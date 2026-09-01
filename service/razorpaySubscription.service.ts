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
import { isRazorpayAuditOnlyEvent } from '../constants/razorpay.webhook.events';

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
    case 'created':
      return 'initialized';
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
    case 'failed':
      return 'failed';
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
    const last4 = id.length >= 4 ? id.slice(-4) : id;
    return {
      type: 'upi',
      brand: 'UPI',
      last4,
      umn: vpa || null,
      instrumentId: payment.id ? String(payment.id) : null,
    };
  }
  if (method === 'card' || card.last4) {
    return {
      type: 'card',
      brand: String(card.network || card.type || 'Card'),
      last4: String(card.last4 || '****'),
      expiryMonth: card.expiry_month ? Number(card.expiry_month) : null,
      expiryYear: card.expiry_year ? Number(card.expiry_year) : null,
      instrumentId: card.id ? String(card.id) : payment.id ? String(payment.id) : null,
    };
  }
  if (method === 'emandate' || method === 'nach') {
    return { type: 'enach', brand: 'eNACH', last4: '****' };
  }
  if (method === 'wallet' && payment.wallet) {
    const wallet = String(payment.wallet);
    return {
      type: 'unknown',
      brand: wallet,
      last4: wallet.slice(-4).padStart(4, '*'),
    };
  }
  if (method === 'netbanking' && payment.bank) {
    const bank = String(payment.bank);
    return {
      type: 'unknown',
      brand: bank,
      last4: bank.slice(-4).padStart(4, '*'),
    };
  }
  return method
    ? { type: 'unknown', brand: method, last4: '****' }
    : null;
}

function extractCustomerPhone(
  payment: Record<string, any> | null | undefined
): string | null {
  if (!payment) return null;
  const raw =
    payment.contact ||
    payment.customer_details?.contact ||
    payment.customer_details?.customer_phone;
  const phone = String(raw || '')
    .replace(/\D/g, '')
    .slice(-10);
  return phone.length === 10 ? phone : null;
}

async function resolveCustomerPhone(params: {
  paymentEntity?: Record<string, any> | null;
  paymentId?: string | null;
}): Promise<string | null> {
  const fromEntity = extractCustomerPhone(params.paymentEntity);
  if (fromEntity) return fromEntity;

  if (params.paymentId) {
    try {
      const remote = await razorpayClient.getPayment(params.paymentId);
      return extractCustomerPhone(remote as Record<string, any>);
    } catch (err) {
      console.warn('[razorpay] getPayment for contact failed', params.paymentId, err);
    }
  }

  return null;
}

function paymentMethodKey(method: SavedPaymentMethod): string {
  return [
    method.type,
    method.brand,
    method.last4,
    method.instrumentId || '',
    method.umn || '',
  ].join(':');
}

async function resolvePaymentMethod(params: {
  paymentEntity?: Record<string, any> | null;
  paymentId?: string | null;
  providerSubscriptionId?: string | null;
}): Promise<SavedPaymentMethod | null> {
  const fromEntity = mapPaymentMethodFromPayment(params.paymentEntity);
  if (fromEntity && fromEntity.last4 !== '****') {
    return fromEntity;
  }

  if (params.paymentId) {
    try {
      const remote = await razorpayClient.getPayment(params.paymentId);
      const fromRemote = mapPaymentMethodFromPayment(remote as Record<string, any>);
      if (fromRemote) return fromRemote;
    } catch (err) {
      console.warn('[razorpay] getPayment failed', params.paymentId, err);
    }
  }

  if (params.providerSubscriptionId) {
    try {
      const { items } = await razorpayClient.listInvoices({
        subscriptionId: params.providerSubscriptionId,
        count: 12,
      });
      const paid = items
        .filter((inv) => inv.payment_id && inv.status === 'paid')
        .sort((a, b) => String(b.id).localeCompare(String(a.id)));

      for (const inv of paid) {
        if (!inv.payment_id) continue;
        try {
          const remote = await razorpayClient.getPayment(inv.payment_id);
          const mapped = mapPaymentMethodFromPayment(remote as Record<string, any>);
          if (mapped) return mapped;
        } catch {
          // try next invoice
        }
      }
    } catch (err) {
      console.warn(
        '[razorpay] listInvoices failed',
        params.providerSubscriptionId,
        err
      );
    }
  }

  return fromEntity;
}

