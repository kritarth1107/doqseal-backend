import { FastifyRequest, FastifyReply } from 'fastify';
import userService from '../service/user.service';
import sessionService from '../service/session.service';
import authService from '../service/auth.service';
import responseUtil from '../utils/response.util';
import TokenBlacklist from '../utils/token-blacklist.util';

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

  public async listSessions(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const fingerprint =
      (request.headers['x-fingerprint'] as string) || undefined;

    try {
      const sessions = await sessionService.listActiveSessions(
        sessionUser.userId,
        fingerprint
      );
      return responseUtil.success(reply, 'Sessions retrieved', sessions);
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to list sessions',
        500
      );
    }
  }

  public async revokeSession(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { fingerprint } = request.params as { fingerprint: string };
    const authHeader = request.headers.authorization;
    const currentToken = authHeader?.split(' ')[1];
    const currentFingerprint =
      (request.headers['x-fingerprint'] as string) || '';

    try {
      await sessionService.revokeSession(sessionUser.userId, fingerprint);

      if (fingerprint === currentFingerprint && currentToken) {
        await TokenBlacklist.blacklistToken(currentToken, 86400);
      }

      return responseUtil.success(reply, 'Session terminated');
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to revoke session',
        400
      );
    }
  }

  public async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const authHeader = request.headers.authorization;
    const currentToken = authHeader?.split(' ')[1];

    try {
      await authService.logout(sessionUser.userId, { type: 'all' });
      if (currentToken) {
        await TokenBlacklist.blacklistToken(currentToken, 86400);
      }
      return responseUtil.success(reply, 'Logged out from all devices');
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to log out',
        500
      );
    }
  }

  public async deleteAccount(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const authHeader = request.headers.authorization;
    const currentToken = authHeader?.split(' ')[1];

    try {
      await sessionService.deleteAccount(sessionUser.userId);
      if (currentToken) {
        await TokenBlacklist.blacklistToken(currentToken, 86400);
      }
      return responseUtil.success(reply, 'Account deleted');
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to delete account',
        500
      );
    }
  }
}


export default new UserController();
