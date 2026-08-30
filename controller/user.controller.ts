import { FastifyRequest, FastifyReply } from 'fastify';
import userService from '../service/user.service';
import responseUtil from '../utils/response.util';

/**
 * User Controller - Handles user-related HTTP requests
 */
export class UserController {
  /**
   * Get the current authenticated user's profile
   */
  public async getMe(request: FastifyRequest, reply: FastifyReply) {
    // The user object is attached to the request by the userAuth middleware
    const sessionUser = (request as any).user;

    if (!sessionUser) {
      return responseUtil.error(reply, 'User session not found', 401);
    }

    try {
      const profile = await userService.getUserProfile(sessionUser.userId);
      return responseUtil.success(reply, 'User profile retrieved successfully', profile);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed to retrieve user profile', 500);
    }
  }

  /**
   * Complete first-time onboarding
   */
  public async completeOnboarding(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;

    if (!sessionUser) {
      return responseUtil.error(reply, 'User session not found', 401);
    }

    try {
      const body = request.body as {
        name: string;
        organisationName: string;
        usageIntent: 'individual' | 'team';
        jobRole: string;
        useCases?: string[];
      };

      const profile = await userService.completeOnboarding(sessionUser.userId, {
        name: body.name,
        organisationName: body.organisationName,
        usageIntent: body.usageIntent,
        jobRole: body.jobRole,
        useCases: body.useCases || [],
      });

      return responseUtil.success(reply, 'Onboarding completed successfully', profile);
    } catch (error: any) {
      const status = error.message?.includes('Please') ? 400 : 500;
      return responseUtil.error(reply, error.message || 'Failed to complete onboarding', status);
    }
  }

  /**
   * Create a new organisation for the authenticated user
   */
  public async createOrganisation(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    
    try {
      const { name, website, logoUrl } = request.body as { name: string; website?: string; logoUrl?: string };
      
      if (!name || name.trim().length < 3) {
        return responseUtil.error(reply, 'Organisation name must be at least 3 characters long', 400);
      }

      const organisation = await userService.createNewOrganisation(sessionUser.userId, { name, website, logoUrl });
      return responseUtil.success(reply, 'Organisation created successfully', organisation);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || 'Failed to create organisation', 500);
    }
  }
}


export default new UserController();
