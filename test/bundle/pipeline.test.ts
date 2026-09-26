import { describe, it, expect, vi, beforeEach } from 'vitest';
import Organisation from '../../model/organisation.model';
import Bundle from '../../model/bundle.model';
import BundleDocument from '../../model/bundleDocument.model';
import BundleTemplateVersion from '../../model/bundleTemplateVersion.model';
import BundleEvent from '../../model/bundleEvent.model';
import Document from '../../model/document.model';
import Extraction from '../../model/extraction.model';
import { loadBundlePipelineConfig } from '../../config/bundlePipeline.config';
import { BundlePipeline, ClassifyTaskMessage } from '../../service/bundle/pipeline/pipeline.service';
import { ClassifierError, ClassifyRequest, ClassifyResult } from '../../service/bundle/pipeline/classifier.client';
import { createMessageHandler } from '../../service/bundle/pipeline/runtime';

const ORG_A = 'org_a';
const ORG_B = 'org_b';
const tpl = (org: string) => `tpl_onboarding_${org}`;

const config = loadBundlePipelineConfig({
  BUNDLE_PIPELINE_ENABLED: 'true',
  AI_ENGINE_SERVICE_TOKEN: 'test-token',
  BUNDLE_CLASSIFY_MAX_ATTEMPTS: '3',
  BUNDLE_CLASSIFY_MAX_WAIT_ATTEMPTS: '2',
} as NodeJS.ProcessEnv);

/** Canned model answers keyed by documentId. */
type Answer = Partial<ClassifyResult> | Error;

function harness(answers: Record<string, Answer | Answer[]> = {}) {
  const published: Array<{ queue: string; message: ClassifyTaskMessage }> = [];
  const calls: ClassifyRequest[] = [];
  const classify = vi.fn(async (req: ClassifyRequest): Promise<ClassifyResult> => {
    calls.push(req);
    let answer: Answer | Answer[] | undefined = answers[req.documentId];
    if (Array.isArray(answer)) answer = answer.shift();
    if (answer instanceof Error) throw answer;
    return {
      requestId: req.requestId,
      organisationId: req.organisationId,
      bundleId: req.bundleId,
      documentId: req.documentId,
      slot: null,
      confidence: 0,
      reasons: [],
      alternatives: [],
      keyFields: {},
      model: 'test-model',
      ...(answer || {}),
    };
  });
  const publish = vi.fn(async (queue: string, message: ClassifyTaskMessage) => {
    published.push({ queue, message });
    return true;
  });
  const pipeline = new BundlePipeline({ config, classify, publish });
  const lastTask = (documentId: string) =>
    [...published].reverse().find((p) => p.message.documentId === documentId)!.message;
  return { pipeline, classify, publish, published, calls, lastTask };
}

async function seedOrg(publicId: string, bundles = true) {
  await Organisation.create({
    name: publicId,
    slug: publicId,
    publicId,
    features: bundles ? { bundles: true } : { bundles: false, bundlesDisabled: true },
  });
  await BundleTemplateVersion.create({
    templateId: tpl(publicId),
    version: 1,
    organisationId: publicId,
    snapshot: {
      instructions: 'Collect identity and address proof.',
      documentTypes: [
        { key: 'identity_proof', label: 'Identity proof', required: true, minCount: 1, maxCount: 1, classificationHints: ['PAN'] },
        { key: 'address_proof', label: 'Address proof', required: true, minCount: 1, maxCount: 1, classificationHints: ['utility bill'] },
        { key: 'other', label: 'Other', required: false, minCount: 0, maxCount: 5 },
      ],
    },
    publishedBy: 'user_1',
    publishedAt: new Date(),
  });
}

async function seedBundle(org: string, bundleId: string, status = 'collecting', templateId = tpl(org)) {
  await Bundle.create({
    bundleId,
    organisationId: org,
    templateId,
    templateVersion: 1,
    createdBy: 'user_1',
    status,
  });
}

