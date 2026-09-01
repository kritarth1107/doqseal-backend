import { v4 as uuidv4 } from 'uuid';
import Organisation from '../model/organisation.model';
import OrganisationSubscription, {
  SavedPaymentMethod,
  SubscriptionStatus,
} from '../model/organisationSubscription.model';
import BillingInvoice from '../model/billingInvoice.model';
import User from '../model/user.model';
import planService from './plan.service';
import cashfreeClient from '../utils/cashfree.client';
import config from '../config/app.config';
import { assertOrgRole, assertUserInOrganisation } from '../utils/org-access.util';
import auditService from './audit.service';

const PAID_PLAN_IDS = new Set(['starter', 'growth', 'scale']);

function normalizeStatus(raw?: string | null): SubscriptionStatus {
  const value = String(raw || '').toUpperCase();
  switch (value) {
    case 'ACTIVE':
      return 'active';
    case 'BANK_APPROVAL_PENDING':
      return 'bank_approval_pending';
    case 'ON_HOLD':
      return 'on_hold';
    case 'PAUSED':
      return 'paused';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    case 'COMPLETED':
      return 'completed';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
      return 'failed';
    case 'INITIALIZED':
    default:
      return 'initialized';
  }
}

function mapPaymentMethodFromWebhook(
  data: Record<string, any>
): SavedPaymentMethod | null {
  const auth =
    data.authorization_details ||
    data.payment_method ||
    data.payment ||
    data;

  const mode = String(
    auth.payment_method ||
      auth.payment_mode ||
      auth.cf_mode ||
      auth.mode ||
      ''
  ).toLowerCase();

  if (mode.includes('upi') || auth.umn) {
    const vpa = String(auth.upi_id || auth.vpa || auth.umn || 'UPI');
    return {
      type: 'upi',
      brand: 'UPI',
      last4: vpa.slice(-4),
      umn: auth.umn || null,
    };
  }

  if (mode.includes('card') || auth.card_number || auth.last4) {
    const network = String(
      auth.card_network || auth.card_type || auth.brand || 'Card'
    );
    const last4 = String(
      auth.card_number_last4 ||
        auth.last4 ||
        auth.card_number?.slice?.(-4) ||
        '****'
    );
    return {
      type: 'card',
      brand: network,
      last4,
      expiryMonth: auth.card_expiry_mm ? Number(auth.card_expiry_mm) : null,
      expiryYear: auth.card_expiry_yy ? Number(auth.card_expiry_yy) : null,
      instrumentId: auth.instrument_id || auth.cf_payment_id || null,
    };
  }

  if (mode.includes('enach') || mode.includes('nach')) {
    return {
      type: 'enach',
      brand: 'eNACH',
      last4: String(auth.account_number || auth.last4 || '****').slice(-4),
    };
  }

  if (!mode && !auth) return null;

  return {
    type: 'unknown',
    brand: mode || 'Mandate',
    last4: '****',
  };
}

function nextMonthDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

