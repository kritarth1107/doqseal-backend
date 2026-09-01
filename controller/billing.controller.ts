import { FastifyRequest, FastifyReply } from 'fastify';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';
import cashfreeSubscriptionService from '../service/cashfreeSubscription.service';
import cashfreeClient, {
  verifyCashfreeWebhookSignature,
} from '../utils/cashfree.client';

export class BillingController {
  public async subscribe(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = (request.body || {}) as {
      planId?: string;
      customerPhone?: string;
    };

    try {
      const organisationId = resolveOrganisationId(request);
      if (!body.planId) {
        return responseUtil.error(reply, 'planId is required', 400);
      }

      const result = await cashfreeSubscriptionService.startCheckout({
        userId: sessionUser.userId,
        organisationId,
        planId: body.planId,
        customerPhone: body.customerPhone || '',
      });

      return responseUtil.success(reply, 'Checkout session created', result);
    } catch (error: any) {
      const message = error.message || 'Failed to start checkout';
      const status = /not configured|required|valid|Only Starter/i.test(message)
        ? 400
        : /access|Requires/i.test(message)
          ? 403
          : 500;
      return responseUtil.error(reply, message, status);
    }
  }

  public async syncCheckout(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const body = (request.body || {}) as { subscriptionId?: string };

    try {
      const organisationId = resolveOrganisationId(request);
      if (!body.subscriptionId) {
        return responseUtil.error(reply, 'subscriptionId is required', 400);
      }

      const result = await cashfreeSubscriptionService.syncAfterReturn({
        userId: sessionUser.userId,
        organisationId,
        subscriptionId: body.subscriptionId,
      });

      return responseUtil.success(reply, 'Subscription synced', result);
    } catch (error: any) {
      return responseUtil.error(
        reply,
        error.message || 'Failed to sync subscription',
        500
      );
    }
  }

  public async webhook(request: FastifyRequest, reply: FastifyReply) {
    try {
      const signature = String(
        request.headers['x-webhook-signature'] || ''
      );
      const timestamp = String(
        request.headers['x-webhook-timestamp'] || ''
      );
      const rawBody =
        typeof (request as any).rawBody === 'string'
          ? (request as any).rawBody
          : JSON.stringify(request.body || {});

      if (cashfreeClient.isConfigured() && signature && timestamp) {
        const ok = verifyCashfreeWebhookSignature({
          signature,
          timestamp,
          rawBody,
        });
        if (!ok) {
          return responseUtil.error(reply, 'Invalid webhook signature', 401);
        }
      }

      const payload = (request.body || {}) as Record<string, any>;
      const result = await cashfreeSubscriptionService.handleWebhook(payload);
      return responseUtil.success(reply, 'Webhook processed', result);
    } catch (error: any) {
      console.error('[cashfree] webhook error', error);
      return responseUtil.error(
        reply,
        error.message || 'Webhook processing failed',
        500
      );
    }
  }
}

export default new BillingController();
