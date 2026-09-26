import { describe, it, expect, vi, beforeEach } from 'vitest';

// Membership stand-in: roles[org][user]. Mirrors assertOrgRole's messages.
const roles: Record<string, Record<string, 'owner' | 'admin' | 'member'>> = {};
const RANK = { owner: 3, admin: 2, member: 1 } as const;
vi.mock('../../utils/org-access.util', () => ({
  assertOrgRole: vi.fn(async (userId: string, orgId: string, minRole: 'owner' | 'admin' | 'member') => {
    const role = roles[orgId]?.[userId];
    if (!role) throw new Error('You do not have access to this organisation');
    if (RANK[role] < RANK[minRole]) throw new Error(`Requires ${minRole} role or higher`);
    return { role };
  }),
  resolveOrganisationId: (req: { headers: Record<string, unknown> }) => req.headers['x-organisation-id'],
}));

import Organisation from '../../model/organisation.model';
import User from '../../model/user.model';
import Bundle from '../../model/bundle.model';
import BundleDocument from '../../model/bundleDocument.model';
import BundleTemplate from '../../model/bundleTemplate.model';
import BundleTemplateVersion from '../../model/bundleTemplateVersion.model';
import BundleExceptionAction from '../../model/bundleExceptionAction.model';
import BundleEvent from '../../model/bundleEvent.model';
import Document from '../../model/document.model';
import bundleService from '../../service/bundle.service';
import bundleTemplateService from '../../service/bundleTemplate.service';
import userService from '../../service/user.service';
import { evaluateBundleNow, getBundlePipeline } from '../../service/bundle/pipeline/runtime';
import { BUNDLE_STARTER_TEMPLATES } from '../../constants/bundleStarterTemplates';
import { sendBundleError } from '../../utils/bundleHttp.util';
import { NotFoundError } from '../../utils/errors.util';

const ORG_A = 'org_a';
const ORG_B = 'org_b';
const MEMBER = 'user_member';
const ADMIN = 'user_admin';
const OUTSIDER = 'user_b';

async function seedOrgs() {
  for (const k of Object.keys(roles)) delete roles[k];
  roles[ORG_A] = { [MEMBER]: 'member', [ADMIN]: 'admin' };
  roles[ORG_B] = { [OUTSIDER]: 'owner' };
  await Organisation.create({ name: 'A', slug: 'a', publicId: ORG_A, features: { bundles: true } });
  await Organisation.create({ name: 'B', slug: 'b', publicId: ORG_B, features: { bundles: false } });
  await User.create({ userId: MEMBER, name: 'Meera Member', email: 'm@a.test' });
  await User.create({ userId: ADMIN, name: 'Arjun Admin', email: 'a@a.test' });
  await User.create({ userId: OUTSIDER, name: 'Other Org', email: 'b@b.test' });
}

