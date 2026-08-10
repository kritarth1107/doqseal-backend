import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import User from '../model/user.model';
import Document from '../model/document.model';
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';

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
      logoUrl: organisation.logoUrl,
      isDomainVerified: (organisation as any).isDomainVerified,
      autoJoinDomain: (organisation as any).autoJoinDomain,
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

    const [documentCount, extractionCount, pendingJobs] = await Promise.all([
      Document.countDocuments({ organisationId, deletedAt: null }),
      Extraction.countDocuments({ organisationId }),
      ExtractionJob.countDocuments({
        organisationId,
        status: { $in: ['queued', 'processing'] },
      }),
    ]);

    return {
      documentCount,
      extractionCount,
      pendingJobs,
    };
  }
}

export default new OrganisationService();
