import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import authController from '../controller/auth.controller';
import userAuth from '../middleware/user.auth';

/**
 * Auth Router - Handles all authentication related endpoints
 */
export const authRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/v1/auth/login-request
  fastify.post('/login-request', authController.loginRequest);

  // POST /api/v1/auth/verify-otp
  fastify.post('/login-request/verify-otp', authController.verifyOtp);

  // POST /api/v1/auth/social
  fastify.post('/social', authController.socialLogin);

  // POST /api/v1/auth/logout
  fastify.post('/logout', { preHandler: [userAuth] }, authController.logout);
};

export default authRouter;
