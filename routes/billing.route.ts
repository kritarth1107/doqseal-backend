import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import billingController from '../controller/billing.controller';
import userAuth from '../middleware/user.auth';
import {
  ApiSuccessSchema,
  OrganisationIdParams,
  bearerSecurity,
  errorResponses,
} from '../openapi/schemas';

export const billingRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.post(
    '/webhooks/cashfree',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Cashfree subscription webhook',
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    billingController.cashfreeWebhook.bind(billingController)
  );

  fastify.post(
    '/webhooks/razorpay',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Razorpay subscription webhook',
        response: { 200: ApiSuccessSchema, ...errorResponses },
      },
    },
    billingController.razorpayWebhook.bind(billingController)
  );

  fastify.register(async (authed) => {
    authed.addHook('preHandler', userAuth);

    authed.post(
      '/organisations/:organisationId/billing/subscribe',
      {
        schema: {
          tags: ['Billing'],
          summary: 'Start Cashfree monthly subscription checkout',
          security: bearerSecurity,
          params: OrganisationIdParams,
          response: { 200: ApiSuccessSchema, ...errorResponses },
        },
      },
      billingController.subscribe.bind(billingController)
    );

    authed.post(
      '/organisations/:organisationId/billing/sync',
      {
        schema: {
          tags: ['Billing'],
          summary: 'Sync subscription status after checkout return',
          security: bearerSecurity,
          params: OrganisationIdParams,
          response: { 200: ApiSuccessSchema, ...errorResponses },
        },
      },
      billingController.syncCheckout.bind(billingController)
    );
  });
};

export default billingRouter;
