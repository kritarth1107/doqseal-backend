import { v4 as uuidv4 } from 'uuid';
import Organisation from '../model/organisation.model';
import OrganisationSubscription, {
  SavedPaymentMethod,
  SubscriptionStatus,
} from '../model/organisationSubscription.model';
import BillingInvoice from '../model/billingInvoice.model';
import User from '../model/user.model';
import planService from './plan.service';
import razorpayClient from '../utils/razorpay.client';
import config from '../config/app.config';
import { assertOrgRole, assertUserInOrganisation } from '../utils/org-access.util';
import auditService from './audit.service';

const PAID_PLAN_IDS = new Set(['starter', 'growth', 'scale']);

function normalizeStatus(raw?: string | null): SubscriptionStatus {
  const value = String(raw || '').toLowerCase();
  switch (value) {
    case 'active':
      return 'active';
    case 'authenticated':
      return 'bank_approval_pending';
    case 'pending':
      return 'bank_approval_pending';
    case 'halted':
      return 'on_hold';
    case 'paused':
      return 'paused';
    case 'cancelled':
      return 'cancelled';
    case 'completed':
      return 'completed';
    case 'expired':
      return 'expired';
    default:
      return 'initialized';
  }
}

function mapPaymentMethodFromPayment(
  payment: Record<string, any> | null | undefined
): SavedPaymentMethod | null {
  if (!payment) return null;
  const method = String(payment.method || '').toLowerCase();
  const card = payment.card || {};
  const vpa = payment.vpa || payment.upi?.vpa;

  if (method === 'upi' || vpa) {
    const id = String(vpa || 'UPI');
    return { type: 'upi', brand: 'UPI', last4: id.slice(-4), umn: vpa || null };
  }
  if (method === 'card' || card.last4) {
    return {
      type: 'card',
      brand: String(card.network || card.type || 'Card'),
      last4: String(card.last4 || '****'),
      expiryMonth: card.expiry_month ? Number(card.expiry_month) : null,
      expiryYear: card.expiry_year ? Number(card.expiry_year) : null,
      instrumentId: payment.id ? String(payment.id) : null,
    };
  }
  if (method === 'emandate' || method === 'nach') {
    return { type: 'enach', brand: 'eNACH', last4: '****' };
  }
  return method
    ? { type: 'unknown', brand: method, last4: '****' }
    : null;
}

function nextMonthDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

function inferStatusFromEvent(
  event: string,
  subscription?: Record<string, any> | null,
  payment?: Record<string, any> | null
): SubscriptionStatus | null {
  const e = event.toLowerCase();
  if (e === 'subscription.activated' || e === 'subscription.charged') {
    return 'active';
  }
  if (e === 'subscription.authenticated' || e === 'subscription.pending') {
    return 'bank_approval_pending';
  }
  if (e === 'subscription.halted' || e === 'payment.failed') {
    return payment?.status === 'failed' ? 'failed' : 'on_hold';
  }
  if (e === 'subscription.cancelled') return 'cancelled';
  if (e === 'subscription.completed') return 'completed';
  if (e === 'subscription.paused') return 'paused';
  if (e === 'subscription.resumed') return 'active';
  if (e === 'invoice.paid') return 'active';
  if (subscription?.status) return normalizeStatus(subscription.status);
  return null;
}

