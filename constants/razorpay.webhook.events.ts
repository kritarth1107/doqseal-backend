/** Razorpay webhook event names (subscriptions + payments). */

export const RAZORPAY_SUBSCRIPTION_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.completed',
  'subscription.updated',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.paused',
  'subscription.resumed',
] as const;

export const RAZORPAY_PAYMENT_EVENTS = [
  'payment.authorized',
  'payment.failed',
  'payment.captured',
  'payment.dispute.created',
  'payment.dispute.action_required',
  'payment.dispute.under_review',
  'payment.dispute.won',
  'payment.dispute.lost',
  'payment.dispute.closed',
  'payment.downtime.started',
  'payment.downtime.resolved',
  'payment.downtime.updated',
] as const;

export const RAZORPAY_INVOICE_EVENTS = [
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.expired',
] as const;

export const RAZORPAY_REFUND_EVENTS = [
  'refund.created',
  'refund.processed',
  'refund.failed',
  'refund.speed_changed',
] as const;

export type RazorpayWebhookEvent =
  | (typeof RAZORPAY_SUBSCRIPTION_EVENTS)[number]
  | (typeof RAZORPAY_PAYMENT_EVENTS)[number]
  | (typeof RAZORPAY_INVOICE_EVENTS)[number]
  | (typeof RAZORPAY_REFUND_EVENTS)[number];

export function isRazorpayAuditOnlyEvent(event: string): boolean {
  const e = event.toLowerCase();
  return (
    e.startsWith('payment.dispute.') ||
    e.startsWith('payment.downtime.') ||
    e.startsWith('refund.')
  );
}