async function persistPaymentMethodsOnOrg(
  organisationId: string,
  method: SavedPaymentMethod,
  status?: SubscriptionStatus
) {
  const org = await Organisation.findOne({ publicId: organisationId }).lean();
  const billing = (org?.planDetails as { billing?: Record<string, unknown> } | undefined)
    ?.billing;
  const existing = (billing?.paymentMethods as SavedPaymentMethod[] | undefined) || [];
  const key = paymentMethodKey(method);
  const already = existing.some((m) => paymentMethodKey(m) === key);
  const paymentMethods = already
    ? existing
    : [{ ...method }, ...existing].slice(0, 10);

  const update: Record<string, unknown> = {
    'planDetails.billing.paymentMethod': method,
    'planDetails.billing.paymentMethods': paymentMethods,
    'planDetails.billing.updatedAt': new Date().toISOString(),
  };
  if (status) update['planDetails.billing.status'] = status;

  await Organisation.updateOne({ publicId: organisationId }, { $set: update });
}

function nextMonthDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

function entityFromPayload(
  payload: Record<string, any>,
  key: string
): Record<string, any> | null {
  const block = payload.payload?.[key];
  if (!block) return null;
  if (block.entity && typeof block.entity === 'object') return block.entity;
  if (typeof block === 'object') return block as Record<string, any>;
  return null;
}

function extractProviderSubscriptionId(payload: Record<string, any>): string {
  const subscription = entityFromPayload(payload, 'subscription');
  const payment = entityFromPayload(payload, 'payment');
  const invoice = entityFromPayload(payload, 'invoice');
  const refund = entityFromPayload(payload, 'refund');

  const candidates = [
    subscription?.id,
    payment?.subscription_id,
    invoice?.subscription_id,
    refund?.subscription_id,
  ];

  for (const c of candidates) {
    if (c) return String(c);
  }
  return '';
}

function amountInrFromEntities(
  payment?: Record<string, any> | null,
  invoice?: Record<string, any> | null,
  subscription?: Record<string, any> | null
): number | null {
  const paise =
    Number(payment?.amount) ||
    Number(invoice?.amount) ||
    Number(invoice?.amount_paid) ||
    Number(subscription?.plan_amount) ||
    0;
  if (!paise) return null;
  return paise / 100;
}

/**
 * Map Razorpay webhook event → subscription status.
 * Returns null when the event should not change subscription status.
 */
function inferStatusFromEvent(
  event: string,
  subscription?: Record<string, any> | null,
  payment?: Record<string, any> | null,
  invoice?: Record<string, any> | null
): SubscriptionStatus | null {
  const e = event.toLowerCase();

  // ── Subscription lifecycle ─────────────────────────────
  switch (e) {
    case 'subscription.authenticated':
      return 'bank_approval_pending';
    case 'subscription.activated':
      return 'active';
    case 'subscription.charged':
      return 'active';
    case 'subscription.resumed':
      return 'active';
    case 'subscription.pending':
      return 'bank_approval_pending';
    case 'subscription.halted':
      return 'on_hold';
    case 'subscription.paused':
      return 'paused';
    case 'subscription.cancelled':
      return 'cancelled';
    case 'subscription.completed':
      return 'completed';
    case 'subscription.updated':
      return subscription?.status
        ? normalizeStatus(subscription.status)
        : null;
  }

  // ── Payment lifecycle ──────────────────────────────────
  switch (e) {
    case 'payment.authorized':
      return 'bank_approval_pending';
    case 'payment.captured':
      return 'active';
    case 'payment.failed':
      return 'failed';
  }

  // ── Invoice lifecycle ──────────────────────────────────
  switch (e) {
    case 'invoice.paid':
      return 'active';
    case 'invoice.partially_paid':
      return 'bank_approval_pending';
    case 'invoice.expired':
      return 'on_hold';
  }

  if (subscription?.status) return normalizeStatus(subscription.status);
  if (payment?.status === 'failed') return 'failed';
  if (invoice?.status === 'paid') return 'active';

  return null;
}

function shouldRecordPaidInvoice(event: string): boolean {
  const e = event.toLowerCase();
  return (
    e === 'subscription.charged' ||
    e === 'payment.captured' ||
    e === 'invoice.paid'
  );
}

function shouldRecordFailedInvoice(event: string): boolean {
  return event.toLowerCase() === 'payment.failed';
}