export class RazorpaySubscriptionService {
  public async startCheckout(params: {
    userId: string;
    organisationId: string;
    planId: string;
    customerPhone: string;
  }) {
    const { userId, organisationId, planId } = params;
    await assertUserInOrganisation(userId, organisationId);
    await assertOrgRole(userId, organisationId, 'admin');

    if (!razorpayClient.isConfigured()) {
      throw new Error(
        'Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
      );
    }

    if (!PAID_PLAN_IDS.has(planId)) {
      throw new Error('Only Starter, Growth, and Scale can be purchased online');
    }

    const phone = String(params.customerPhone || '')
      .replace(/\D/g, '')
      .slice(-10);

    const [org, user, plan] = await Promise.all([
      Organisation.findOne({ publicId: organisationId, deletedAt: null }),
      User.findOne({ userId, deletedAt: null }),
      planService.getPlanById(planId),
    ]);

    if (!org) throw new Error('Organisation not found');
    if (!user) throw new Error('User not found');
    if (plan.priceInrMonthly == null || plan.priceInrMonthly <= 0) {
      throw new Error('Selected plan is not billable');
    }

    const subscriptionId = `sub_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const returnUrl = `${config.server.liveFrontendUrl.replace(/\/$/, '')}/settings/billing?checkout=done&subscription_id=${subscriptionId}`;

    const customer = await razorpayClient.createCustomer({
      name: user.name,
      email: user.email,
      contact: phone.length === 10 ? phone : undefined,
      organisationId,
    });

    const razorpayPlan = await razorpayClient.createPlan({
      name: `DoqSeal ${plan.name}`,
      amountInr: plan.priceInrMonthly,
      planId,
    });

    const created = await razorpayClient.createSubscription({
      planId: razorpayPlan.id,
      customerId: customer.id,
      notes: {
        organisation_id: organisationId,
        plan_id: planId,
        user_id: userId,
        doqseal_subscription_id: subscriptionId,
      },
    });

    await OrganisationSubscription.create({
      subscriptionId,
      organisationId,
      userId,
      planId,
      paymentProvider: 'razorpay',
      cashfreeSubscriptionId: created.id,
      cashfreeCfSubscriptionId: null,
      status: normalizeStatus(created.status),
      amountInr: plan.priceInrMonthly,
      currency: 'INR',
      customerPhone: phone.length === 10 ? phone : '',
      metadata: {
        returnUrl,
        razorpayPlanId: razorpayPlan.id,
        razorpayCustomerId: customer.id,
      },
    });

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'billing.subscription_checkout_started',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      metadata: { planId, amountInr: plan.priceInrMonthly, provider: 'razorpay' },
    });

    return {
      subscriptionId,
      paymentProvider: 'razorpay' as const,
      razorpaySubscriptionId: created.id,
      razorpayKeyId: razorpayClient.getKeyId(),
      paymentUrl: created.short_url || null,
      checkoutMode: razorpayClient.getCheckoutMode(),
      amountInr: plan.priceInrMonthly,
      planId,
      returnUrl,
    };
  }

  public async syncAfterReturn(params: {
    userId: string;
    organisationId: string;
    subscriptionId: string;
  }) {
    await assertUserInOrganisation(params.userId, params.organisationId);

    const sub = await OrganisationSubscription.findOne({
      subscriptionId: params.subscriptionId,
      organisationId: params.organisationId,
    });
    if (!sub) throw new Error('Subscription not found');

    try {
      const remote = await razorpayClient.getSubscription(sub.cashfreeSubscriptionId);
      await this.applySubscriptionState({
        providerSubscriptionId: sub.cashfreeSubscriptionId,
        status: normalizeStatus(remote.status),
        raw: remote as Record<string, any>,
      });
    } catch (err) {
      console.warn('[razorpay] syncAfterReturn failed', err);
    }

    const refreshed = await OrganisationSubscription.findOne({
      subscriptionId: params.subscriptionId,
    }).lean();

    return {
      subscriptionId: params.subscriptionId,
      status: refreshed?.status || sub.status,
      planId: refreshed?.planId || sub.planId,
      paymentMethod: refreshed?.paymentMethod || null,
    };
  }

  public async applySubscriptionState(params: {
    providerSubscriptionId: string;
    status: SubscriptionStatus;
    raw?: Record<string, any>;
    paymentMethod?: SavedPaymentMethod | null;
    amountInr?: number | null;
    paymentId?: string | null;
  }) {
    const sub = await OrganisationSubscription.findOne({
      cashfreeSubscriptionId: params.providerSubscriptionId,
      paymentProvider: 'razorpay',
    });
    if (!sub) {
      console.warn('[razorpay] subscription not found for', params.providerSubscriptionId);
      return null;
    }

    const method =
      params.paymentMethod ||
      (params.raw?.payment ? mapPaymentMethodFromPayment(params.raw.payment) : null);

    sub.status = params.status;
    if (method) sub.paymentMethod = method;

    if (params.status === 'active' || params.status === 'bank_approval_pending') {
      if (!sub.activatedAt && params.status === 'active') sub.activatedAt = new Date();
      sub.currentPeriodEnd = nextMonthDate();
      sub.nextChargeAt = nextMonthDate();

      await Organisation.updateOne(
        { publicId: sub.organisationId },
        {
          $set: {
            'planDetails.planId': sub.planId,
            'planDetails.billing.provider': 'razorpay',
            'planDetails.billing.subscriptionId': sub.subscriptionId,
            'planDetails.billing.razorpaySubscriptionId': sub.cashfreeSubscriptionId,
            'planDetails.billing.paymentMethod': method || sub.paymentMethod,
            'planDetails.billing.status': params.status,
            'planDetails.billing.updatedAt': new Date().toISOString(),
          },
        }
      );

      if (params.status === 'active' && params.amountInr && params.amountInr > 0) {
        const invoiceId = `inv_${params.paymentId || Date.now()}`;
        await BillingInvoice.findOneAndUpdate(
          {
            organisationId: sub.organisationId,
            cashfreePaymentId: params.paymentId || invoiceId,
          },
          {
            $setOnInsert: {
              invoiceId,
              organisationId: sub.organisationId,
              subscriptionId: sub.subscriptionId,
              planId: sub.planId,
              date: new Date().toISOString().slice(0, 10),
              totalInr: params.amountInr,
              status: 'paid',
              description: `${sub.planId} subscription`,
              cashfreePaymentId: params.paymentId || invoiceId,
            },
          },
          { upsert: true }
        );
      }
    }

    if (
      params.status === 'cancelled' ||
      params.status === 'expired' ||
      params.status === 'failed'
    ) {
      if (params.status === 'cancelled') sub.cancelledAt = new Date();
      await Organisation.updateOne(
        { publicId: sub.organisationId },
        {
          $set: {
            'planDetails.planId': 'free',
            'planDetails.billing.status': params.status,
            'planDetails.billing.updatedAt': new Date().toISOString(),
          },
        }
      );
    }

    await sub.save();
    return sub;
  }

  public async handleWebhook(payload: Record<string, any>) {
    const event = String(payload.event || '').trim();
    const subscriptionEntity =
      payload.payload?.subscription?.entity ||
      payload.payload?.subscription ||
      null;
    const paymentEntity =
      payload.payload?.payment?.entity || payload.payload?.payment || null;

    const providerSubscriptionId = String(
      subscriptionEntity?.id || paymentEntity?.subscription_id || ''
    );

    if (!providerSubscriptionId) {
      console.info('[razorpay] webhook without subscription id', event);
      return { handled: false, action: 'ignored', event };
    }

    const amountInr =
      Number(paymentEntity?.amount || subscriptionEntity?.plan_amount || 0) / 100 || null;
    const paymentId = paymentEntity?.id ? String(paymentEntity.id) : null;
    const paymentMethod = mapPaymentMethodFromPayment(paymentEntity);

    const status =
      inferStatusFromEvent(event, subscriptionEntity, paymentEntity) ||
      normalizeStatus(subscriptionEntity?.status);

    await this.applySubscriptionState({
      providerSubscriptionId,
      status,
      raw: { subscription: subscriptionEntity, payment: paymentEntity },
      paymentMethod,
      amountInr,
      paymentId,
    });

    return { handled: true, providerSubscriptionId, status, event };
  }
}

export default new RazorpaySubscriptionService();