/** Org A bundle with two required slots and two documents whose names differ. */
async function seedBundle(opts: { conflicting?: boolean } = {}) {
  await BundleTemplate.create({
    templateId: 'tpl_a',
    organisationId: ORG_A,
    name: 'Onboarding',
    status: 'published',
    latestVersion: 1,
    draft: { documentTypes: [] },
    createdBy: ADMIN,
  });
  await BundleTemplateVersion.create({
    templateId: 'tpl_a',
    version: 1,
    organisationId: ORG_A,
    snapshot: {
      documentTypes: [
        { key: 'identity_proof', label: 'Identity proof', required: true, minCount: 1, maxCount: 1 },
        { key: 'address_proof', label: 'Address proof', required: true, minCount: 1, maxCount: 1 },
        { key: 'other', label: 'Other', required: false, minCount: 0, maxCount: 5 },
      ],
    },
    publishedBy: ADMIN,
    publishedAt: new Date(),
  });
  await Bundle.create({
    bundleId: 'b1',
    organisationId: ORG_A,
    templateId: 'tpl_a',
    templateVersion: 1,
    name: 'Ravi onboarding',
    externalRef: 'APP-001',
    createdBy: MEMBER,
  });
  for (const [documentId, uploadedBy, shared] of [
    ['d1', MEMBER, true],
    ['d2', MEMBER, true],
    ['d3', ADMIN, false],
  ] as const) {
    await Document.create({
      documentId,
      organisationId: ORG_A,
      originalFilename: `${documentId}.pdf`,
      mimeType: 'application/pdf',
      size: 10,
      uploadedBy,
      sharedWithOrganisation: shared,
    });
  }
  const second = opts.conflicting === false ? 'Ravi Kumar' : 'Suresh Iyer';
  await BundleDocument.create({
    bundleId: 'b1',
    organisationId: ORG_A,
    documentId: 'd1',
    assignedTypeKey: 'identity_proof',
    assignedBy: 'auto',
    addedBy: MEMBER,
    classification: { status: 'classified', attempts: 1, reasons: [], alternatives: [], confidence: 0.95 },
    keyFields: { full_name: 'Ravi Kumar' },
  });
  await BundleDocument.create({
    bundleId: 'b1',
    organisationId: ORG_A,
    documentId: 'd2',
    assignedTypeKey: null,
    assignedBy: 'auto',
    addedBy: MEMBER,
    classification: {
      status: 'needs_review',
      attempts: 1,
      reasons: ['looks like a utility bill'],
      alternatives: [{ slot: 'address_proof', confidence: 0.55 }],
      suggestedTypeKey: 'address_proof',
      confidence: 0.55,
    },
    keyFields: { full_name: second },
  });
  await evaluateBundleNow(ORG_A, 'b1', 'seed');
}

async function openConflict() {
  const b: any = await Bundle.findOne({ bundleId: 'b1' }).lean();
  return (b.pipeline.conflicts as any[]).find((c) => c.field === 'full_name');
}

beforeEach(async () => {
  expect(getBundlePipeline()).toBeNull();
  await seedOrgs();
});