async function seedDocument(org: string, bundleId: string, documentId: string, opts: { status?: string; data?: any } = {}) {
  const status = opts.status ?? 'completed';
  await Document.create({
    documentId,
    organisationId: org,
    originalFilename: `${documentId}.pdf`,
    mimeType: 'application/pdf',
    size: 100,
    uploadedBy: 'user_1',
    status,
  });
  if (status === 'completed') {
    // Written the way the ai-engine writes it (raw insert, includes ocrFullText).
    await Extraction.collection.insertOne({
      extractionId: `ext_${documentId}`,
      documentId,
      jobId: `job_${documentId}`,
      organisationId: org,
      projectId: 'proj_1',
      version: 1,
      data: opts.data ?? { document_type: 'unknown' },
      ocrFullText: `text of ${documentId}`,
      createdAt: new Date(),
    } as any);
  }
  await BundleDocument.create({
    bundleId,
    organisationId: org,
    documentId,
    addedBy: 'user_1',
    addedAt: new Date(),
  });
}

const ok = (slot: string, keyFields: Record<string, string> = {}, confidence = 0.95): Partial<ClassifyResult> => ({
  slot,
  confidence,
  reasons: [`looks like ${slot}`],
  keyFields,
});

async function bundleOf(org: string, bundleId: string) {
  return Bundle.findOne({ organisationId: org, bundleId }).lean();
}

async function eventTypes(org: string, bundleId: string) {
  const rows = await BundleEvent.find({ organisationId: org, bundleId }).sort({ createdAt: 1 }).lean();
  return rows.map((r) => r.type);
}

