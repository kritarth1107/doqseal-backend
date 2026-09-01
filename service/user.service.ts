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
      organisations: userOrganisations,
      // Legacy users created before onboarding flag → treat as completed
      onboardingCompleted: user.onboardingCompleted !== false,
      onboarding: user.onboarding || null,
    };
  }

  /**
   * Complete first-time onboarding: profile, org rename, intent & role
   */
  public async completeOnboarding(
    userId: string,
    data: {
      name: string;
      organisationName: string;
      usageIntent: 'individual' | 'team';
      jobRole: string;
      useCases: string[];
    }
  ) {
    const { name, organisationName, usageIntent, jobRole, useCases } = data;

    if (!name?.trim() || name.trim().length < 2) {
      throw new Error('Please enter your full name');
    }
    if (!organisationName?.trim() || organisationName.trim().length < 2) {
      throw new Error('Please enter your organisation name');
    }
    if (!usageIntent || !['individual', 'team'].includes(usageIntent)) {
      throw new Error('Please select how you plan to use DoqSeal');
    }
    if (!jobRole?.trim()) {
      throw new Error('Please select your role');
    }

    const user = await User.findOne({ userId, deletedAt: null });
    if (!user) {
      throw new Error('User not found');
    }

    if (user.onboardingCompleted) {
      return this.getUserProfile(userId);
    }

    user.name = name.trim();
    user.onboarding = {
      usageIntent,
      jobRole: jobRole.trim(),
      useCases: Array.isArray(useCases) ? useCases.filter(Boolean) : [],
      completedAt: new Date(),
    };
    user.onboardingCompleted = true;
    await user.save();

    // Rename primary organisation
    const primaryOrgId = user.organisations?.[0]?.organisationId;
    if (primaryOrgId) {
      const org = await Organisation.findOne({ publicId: primaryOrgId });
      if (org) {
        org.name = organisationName.trim();
        org.slug = `${organisationName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${primaryOrgId.slice(0, 8)}`;
        await org.save();
      }
    }

    return this.getUserProfile(userId);
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
      planDetails: { planId: 'free' },
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