export class RazorpaySubscriptionService {
  public async startCheckout(params: {
    userId: string;
    organisationId: string;
    planId: string;
    customerPhone?: string;
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

    const subscriptionPayload: Record<string, unknown> = {
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
      metadata: {
        returnUrl,
        razorpayPlanId: razorpayPlan.id,
        razorpayCustomerId: customer.id,
      },
    };
    if (phone.length === 10) {
      subscriptionPayload.customerPhone = phone;
    }

    await OrganisationSubscription.create(subscriptionPayload);

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
      const paymentMethod = await resolvePaymentMethod({
        providerSubscriptionId: sub.cashfreeSubscriptionId,
      });
      await this.applySubscriptionState({
        providerSubscriptionId: sub.cashfreeSubscriptionId,
        status: normalizeStatus(remote.status),
        raw: remote as Record<string, any>,
        paymentMethod,
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

  public async recordInvoice(
    organisationId: string,
    subscriptionId: string,
    planId: string,
    paymentId: string,
    amountInr: number,
    status: 'paid' | 'failed',
    description: string
  ) {
    const invoiceId = `inv_${paymentId}`;
    await BillingInvoice.findOneAndUpdate(
      { organisationId, cashfreePaymentId: paymentId },
      {
        $set: {
          invoiceId,
          organisationId,
          subscriptionId,
          planId,
          date: new Date().toISOString().slice(0, 10),
          totalInr: amountInr,
          status,
          description,
          cashfreePaymentId: paymentId,
        },
      },
      { upsert: true }
    );
  }

  public async applySubscriptionState(params: {
    providerSubscriptionId: string;
    status: SubscriptionStatus;
    raw?: Record<string, any>;
    paymentMethod?: SavedPaymentMethod | null;
    customerPhone?: string | null;
    amountInr?: number | null;
    paymentId?: string | null;
    recordInvoice?: boolean;
    invoiceStatus?: 'paid' | 'failed';
    invoiceDescription?: string;
  }) {
    const sub = await OrganisationSubscription.findOne({
      cashfreeSubscriptionId: params.providerSubscriptionId,
      paymentProvider: 'razorpay',
    });
    if (!sub) {
      console.warn('[razorpay] subscription not found for', params.providerSubscriptionId);
      return null;
    }

    const paymentEntity = params.raw?.payment as Record<string, any> | undefined;
    const method =
      params.paymentMethod ||
      mapPaymentMethodFromPayment(paymentEntity);

    sub.status = params.status;
    if (method) sub.paymentMethod = method;

    const phone =
      params.customerPhone ||
      extractCustomerPhone(paymentEntity) ||
      null;
    if (phone) sub.customerPhone = phone;

    if (method) {
      await persistPaymentMethodsOnOrg(sub.organisationId, method, params.status);
    }

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
            'planDetails.billing.status': params.status,
            'planDetails.billing.updatedAt': new Date().toISOString(),
            ...(method
              ? {
                  'planDetails.billing.paymentMethod': method,
                }
              : {}),
          },
        }
      );

      if (
        params.recordInvoice &&
        params.amountInr &&
        params.amountInr > 0 &&
        params.paymentId
      ) {
        await this.recordInvoice(
          sub.organisationId,
          sub.subscriptionId,
          sub.planId,
          params.paymentId,
          params.amountInr,
          params.invoiceStatus || 'paid',
          params.invoiceDescription || `${sub.planId} subscription`
        );
      }
    }

    if (
      params.status === 'cancelled' ||
      params.status === 'completed' ||
      params.status === 'expired' ||
      params.status === 'failed'
    ) {
      if (params.status === 'cancelled') sub.cancelledAt = new Date();

      const downgrade =
        params.status === 'cancelled' ||
        params.status === 'completed' ||
        params.status === 'failed';

      await Organisation.updateOne(
        { publicId: sub.organisationId },
        {
          $set: {
            ...(downgrade ? { 'planDetails.planId': 'free' } : {}),
            'planDetails.billing.status': params.status,
            'planDetails.billing.updatedAt': new Date().toISOString(),
          },
        }
      );

      if (
        params.recordInvoice &&
        params.paymentId &&
        params.amountInr &&
        params.invoiceStatus === 'failed'
      ) {
        await this.recordInvoice(
          sub.organisationId,
          sub.subscriptionId,
          sub.planId,
          params.paymentId,
          params.amountInr,
          'failed',
          params.invoiceDescription || 'Payment failed'
        );
      }
    }

    if (params.status === 'on_hold' || params.status === 'paused') {
      await Organisation.updateOne(
        { publicId: sub.organisationId },
        {
          $set: {
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
    const event = String(payload.event || '').trim().toLowerCase();
    if (!event) {
      return { handled: false, action: 'ignored', reason: 'missing_event' };
    }

    const subscriptionEntity = entityFromPayload(payload, 'subscription');
    const paymentEntity = entityFromPayload(payload, 'payment');
    const invoiceEntity = entityFromPayload(payload, 'invoice');
    const refundEntity = entityFromPayload(payload, 'refund');

    const providerSubscriptionId = extractProviderSubscriptionId(payload);

    // Audit-only: disputes, downtime, refunds (no subscription state change)
    if (isRazorpayAuditOnlyEvent(event)) {
      const orgId =
        providerSubscriptionId
          ? (
              await OrganisationSubscription.findOne({
                cashfreeSubscriptionId: providerSubscriptionId,
                paymentProvider: 'razorpay',
              }).lean()
            )?.organisationId
          : null;

      if (orgId) {
        await auditService.logEvent({
          actorId: 'system:razorpay',
          organisationId: orgId,
          action: `razorpay.${event.replace(/\./g, '_')}`,
          resourceType: 'payment',
          resourceId: String(
            paymentEntity?.id || refundEntity?.id || providerSubscriptionId
          ),
          metadata: {
            event,
            paymentId: paymentEntity?.id,
            refundId: refundEntity?.id,
            subscriptionId: providerSubscriptionId,
          },
        });
      }

      return {
        handled: true,
        action: 'audit_logged',
        event,
        providerSubscriptionId: providerSubscriptionId || null,
      };
    }

    if (!providerSubscriptionId) {
      console.info('[razorpay] webhook without subscription id', event);
      return { handled: true, action: 'ignored', event, reason: 'no_subscription' };
    }

    const amountInr = amountInrFromEntities(
      paymentEntity,
      invoiceEntity,
      subscriptionEntity
    );
    const paymentId = paymentEntity?.id
      ? String(paymentEntity.id)
      : invoiceEntity?.payment_id
        ? String(invoiceEntity.payment_id)
        : invoiceEntity?.id
          ? String(invoiceEntity.id)
          : null;
    const paymentMethod = await resolvePaymentMethod({
      paymentEntity,
      paymentId,
      providerSubscriptionId,
    });
    const customerPhone = await resolveCustomerPhone({
      paymentEntity,
      paymentId,
    });

    const status =
      inferStatusFromEvent(
        event,
        subscriptionEntity,
        paymentEntity,
        invoiceEntity
      ) || normalizeStatus(subscriptionEntity?.status);

    const recordPaid =
      shouldRecordPaidInvoice(event) && paymentId && amountInr;
    const recordFailed =
      shouldRecordFailedInvoice(event) && paymentId && amountInr;

    await this.applySubscriptionState({
      providerSubscriptionId,
      status,
      raw: {
        subscription: subscriptionEntity,
        payment: paymentEntity,
        invoice: invoiceEntity,
      },
      paymentMethod,
      customerPhone,
      amountInr,
      paymentId,
      recordInvoice: Boolean(recordPaid || recordFailed),
      invoiceStatus: recordFailed ? 'failed' : 'paid',
      invoiceDescription: recordFailed
        ? `Failed: ${event}`
        : `${event} — subscription`,
    });

    const sub = await OrganisationSubscription.findOne({
      cashfreeSubscriptionId: providerSubscriptionId,
    }).lean();

    if (sub) {
      await auditService.logEvent({
        actorId: 'system:razorpay',
        organisationId: sub.organisationId,
        action: `razorpay.webhook.${event.replace(/\./g, '_')}`,
        resourceType: 'subscription',
        resourceId: sub.subscriptionId,
        metadata: {
          event,
          status,
          paymentId,
          amountInr,
          razorpaySubscriptionId: providerSubscriptionId,
        },
      });
    }

    return {
      handled: true,
      action: 'subscription_updated',
      providerSubscriptionId,
      status,
      event,
    };
  }
}

export default new RazorpaySubscriptionService();
