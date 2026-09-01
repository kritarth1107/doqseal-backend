import crypto from 'crypto';
import config from '../config/app.config';

export type RazorpayPlan = {
  id: string;
  period: string;
  item: { name: string; amount: number; currency: string };
};

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  short_url?: string;
  customer_id?: string;
  notes?: Record<string, string>;
  [key: string]: unknown;
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
  }): Promise<RazorpayPlan> {
    return request<RazorpayPlan>('POST', '/plans', {
      period: 'monthly',
      interval: 1,
      item: {
        name: params.name.slice(0, 250),
        amount: Math.round(params.amountInr * 100),
        currency: 'INR',
      },
      notes: { doqseal_plan_id: params.planId },
    });
  }

  public async createCustomer(params: {
    name: string;
    email: string;
    contact: string;
    organisationId: string;
  }) {
    return request<{ id: string }>('POST', '/customers', {
      name: params.name,
      email: params.email,
      contact: params.contact,
      notes: { organisation_id: params.organisationId },
    });
  }

  public async createSubscription(params: {
    planId: string;
    customerId?: string;
    totalCount?: number;
    notes: Record<string, string>;
  }): Promise<RazorpaySubscription> {
    return request<RazorpaySubscription>('POST', '/subscriptions', {
      plan_id: params.planId,
      customer_id: params.customerId,
      customer_notify: 1,
      total_count: params.totalCount ?? 120,
      notes: params.notes,
    });
  }

  public async getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    return request<RazorpaySubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`
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
