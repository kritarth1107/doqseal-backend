/**
 * Public / consumer email and mail-host domains — not eligible for domain
 * verification or auto-join (claim, verify, or auto-join as member).
 */
const BLOCKED_EMAIL_DOMAINS = new Set([
  // Google
  'gmail.com',
  'googlemail.com',
  'google.com',
  'google.co.in',
  'google.co.uk',
  'google.ca',
  'googlemail.co.uk',
  // Microsoft
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'outlook.com',
  'outlook.in',
  'outlook.co.uk',
  'live.com',
  'live.in',
  'msn.com',
  // Yahoo
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'yahoo.in',
  'ymail.com',
  'rocketmail.com',
  // Apple
  'icloud.com',
  'me.com',
  'mac.com',
  // Other free providers
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'tutanota.com',
  'fastmail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.net',
  'web.de',
  'mail.ru',
  'inbox.ru',
  'list.ru',
  'bk.ru',
  // India
  'rediffmail.com',
  'rediff.com',
  'sify.com',
  // Disposable / temp (common)
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
]);

export function extractEmailDomain(email: string): string | null {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalizeDomain(normalized.slice(at + 1));
}

export function normalizeDomain(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\.+$/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

export function isPublicEmailDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  if (!normalized) return true;
  return BLOCKED_EMAIL_DOMAINS.has(normalized);
}

export function emailMatchesDomain(email: string, domain: string): boolean {
  const emailDomain = extractEmailDomain(email);
  const normalized = normalizeDomain(domain);
  if (!emailDomain || !normalized) return false;
  return emailDomain === normalized;
}

/** Domain must be a real company domain — not a public mail provider. */
export function assertEligibleVerificationDomain(domain: string): void {
  const normalized = normalizeDomain(domain);
  if (!normalized || !normalized.includes('.')) {
    throw new Error('Enter a valid domain (e.g. acme.com)');
  }
  if (isPublicEmailDomain(normalized)) {
    throw new Error(
      'Public email providers (Gmail, Outlook, Yahoo, etc.) cannot be used for domain verification'
    );
  }
}

/** Admin must be signed in with an email on the domain they are verifying. */
export function assertUserEmailMatchesDomain(
  email: string,
  domain: string
): void {
  const userDomain = extractEmailDomain(email);
  if (!userDomain || isPublicEmailDomain(userDomain)) {
    throw new Error(
      'You must sign in with a work email on your company domain to verify it (not Gmail, Outlook, etc.)'
    );
  }
  if (!emailMatchesDomain(email, domain)) {
    const normalized = normalizeDomain(domain);
    throw new Error(
      `Your account email must be on @${normalized} to verify this domain`
    );
  }
}
