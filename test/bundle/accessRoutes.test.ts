import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

// Only authentication is faked; organisation membership uses the real
// assertOrgRole against the memberships collection.
vi.mock('../../middleware/user.auth', () => ({
  default: async (request: any, reply: any) => {
    const userId = request.headers['x-test-user'];
    if (!userId) return reply.status(401).send({ success: false, message: 'Authentication required.' });
    request.user = { userId };
  },
}));

import { errorHandler } from '../../middleware/error.middleware';
import bundleRouter from '../../routes/bundle.route';
import bundleTemplateRouter from '../../routes/bundleTemplate.route';
import Organisation from '../../model/organisation.model';
import Membership from '../../model/membership.model';
import User from '../../model/user.model';
import Bundle from '../../model/bundle.model';
import userService from '../../service/user.service';
import { isOrgFeatureEnabled, profileFeatures } from '../../utils/orgFeatures.util';

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

let templateId = '';

async function org(publicId: string, features?: Record<string, unknown>) {
  const doc = await Organisation.collection.insertOne({
    name: publicId,
    slug: publicId,
    publicId,
    deletedAt: null,
    createdAt: new Date(),
    ...(features === undefined ? {} : { features }),
  });
  return doc.insertedId;
}

beforeEach(async () => {
  const a = await org('org_a', { bundles: true });
  const legacyOff = await org('org_legacy_off', { bundles: false, esign: false });
  const noFeatures = await org('org_plain');
  const killed = await org('org_killed', { bundles: true, bundlesDisabled: true });
  await User.create({ userId: 'u_member', name: 'Meera', email: 'm@a.test' });
  await User.create({ userId: 'u_outsider', name: 'Omar', email: 'o@b.test' });
  for (const organisationId of [a, legacyOff, noFeatures, killed]) {
    await Membership.create({ userId: 'u_member', organisationId, role: 'member' });
  }
  await Bundle.create({
    bundleId: 'b1',
    organisationId: 'org_a',
    templateId: 'tpl',
    templateVersion: 1,
    name: 'Case one',
    createdBy: 'u_member',
  });
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/bundle-templates/starters/diagnostics_intake',
    headers: as('u_member', 'org_a'),
    payload: {},
  });
  expect(created.statusCode).toBe(201);
  templateId = created.json().data.templateId;
});

describe('case packs are on by default', () => {
  it('reads the kill switch, not the legacy default', () => {
    expect(isOrgFeatureEnabled(undefined, 'bundles')).toBe(true);
    expect(isOrgFeatureEnabled({}, 'bundles')).toBe(true);
    expect(isOrgFeatureEnabled({ bundles: false }, 'bundles')).toBe(true);
    expect(isOrgFeatureEnabled({ bundlesDisabled: true }, 'bundles')).toBe(false);
    expect(isOrgFeatureEnabled({ bundles: true, bundlesDisabled: false }, 'bundles')).toBe(true);
    // Other features stay opt-in.
    expect(isOrgFeatureEnabled({}, 'esign')).toBe(false);
    expect(isOrgFeatureEnabled({ esign: true }, 'esign')).toBe(true);
    expect(profileFeatures({ bundlesDisabled: true })).toEqual({ bundles: false });
  });

  it.each(['org_a', 'org_legacy_off', 'org_plain'])('lets members of %s use case packs', async (orgId) => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles', headers: as('u_member', orgId) });
    expect(res.statusCode).toBe(200);
    const starters = await app.inject({
      method: 'GET',
      url: '/api/v1/bundle-templates/starters',
      headers: as('u_member', orgId),
    });
    expect(starters.statusCode).toBe(200);
  });

  it('answers 403 FEATURE_DISABLED when the kill switch is set', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles', headers: as('u_member', 'org_killed') });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'FEATURE_DISABLED' });
  });

  it('new organisations no longer store bundles: false', async () => {
    const created = await Organisation.create({ name: 'New', slug: 'new', publicId: 'org_new' });
    const raw = await Organisation.collection.findOne({ _id: created._id });
    expect(raw!.features.bundles).toBe(true);
    expect(raw!.features.bundlesDisabled).toBeUndefined();
    expect(isOrgFeatureEnabled(raw!.features, 'bundles')).toBe(true);
  });

  it('reports the effective flag in the user profile', async () => {
    await User.updateOne(
      { userId: 'u_member' },
      {
        $set: {
          organisations: ['org_a', 'org_legacy_off', 'org_plain', 'org_killed'].map((organisationId) => ({
            organisationId,
            role: 'member',
          })),
        },
      }
    );
    const profile = await userService.getUserProfile('u_member');
    const flags = Object.fromEntries(profile.organisations.map((o: any) => [o.organisationId, o.features.bundles]));
    expect(flags).toEqual({ org_a: true, org_legacy_off: true, org_plain: true, org_killed: false });
  });
});

describe('non-members get 403 on the bundle GET endpoints', () => {
  const paths = () => [
    '/api/v1/bundles',
    '/api/v1/bundles/b1',
    '/api/v1/bundles/b1/runs',
    '/api/v1/bundles/b1/runs/run_1',
    '/api/v1/bundles/b1/timeline',
    '/api/v1/bundle-templates',
    '/api/v1/bundle-templates/starters',
    `/api/v1/bundle-templates/${templateId}`,
    `/api/v1/bundle-templates/${templateId}/versions`,
    `/api/v1/bundle-templates/${templateId}/versions/1`,
  ];

  it('returns 403 for a signed-in user outside the organisation', async () => {
    for (const url of paths()) {
      const res = await app.inject({ method: 'GET', url, headers: as('u_outsider', 'org_a') });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 403 });
      expect(res.json()).toMatchObject({ success: false, message: 'You do not have access to this organisation' });
    }
  });

  it('still serves members', async () => {
    for (const url of ['/api/v1/bundles', '/api/v1/bundles/b1', '/api/v1/bundles/b1/runs', `/api/v1/bundle-templates/${templateId}`]) {
      const res = await app.inject({ method: 'GET', url, headers: as('u_member', 'org_a') });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 200 });
    }
  });

  it('keeps 404 for a pack that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles/missing', headers: as('u_member', 'org_a') });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for non-members on writes too', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/bundles/b1',
      headers: as('u_outsider', 'org_a'),
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires a login', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/bundles', headers: { 'x-organisation-id': 'org_a' } });
    expect(res.statusCode).toBe(401);
  });
});