describe('bundle pipeline', () => {
  beforeEach(async () => {
    await seedOrg(ORG_A);
  });

  it('happy path: classifies both documents, assigns slots and moves to ready_to_run', async () => {
    await seedBundle(ORG_A, 'b1');
    await seedDocument(ORG_A, 'b1', 'd_pan');
    await seedDocument(ORG_A, 'b1', 'd_bill');
    const h = harness({
      d_pan: ok('identity_proof', { full_name: 'Ravi Kumar', date_of_birth: '1990-01-02' }),
      d_bill: ok('address_proof', { full_name: 'RAVI KUMAR' }),
    });

    const enq = await h.pipeline.enqueueDocuments(ORG_A, 'b1', ['d_pan', 'd_bill']);
    expect(enq).toEqual({ queued: 2, pending: 0 });
    expect(h.published.map((p) => p.queue)).toEqual([config.queue, config.queue]);

    expect(await h.pipeline.handleTask(h.lastTask('d_pan'))).toBe('classified');
    expect((await bundleOf(ORG_A, 'b1'))!.status).toBe('collecting');
    expect(await h.pipeline.handleTask(h.lastTask('d_bill'))).toBe('classified');

    const bundle = await bundleOf(ORG_A, 'b1');
    expect(bundle!.status).toBe('ready_to_run');
    expect((bundle as any).pipeline.missing).toEqual([]);
    expect((bundle as any).pipeline.conflicts).toEqual([]);

    const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
    expect(link!.assignedTypeKey).toBe('identity_proof');
    expect(link!.assignedBy).toBe('auto');
    expect(link!.classification!.status).toBe('classified');
    expect(link!.keyFields).toMatchObject({ full_name: 'Ravi Kumar' });

    // The request carried only this org's slots and this document's content.
    expect(h.calls[0]).toMatchObject({ organisationId: ORG_A, bundleId: 'b1', documentId: 'd_pan' });
    expect(h.calls[0].slots.map((s) => s.key)).toEqual(['identity_proof', 'address_proof', 'other']);
    expect(h.calls[0].document.text).toBe('text of d_pan');

    const types = await eventTypes(ORG_A, 'b1');
    expect(types.filter((t) => t === 'bundle.document_queued')).toHaveLength(2);
    expect(types.filter((t) => t === 'bundle.document_classified')).toHaveLength(2);
    const statusEvents = await BundleEvent.find({ organisationId: ORG_A, type: 'bundle.status_changed' }).lean();
    expect(statusEvents.map((e) => `${e.from}->${e.to}`)).toContain('collecting->ready_to_run');
  });

  it('missing required slot keeps the bundle collecting and lists the gap', async () => {
    await seedBundle(ORG_A, 'b2');
    await seedDocument(ORG_A, 'b2', 'd_pan');
    const h = harness({ d_pan: ok('identity_proof') });
    await h.pipeline.enqueueDocuments(ORG_A, 'b2', ['d_pan']);
    expect(await h.pipeline.handleTask(h.lastTask('d_pan'))).toBe('classified');

    const bundle = await bundleOf(ORG_A, 'b2');
    expect(bundle!.status).toBe('collecting');
    expect((bundle as any).pipeline.missing.map((m: any) => m.typeKey)).toEqual(['address_proof']);
  });

  it('flags a conflict between documents for human review', async () => {
    await seedBundle(ORG_A, 'b3');
    await seedDocument(ORG_A, 'b3', 'd_pan');
    await seedDocument(ORG_A, 'b3', 'd_bill');
    const h = harness({
      d_pan: ok('identity_proof', { full_name: 'Ravi Kumar', date_of_birth: '1990-01-02' }),
      d_bill: ok('address_proof', { full_name: 'Sunita Sharma', date_of_birth: '02/01/1990' }),
    });
    await h.pipeline.enqueueDocuments(ORG_A, 'b3', ['d_pan', 'd_bill']);
    await h.pipeline.handleTask(h.lastTask('d_pan'));
    await h.pipeline.handleTask(h.lastTask('d_bill'));

    const bundle = await bundleOf(ORG_A, 'b3');
    expect(bundle!.status).toBe('needs_review');
    const conflicts = (bundle as any).pipeline.conflicts;
    expect(conflicts.map((c: any) => c.field)).toEqual(['full_name']);
    expect(conflicts[0].values.map((v: any) => v.documentId).sort()).toEqual(['d_bill', 'd_pan']);
    expect(await eventTypes(ORG_A, 'b3')).toContain('bundle.conflicts_detected');
  });

  it('low confidence leaves the slot empty and marks the document for review', async () => {
    await seedBundle(ORG_A, 'b4');
    await seedDocument(ORG_A, 'b4', 'd_x');
    const h = harness({ d_x: ok('identity_proof', {}, 0.4) });
    await h.pipeline.enqueueDocuments(ORG_A, 'b4', ['d_x']);
    expect(await h.pipeline.handleTask(h.lastTask('d_x'))).toBe('needs_review');
    const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_x' }).lean();
    expect(link!.assignedTypeKey).toBeNull();
    expect(link!.classification!.suggestedTypeKey).toBe('identity_proof');
    expect((await bundleOf(ORG_A, 'b4'))!.status).toBe('collecting');
  });

  it('ignores a slot the template does not define', async () => {
    await seedBundle(ORG_A, 'b4b');
    await seedDocument(ORG_A, 'b4b', 'd_x');
    const h = harness({ d_x: ok('passport_from_elsewhere') });
    await h.pipeline.enqueueDocuments(ORG_A, 'b4b', ['d_x']);
    expect(await h.pipeline.handleTask(h.lastTask('d_x'))).toBe('needs_review');
    const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_x' }).lean();
    expect(link!.assignedTypeKey).toBeNull();
    expect(link!.classification!.suggestedTypeKey).toBeNull();
  });

  it('keeps a slot the user assigned by hand', async () => {
    await seedBundle(ORG_A, 'b5');
    await seedDocument(ORG_A, 'b5', 'd_pan');
    await BundleDocument.updateOne(
      { organisationId: ORG_A, documentId: 'd_pan' },
      { $set: { assignedTypeKey: 'other', assignedBy: 'user' } }
    );
    const h = harness({ d_pan: ok('identity_proof') });
    await h.pipeline.enqueueDocuments(ORG_A, 'b5', ['d_pan']);
    expect(await h.pipeline.handleTask(h.lastTask('d_pan'))).toBe('classified');
    const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
    expect(link!.assignedTypeKey).toBe('other');
    expect(link!.assignedBy).toBe('user');
    expect(link!.classification!.suggestedTypeKey).toBe('identity_proof');
  });

  it('does not move bundles out of statuses it does not manage', async () => {
    await seedBundle(ORG_A, 'b6', 'running');
    await seedDocument(ORG_A, 'b6', 'd_pan');
    const h = harness({ d_pan: ok('identity_proof') });
    await h.pipeline.enqueueDocuments(ORG_A, 'b6', ['d_pan']);
    await h.pipeline.handleTask(h.lastTask('d_pan'));
    const bundle = await bundleOf(ORG_A, 'b6');
    expect(bundle!.status).toBe('running');
    expect((bundle as any).pipeline.documents.classified).toBe(1);
  });

  describe('feature flag', () => {
    it('does nothing for an organisation with case packs switched off', async () => {
      await seedOrg(ORG_B, false);
      await seedBundle(ORG_B, 'bb');
      await seedDocument(ORG_B, 'bb', 'd_b');
      const h = harness();
      expect(await h.pipeline.enqueueDocuments(ORG_B, 'bb', ['d_b'])).toEqual({ queued: 0, pending: 0 });
      expect(h.published).toEqual([]);
      const link = await BundleDocument.findOne({ organisationId: ORG_B, documentId: 'd_b' }).lean();
      expect(link!.classification ?? null).toBeNull();
      expect(await BundleEvent.countDocuments({})).toBe(0);
    });
  });

  describe('organisation isolation', () => {
    it('a task naming another org cannot touch or read that org\'s documents', async () => {
      await seedOrg(ORG_B);
      await seedBundle(ORG_B, 'bb');
      await seedDocument(ORG_B, 'bb', 'd_b');
      await seedBundle(ORG_A, 'ba');
      await seedDocument(ORG_A, 'ba', 'd_a');
      const h = harness({ d_a: ok('identity_proof'), d_b: ok('identity_proof') });
      await h.pipeline.enqueueDocuments(ORG_B, 'bb', ['d_b']);
      const realTask = h.lastTask('d_b');

      // Same taskId and bundle, but claiming org A: nothing is found.
      expect(await h.pipeline.handleTask({ ...realTask, organisationId: ORG_A })).toBe('not_found');
      // Org A's bundle id with org B's document: nothing is found.
      expect(await h.pipeline.handleTask({ ...realTask, organisationId: ORG_A, bundleId: 'ba' })).toBe('not_found');
      expect(h.calls).toHaveLength(0);

      // Enqueueing org A's document under org B does nothing either.
      expect(await h.pipeline.enqueueDocuments(ORG_B, 'bb', ['d_a'])).toEqual({ queued: 0, pending: 0 });

      expect(await h.pipeline.handleTask(realTask)).toBe('classified');
      expect(h.calls.map((c) => c.organisationId)).toEqual([ORG_B]);
      const slotsSent = h.calls[0].slots.map((s) => s.key);
      expect(slotsSent).toContain('identity_proof');
      expect(await BundleEvent.countDocuments({ organisationId: ORG_A })).toBe(0);
    });

    it('never loads another organisation\'s template', async () => {
      await seedOrg(ORG_B);
      // A bundle in org A that points at org B's template id.
      await seedBundle(ORG_A, 'ba', 'collecting', tpl(ORG_B));
      await seedDocument(ORG_A, 'ba', 'd_a');
      const h = harness({ d_a: ok('identity_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'ba', ['d_a']);
      expect(await h.pipeline.handleTask(h.lastTask('d_a'))).toBe('failed');
      expect(h.classify).not.toHaveBeenCalled();
      const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_a' }).lean();
      expect(link!.classification!.lastError).toBe('template_has_no_document_types');
    });

    it('fails a response that names a different organisation or document', async () => {
      await seedBundle(ORG_A, 'ba');
      await seedDocument(ORG_A, 'ba', 'd_a');
      const h = harness({ d_a: { ...ok('identity_proof'), organisationId: ORG_B } });
      await h.pipeline.enqueueDocuments(ORG_A, 'ba', ['d_a']);
      expect(await h.pipeline.handleTask(h.lastTask('d_a'))).toBe('failed');
      const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_a' }).lean();
      expect(link!.assignedTypeKey ?? null).toBeNull();
      expect(link!.classification!.lastError).toBe('response_mismatch');
    });
  });

  describe('retries', () => {
    it('schedules a retry on a retryable error and succeeds on the next delivery', async () => {
      await seedBundle(ORG_A, 'br');
      await seedDocument(ORG_A, 'br', 'd_pan');
      const h = harness({ d_pan: [new ClassifierError('ai-engine responded 502', true), ok('identity_proof')] });
      await h.pipeline.enqueueDocuments(ORG_A, 'br', ['d_pan']);
      const task = h.lastTask('d_pan');

      expect(await h.pipeline.handleTask(task)).toBe('retry_scheduled');
      expect(h.published.at(-1)).toEqual({ queue: config.retryQueue, message: task });
      let link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
      expect(link!.classification!.status).toBe('queued');
      expect(link!.classification!.attempts).toBe(1);

      expect(await h.pipeline.handleTask(task)).toBe('classified');
      link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
      expect(link!.assignedTypeKey).toBe('identity_proof');
    });

    it('gives up after the maximum number of attempts', async () => {
      await seedBundle(ORG_A, 'br');
      await seedDocument(ORG_A, 'br', 'd_pan');
      const err = () => new ClassifierError('ai-engine unreachable', true);
      const h = harness({ d_pan: [err(), err(), err(), err()] });
      await h.pipeline.enqueueDocuments(ORG_A, 'br', ['d_pan']);
      const task = h.lastTask('d_pan');
      expect(await h.pipeline.handleTask(task)).toBe('retry_scheduled');
      expect(await h.pipeline.handleTask(task)).toBe('retry_scheduled');
      expect(await h.pipeline.handleTask(task)).toBe('failed');
      expect(h.classify).toHaveBeenCalledTimes(3);
      const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
      expect(link!.classification!.status).toBe('failed');
      expect(await eventTypes(ORG_A, 'br')).toContain('bundle.document_classification_failed');
      // A further redelivery of the same task is a no-op.
      expect(await h.pipeline.handleTask(task)).toBe('duplicate');
      expect(h.classify).toHaveBeenCalledTimes(3);
    });

    it('fails straight away on a non-retryable error', async () => {
      await seedBundle(ORG_A, 'br');
      await seedDocument(ORG_A, 'br', 'd_pan');
      const h = harness({ d_pan: new ClassifierError('ai-engine responded 422', false) });
      await h.pipeline.enqueueDocuments(ORG_A, 'br', ['d_pan']);
      expect(await h.pipeline.handleTask(h.lastTask('d_pan'))).toBe('failed');
      const bundle = await bundleOf(ORG_A, 'br');
      // Required slots are still missing, so the bundle keeps collecting.
      expect(bundle!.status).toBe('collecting');
      expect((bundle as any).pipeline.documents.failed).toBe(1);
      expect(h.classify).toHaveBeenCalledTimes(1);
    });

    it('waits for extraction to finish before classifying', async () => {
      await seedBundle(ORG_A, 'bw');
      await seedDocument(ORG_A, 'bw', 'd_slow', { status: 'processing' });
      const h = harness({ d_slow: ok('identity_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'bw', ['d_slow']);
      const task = h.lastTask('d_slow');
      expect(await h.pipeline.handleTask(task)).toBe('retry_scheduled');
      expect(h.classify).not.toHaveBeenCalled();
      expect(await h.pipeline.handleTask(task)).toBe('retry_scheduled');
      expect(await h.pipeline.handleTask(task)).toBe('failed');
      const link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_slow' }).lean();
      expect(link!.classification!.lastError).toBe('extraction_not_ready');
    });

    it('marks the task pending when the broker is unavailable, and the sweeper re-queues it', async () => {
      await seedBundle(ORG_A, 'bs');
      await seedDocument(ORG_A, 'bs', 'd_pan');
      const h = harness({ d_pan: ok('identity_proof') });
      h.publish.mockResolvedValueOnce(false);
      expect(await h.pipeline.enqueueDocuments(ORG_A, 'bs', ['d_pan'])).toEqual({ queued: 0, pending: 1 });
      let link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
      expect(link!.classification!.status).toBe('pending');
      const oldTaskId = link!.classification!.taskId;

      expect(await h.pipeline.sweep()).toBe(1);
      link = await BundleDocument.findOne({ organisationId: ORG_A, documentId: 'd_pan' }).lean();
      expect(link!.classification!.status).toBe('queued');
      expect(link!.classification!.taskId).not.toBe(oldTaskId);
      expect(await h.pipeline.handleTask(h.lastTask('d_pan'))).toBe('classified');
      // Nothing left for the sweeper.
      expect(await h.pipeline.sweep()).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('a duplicate delivery does not call the model again or record events twice', async () => {
      await seedBundle(ORG_A, 'bi');
      await seedDocument(ORG_A, 'bi', 'd_pan');
      await seedDocument(ORG_A, 'bi', 'd_bill');
      const h = harness({ d_pan: ok('identity_proof'), d_bill: ok('address_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'bi', ['d_pan', 'd_bill']);
      const task = h.lastTask('d_pan');
      await h.pipeline.handleTask(h.lastTask('d_bill'));
      expect(await h.pipeline.handleTask(task)).toBe('classified');
      const eventsBefore = await BundleEvent.countDocuments({ organisationId: ORG_A });

      expect(await h.pipeline.handleTask(task)).toBe('duplicate');
      expect(await h.pipeline.handleTask(task)).toBe('duplicate');
      expect(h.classify).toHaveBeenCalledTimes(2);
      expect(await BundleEvent.countDocuments({ organisationId: ORG_A })).toBe(eventsBefore);
      expect((await bundleOf(ORG_A, 'bi'))!.status).toBe('ready_to_run');
    });

    it('a task superseded by a newer one is ignored', async () => {
      await seedBundle(ORG_A, 'bi');
      await seedDocument(ORG_A, 'bi', 'd_pan');
      const h = harness({ d_pan: ok('identity_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'bi', ['d_pan']);
      const first = h.lastTask('d_pan');
      await h.pipeline.enqueueDocuments(ORG_A, 'bi', ['d_pan']);
      const second = h.lastTask('d_pan');
      expect(second.taskId).not.toBe(first.taskId);
      expect(await h.pipeline.handleTask(first)).toBe('stale');
      expect(h.classify).not.toHaveBeenCalled();
      expect(await h.pipeline.handleTask(second)).toBe('classified');
    });

    it('re-evaluating an unchanged bundle does not change status or emit events', async () => {
      await seedBundle(ORG_A, 'bi');
      await seedDocument(ORG_A, 'bi', 'd_pan');
      await seedDocument(ORG_A, 'bi', 'd_bill');
      const h = harness({ d_pan: ok('identity_proof'), d_bill: ok('address_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'bi', ['d_pan', 'd_bill']);
      await h.pipeline.handleTask(h.lastTask('d_pan'));
      await h.pipeline.handleTask(h.lastTask('d_bill'));
      const before = await BundleEvent.countDocuments({ organisationId: ORG_A });
      const res = await h.pipeline.evaluateBundle(ORG_A, 'bi', 'manual');
      expect(res).toEqual({ status: 'ready_to_run', changed: false, target: 'ready_to_run' });
      expect(await BundleEvent.countDocuments({ organisationId: ORG_A })).toBe(before);
    });

    it('removing a document is reflected on the next evaluation', async () => {
      await seedBundle(ORG_A, 'bi');
      await seedDocument(ORG_A, 'bi', 'd_pan');
      await seedDocument(ORG_A, 'bi', 'd_bill');
      const h = harness({ d_pan: ok('identity_proof'), d_bill: ok('address_proof') });
      await h.pipeline.enqueueDocuments(ORG_A, 'bi', ['d_pan', 'd_bill']);
      await h.pipeline.handleTask(h.lastTask('d_pan'));
      await h.pipeline.handleTask(h.lastTask('d_bill'));
      await BundleDocument.updateOne({ organisationId: ORG_A, documentId: 'd_bill' }, { $set: { removedAt: new Date() } });
      const res = await h.pipeline.evaluateBundle(ORG_A, 'bi', 'document_removed:1');
      expect(res).toEqual({ status: 'collecting', changed: true, target: 'collecting' });
    });
  });
});

describe('message handler', () => {
  function fakeChannel() {
    return { ack: vi.fn(), nack: vi.fn() };
  }
  const msg = (body: unknown) => ({ content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) });

  it('acks after the task is handled', async () => {
    const ch = fakeChannel();
    const target = { handleTask: vi.fn(async () => 'classified') } as any;
    const m = msg({ v: 1, taskId: 't', organisationId: 'o', bundleId: 'b', documentId: 'd' });
    await createMessageHandler(target, () => ch)(m);
    expect(ch.ack).toHaveBeenCalledWith(m);
    expect(ch.nack).not.toHaveBeenCalled();
  });

  it('dead-letters unparseable messages without handling them', async () => {
    const ch = fakeChannel();
    const target = { handleTask: vi.fn() } as any;
    const m = msg('not json');
    await createMessageHandler(target, () => ch)(m);
    expect(target.handleTask).not.toHaveBeenCalled();
    expect(ch.nack).toHaveBeenCalledWith(m, false, false);
  });

  it('dead-letters (no requeue loop) when handling throws', async () => {
    const ch = fakeChannel();
    const target = { handleTask: vi.fn(async () => { throw new Error('db down'); }) } as any;
    const m = msg({ v: 1, taskId: 't', organisationId: 'o', bundleId: 'b', documentId: 'd' });
    await createMessageHandler(target, () => ch)(m);
    expect(ch.nack).toHaveBeenCalledWith(m, false, false);
    expect(ch.ack).not.toHaveBeenCalled();
  });

  it('dead-letters messages missing required fields via the real pipeline parser', async () => {
    const ch = fakeChannel();
    const h = harness();
    const m = msg({ v: 1, taskId: 't' });
    await createMessageHandler(h.pipeline, () => ch)(m);
    expect(ch.nack).toHaveBeenCalledWith(m, false, false);
  });
});

describe('config', () => {
  it('is disabled unless both the flag and the token are set', () => {
    expect(loadBundlePipelineConfig({} as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(loadBundlePipelineConfig({ BUNDLE_PIPELINE_ENABLED: 'true' } as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(loadBundlePipelineConfig({ AI_ENGINE_SERVICE_TOKEN: 'x' } as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(
      loadBundlePipelineConfig({ BUNDLE_PIPELINE_ENABLED: 'true', AI_ENGINE_SERVICE_TOKEN: 'x' } as NodeJS.ProcessEnv).enabled
    ).toBe(true);
  });

  it('falls back to defaults for empty or invalid numbers', () => {
    const c = loadBundlePipelineConfig({ BUNDLE_CLASSIFY_RETRY_DELAY_MS: '', BUNDLE_CLASSIFY_MIN_CONFIDENCE: '7' } as NodeJS.ProcessEnv);
    expect(c.retryDelayMs).toBe(30_000);
    expect(c.minConfidence).toBe(0.7);
    expect(c.queue).toBe('bundle.classify');
    expect(c.retryQueue).toBe('bundle.classify.retry');
    expect(c.deadQueue).toBe('bundle.classify.dead');
  });
});