export class CashfreeSubscriptionService {
  public async startCheckout(params: {
    userId: string;
    organisationId: string;
    planId: string;
    customerPhone: string;
  }) {
    const { userId, organisationId, planId } = params;
    await assertUserInOrganisation(userId, organisationId);
    await assertOrgRole(userId, organisationId, 'admin');

    if (!cashfreeClient.isConfigured()) {
      throw new Error(
        'Cashfree is not configured. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY.'
      );
    }

    if (!PAID_PLAN_IDS.has(planId)) {
      throw new Error('Only Starter, Growth, and Scale can be purchased online');
    }

    const phone = String(params.customerPhone || '')
      .replace(/\D/g, '')
      .slice(-10);
    if (phone.length !== 10) {
      throw new Error('A valid 10-digit Indian mobile number is required');
    }

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

    const created = await cashfreeClient.createSubscription({
      subscription_id: subscriptionId,
      customer_details: {
        customer_name: user.name,
        customer_email: user.email,
        customer_phone: phone,
      },
      plan_details: {
        plan_name: `DoqSeal ${plan.name}`.slice(0, 40),
        plan_type: 'PERIODIC',
        plan_amount: plan.priceInrMonthly,
        plan_max_amount: plan.priceInrMonthly,
        plan_currency: 'INR',
        plan_interval_type: 'MONTH',
        plan_intervals: 1,
        plan_max_cycles: 120,
      },
      authorization_details: {
        authorization_amount: 1,
        authorization_amount_refund: true,
        payment_methods: ['card', 'upi', 'enach'],
      },
      subscription_meta: {
        return_url: returnUrl,
        notification_channel: ['EMAIL'],
      },
      subscription_tags: {
        organisation_id: organisationId,
        plan_id: planId,
        user_id: userId,
      },
    });

    let paymentSessionId: string | null =
      (created.subscription_session_id as string) || null;
    let paymentUrl: string | null = null;

    try {
      const authPayment = await cashfreeClient.createSubscriptionPayment({
        subscription_id: created.subscription_id || subscriptionId,
        payment_id: `pay_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        payment_amount: 1,
        payment_type: 'AUTH',
        payment_schedule_date: new Date().toISOString(),
      });

      paymentSessionId =
        (authPayment.payment_session_id as string) ||
        (authPayment.subscription_session_id as string) ||
        paymentSessionId;
      paymentUrl = authPayment.data?.url || null;
    } catch (err) {
      console.warn(
        '[cashfree] AUTH payment create failed; using subscription session if present',
        err
      );
    }

    await OrganisationSubscription.create({
      subscriptionId,
      organisationId,
      userId,
      planId,
      cashfreeSubscriptionId: created.subscription_id || subscriptionId,
      cashfreeCfSubscriptionId: created.cf_subscription_id
        ? String(created.cf_subscription_id)
        : null,
      status: normalizeStatus(created.subscription_status),
      amountInr: plan.priceInrMonthly,
      currency: 'INR',
      customerPhone: phone,
      metadata: {
        returnUrl,
      },
    });

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'billing.subscription_checkout_started',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      metadata: { planId, amountInr: plan.priceInrMonthly },
    });

    return {
      subscriptionId,
      cashfreeSubscriptionId: created.subscription_id || subscriptionId,
      paymentSessionId,
      subscriptionSessionId: created.subscription_session_id || paymentSessionId,
      paymentUrl,
      checkoutMode: cashfreeClient.getCheckoutMode(),
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
      const remote = await cashfreeClient.getSubscription(
        sub.cashfreeSubscriptionId
      );
      await this.applySubscriptionState({
        cashfreeSubscriptionId: sub.cashfreeSubscriptionId,
        status: normalizeStatus(remote.subscription_status as string),
        raw: remote as Record<string, any>,
      });
    } catch (err) {
      console.warn('[cashfree] syncAfterReturn failed', err);
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
    cashfreeSubscriptionId: string;
    status: SubscriptionStatus;
    raw?: Record<string, any>;
    paymentMethod?: SavedPaymentMethod | null;
    amountInr?: number | null;
    paymentId?: string | null;
  }) {
    const sub = await OrganisationSubscription.findOne({
      cashfreeSubscriptionId: params.cashfreeSubscriptionId,
    });
    if (!sub) {
      console.warn(
        '[cashfree] subscription not found for',
        params.cashfreeSubscriptionId
      );
      return null;
    }

    const method =
      params.paymentMethod ||
      (params.raw ? mapPaymentMethodFromWebhook(params.raw) : null);

    sub.status = params.status;
    if (method) {
      sub.paymentMethod = method;
    }

    if (params.status === 'active' || params.status === 'bank_approval_pending') {
      if (!sub.activatedAt) sub.activatedAt = new Date();
      sub.currentPeriodEnd = nextMonthDate();
      sub.nextChargeAt = nextMonthDate();

      await Organisation.updateOne(
        { publicId: sub.organisationId },
        {
          $set: {
            'planDetails.planId': sub.planId,
            'planDetails.billing.provider': 'cashfree',
            'planDetails.billing.subscriptionId': sub.subscriptionId,
            'planDetails.billing.cashfreeSubscriptionId':
              sub.cashfreeSubscriptionId,
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
      if (params.status === 'cancelled') {
        sub.cancelledAt = new Date();
      }
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
    const type = String(payload.type || payload.event || '').toUpperCase();
    const data = (payload.data || payload) as Record<string, any>;

    const cashfreeSubscriptionId = String(
      data.subscription_id ||
        data.cf_subscriptionId ||
        data.subscriptionId ||
        data.subscription?.subscription_id ||
        ''
    );

    if (!cashfreeSubscriptionId) {
      console.warn('[cashfree] webhook missing subscription_id', type);
      return { handled: false };
    }

    const statusRaw =
      data.subscription_status ||
      data.cf_subscriptionStatus ||
      data.status ||
      data.subscription?.subscription_status;

    const status = normalizeStatus(statusRaw);
    const paymentMethod = mapPaymentMethodFromWebhook(data);

    const amount =
      Number(
        data.payment_amount ||
          data.cf_authAmount ||
          data.authorization_amount ||
          data.amount ||
          0
      ) || null;

    const paymentId = String(
      data.payment_id ||
        data.cf_paymentId ||
        data.cf_subscriptionPaymentId ||
        data.payment?.payment_id ||
        ''
    );

    await this.applySubscriptionState({
      cashfreeSubscriptionId,
      status:
        type.includes('PAYMENT') && type.includes('FAILED')
          ? 'failed'
          : status,
      raw: data,
      paymentMethod,
      amountInr: amount,
      paymentId: paymentId || null,
    });

    return { handled: true, cashfreeSubscriptionId, status, type };
  }
}

export default new CashfreeSubscriptionService();
