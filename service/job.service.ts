import ExtractionJob from '../model/extractionJob.model';
import Extraction from '../model/extraction.model';
import Document from '../model/document.model';
import { v4 as uuidv4 } from 'uuid';
import RabbitMQUtil from '../utils/rabbitmq.util';
import { EXTRACTION_QUEUE } from '../constants/queues';
import { assertUserInOrganisation } from '../utils/org-access.util';
import quotaService from './quota.service';
import demoService from './demo.service';
import { DEMO_PROCESSING_MS } from '../constants/demo.account';

export class JobService {
  public async createJob(params: {
    documentId: string;
    organisationId: string;
    projectId?: string | null;
  }) {
    const { documentId, organisationId, projectId } = params;

    const useDemoExtraction = await demoService.isDemoTrfProject(
      organisationId,
      projectId
    );

    if (!useDemoExtraction) {
      await quotaService.assertExtractionAllowed(organisationId);
    }

    if (useDemoExtraction) {
      // Clear prior extraction so re-upload / reprocess feels fresh
      await Extraction.deleteMany({ documentId });

      const revealAt = new Date(Date.now() + DEMO_PROCESSING_MS);
      const job = await ExtractionJob.create({
        jobId: uuidv4(),
        documentId,
        organisationId,
        projectId: projectId || null,
        status: 'processing',
        startedAt: new Date(),
        demoMode: true,
        demoRevealAt: revealAt,
      });

      await Document.updateOne(
        { documentId },
        { $set: { status: 'processing', displayTitle: null } }
      );

      // Safety net if nobody polls getDocument within the window
      setTimeout(() => {
        void (async () => {
          try {
            const mongoose = await import('mongoose');
            if (mongoose.connection.readyState !== 1) return;
            await demoService.finalizeDemoJobIfDue({
              jobId: job.jobId,
              documentId,
              organisationId,
              projectId: projectId || null,
              status: 'processing',
              demoMode: true,
              demoRevealAt: revealAt,
            });
          } catch (err) {
            console.error('[demo] finalize failed', err);
          }
        })();
      }, DEMO_PROCESSING_MS + 250);

      return {
        jobId: job.jobId,
        documentId: job.documentId,
        status: job.status,
        demo: true,
        demoRevealAt: revealAt.toISOString(),
      };
    }

    const job = await ExtractionJob.create({
      jobId: uuidv4(),
      documentId,
      organisationId,
      projectId: projectId || null,
      status: 'queued',
    });

    await Document.updateOne(
      { documentId },
      { $set: { status: 'queued' } }
    );

    await RabbitMQUtil.publishToQueue(EXTRACTION_QUEUE, {
      jobId: job.jobId,
    });

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      status: job.status,
    };
  }

  public async getJob(
    userId: string,
    organisationId: string,
    jobId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    let job = await ExtractionJob.findOne({
      jobId,
      organisationId,
    }).lean();

    if (!job) {
      throw new Error('Job not found');
    }

    await demoService.rescueStuckDemoJob(job as any);
    await demoService.finalizeDemoJobIfDue(job as any);

    job = await ExtractionJob.findOne({
      jobId,
      organisationId,
    }).lean();

    if (!job) {
      throw new Error('Job not found');
    }

    const extraction = await Extraction.findOne({ jobId })
      .sort({ version: -1 })
      .lean();

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      projectId: job.projectId,
      status: job.status,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      demoMode: Boolean((job as { demoMode?: boolean }).demoMode),
      demoRevealAt: (job as { demoRevealAt?: Date | null }).demoRevealAt || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      extraction: extraction
        ? {
            extractionId: extraction.extractionId,
            data: extraction.data,
            fieldConfidence: extraction.fieldConfidence,
            validationErrors: extraction.validationErrors,
            status: extraction.status,
            strategy: (extraction as { strategy?: string }).strategy,
            version: extraction.version,
          }
        : null,
    };
  }
}

export default new JobService();
