import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

const ROLES: Record<string, Record<string, 'owner' | 'admin' | 'member'>> = {
  org_a: { u_member: 'member', u_admin: 'admin' },
  org_off: { u_off: 'owner' },
};
const RANK = { owner: 3, admin: 2, member: 1 } as const;

vi.mock('../../middleware/user.auth', () => ({
  default: async (request: any, reply: any) => {
    const userId = request.headers['x-test-user'];
    if (!userId) return reply.status(401).send({ success: false, message: 'Authentication required.' });
    request.user = { userId };
  },
}));
vi.mock('../../utils/org-access.util', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    assertOrgRole: vi.fn(async (userId: string, orgId: string, minRole: 'owner' | 'admin' | 'member') => {
      const role = ROLES[orgId]?.[userId];
      if (!role) throw new Error('You do not have access to this organisation');
      if (RANK[role] < RANK[minRole]) throw new Error(`Requires ${minRole} role or higher`);
      return { role };
    }),
  };
});

import { errorHandler } from '../../middleware/error.middleware';
import bundleRouter from '../../routes/bundle.route';
import bundleTemplateRouter from '../../routes/bundleTemplate.route';
import Organisation from '../../model/organisation.model';
import User from '../../model/user.model';
import Bundle from '../../model/bundle.model';
import BundleDocument from '../../model/bundleDocument.model';
import BundleTemplateVersion from '../../model/bundleTemplateVersion.model';
import { evaluateBundleNow } from '../../service/bundle/pipeline/runtime';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.register(bundleTemplateRouter, { prefix: '/api/v1/bundle-templates' });
  app.register(bundleRouter, { prefix: '/api/v1/bundles' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const as = (user: string, org: string) => ({ 'x-test-user': user, 'x-organisation-id': org });

beforeEach(async () => {
  await Organisation.create({ name: 'A', slug: 'a', publicId: 'org_a', features: { bundles: true } });
  await Organisation.create({ name: 'Off', slug: 'off', publicId: 'org_off', features: { bundles: true, bundlesDisabled: true } });
  await User.create({ userId: 'u_member', name: 'Meera', email: 'm@a.test' });
  await BundleTemplateVersion.create({
    templateId: 'tpl',
    version: 1,
    organisationId: 'org_a',
    snapshot: {
      documentTypes: [
        { key: 'identity_proof', label: 'Identity proof', required: true, minCount: 1, maxCount: 1 },
        { key: 'address_proof', label: 'Address proof', required: true, minCount: 1, maxCount: 1 },
      ],
    },
    publishedBy: 'u_admin',
    publishedAt: new Date(),
  });
  await Bundle.create({
    bundleId: 'b1',
    organisationId: 'org_a',
    templateId: 'tpl',
    templateVersion: 1,
    name: 'Case one',
    externalRef: 'REF-1',
    createdBy: 'u_member',
  });
  await BundleDocument.create({
    bundleId: 'b1',
    organisationId: 'org_a',
    documentId: 'd1',
    assignedTypeKey: 'identity_proof',
    addedBy: 'u_member',
    keyFields: { full_name: 'Ravi Kumar' },
  });
  await BundleDocument.create({
    bundleId: 'b1',
    organisationId: 'org_a',
    documentId: 'd2',
    assignedTypeKey: 'address_proof',
    addedBy: 'u_member',
    keyFields: { full_name: 'Suresh Iyer' },
  });
  await evaluateBundleNow('org_a', 'b1', 'seed');
});

describe('bundle review routes', () => {
  it('answers 403 FEATURE_DISABLED when case packs are switched off for the organisation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles', headers: as('u_off', 'org_off') });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'FEATURE_DISABLED' });
    const starters = await app.inject({
      method: 'GET',
      url: '/api/v1/bundle-templates/starters',
      headers: as('u_off', 'org_off'),
    });
    expect(starters.statusCode).toBe(403);
  });

  it('lists starters and creates a template from one (201, then 200)', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/bundle-templates/starters', headers: as('u_member', 'org_a') });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.length).toBeGreaterThanOrEqual(9);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/bundle-templates/starters/msme_loan',
      headers: as('u_member', 'org_a'),
      payload: {},
    });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/bundle-templates/starters/msme_loan',
      headers: as('u_member', 'org_a'),
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.templateId).toBe(first.json().data.templateId);
  });

  it('refuses to mark reviewed with an open conflict (409), then allows it after resolving', async () => {
    const early = await app.inject({
      method: 'POST',
      url: '/api/v1/bundles/b1/review',
      headers: as('u_member', 'org_a'),
      payload: {},
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().message).toMatch(/1 open conflict/);

    const detail = await app.inject({ method: 'GET', url: '/api/v1/bundles/b1', headers: as('u_member', 'org_a') });
    const conflict = detail.json().data.pipeline.conflicts[0];

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/bundles/b1/conflicts',
      headers: as('u_member', 'org_a'),
      payload: { field: 'full_name', action: 'resolve' },
    });
    expect(bad.statusCode).toBe(400);

    const dismissByMember = await app.inject({
      method: 'POST',
      url: '/api/v1/bundles/b1/conflicts',
      headers: as('u_member', 'org_a'),
      payload: { field: 'full_name', valuesHash: conflict.valuesHash, action: 'dismiss', reason: 'Alias' },
    });
    expect(dismissByMember.statusCode).toBe(403);

    const resolved = await app.inject({
      method: 'POST',
      url: '/api/v1/bundles/b1/conflicts',
      headers: as('u_member', 'org_a'),
      payload: { field: 'full_name', valuesHash: conflict.valuesHash, action: 'resolve', value: 'Ravi Kumar' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().data.status).toBe('ready_to_run');

    const reviewed = await app.inject({
      method: 'POST',
      url: '/api/v1/bundles/b1/review',
      headers: as('u_member', 'org_a'),
      payload: { note: 'Checked' },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().data.status).toBe('ready');

    const timeline = await app.inject({ method: 'GET', url: '/api/v1/bundles/b1/timeline?limit=20', headers: as('u_member', 'org_a') });
    expect(timeline.statusCode).toBe(200);
    const actions = timeline.json().data.map((e: any) => e.action);
    expect(actions).toContain('bundle.reviewed');
    expect(actions).toContain('bundle.conflict_resolved');
  });

  it('searches and filters the list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/bundles?q=ref-1&status=needs_review,collecting',
      headers: as('u_member', 'org_a'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((b: any) => b.bundleId)).toEqual(['b1']);
    expect(res.json().data[0].progress.openConflicts).toBe(1);
  });

  it('keeps other organisations out', async () => {
    // Not a member of org_a.
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles/b1/timeline', headers: as('u_off', 'org_a') });
    expect(res.statusCode).toBe(403);
    // Own org (bundles off) is blocked by the flag before any lookup.
    const own = await app.inject({ method: 'GET', url: '/api/v1/bundles/b1', headers: as('u_off', 'org_off') });
    expect(own.statusCode).toBe(403);
  });
});
