import cashfreeClient from '../utils/cashfree.client';
import razorpayClient from '../utils/razorpay.client';
import config from '../config/app.config';

export type BillingProvider = 'cashfree' | 'razorpay' | null;

/** Which payment gateway handles new checkouts */
export function resolveBillingProvider(): BillingProvider {
  const preferred = String(process.env.BILLING_PROVIDER || '').toLowerCase();
  if (preferred === 'razorpay' && razorpayClient.isConfigured()) return 'razorpay';
  if (preferred === 'cashfree' && cashfreeClient.isConfigured()) return 'cashfree';
  if (razorpayClient.isConfigured()) return 'razorpay';
  if (cashfreeClient.isConfigured()) return 'cashfree';
  return null;
}

export function isCheckoutAvailable(): boolean {
  return resolveBillingProvider() !== null;
}

export function getCheckoutMode(): 'sandbox' | 'production' {
  const provider = resolveBillingProvider();
  if (provider === 'razorpay') return razorpayClient.getCheckoutMode();
  if (provider === 'cashfree') return cashfreeClient.getCheckoutMode();
  return config.server.env === 'production' ? 'production' : 'sandbox';
}

export default { resolveBillingProvider, isCheckoutAvailable, getCheckoutMode };
