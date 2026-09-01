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
      email: params.email.trim().toLowerCase(),
      notes: { organisation_id: params.organisationId },
    };
    if (params.contact) {
      body.contact = params.contact;
    }
    return request<{ id: string }>('POST', '/customers', body);
  }

  public async getCustomer(customerId: string): Promise<{ id: string; email?: string }> {
    return request<{ id: string; email?: string }>(
      'GET',
      `/customers/${encodeURIComponent(customerId)}`
    );
  }

  public async findCustomerByEmail(email: string): Promise<{ id: string } | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const data = await request<{ items: { id: string; email?: string }[] }>(
      'GET',
      `/customers?email=${encodeURIComponent(normalized)}&count=20`
    );

    const items = data.items || [];
    const exact = items.find(
      (c) => String(c.email || '').trim().toLowerCase() === normalized
    );
    if (exact) return { id: exact.id };
    if (items[0]?.id) return { id: items[0].id };
    return null;
  }

  public async updateCustomer(
    customerId: string,
    params: { name?: string; email?: string; contact?: string }
  ) {
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    if (params.email) body.email = params.email;
    if (params.contact) body.contact = params.contact;
    if (!Object.keys(body).length) return { id: customerId };
    return request<{ id: string }>(
      'PUT',
      `/customers/${encodeURIComponent(customerId)}`,
      body
    );
  }

  /** Reuse Razorpay customer by email / stored id — avoids duplicate-customer errors. */
  public async findOrCreateCustomer(params: {
    name: string;
    email: string;
    contact?: string;
    organisationId: string;
    existingCustomerId?: string | null;
  }): Promise<{ id: string }> {
    if (params.existingCustomerId) {
      try {
        const stored = await this.getCustomer(params.existingCustomerId);
        const storedEmail = String(stored?.email || '')
          .trim()
          .toLowerCase();
        const requestedEmail = params.email.trim().toLowerCase();
        if (stored?.id && storedEmail === requestedEmail) {
          await this.updateCustomer(stored.id, {
            name: params.name,
            contact: params.contact,
          }).catch(() => undefined);
          return { id: stored.id };
        }
      } catch {
        // stored id invalid or email mismatch — fall through
      }
    }

    const byEmail = await this.findCustomerByEmail(params.email);
    if (byEmail) {
      await this.updateCustomer(byEmail.id, {
        name: params.name,
        contact: params.contact,
      }).catch(() => undefined);
      return byEmail;
    }

    try {
      return await this.createCustomer(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(message)) {
        const fallback = await this.findCustomerByEmail(params.email);
        if (fallback) return fallback;
      }
      throw err;
    }
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
