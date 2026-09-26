/**
 * Bundle processing pipeline settings. The pipeline is off unless
 * BUNDLE_PIPELINE_ENABLED=true and the ai-engine service secret
 * (AI_ENGINE_JWT_SECRET, or its alias AI_ENGINE_SERVICE_TOKEN) is set; per-org
 * access is additionally gated by organisation.features.bundles.
 */
import { aiEngineSecret } from '../utils/aiEngineToken.util';

type Env = NodeJS.ProcessEnv;

function numberFromEnv(env: Env, name: string): number {
  const value = env[name];
  if (value === undefined || value.trim() === '') return NaN;
  return Number(value);
}

function intFromEnv(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = numberFromEnv(env, name);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function floatFromEnv(env: Env, name: string, fallback: number): number {
  const raw = numberFromEnv(env, name);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return fallback;
  return raw;
}

export interface BundlePipelineConfig {
  enabled: boolean;
  /** Secret used to sign short-lived ai-engine service tokens. */
  serviceToken: string;
  aiEngineUrl: string;
  queue: string;
  retryQueue: string;
  deadQueue: string;
  retryDelayMs: number;
  prefetch: number;
  minConfidence: number;
  maxAiAttempts: number;
  maxExtractionWaitAttempts: number;
  aiTimeoutMs: number;
  staleAfterMs: number;
  sweepIntervalMs: number;
}

export function loadBundlePipelineConfig(env: Env = process.env): BundlePipelineConfig {
  const queue = env.BUNDLE_CLASSIFY_QUEUE || 'bundle.classify';
  const serviceToken = aiEngineSecret(env);
  return {
    enabled: env.BUNDLE_PIPELINE_ENABLED === 'true' && serviceToken.length > 0,
    serviceToken,
    aiEngineUrl: (env.AI_ENGINE_URL || 'http://localhost:3031').replace(/\/$/, ''),
    queue,
    retryQueue: `${queue}.retry`,
    deadQueue: `${queue}.dead`,
    retryDelayMs: intFromEnv(env, 'BUNDLE_CLASSIFY_RETRY_DELAY_MS', 30_000, 1_000, 600_000),
    prefetch: intFromEnv(env, 'BUNDLE_CLASSIFY_PREFETCH', 4, 1, 50),
    minConfidence: floatFromEnv(env, 'BUNDLE_CLASSIFY_MIN_CONFIDENCE', 0.7),
    maxAiAttempts: intFromEnv(env, 'BUNDLE_CLASSIFY_MAX_ATTEMPTS', 5, 1, 20),
    maxExtractionWaitAttempts: intFromEnv(env, 'BUNDLE_CLASSIFY_MAX_WAIT_ATTEMPTS', 40, 1, 500),
    aiTimeoutMs: intFromEnv(env, 'BUNDLE_CLASSIFY_TIMEOUT_MS', 60_000, 1_000, 300_000),
    staleAfterMs: intFromEnv(env, 'BUNDLE_CLASSIFY_STALE_MS', 10 * 60_000, 60_000, 24 * 3600_000),
    sweepIntervalMs: intFromEnv(env, 'BUNDLE_CLASSIFY_SWEEP_MS', 2 * 60_000, 10_000, 3600_000),
  };
}
