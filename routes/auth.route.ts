import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import authController from '../controller/auth.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  LoginRequestBody,
  LogoutBody,
  SocialLoginBody,
  VerifyOtpBody,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const authRouter: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post(
    '/login-request',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request login OTP',
        description: 'Sends a one-time password to the given email.',
        body: LoginRequestBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    authController.loginRequest
  );

  fastify.post(
    '/login-request/verify-otp',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify login OTP',
        body: VerifyOtpBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    authController.verifyOtp
  );

  fastify.post(
    '/social',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Social OAuth login sync',
        body: SocialLoginBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    authController.socialLogin
  );

  fastify.post(
    '/logout',
    {
      preHandler: [userAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Logout current or all sessions',
        security: bearerSecurity,
        body: LogoutBody,
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    authController.logout
  );
};

export default authRouter;
