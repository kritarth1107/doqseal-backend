import mongoose from 'mongoose';
import axios from 'axios';
import { readFileSync } from 'fs';
import { join } from 'path';
import config from '../config/app.config';
import RabbitMQUtil from './rabbitmq.util';

export type CheckStatus = 'up' | 'down' | 'degraded' | 'not_configured' | 'skipped';
export type OverallStatus = 'ok' | 'degraded' | 'unhealthy';

export interface DependencyCheck {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

export interface HealthReport {
  status: OverallStatus;
  service: string;
  version: string;
  apiVersion: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  runtime: {
    node: string;
    platform: string;
  };
  deploy?: {
    gitSha: string;
  };
  features: {
    esignEnabled: boolean;
  };
  checks: {
    mongodb: DependencyCheck & { readyState?: string };
    rabbitmq: DependencyCheck;
    aiEngine: DependencyCheck;
    blobStorage: DependencyCheck;
  };
}

const READY_STATE: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function readAppVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function truncateSha(sha: string | undefined): string | undefined {
  if (!sha?.trim()) return undefined;
  return sha.trim().slice(0, 12);
}

async function checkMongo(): Promise<DependencyCheck & { readyState?: string }> {
  const started = Date.now();
  const readyState = READY_STATE[mongoose.connection.readyState] ?? 'unknown';

  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return { status: 'down', latencyMs: Date.now() - started, readyState, detail: 'not_connected' };
    }

    await mongoose.connection.db.admin().command({ ping: 1 });
    return { status: 'up', latencyMs: Date.now() - started, readyState };
  } catch {
    return { status: 'down', latencyMs: Date.now() - started, readyState, detail: 'ping_failed' };
  }
}

async function checkRabbitMq(): Promise<DependencyCheck> {
  const started = Date.now();
  try {
    const result = await RabbitMQUtil.healthCheck();
    return {
      status: result.ok ? 'up' : 'down',
      latencyMs: Date.now() - started,
      detail: result.ok ? undefined : result.reason,
    };
  } catch {
    return { status: 'down', latencyMs: Date.now() - started, detail: 'check_failed' };
  }
}

async function checkAiEngine(): Promise<DependencyCheck> {
  const started = Date.now();
  const baseUrl = config.aiEngine?.url?.trim();
  if (!baseUrl) {
    return { status: 'not_configured', detail: 'url_missing' };
  }

  try {
    const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/health`, {
      timeout: 4000,
      validateStatus: () => true,
    });

    const latencyMs = Date.now() - started;
    if (response.status >= 200 && response.status < 300) {
      const remoteStatus =
        typeof response.data?.status === 'string' ? response.data.status : undefined;
      return {
        status: remoteStatus === 'ok' || remoteStatus === 'up' ? 'up' : 'degraded',
        latencyMs,
        detail: remoteStatus && remoteStatus !== 'ok' ? remoteStatus : undefined,
      };
    }

    return {
      status: 'down',
      latencyMs,
      detail: `http_${response.status}`,
    };
  } catch {
    return { status: 'down', latencyMs: Date.now() - started, detail: 'unreachable' };
  }
}

function checkBlobStorage(): DependencyCheck {
  const configured = Boolean(config.storage?.azureConnectionString?.trim());
  if (!configured) {
    return { status: 'not_configured' };
  }
  // Do not open a live storage connection here — connection strings / account
  // metadata must not be exercised or echoed from a public health route.
  return { status: 'up', detail: 'configured' };
}

function overallStatus(checks: HealthReport['checks']): OverallStatus {
  if (checks.mongodb.status !== 'up') return 'unhealthy';

  const optionalDown =
    checks.rabbitmq.status === 'down' ||
    checks.aiEngine.status === 'down' ||
    checks.aiEngine.status === 'degraded';

  return optionalDown ? 'degraded' : 'ok';
}

/**
 * Collects public-safe dependency health. Never includes URIs, secrets,
 * hostnames, error stacks, or storage account details.
 */
export async function collectHealthReport(): Promise<HealthReport> {
  const [mongodb, rabbitmq, aiEngine] = await Promise.all([
    checkMongo(),
    checkRabbitMq(),
    checkAiEngine(),
  ]);
  const blobStorage = checkBlobStorage();

  const checks = { mongodb, rabbitmq, aiEngine, blobStorage };
  const gitSha = truncateSha(process.env.GIT_SHA);

  const report: HealthReport = {
    status: overallStatus(checks),
    service: 'doqseal-api',
    version: readAppVersion(),
    apiVersion: config.server.apiVersion,
    environment: config.server.env,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
    },
    features: {
      esignEnabled: Boolean(config.features?.esignEnabled),
    },
    checks,
  };

  if (gitSha) {
    report.deploy = { gitSha };
  }

  return report;
}
