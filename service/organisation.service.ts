import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import User from '../model/user.model';
import Document from '../model/document.model';
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';
import Project from '../model/project.model';

/**
 * Organisation Service - Handles organisation-related operations
 */
export class OrganisationService {
  /**
   * Get detailed information about an organisation including its members
   * @param organisationId - The publicId of the organisation
   */
  public async getOrganisationDetails(organisationId: string) {
    // 1. Fetch Organisation Details
    const organisation = await Organisation.findOne({ publicId: organisationId, deletedAt: null }).lean();
    
    if (!organisation) {
      throw new Error('Organisation not found');
    }

    // 2. Fetch Memberships for this organisation
    const memberships = await Membership.find({ organisationId: organisation._id }).lean();

    // 3. Fetch User details for all members
    const userIds = memberships.map(m => m.userId);
    const users = await User.find({ userId: { $in: userIds } }).lean();

    // 4. Map members with their profile details
    const members = memberships.map(membership => {
      const user = users.find(u => u.userId === membership.userId);
      return {
        userId: membership.userId,
        name: user?.name || 'Unknown User',
        email: user?.email || 'N/A',
        avatar: user?.avatar || null,
        role: membership.role,
        joinedAt: (membership as any).createdAt
      };
    });

    return {
      organisationId: organisation.publicId,
      name: organisation.name,
      slug: organisation.slug,
      website: organisation.website,
      logoUrl: organisation.logoUrl || null,
      gstNumber: (organisation as any).gstNumber || null,
      address: (organisation as any).address || null,
      verifiedDomain: (organisation as any).verifiedDomain || null,
      isDomainVerified: Boolean((organisation as any).isDomainVerified),
      autoJoinEnabled: Boolean((organisation as any).autoJoinDomain),
      domainVerifiedAt: (organisation as any).domainVerifiedAt || null,
      memberCount: members.length,
      members
    };
  }

  public async getOrganisationStats(organisationId: string) {
    const organisation = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();

    if (!organisation) {
      throw new Error('Organisation not found');
    }

    const weekAgo = new Date();
    weekAgo.setHours(0, 0, 0, 0);
    weekAgo.setDate(weekAgo.getDate() - 6);

    const [
      documentCount,
      extractionCount,
      pendingJobs,
      activeProjects,
      recentDocs,
      weekDocs,
    ] = await Promise.all([
      Document.countDocuments({ organisationId, deletedAt: null }),
      Extraction.countDocuments({ organisationId }),
      ExtractionJob.countDocuments({
        organisationId,
        status: { $in: ['queued', 'processing'] },
      }),
      Project.countDocuments({
        organisationId,
        deletedAt: null,
        status: 'active',
      }),
      Document.find({ organisationId, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Document.find({
        organisationId,
        deletedAt: null,
        createdAt: { $gte: weekAgo },
      })
        .select({ createdAt: 1 })
        .lean(),
    ]);

    const documentIds = recentDocs.map((d) => d.documentId);
    const extractions = documentIds.length
      ? await Extraction.find({ documentId: { $in: documentIds } })
          .sort({ createdAt: -1, version: -1 })
          .lean()
      : [];

    const extractionByDoc = new Map<string, (typeof extractions)[number]>();
    for (const row of extractions) {
      if (!extractionByDoc.has(row.documentId)) {
        extractionByDoc.set(row.documentId, row);
      }
    }

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendBuckets = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo);
      d.setDate(weekAgo.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      trendBuckets.set(key, 0);
    }
    for (const doc of weekDocs) {
      const created = new Date(doc.createdAt);
      const key = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
      if (trendBuckets.has(key)) {
        trendBuckets.set(key, (trendBuckets.get(key) || 0) + 1);
      }
    }

    const trends = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekAgo);
      d.setDate(weekAgo.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return {
        day: dayLabels[d.getDay()],
        count: trendBuckets.get(key) || 0,
      };
    });

