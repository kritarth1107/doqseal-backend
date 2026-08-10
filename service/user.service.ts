import User from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import { v4 as uuidv4 } from 'uuid';



/**
 * User Service - Handles user-related data operations
 */
export class UserService {
  /**
   * Get complete user profile with organisation details
   * @param userId - The business userId (string)
   */
  public async getUserProfile(userId: string) {
    const user = await User.findOne({ userId, deletedAt: null });

    if (!user) {
      throw new Error('User not found');
    }

    // Fetch all organisations details
    const userOrganisations = [];
    if (user.organisations && user.organisations.length > 0) {
      const publicIds = user.organisations.map(o => o.organisationId);
      const orgs = await Organisation.find({ publicId: { $in: publicIds } }).lean();

      for (const userOrg of user.organisations) {
        const org = orgs.find(o => o.publicId === userOrg.organisationId);
        if (org) {
          userOrganisations.push({
            organisationId: userOrg.organisationId,
            name: org.name,
            role: userOrg.role
          });
        }
      }
    }

    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      organisationName: userOrganisations[0]?.name || 'Personal',
      organisations: userOrganisations
    };
  }

  /**
   * Create a new organisation for an existing user
   */
  public async createNewOrganisation(userId: string, data: { name: string; website?: string; logoUrl?: string }) {
    const { name, website, logoUrl } = data;
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error('User not found');
    }

    // 0. Validate website uniqueness if provided
    if (website) {
      const existingOrg = await Organisation.findOne({ website, deletedAt: null });
      if (existingOrg) {
        throw new Error(`The website ${website} is already associated with another organisation.`);
      }
    }

    // 1. Create Organisation
    const orgId = uuidv4();
    const organisation = await Organisation.create({
      publicId: orgId,
      name,
      slug: `${name.toLowerCase().replace(/ /g, '-')}-${uuidv4().split('-')[0]}`,
      website: website || null,
      logoUrl: logoUrl || null,
      isDomainVerified: false,
      autoJoinDomain: false,
      memberCount: 1,
      createdBy: userId
    });


    // 2. Create Membership
    await Membership.create({
      organisationId: organisation._id,
      userId: user.userId,
      role: 'owner'
    });

    // 3. Update User's organisations array
    if (!user.organisations) {
      user.organisations = [];
    }

    user.organisations.push({
      organisationId: organisation.publicId as string,
      role: 'owner'
    });

    await user.save();

    return {
      organisationId: organisation.publicId,
      name: organisation.name,
      website: organisation.website,
      logoUrl: organisation.logoUrl,
      role: 'owner'
    };
  }
}


export default new UserService();
