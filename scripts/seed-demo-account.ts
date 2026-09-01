/**
 * Seeds the DoqSeal demo account with all 5 Lupin TRF showcase files.
 *
 * Usage: npx ts-node --transpile-only scripts/seed-demo-account.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import User from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import Document from '../model/document.model';
import ExtractionJob from '../model/extractionJob.model';
import demoService from '../service/demo.service';
import documentService from '../service/document.service';
import {
  DEMO_EMAIL,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PROJECT_NAME,
  DEMO_TRF_VARIANTS,
  DEMO_USER_NAME,
  resolveDemoTrfExtraction,
} from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

const DEMO_DIR = path.resolve(
  'd:/doqseal/doqseal-dashboard/test-trf'
);

const DEMO_FILES = [
  'WhatsApp Image 2026-08-31 at 12.53.21 PM (1).jpeg',
  'WhatsApp Image 2026-08-31 at 12.53.21 PM.jpeg',
  'WhatsApp Image 2026-08-31 at 12.53.22 PM (1).jpeg',
  'WhatsApp Image 2026-08-31 at 12.53.22 PM (2).jpeg',
  'WhatsApp Image 2026-08-31 at 12.53.22 PM.jpeg',
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: DEMO_EMAIL, deletedAt: null });
  if (!user) {
    const userId = uuidv4();
    const orgId = uuidv4();
    user = await User.create({
      userId,
      name: DEMO_USER_NAME,
      email: DEMO_EMAIL,
      onboardingCompleted: true,
      organisations: [{ organisationId: orgId, role: 'owner' }],
    });

    const org = await Organisation.create({
      publicId: orgId,
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
      memberCount: 1,
      isDemo: true,
      planDetails: { planId: 'growth' },
      createdBy: userId,
    });

    await Membership.create({
      organisationId: org._id,
      userId,
      role: 'owner',
    });

    console.log(`Created user ${DEMO_EMAIL}`);
  } else {
    console.log(`User ${DEMO_EMAIL} already exists`);
  }

  const ensured = await demoService.ensureDemoWorkspace(user);
  const orgId = ensured.organisations?.[0]?.organisationId;
  if (!orgId) throw new Error('Demo org missing after ensureDemoWorkspace');

  const project = await demoService.ensureTrfProject(orgId, ensured.userId);
  console.log(`Project ready: ${project.name} (${project.projectId})`);
  console.log(
    `Fields: ${project.fields?.map((f: { key: string }) => f.key).join(', ')}`
  );

  // Soft-delete prior samples so we refresh the showcase set.
  const prior = await Document.find({
    organisationId: orgId,
    projectId: project.projectId,
    deletedAt: null,
  });
  for (const doc of prior) {
    doc.deletedAt = new Date();
    await doc.save();
  }

  for (const filename of DEMO_FILES) {
    const fullPath = path.join(DEMO_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Missing demo file: ${fullPath}`);
      continue;
    }
    const buffer = fs.readFileSync(fullPath);
    const expected = resolveDemoTrfExtraction(filename, buffer.length);
    const uploaded = await documentService.uploadDocument({
      userId: ensured.userId,
      organisationId: orgId,
      projectId: project.projectId,
      originalFilename: filename,
      mimeType: 'image/jpeg',
      buffer,
      sharedWithOrganisation: true,
    });

    const job = await ExtractionJob.findOne({ jobId: uploaded.jobId });
    if (job) {
      job.demoRevealAt = new Date(0);
      job.demoMode = true;
      await job.save();
      await demoService.writeDemoExtraction(job);
    }

    console.log(
      `✓ ${expected.patient_name} | age ${expected.patient_age} | ${expected.patient_gender} | client ${expected.client_code} | ${expected.tests_requested}`
    );
  }

  console.log(`\nDemo variants ready: ${DEMO_TRF_VARIANTS.length}`);
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  OTP:   123456`);
  console.log(`  Project: ${DEMO_PROJECT_NAME}`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
