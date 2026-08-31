import { v4 as uuidv4 } from 'uuid';
import User, { IUser } from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import Project from '../model/project.model';
import Document from '../model/document.model';
import Extraction from '../model/extraction.model';
import ExtractionJob, { IExtractionJob } from '../model/extractionJob.model';
import {
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PROCESSING_MS,
  DEMO_PROJECT_HINT,
  DEMO_PROJECT_NAME,
  DEMO_TRF_EXTRACTION,
  DEMO_USER_NAME,
  demoFieldConfidence,
  isDemoEmail,
} from '../constants/demo.account';

export class DemoService {
  public isDemoEmail(email?: string | null): boolean {
    return isDemoEmail(email);
  }

  public async isDemoOrganisation(organisationId: string): Promise<boolean> {
    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();
    if (!org) return false;
    return Boolean((org as { isDemo?: boolean }).isDemo) || org.slug === DEMO_ORG_SLUG;
  }

  public isTrfProjectName(name?: string | null): boolean {
    const n = (name || '').toLowerCase();
    return n.includes('trf') || n.includes('test request form');
  }

  public async isDemoTrfProject(
    organisationId: string,
    projectId?: string | null
  ): Promise<boolean> {
    if (!projectId) return false;
    if (!(await this.isDemoOrganisation(organisationId))) return false;

    const project = await Project.findOne({
      projectId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!project) return false;

    // Only the seeded showcase project uses canned extraction.
    // Other demo-org projects (e.g. Lupin TRFs) run real AI.
    return (project.name || '').trim() === DEMO_PROJECT_NAME;
  }

  /**
   * Rescue jobs that were queued for real AI on the demo org (e.g. old projects)
   * so the UI never sits in "processing" for minutes.
   */
  public async rescueStuckDemoJob(job: {
    jobId: string;
    documentId: string;
    organisationId: string;
    projectId?: string | null;
    status: string;
    demoMode?: boolean;
    demoRevealAt?: Date | null;
    createdAt?: Date;
  } | null): Promise<boolean> {
    if (!job) return false;
    if (job.status === 'completed' || job.status === 'failed') return false;

    const isDemoOrg = await this.isDemoOrganisation(job.organisationId);
    if (!isDemoOrg) return false;
    if (!job.projectId) return false;

    // Already on the timed demo path — respect reveal window
    if (job.demoMode) {
      return this.finalizeDemoJobIfDue(job as any);
    }

    // Real-AI queued/processing job on demo org → convert to instant demo finish
    const ageMs = job.createdAt
      ? Date.now() - new Date(job.createdAt).getTime()
      : DEMO_PROCESSING_MS + 1;
    if (ageMs < 2_000) return false;

    await ExtractionJob.updateOne(
      { jobId: job.jobId },
      {
        $set: {
          demoMode: true,
          demoRevealAt: new Date(0),
          status: 'processing',
          updatedAt: new Date(),
        },
      }
    );

    await this.writeDemoExtraction(job);
    return true;
  }

  /**
   * Ensure demo user has Zeroknow org + TRF project after OTP verify.
   */
  public async ensureDemoWorkspace(user: IUser): Promise<IUser> {
    if (!isDemoEmail(user.email)) return user;

    user.name = DEMO_USER_NAME;
    user.onboardingCompleted = true;

    let org = await Organisation.findOne({
      $or: [{ slug: DEMO_ORG_SLUG }, { isDemo: true }],
      deletedAt: null,
    });

    if (!org) {
      const primaryId = user.organisations?.[0]?.organisationId;
      if (primaryId) {
        org = await Organisation.findOne({ publicId: primaryId, deletedAt: null });
      }
    }

    if (!org) {
      const orgId = uuidv4();
      org = await Organisation.create({
        publicId: orgId,
        name: DEMO_ORG_NAME,
        slug: DEMO_ORG_SLUG,
        memberCount: 1,
        isDemo: true,
        createdBy: user.userId,
      });
    } else {
      org.name = DEMO_ORG_NAME;
      org.slug = DEMO_ORG_SLUG;
      (org as { isDemo?: boolean }).isDemo = true;
      await org.save();
    }

    const membership = await Membership.findOne({
      userId: user.userId,
      organisationId: org._id,
      deletedAt: null,
    });
    if (!membership) {
      await Membership.create({
        organisationId: org._id,
        userId: user.userId,
        role: 'owner',
      });
    }

    const orgPublicId = org.publicId as string;
    const orgs = user.organisations || [];
    user.organisations = [
      { organisationId: orgPublicId, role: 'owner' },
      ...orgs.filter((o) => o.organisationId !== orgPublicId),
    ];

    await user.save();
    await this.ensureTrfProject(orgPublicId, user.userId);

    const refreshed = await User.findOne({ userId: user.userId, deletedAt: null });
    return refreshed || user;
  }

  public async ensureTrfProject(organisationId: string, createdBy: string) {
    let project = await Project.findOne({
      organisationId,
      deletedAt: null,
      $or: [
        { name: DEMO_PROJECT_NAME },
        { name: /trf/i },
        { name: /test request form/i },
      ],
    });

    if (!project) {
      project = await Project.create({
        projectId: uuidv4(),
        organisationId,
        createdBy,
        name: DEMO_PROJECT_NAME,
        description:
          'Demo TRF project — uploads use canned extraction (no AI) for demos.',
        extractionHint: DEMO_PROJECT_HINT,
        fields: [],
        crossFieldRules: [],
        status: 'active',
        sharedWithOrganisation: true,
      });
    } else {
      project.name = DEMO_PROJECT_NAME;
      project.extractionHint = DEMO_PROJECT_HINT;
      if (!project.description) {
        project.description =
          'Demo TRF project — uploads use canned extraction (no AI) for demos.';
      }
      await project.save();
    }

    return project;
  }

  public async finalizeDemoJobIfDue(
    job: Pick<
      IExtractionJob,
      | 'jobId'
      | 'documentId'
      | 'organisationId'
      | 'projectId'
      | 'status'
      | 'demoMode'
      | 'demoRevealAt'
    > | null
  ): Promise<boolean> {
    if (!job?.demoMode) return false;
    if (job.status === 'completed') return true;
    if (job.status === 'failed') return false;

    const revealAt = job.demoRevealAt ? new Date(job.demoRevealAt).getTime() : 0;
    if (!revealAt || Date.now() < revealAt) return false;

    await this.writeDemoExtraction(job);
    return true;
  }

  public async writeDemoExtraction(job: {
    jobId: string;
    documentId: string;
    organisationId: string;
    projectId?: string | null;
  }) {
    const existingForJob = await Extraction.findOne({ jobId: job.jobId }).lean();
    if (existingForJob) {
      await ExtractionJob.updateOne(
        { jobId: job.jobId },
        {
          $set: {
            status: 'completed',
            completedAt: existingForJob.approvedAt || new Date(),
            error: null,
          },
        }
      );
      await Document.updateOne(
        { documentId: job.documentId },
        {
          $set: {
            status: 'completed',
            displayTitle: DEMO_TRF_EXTRACTION.suggested_title,
          },
        }
      );
      return;
    }

    const data = {
      ...DEMO_TRF_EXTRACTION,
      confidence_scores: { ...DEMO_TRF_EXTRACTION.confidence_scores },
    };
    const fieldConfidence = demoFieldConfidence(DEMO_TRF_EXTRACTION);
    const prev = await Extraction.findOne({ documentId: job.documentId })
      .sort({ version: -1 })
      .lean();
    const version = (prev?.version || 0) + 1;
    const now = new Date();

    await Extraction.create({
      extractionId: uuidv4(),
      documentId: job.documentId,
      jobId: job.jobId,
      organisationId: job.organisationId,
      projectId: job.projectId || 'demo-trf',
      version,
      data,
      fieldConfidence,
      validationErrors: [],
      status: 'approved',
      strategy: 'demo',
      approvedAt: now,
    });

    await ExtractionJob.updateOne(
      { jobId: job.jobId },
      {
        $set: {
          status: 'completed',
          completedAt: now,
          error: null,
          updatedAt: now,
        },
      }
    );

    await Document.updateOne(
      { documentId: job.documentId },
      {
        $set: {
          status: 'completed',
          displayTitle: DEMO_TRF_EXTRACTION.suggested_title,
          updatedAt: now,
        },
      }
    );

    if (job.projectId) {
      try {
        const {
          coerceProjectWebhooks,
          dispatchProjectWebhooks,
        } = await import('./webhook.service');
        const project = await Project.findOne({
          projectId: job.projectId,
          deletedAt: null,
        }).lean();
        const document = await Document.findOne({
          documentId: job.documentId,
        }).lean();
        await dispatchProjectWebhooks(coerceProjectWebhooks(project || {}), {
          event: 'document.processed',
          projectId: job.projectId,
          documentId: job.documentId,
          jobId: job.jobId,
          organisationId: job.organisationId,
          status: 'completed',
          originalFilename: document?.originalFilename || null,
          displayTitle: DEMO_TRF_EXTRACTION.suggested_title,
          extraction: {
            data: data as unknown as Record<string, unknown>,
            fieldConfidence,
            strategy: 'demo',
            status: 'approved',
          },
          timestamp: now.toISOString(),
        });
      } catch (error) {
        console.warn('[demo] webhook dispatch failed', error);
      }
    }
  }
}

export default new DemoService();
