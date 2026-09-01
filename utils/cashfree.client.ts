import crypto from 'crypto';
import config from '../config/app.config';

export type CashfreeSubscriptionCreateResponse = {
  subscription_id: string;
  cf_subscription_id?: string | number;
  subscription_session_id?: string;
  subscription_status?: string;
  [key: string]: unknown;
};

export type CashfreePaymentCreateResponse = {
  payment_id?: string;
  cf_payment_id?: string | number;
  payment_session_id?: string;
  subscription_session_id?: string;
  data?: {
    url?: string;
    payload?: string;
  };
  [key: string]: unknown;
};

function baseUrl(): string {
  return config.cashfree.env === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

function headers(): Record<string, string> {
  if (!config.cashfree.appId || !config.cashfree.secretKey) {
    throw new Error(
      'Cashfree is not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.'
    );
  }
  return {
    'Content-Type': 'application/json',
    'x-api-version': config.cashfree.apiVersion,
    'x-client-id': config.cashfree.appId,
    'x-client-secret': config.cashfree.secretKey,
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: headers(),
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
      data?.message ||
      data?.error ||
      data?.message_code ||
      `Cashfree API error (${res.status})`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data as T;
}

export function verifyCashfreeWebhookSignature(params: {
  signature: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  const secret = config.cashfree.webhookSecret || config.cashfree.secretKey;
  if (!secret) return false;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(params.timestamp + params.rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(params.signature)
    );
  } catch {
    return computed === params.signature;
  }
}

export class CashfreeClient {
  public async createSubscription(payload: Record<string, unknown>) {
    return request<CashfreeSubscriptionCreateResponse>(
      'POST',
      '/subscriptions',
      payload
    );
  }

  public async createSubscriptionPayment(payload: Record<string, unknown>) {
    return request<CashfreePaymentCreateResponse>(
      'POST',
      '/subscriptions/pay',
      payload
    );
  }

  public async getSubscription(subscriptionId: string) {
    return request<CashfreeSubscriptionCreateResponse>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`
    );
  }

  public async cancelSubscription(subscriptionId: string) {
    return request(
      'POST',
      `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`,
      {
        subscription_id: subscriptionId,
        action: 'CANCEL',
        action_details: {
          cancel_immediately: false,
        },
      }
    );
  }

  public isConfigured(): boolean {
    return Boolean(config.cashfree.appId && config.cashfree.secretKey);
  }

  public getCheckoutMode(): 'sandbox' | 'production' {
    return config.cashfree.env === 'production' ? 'production' : 'sandbox';
  }
}

export default new CashfreeClient();
