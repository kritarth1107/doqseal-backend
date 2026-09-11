/**
 * Parse simple duration strings used in env config (e.g. "24h", "30d", "90m").
 * Returns milliseconds. Falls back to `fallbackMs` on invalid input.
 */
export function parseDurationToMs(value: string | undefined, fallbackMs: number): number {
  if (!value || typeof value !== 'string') return fallbackMs;
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(trimmed);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;

  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

export function durationFromNow(value: string | undefined, fallbackMs: number): Date {
  return new Date(Date.now() + parseDurationToMs(value, fallbackMs));
}
