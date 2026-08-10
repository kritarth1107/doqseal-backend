import { FastifyRequest, FastifyReply } from 'fastify';
import authService from '../service/auth.service';
import responseUtil from '../utils/response.util';
import { z } from 'zod';

/**
 * Auth Controller - Handles authentication requests
 */
export class AuthController {
  /**
   * Request an OTP for login
   */
  public async loginRequest(request: FastifyRequest, reply: FastifyReply) {
   try {
     const schema = z.object({
      email: z.string().email()
    });

    const { email } = schema.parse(request.body);

    const result = await authService.loginWithEmail(email);

    return responseUtil.success(reply, 'OTP sent to your email', result);
   } catch (error: any) {
    return responseUtil.error(reply, error.message || error.toString(), 500);
   }
  }

  /**
   * Verify OTP and complete login/registration
   */
  public async verifyOtp(request: FastifyRequest, reply: FastifyReply) {
    try {
      const schema = z.object({
        email: z.string().email(),
        otp: z.string().length(6),
        token: z.string(),
        name: z.string().optional()
      });

      const params = schema.parse(request.body);

      const result = await authService.verifyEmailLoginOTP({
        ...params,
        sessionData: {
          fingerprint: (request.headers['x-fingerprint'] as string) || 'N/A',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }
      });

      return responseUtil.success(reply, 'OTP verified successfully', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }

  /**
   * Handle Social Login (Google, GitHub, etc.)
   */
  public async socialLogin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const schema = z.object({
        provider: z.string(),
        access_token: z.string(),
        id_token: z.string().optional(),
        email: z.string().email(),
        name: z.string(),
        avatar: z.string().optional(),
      });

      const params = schema.parse(request.body);

      const result = await authService.loginWithSocial({
        ...params,
        sessionData: {
          fingerprint: (request.headers['x-fingerprint'] as string) || 'N/A',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }
      });

      return responseUtil.success(reply, 'Social login successful', result);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }

  /**
   * Logout user and revoke session(s)
   */
  public async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sessionUser = (request as any).user;
      const authHeader = request.headers.authorization;
      const currentToken = authHeader?.split(' ')[1];
      const headerFingerprint = (request.headers['x-fingerprint'] as string) || 'N/A';

      const schema = z.object({
        type: z.enum(['current', 'all', 'specific']).default('current'),
        fingerprint: z.string().optional()
      });

      const { type, fingerprint } = schema.parse(request.body);

      await authService.logout(sessionUser.userId, {
        type,
        token: currentToken,
        fingerprint: type === 'current' ? headerFingerprint : (fingerprint)
      });


      return responseUtil.success(reply, `Logged out from ${type} session(s) successfully`);
    } catch (error: any) {
      return responseUtil.error(reply, error.message || error.toString(), 400);
    }
  }
}


export default new AuthController();
