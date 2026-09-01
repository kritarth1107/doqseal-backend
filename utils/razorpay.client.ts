import crypto from 'crypto';
import config from '../config/app.config';

export type RazorpayPlan = {
  id: string;
  period: string;
  item: { name: string; amount: number; currency: string };
};

export type BillingInterval = 'monthly' | 'yearly';

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  short_url?: string;
  customer_id?: string;
  notes?: Record<string, string>;
  [key: string]: unknown;
};

export type RazorpayPayment = {
  id: string;
  method?: string;
  status?: string;
  amount?: number;
  subscription_id?: string;
  card?: {
    id?: string;
    last4?: string;
    network?: string;
    type?: string;
    expiry_month?: number;
    expiry_year?: number;
  };
  vpa?: string;
  upi?: { vpa?: string };
  bank?: string;
  wallet?: string;
  [key: string]: unknown;
};

export type RazorpayInvoice = {
  id: string;
  status?: string;
  payment_id?: string;
  subscription_id?: string;
  amount?: number;
  amount_paid?: number;
};

function authHeader(): string {
  const keyId = config.razorpay.keyId;
  const secret = config.razorpay.keySecret;
  if (!keyId || !secret) {
    throw new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }
  return `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const message =
      data?.error?.description ||
      data?.error?.reason ||
      data?.message ||
      `Razorpay API error (${res.status})`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data as T;
}

export function verifyRazorpayWebhookSignature(params: {
  signature: string;
  rawBody: string;
}): boolean {
  const secret = config.razorpay.webhookSecret || config.razorpay.keySecret;
  if (!secret || !params.signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(params.rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(params.signature)
    );
  } catch {
    return expected === params.signature;
  }
}

export class RazorpayClient {
  public async createPlan(params: {
    name: string;
    amountInr: number;
    planId: string;
    interval?: BillingInterval;
  }): Promise<RazorpayPlan> {
    const interval = params.interval ?? 'monthly';
    return request<RazorpayPlan>('POST', '/plans', {
      period: interval === 'yearly' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: params.name.slice(0, 250),
        amount: Math.round(params.amountInr * 100),
        currency: 'INR',
      },
      notes: {
        doqseal_plan_id: params.planId,
        billing_interval: interval,
      },
    });
  }

  public async createCustomer(params: {
    name: string;
    email: string;
    contact?: string;
    organisationId: string;
  }) {
    const body: Record<string, unknown> = {
      name: params.name,
      email: params.email,
      notes: { organisation_id: params.organisationId },
    };
    if (params.contact) {
      body.contact = params.contact;
    }
    return request<{ id: string }>('POST', '/customers', body);
  }

  public async createSubscription(params: {
    planId: string;
    customerId?: string;
    totalCount?: number;
    notes: Record<string, string>;
    billingInterval?: BillingInterval;
  }): Promise<RazorpaySubscription> {
    const billingInterval = params.billingInterval ?? 'monthly';
    return request<RazorpaySubscription>('POST', '/subscriptions', {
      plan_id: params.planId,
      customer_id: params.customerId,
      customer_notify: 1,
      total_count:
        params.totalCount ??
        (billingInterval === 'yearly' ? 10 : 120),
      notes: params.notes,
    });
  }

  public async getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    return request<RazorpaySubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`
    );
  }

  public async getPayment(paymentId: string): Promise<RazorpayPayment> {
    return request<RazorpayPayment>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`
    );
  }

  public async listInvoices(params: {
    subscriptionId: string;
    count?: number;
  }): Promise<{ items: RazorpayInvoice[] }> {
    const count = params.count ?? 12;
    return request<{ items: RazorpayInvoice[] }>(
      'GET',
      `/invoices?subscription_id=${encodeURIComponent(params.subscriptionId)}&count=${count}`
    );
  }

  public async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true) {
    return request(
      'POST',
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }
    );
  }

  public isConfigured(): boolean {
    return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
  }

  public getKeyId(): string | undefined {
    return config.razorpay.keyId;
  }

  public getCheckoutMode(): 'sandbox' | 'production' {
    return config.razorpay.keyId?.startsWith('rzp_live_')
      ? 'production'
      : 'sandbox';
  }
}

export default new RazorpayClient();
