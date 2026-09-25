/**
 * Bundle Intelligence Smoke Test
 *
 * Boots the app on mongodb-memory-server, enables the bundles flag for a test org,
 * clones a starter template, creates a bundle, attaches documents, and verifies
 * that org B gets 404 on everything (cross-tenant isolation).
 *
 * Usage: npm run smoke-test
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

process.env.JWT_SECRET = 'smoke-test-secret-key-12345';
process.env.NODE_ENV = 'test';
process.env.API_VERSION = 'v1';

import User from '../model/user.model';
import Session from '../model/session.model';
import Organisation from '../model/organisation.model';
import Document from '../model/document.model';
import BundleTemplate from '../model/bundleTemplate.model';
import Bundle from '../model/bundle.model';
import { ServerSetup } from '../server';

interface TestContext {
  orgA: {
    organisationId: string;
    userId: string;
    token: string;
  };
  orgB: {
    organisationId: string;
    userId: string;
    token: string;
  };
}

let mongoServer: MongoMemoryServer;
let server: ServerSetup;
let ctx: TestContext;

const API_PREFIX = '/api/v1';

async function createTestUser(
  name: string,
  email: string,
  organisationId: string,
  role: string = 'ADMIN'
): Promise<{ userId: string; token: string }> {
  const userId = uuidv4();

  await User.create({
    userId,
    name,
    email,
    organisations: [{ organisationId, role }],
    onboardingCompleted: true,
  });

  const token = jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );

  await Session.create({
    userId,
    token,
    fingerprint: 'N/A',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000),
  });

  return { userId, token };
}

async function createTestOrg(
  name: string,
  slug: string,
  enableBundles: boolean = false
): Promise<string> {
  const organisationId = uuidv4();

  await Organisation.create({
    publicId: organisationId,
    name,
    slug,
    memberCount: 1,
    isActive: true,
    features: { bundles: enableBundles, esign: false },
  });

  return organisationId;
}

async function createTestDocument(
  organisationId: string,
  projectId: string,
  filename: string
): Promise<string> {
  const documentId = uuidv4();

  await Document.create({
    documentId,
    organisationId,
    projectId,
    originalFilename: filename,
    status: 'uploaded',
    sharedWithOrganisation: true,
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: `test/${documentId}.pdf`,
    isEncrypted: false,
    uploadedBy: 'smoke-test',
  });

  return documentId;
}

async function makeRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  token: string,
  organisationId: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const response = await server.app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      'x-organisation-id': organisationId,
      'x-fingerprint': 'N/A',
      'content-type': 'application/json',
    },
    payload: body ? JSON.stringify(body) : undefined,
  });

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(response.body);
  } catch {
    responseBody = response.body;
  }

  return { status: response.statusCode, body: responseBody };
}

async function setup(): Promise<void> {
  console.log('🔧 Starting MongoDB Memory Server...');
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');

  console.log('🔧 Starting Fastify server...');
  server = new ServerSetup();
  await server.app.ready();
  console.log('✅ Fastify ready');

  console.log('🔧 Creating test organisations...');
  const orgAId = await createTestOrg('Org A - Bundles Enabled', 'org-a', true);
  const orgBId = await createTestOrg('Org B - Isolated', 'org-b', true);

  console.log('🔧 Creating test users...');
  const userA = await createTestUser('Alice Admin', 'alice@orga.test', orgAId);
  const userB = await createTestUser('Bob Admin', 'bob@orgb.test', orgBId);

  ctx = {
    orgA: { organisationId: orgAId, ...userA },
    orgB: { organisationId: orgBId, ...userB },
  };

  console.log('✅ Test context ready');
  console.log(`   Org A: ${orgAId}`);
  console.log(`   Org B: ${orgBId}`);
}

async function teardown(): Promise<void> {
  console.log('\n🧹 Cleaning up...');
  await server.app.close();
  await mongoose.disconnect();
  await mongoServer.stop();
  console.log('✅ Cleanup complete');
}

async function testCreateTemplate(): Promise<string> {
  console.log('\n📋 TEST: Create bundle template');

  const { status, body } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundle-templates`,
    ctx.orgA.token,
    ctx.orgA.organisationId,
    {
      name: 'Test Loan Template',
      description: 'A test template for smoke testing',
      documentTypes: [
        {
          typeKey: 'pan_card',
          label: 'PAN Card',
          required: true,
          schema: { pan_number: { type: 'string', label: 'PAN Number' } },
        },
        {
          typeKey: 'aadhaar',
          label: 'Aadhaar Card',
          required: true,
          schema: { aadhaar_number: { type: 'string', label: 'Aadhaar Number' } },
        },
      ],
      profileFields: [{ key: 'applicant_name', label: 'Applicant Name', type: 'string' }],
      rules: [
        {
          ruleId: 'name_match',
          label: 'Name Match',
          category: 'identity',
          severity: 'hard',
          field: 'name',
          method: 'similarity',
          documents: ['pan_card', 'aadhaar'],
          params: { threshold: 0.8 },
        },
      ],
    }
  );

  if (status !== 201) {
    console.error('❌ Failed to create template:', body);
    throw new Error(`Expected 201, got ${status}`);
  }

  const templateId = (body as any).data?.templateId;
  console.log(`✅ Template created: ${templateId}`);
  return templateId;
}

async function testOrgBCannotAccessOrgATemplate(templateId: string): Promise<void> {
  console.log('\n🔒 TEST: Org B cannot access Org A template');

  const { status } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundle-templates/${templateId}`,
    ctx.orgB.token,
    ctx.orgB.organisationId
  );

  if (status !== 404) {
    throw new Error(`Expected 404 for cross-org access, got ${status}`);
  }

  console.log('✅ Cross-org template access correctly denied (404)');
}

async function testPublishTemplate(templateId: string): Promise<void> {
  console.log('\n📤 TEST: Publish template');

  const { status, body } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundle-templates/${templateId}/publish`,
    ctx.orgA.token,
    ctx.orgA.organisationId
  );

  if (status !== 200) {
    console.error('❌ Failed to publish template:', body);
    throw new Error(`Expected 200, got ${status}`);
  }

  console.log('✅ Template published');
}

async function testCreateBundle(templateId: string): Promise<string> {
  console.log('\n📦 TEST: Create bundle');

  const { status, body } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundles`,
    ctx.orgA.token,
    ctx.orgA.organisationId,
    {
      templateId,
      externalRef: 'LOAN-2024-001',
      metadata: { applicantName: 'Test Applicant' },
    }
  );

  if (status !== 201) {
    console.error('❌ Failed to create bundle:', body);
    throw new Error(`Expected 201, got ${status}`);
  }

  const bundleId = (body as any).data?.bundleId;
  console.log(`✅ Bundle created: ${bundleId}`);
  return bundleId;
}

async function testIdempotentBundleCreate(templateId: string, existingBundleId: string): Promise<void> {
  console.log('\n🔄 TEST: Idempotent bundle creation (same externalRef)');

  const { status, body } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundles`,
    ctx.orgA.token,
    ctx.orgA.organisationId,
    {
      templateId,
      externalRef: 'LOAN-2024-001',
      metadata: { applicantName: 'Test Applicant' },
    }
  );

  if (status !== 200) {
    console.error('❌ Idempotent create failed:', body);
    throw new Error(`Expected 200 for idempotent create, got ${status}`);
  }

  const returnedBundleId = (body as any).data?.bundleId;
  if (returnedBundleId !== existingBundleId) {
    throw new Error(`Idempotent create returned different bundleId: ${returnedBundleId} vs ${existingBundleId}`);
  }

  console.log('✅ Idempotent create returned existing bundle');
}

async function testOrgBCannotAccessOrgABundle(bundleId: string): Promise<void> {
  console.log('\n🔒 TEST: Org B cannot access Org A bundle');

  const { status } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundles/${bundleId}`,
    ctx.orgB.token,
    ctx.orgB.organisationId
  );

  if (status !== 404) {
    throw new Error(`Expected 404 for cross-org bundle access, got ${status}`);
  }

  console.log('✅ Cross-org bundle access correctly denied (404)');
}

async function testAttachDocuments(bundleId: string): Promise<string[]> {
  console.log('\n📎 TEST: Attach documents to bundle');

  const doc1Id = await createTestDocument(
    ctx.orgA.organisationId,
    'test-project',
    'pan_card.pdf'
  );
  const doc2Id = await createTestDocument(
    ctx.orgA.organisationId,
    'test-project',
    'aadhaar.pdf'
  );

  const { status, body } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundles/${bundleId}/documents`,
    ctx.orgA.token,
    ctx.orgA.organisationId,
    {
      documents: [
        { documentId: doc1Id, typeKey: 'pan_card' },
        { documentId: doc2Id, typeKey: 'aadhaar' },
      ],
    }
  );

  if (status !== 200) {
    console.error('❌ Failed to attach documents:', body);
    throw new Error(`Expected 200, got ${status}`);
  }

  console.log(`✅ Documents attached: ${doc1Id}, ${doc2Id}`);
  return [doc1Id, doc2Id];
}

async function testOrgBCannotAttachToOrgABundle(bundleId: string): Promise<void> {
  console.log('\n🔒 TEST: Org B cannot attach documents to Org A bundle');

  const docId = await createTestDocument(
    ctx.orgB.organisationId,
    'test-project',
    'fake.pdf'
  );

  const { status } = await makeRequest(
    'POST',
    `${API_PREFIX}/bundles/${bundleId}/documents`,
    ctx.orgB.token,
    ctx.orgB.organisationId,
    {
      documents: [{ documentId: docId, typeKey: 'pan_card' }],
    }
  );

  if (status !== 404) {
    throw new Error(`Expected 404 for cross-org document attach, got ${status}`);
  }

  console.log('✅ Cross-org document attach correctly denied (404)');
}

async function testListBundlesIsolation(): Promise<void> {
  console.log('\n🔒 TEST: List bundles returns only own org bundles');

  const { status: statusA, body: bodyA } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundles`,
    ctx.orgA.token,
    ctx.orgA.organisationId
  );

  const { status: statusB, body: bodyB } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundles`,
    ctx.orgB.token,
    ctx.orgB.organisationId
  );

  if (statusA !== 200 || statusB !== 200) {
    throw new Error(`List bundles failed: A=${statusA}, B=${statusB}`);
  }

  const bundlesA = (bodyA as any).data || [];
  const bundlesB = (bodyB as any).data || [];

  if (bundlesA.length !== 1) {
    throw new Error(`Org A should have 1 bundle, got ${bundlesA.length}`);
  }

  if (bundlesB.length !== 0) {
    throw new Error(`Org B should have 0 bundles, got ${bundlesB.length}`);
  }

  console.log('✅ Bundle list isolation verified (A=1, B=0)');
}

async function testListTemplatesIsolation(): Promise<void> {
  console.log('\n🔒 TEST: List templates returns only own org templates');

  const { status: statusA, body: bodyA } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundle-templates`,
    ctx.orgA.token,
    ctx.orgA.organisationId
  );

  const { status: statusB, body: bodyB } = await makeRequest(
    'GET',
    `${API_PREFIX}/bundle-templates`,
    ctx.orgB.token,
    ctx.orgB.organisationId
  );

  if (statusA !== 200 || statusB !== 200) {
    throw new Error(`List templates failed: A=${statusA}, B=${statusB}`);
  }

  const templatesA = (bodyA as any).data || [];
  const templatesB = (bodyB as any).data || [];

  if (templatesA.length !== 1) {
    throw new Error(`Org A should have 1 template, got ${templatesA.length}`);
  }

  if (templatesB.length !== 0) {
    throw new Error(`Org B should have 0 templates, got ${templatesB.length}`);
  }

  console.log('✅ Template list isolation verified (A=1, B=0)');
}

async function testOrgBCannotDeleteOrgABundle(bundleId: string): Promise<void> {
  console.log('\n🔒 TEST: Org B cannot delete Org A bundle');

  const { status } = await makeRequest(
    'DELETE',
    `${API_PREFIX}/bundles/${bundleId}`,
    ctx.orgB.token,
    ctx.orgB.organisationId
  );

  if (status !== 404) {
    throw new Error(`Expected 404 for cross-org delete, got ${status}`);
  }

  console.log('✅ Cross-org bundle delete correctly denied (404)');
}

async function testOrgBCannotUpdateOrgABundle(bundleId: string): Promise<void> {
  console.log('\n🔒 TEST: Org B cannot update Org A bundle');

  const { status } = await makeRequest(
    'PATCH',
    `${API_PREFIX}/bundles/${bundleId}`,
    ctx.orgB.token,
    ctx.orgB.organisationId,
    { metadata: { hacked: true } }
  );

  if (status !== 404) {
    throw new Error(`Expected 404 for cross-org update, got ${status}`);
  }

  console.log('✅ Cross-org bundle update correctly denied (404)');
}

async function runSmokeTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🔥 BUNDLE INTELLIGENCE SMOKE TEST');
  console.log('='.repeat(60));

  try {
    await setup();

    const templateId = await testCreateTemplate();
    await testOrgBCannotAccessOrgATemplate(templateId);
    await testPublishTemplate(templateId);

    const bundleId = await testCreateBundle(templateId);
    await testIdempotentBundleCreate(templateId, bundleId);
    await testOrgBCannotAccessOrgABundle(bundleId);

    await testAttachDocuments(bundleId);
    await testOrgBCannotAttachToOrgABundle(bundleId);

    await testListBundlesIsolation();
    await testListTemplatesIsolation();

    await testOrgBCannotDeleteOrgABundle(bundleId);
    await testOrgBCannotUpdateOrgABundle(bundleId);

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL SMOKE TESTS PASSED');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ SMOKE TEST FAILED');
    console.error('='.repeat(60));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

runSmokeTests();