describe('starter templates', () => {
  it('covers every vertical and copies a starter into the org once', async () => {
    const starters = await bundleTemplateService.listStarters(MEMBER, ORG_A);
    expect(starters).toHaveLength(BUNDLE_STARTER_TEMPLATES.length);
    expect(new Set(starters.map((s) => s.vertical))).toEqual(
      new Set(['diagnostics', 'lending', 'mutual_funds', 'insurance', 'vendor_onboarding'])
    );
    expect(starters.every((s) => s.templateId === null)).toBe(true);

    const first = await bundleTemplateService.createFromStarter({
      userId: MEMBER,
      organisationId: ORG_A,
      starterKey: 'retail_loan_salaried',
    });
    expect(first.created).toBe(true);
    expect(first.status).toBe('published');
    expect(first.latestVersion).toBe(1);
    expect(first.organisationId).toBe(ORG_A);
    expect(await BundleTemplateVersion.countDocuments({ templateId: first.templateId, version: 1 })).toBe(1);

    const again = await bundleTemplateService.createFromStarter({
      userId: MEMBER,
      organisationId: ORG_A,
      starterKey: 'retail_loan_salaried',
    });
    expect(again.created).toBe(false);
    expect(again.templateId).toBe(first.templateId);

    // The copy is usable straight away.
    const bundle = await bundleService.createBundle({
      userId: MEMBER,
      organisationId: ORG_A,
      templateId: first.templateId,
      name: 'Loan 1',
    });
    expect(bundle.status).toBe('collecting');

    // Org B sees the starter but not org A's copy, and cannot use org A's template.
    const bStarters = await bundleTemplateService.listStarters(OUTSIDER, ORG_B);
    expect(bStarters.find((s) => s.key === 'retail_loan_salaried')?.templateId).toBeNull();
    await expect(
      bundleService.createBundle({ userId: OUTSIDER, organisationId: ORG_B, templateId: first.templateId })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses unknown starters', async () => {
    await expect(
      bundleTemplateService.createFromStarter({ userId: MEMBER, organisationId: ORG_A, starterKey: 'nope' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('bundle detail', () => {
  it('returns slots, document names, classification and an open conflict', async () => {
    await seedBundle();
    await BundleDocument.create({
      bundleId: 'b1',
      organisationId: ORG_A,
      documentId: 'd3',
      assignedTypeKey: 'other',
      assignedBy: 'user',
      addedBy: ADMIN,
    });
    const b: any = await bundleService.getBundle(MEMBER, ORG_A, 'b1');
    expect(b.templateName).toBe('Onboarding');
    expect(b.template.documentTypes.map((d: any) => d.key)).toEqual(['identity_proof', 'address_proof', 'other']);
    const d1 = b.documents.find((d: any) => d.documentId === 'd1');
    expect(d1.filename).toBe('d1.pdf');
    const d2 = b.documents.find((d: any) => d.documentId === 'd2');
    expect(d2.classification.status).toBe('needs_review');
    expect(d2.classification.suggestedTypeKey).toBe('address_proof');
    // Another member's private document is listed without its name.
    const d3 = b.documents.find((d: any) => d.documentId === 'd3');
    expect(d3.restricted).toBe(true);
    expect(d3.filename).toBeNull();
    expect(b.status).toBe('collecting');
    expect(b.progress.missing).toBe(1);
    expect(b.pipeline.conflicts[0]).toMatchObject({ field: 'full_name', status: 'open' });
    expect(b.pipeline.conflicts[0].valuesHash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('manual slot assignment', () => {
  it('validates the slot and settles a low-confidence document', async () => {
    await seedBundle({ conflicting: false });
    await expect(
      bundleService.updateBundleDocument({
        userId: MEMBER,
        organisationId: ORG_A,
        bundleId: 'b1',
        documentId: 'd2',
        typeKey: 'passport_photo',
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await bundleService.updateBundleDocument({
      userId: MEMBER,
      organisationId: ORG_A,
      bundleId: 'b1',
      documentId: 'd2',
      typeKey: 'address_proof',
    });
    const link: any = await BundleDocument.findOne({ bundleId: 'b1', documentId: 'd2' }).lean();
    expect(link.assignedBy).toBe('user');
    expect(link.classification.status).toBe('classified');
    const b: any = await Bundle.findOne({ bundleId: 'b1' }).lean();
    expect(b.status).toBe('ready_to_run');
  });
});

describe('conflict review', () => {
  async function fillSlots() {
    await bundleService.updateBundleDocument({
      userId: MEMBER,
      organisationId: ORG_A,
      bundleId: 'b1',
      documentId: 'd2',
      typeKey: 'address_proof',
    });
  }

  it('resolves with one of the values, then reopens when the values change', async () => {
    await seedBundle();
    await fillSlots();
    expect((await Bundle.findOne({ bundleId: 'b1' }).lean())!.status).toBe('needs_review');
    const c = await openConflict();

    await expect(
      bundleService.actOnConflict({
        userId: MEMBER,
        organisationId: ORG_A,
        bundleId: 'b1',
        field: 'full_name',
        valuesHash: c.valuesHash,
        action: 'resolve',
        value: 'Somebody Else',
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const after: any = await bundleService.actOnConflict({
      userId: MEMBER,
      organisationId: ORG_A,
      bundleId: 'b1',
      field: 'full_name',
      valuesHash: c.valuesHash,
      action: 'resolve',
      value: 'ravi kumar',
    });
    expect(after.pipeline.conflicts[0].status).toBe('resolved');
    expect(after.pipeline.conflicts[0].resolution.value).toBe('Ravi Kumar');
    expect(after.status).toBe('ready_to_run');
    expect(await BundleEvent.countDocuments({ bundleId: 'b1', type: 'bundle.conflict_resolved' })).toBe(1);

    // New values: the decision lapses and the conflict is open again.
    await BundleDocument.updateOne({ bundleId: 'b1', documentId: 'd2' }, { $set: { keyFields: { full_name: 'Mahesh Rao' } } });
    await evaluateBundleNow(ORG_A, 'b1', 'values_changed');
    const reopened = await openConflict();
    expect(reopened.status).toBe('open');
    expect((await Bundle.findOne({ bundleId: 'b1' }).lean())!.status).toBe('needs_review');
    expect(await BundleExceptionAction.countDocuments({ bundleId: 'b1', status: 'lapsed' })).toBe(1);
  });

  it('needs the admin role and a reason to dismiss, and refuses a stale conflict', async () => {
    await seedBundle();
    await fillSlots();
    const c = await openConflict();
    const base = { organisationId: ORG_A, bundleId: 'b1', field: 'full_name', valuesHash: c.valuesHash } as const;

    await expect(
      bundleService.actOnConflict({ ...base, userId: MEMBER, action: 'dismiss', reason: 'Known alias' })
    ).rejects.toThrow('Requires admin role or higher');
    await expect(
      bundleService.actOnConflict({ ...base, userId: ADMIN, action: 'dismiss', reason: '' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const after: any = await bundleService.actOnConflict({
      ...base,
      userId: ADMIN,
      action: 'dismiss',
      reason: 'Married name, confirmed with the customer',
    });
    expect(after.pipeline.conflicts[0].status).toBe('dismissed');
    expect(after.status).toBe('ready_to_run');

    await expect(
      bundleService.actOnConflict({ ...base, valuesHash: 'deadbeef', userId: ADMIN, action: 'resolve', value: 'Ravi Kumar' })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // Reopen undoes the decision.
    const reopened: any = await bundleService.actOnConflict({ ...base, userId: MEMBER, action: 'reopen' });
    expect(reopened.pipeline.conflicts[0].status).toBe('open');
    expect(reopened.status).toBe('needs_review');
  });
});

describe('mark reviewed', () => {
  it('refuses while items are open, then records the review and clears it on change', async () => {
    await seedBundle({ conflicting: false });
    await expect(
      bundleService.markReviewed({ userId: MEMBER, organisationId: ORG_A, bundleId: 'b1' })
    ).rejects.toThrow(/open items/);

    await bundleService.updateBundleDocument({
      userId: MEMBER,
      organisationId: ORG_A,
      bundleId: 'b1',
      documentId: 'd2',
      typeKey: 'address_proof',
    });
    const reviewed: any = await bundleService.markReviewed({
      userId: MEMBER,
      organisationId: ORG_A,
      bundleId: 'b1',
      note: 'All documents checked',
    });
    expect(reviewed.status).toBe('ready');
    expect(reviewed.reviewed).toBe(true);
    expect(reviewed.review.reviewer.name).toBe('Meera Member');

    // Idempotent.
    const again: any = await bundleService.markReviewed({ userId: MEMBER, organisationId: ORG_A, bundleId: 'b1' });
    expect(again.status).toBe('ready');

    const timeline = await bundleService.getTimeline(MEMBER, ORG_A, 'b1');
    const entry = timeline.find((e) => e.action === 'bundle.reviewed')!;
    expect(entry.actor).toMatchObject({ name: 'Meera Member', isSystem: false });
    expect(entry.details).toMatchObject({ note: 'All documents checked', to: 'ready' });
    expect(timeline.some((e) => e.action === 'bundle.document_reassign')).toBe(true);

    // A new document means the review no longer holds.
    await Document.create({
      documentId: 'd9',
      organisationId: ORG_A,
      originalFilename: 'd9.pdf',
      mimeType: 'application/pdf',
      size: 1,
      uploadedBy: MEMBER,
    });
    await bundleService.attachDocuments({ userId: MEMBER, organisationId: ORG_A, bundleId: 'b1', documentIds: ['d9'] });
    const b: any = await Bundle.findOne({ bundleId: 'b1' }).lean();
    expect(b.status).toBe('needs_review');
    expect(b.review ?? null).toBeNull();
    expect(await BundleEvent.countDocuments({ bundleId: 'b1', type: 'bundle.review_cleared' })).toBe(1);
  });
});

describe('organisation isolation', () => {
  it('never lets another organisation read or act on a bundle', async () => {
    await seedBundle();
    const c = await openConflict();
    // Org B user with their own org header: the bundle does not exist for them.
    await expect(bundleService.getBundle(OUTSIDER, ORG_B, 'b1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(bundleService.getTimeline(OUTSIDER, ORG_B, 'b1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      bundleService.markReviewed({ userId: OUTSIDER, organisationId: ORG_B, bundleId: 'b1' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      bundleService.actOnConflict({
        userId: OUTSIDER,
        organisationId: ORG_B,
        bundleId: 'b1',
        field: 'full_name',
        valuesHash: c.valuesHash,
        action: 'reopen',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Org B user sending org A's header is not a member there.
    await expect(bundleService.getBundle(OUTSIDER, ORG_A, 'b1')).rejects.toThrow(
      'You do not have access to this organisation'
    );
    const list = await bundleService.listBundles({ userId: OUTSIDER, organisationId: ORG_B });
    expect(list.bundles).toHaveLength(0);
  });
});

describe('bundle list', () => {
  it('searches name and reference, filters several statuses and adds progress', async () => {
    await seedBundle();
    await Bundle.create({
      bundleId: 'b2',
      organisationId: ORG_A,
      templateId: 'tpl_a',
      templateVersion: 1,
      name: 'Priya pack',
      externalRef: 'APP-002',
      status: 'ready',
      createdBy: MEMBER,
    });
    const byRef = await bundleService.listBundles({ userId: MEMBER, organisationId: ORG_A, q: 'app-001' });
    expect(byRef.bundles.map((b) => b.bundleId)).toEqual(['b1']);
    const byName = await bundleService.listBundles({ userId: MEMBER, organisationId: ORG_A, q: 'PRIYA' });
    expect(byName.bundles.map((b) => b.bundleId)).toEqual(['b2']);
    const regexSafe = await bundleService.listBundles({ userId: MEMBER, organisationId: ORG_A, q: '.*(' });
    expect(regexSafe.bundles).toHaveLength(0);
    const multi = await bundleService.listBundles({ userId: MEMBER, organisationId: ORG_A, status: 'collecting,ready' });
    expect(multi.bundles).toHaveLength(2);
    const b1 = multi.bundles.find((b) => b.bundleId === 'b1')!;
    expect(b1.templateName).toBe('Onboarding');
    expect(b1.progress).toMatchObject({ requiredSlots: 2, requiredSlotsMet: 1, missing: 1, openConflicts: 1 });
  });
});

describe('profile features and errors', () => {
  it('exposes the bundles flag per organisation', async () => {
    await User.updateOne(
      { userId: MEMBER },
      { $set: { organisations: [{ organisationId: ORG_A, role: 'member' }, { organisationId: ORG_B, role: 'member' }] } }
    );
    const profile = await userService.getUserProfile(MEMBER);
    const flags = Object.fromEntries(profile.organisations.map((o: any) => [o.organisationId, o.features.bundles]));
    expect(flags).toEqual({ [ORG_A]: true, [ORG_B]: false });
  });

  it('maps role and membership errors to 403', () => {
    const calls: Array<[number, unknown]> = [];
    const reply: any = {
      status(code: number) {
        return { send: (body: unknown) => calls.push([code, body]) };
      },
      code(code: number) {
        return { send: (body: unknown) => calls.push([code, body]) };
      },
    };
    sendBundleError(reply, new Error('Requires admin role or higher'), 'x');
    sendBundleError(reply, new Error('You do not have access to this organisation'), 'x');
    sendBundleError(reply, new NotFoundError('Bundle', 'b1'), 'x');
    sendBundleError(reply, new Error('boom'), 'x');
    expect(calls.map((c) => c[0])).toEqual([403, 403, 404, 500]);
  });
});