    const recentDocuments = recentDocs.map((doc) => {
      const extraction = extractionByDoc.get(doc.documentId);
      const confidenceScores = extraction?.fieldConfidence
        ? Object.values(extraction.fieldConfidence as Record<string, number>)
        : [];
      const avgConfidence =
        confidenceScores.length > 0
          ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
          : 0;

      const data = (extraction?.data || {}) as Record<string, unknown>;
      const category =
        typeof data.category === 'string'
          ? data.category
          : typeof data.document_type === 'string'
            ? data.document_type
            : doc.mimeType?.includes('pdf')
              ? 'PDF'
              : 'Document';

      let statusLabel = 'Review';
      if (doc.status === 'completed') statusLabel = 'Processed';
      else if (doc.status === 'failed') statusLabel = 'Failed';
      else if (doc.status === 'queued' || doc.status === 'processing') {
        statusLabel = 'In review';
      }

      return {
        id: doc.documentId,
        name: doc.displayTitle || doc.originalFilename,
        type: category,
        status: statusLabel,
        confidence: avgConfidence > 0 ? `${Math.round(avgConfidence * 100)}%` : '—',
        date: new Date(doc.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      };
    });

    return {
      // Canonical names (analytics + API)
      documentCount,
      extractionCount,
      pendingJobs,
      activeProjects,
      trends,
      recentDocuments,
      // Dashboard aliases (legacy UI field names)
      documentsCount: documentCount,
      extractionsCount: extractionCount,
      pendingEnvelopes: pendingJobs,
    };
  }

  private normalizeGst(gst?: string | null): string | null {
    if (!gst) return null;
    const value = gst.trim().toUpperCase().replace(/\s+/g, '');
    if (!value) return null;
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
      throw new Error('Enter a valid 15-character GSTIN');
    }
    return value;
  }

  public async updateOrganisationProfile(
    organisationId: string,
    userId: string,
    data: {
      name?: string;
      website?: string | null;
      gstNumber?: string | null;
      address?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        country?: string | null;
      };
    }
  ) {
    const { assertOrgRole } = await import('../utils/org-access.util');
    await assertOrgRole(userId, organisationId, 'admin');

    const org = await Organisation.findOne({ publicId: organisationId, deletedAt: null });
    if (!org) throw new Error('Organisation not found');

    const update: Record<string, unknown> = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (name.length < 2) throw new Error('Organisation name is too short');
      update.name = name;
    }

    if (data.website !== undefined) {
      const website = data.website?.trim() || null;
      update.website = website;
    }

    if (data.gstNumber !== undefined) {
      update.gstNumber = this.normalizeGst(data.gstNumber);
    }

    if (data.address !== undefined) {
      update.address = {
        line1: data.address.line1?.trim() || null,
        line2: data.address.line2?.trim() || null,
        city: data.address.city?.trim() || null,
        state: data.address.state?.trim() || null,
        postalCode: data.address.postalCode?.trim() || null,
        country: data.address.country?.trim() || 'IN',
      };
    }

    if (!Object.keys(update).length) {
      throw new Error('No changes to save');
    }

    await Organisation.updateOne({ publicId: organisationId }, { $set: update });
    return this.getOrganisationDetails(organisationId);
  }

  public async updateOrganisationLogo(
    organisationId: string,
    userId: string,
    file: { buffer: Buffer; mimeType: string }
  ) {
    const { assertOrgRole } = await import('../utils/org-access.util');
    await assertOrgRole(userId, organisationId, 'admin');

    const org = await Organisation.findOne({ publicId: organisationId, deletedAt: null });
    if (!org) throw new Error('Organisation not found');

    const profileMediaService = (await import('./profileMedia.service')).default;
    const uploaded = await profileMediaService.uploadOrgLogo({
      organisationId,
      buffer: file.buffer,
      mimeType: file.mimeType,
      previousKey: (org as any).logoStorageKey || null,
    });

    await Organisation.updateOne(
      { publicId: organisationId },
      {
        $set: {
          logoUrl: uploaded.url,
          logoStorageKey: uploaded.objectKey,
        },
      }
    );

    return {
      logoUrl: uploaded.url,
      organisationId,
    };
  }
}

export default new OrganisationService();
