/**
 * RabbitMQ wiring for the bundle pipeline. Uses its own channel so nothing
 * here can affect the extraction queue channel. Off unless
 * BUNDLE_PIPELINE_ENABLED=true and AI_ENGINE_JWT_SECRET (or AI_ENGINE_SERVICE_TOKEN) are set.
 *
 * Queues (all durable):
 *   bundle.classify        tasks { v, taskId, organisationId, bundleId, documentId }
 *   bundle.classify.retry  delayed retries (message TTL, dead-letters back to bundle.classify)
 *   bundle.classify.dead   messages that could not be parsed or handled
 */
import { randomUUID } from 'crypto';
import RabbitMQUtil from '../../../utils/rabbitmq.util';
import logger from '../../../utils/logger.util';
import { BundlePipelineConfig, loadBundlePipelineConfig } from '../../../config/bundlePipeline.config';
import { createClassifierClient } from './classifier.client';
import { BundlePipeline, ClassifyTaskMessage, InvalidTaskMessageError } from './pipeline.service';

let pipeline: BundlePipeline | null = null;
let channel: any = null;
let sweepTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The running pipeline, or null when it is disabled. */
export function getBundlePipeline(): BundlePipeline | null {
  return pipeline;
}

let fallbackEvaluator: BundlePipeline | null = null;

/**
 * Completeness, conflict review and status need no model call, so they keep
 * working when automatic classification is off: documents are then sorted
 * into slots by people and the bundle status still follows.
 */
function getEvaluator(): BundlePipeline {
  if (pipeline) return pipeline;
  if (!fallbackEvaluator) {
    fallbackEvaluator = new BundlePipeline({
      config: loadBundlePipelineConfig(),
      classify: async () => {
        throw new Error('automatic classification is off');
      },
      publish: async () => false,
    });
  }
  return fallbackEvaluator;
}

/** Re-evaluates a bundle now and returns the result. Throws on failure. */
export async function evaluateBundleNow(organisationId: string, bundleId: string, reason: string) {
  return getEvaluator().evaluateBundle(organisationId, bundleId, `${reason}:${randomUUID()}`);
}

export async function assertPipelineQueues(ch: any, config: BundlePipelineConfig): Promise<void> {
  await ch.assertQueue(config.deadQueue, { durable: true });
  await ch.assertQueue(config.queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': config.deadQueue,
    },
  });
  await ch.assertQueue(config.retryQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': config.retryDelayMs,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': config.queue,
    },
  });
}

/**
 * Builds the consumer callback. Acks only after the task has been handled;
 * unparseable or failing messages are dead-lettered (never requeued in a loop).
 */
export function createMessageHandler(target: BundlePipeline, getChannel: () => any) {
  return async (msg: any): Promise<void> => {
    if (!msg) return;
    const ch = getChannel();
    const settle = (ack: boolean) => {
      try {
        if (!ch) return;
        if (ack) ch.ack(msg);
        else ch.nack(msg, false, false);
      } catch (err) {
        logger.error('bundle pipeline: could not settle message', { error: errMessage(err) });
      }
    };

    let payload: unknown;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      logger.error('bundle pipeline: dropping unparseable message');
      settle(false);
      return;
    }

    try {
      const outcome = await target.handleTask(payload);
      logger.info('bundle pipeline: task handled', { outcome });
      settle(true);
    } catch (err) {
      if (err instanceof InvalidTaskMessageError) {
        logger.error('bundle pipeline: invalid task message', { error: err.message });
      } else {
        logger.error('bundle pipeline: task failed', { error: errMessage(err) });
      }
      settle(false);
    }
  };
}

async function openChannel(config: BundlePipelineConfig): Promise<void> {
  const ch = await RabbitMQUtil.createChannel();
  if (!ch) throw new Error('broker connection not available');
  ch.on('error', (err: unknown) => {
    logger.error('bundle pipeline: channel error', { error: errMessage(err) });
  });
  ch.on('close', () => {
    if (channel === ch) channel = null;
    scheduleReconnect(config);
  });
  await assertPipelineQueues(ch, config);
  await ch.prefetch(config.prefetch);
  channel = ch;
  if (pipeline) {
    await ch.consume(config.queue, createMessageHandler(pipeline, () => channel), { noAck: false });
  }
}

function scheduleReconnect(config: BundlePipelineConfig): void {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openChannel(config).catch((err) => {
      logger.error('bundle pipeline: reconnect failed', { error: errMessage(err) });
      scheduleReconnect(config);
    });
  }, 15_000);
  reconnectTimer.unref?.();
}

/**
 * Starts the consumer and the sweeper. Never throws: a failure is logged and
 * the rest of the API keeps running without the pipeline.
 */
export async function startBundlePipeline(
  config: BundlePipelineConfig = loadBundlePipelineConfig()
): Promise<boolean> {
  if (!config.enabled) {
    logger.info('bundle pipeline: disabled');
    return false;
  }
  try {
    stopped = false;
    pipeline = new BundlePipeline({
      config,
      classify: createClassifierClient({
        baseUrl: config.aiEngineUrl,
        serviceToken: config.serviceToken,
        timeoutMs: config.aiTimeoutMs,
      }),
      publish: async (queue: string, message: ClassifyTaskMessage) => {
        const ch = channel;
        if (!ch) return false;
        ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
          persistent: true,
          contentType: 'application/json',
        });
        return true;
      },
    });
    await openChannel(config);

    sweepTimer = setInterval(() => {
      const current = pipeline;
      if (!current) return;
      current.sweep().catch((err) => {
        logger.error('bundle pipeline: sweep failed', { error: errMessage(err) });
      });
    }, config.sweepIntervalMs);
    sweepTimer.unref?.();

    logger.info('bundle pipeline: started', { queue: config.queue });
    return true;
  } catch (err) {
    logger.error('bundle pipeline: failed to start', { error: errMessage(err) });
    await stopBundlePipeline();
    return false;
  }
}

export async function stopBundlePipeline(): Promise<void> {
  stopped = true;
  if (sweepTimer) clearInterval(sweepTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  sweepTimer = null;
  reconnectTimer = null;
  const ch = channel;
  channel = null;
  pipeline = null;
  if (ch) {
    try {
      await ch.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Hooks for the bundle service. They never throw. With the pipeline off they
 * only re-evaluate completeness and status (no classification).
 */
export async function notifyDocumentsAdded(
  organisationId: string,
  bundleId: string,
  documentIds: string[]
): Promise<void> {
  if (documentIds.length === 0) return;
  const current = pipeline;
  try {
    if (current) {
      await current.enqueueDocuments(organisationId, bundleId, documentIds);
    } else {
      await evaluateBundleNow(organisationId, bundleId, 'documents_added');
    }
  } catch (err) {
    logger.error('bundle pipeline: enqueue failed', { error: errMessage(err), bundleId });
  }
}

export async function notifyBundleChanged(
  organisationId: string,
  bundleId: string,
  reason: string
): Promise<void> {
  try {
    await evaluateBundleNow(organisationId, bundleId, reason);
  } catch (err) {
    logger.error('bundle pipeline: evaluation failed', { error: errMessage(err), bundleId });
  }
}
