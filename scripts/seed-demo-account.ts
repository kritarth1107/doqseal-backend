/**
 * Seeds the DoqSeal demo account:
 *   email: demo@doqseal.com  OTP: 123456
 *   org: Zeroknow Technologies
 *   project: Test Request Forms(TRFs)
 *   sample: assets/demo/b-vijay-kumar-trf.jpeg (completed extraction)
 *
 * Usage: npx ts-node scripts/seed-demo-account.ts
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
import Extraction from '../model/extraction.model';
import ExtractionJob from '../model/extractionJob.model';
import demoService from '../service/demo.service';
import documentService from '../service/document.service';
import {
  DEMO_EMAIL,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PROJECT_NAME,
  DEMO_TRF_EXTRACTION,
  DEMO_USER_NAME,
  demoFieldConfidence,
} from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

const IMAGE_CANDIDATES = [
  path.resolve(__dirname, '../assets/demo/b-vijay-kumar-trf.jpeg'),
  path.resolve(process.cwd(), 'assets/demo/b-vijay-kumar-trf.jpeg'),
  process.env.DEMO_TRF_IMAGE_PATH || '',
  path.resolve(
    'd:/doqseal/doqseal-dashboard/test-trf/WhatsApp Image 2026-08-31 at 12.53.22 PM.jpeg'
  ),
].filter(Boolean);

async function replaceDemoSample(
  userId: string,
  organisationId: string,
  projectId: string
) {
  const imagePath = IMAGE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!imagePath) {
    console.warn('No demo TRF image found — skip sample upload');
    return;
  }

  // Soft-delete prior sample docs in this project so the new Lupin TRF is the showcase.
  const prior = await Document.find({
    organisationId,
    projectId,
    deletedAt: null,
  });
  for (const doc of prior) {
    doc.deletedAt = new Date();
    doc.status = 'failed';
    await doc.save();
  }

  const buffer = fs.readFileSync(imagePath);
  const uploaded = await documentService.uploadDocument({
    userId,
    organisationId,
    projectId,
    originalFilename: 'B Vijay Kumar — Lupin TRF.jpeg',
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

  console.log(`Seeded sample document ${uploaded.documentId} (completed)`);
  console.log(
    `  Fields: ${DEMO_TRF_EXTRACTION.patient_name}, ${DEMO_TRF_EXTRACTION.patient_age}, ${DEMO_TRF_EXTRACTION.patient_gender}, ${DEMO_TRF_EXTRACTION.client_code}, ${DEMO_TRF_EXTRACTION.tests_requested}`
  );
}

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
  console.log(`Fields: ${project.fields?.map((f: { key: string }) => f.key).join(', ')}`);

  // Always refresh the showcase sample to the Vijay Kumar Lupin TRF.
  await replaceDemoSample(ensured.userId, orgId, project.projectId);

  // Also refresh any leftover completed extractions that still hold old canned data.
  const liveDocs = await Document.find({
    organisationId: orgId,
    projectId: project.projectId,
    deletedAt: null,
  }).lean();
  for (const doc of liveDocs) {
    const latest = await Extraction.findOne({ documentId: doc.documentId })
      .sort({ version: -1 });
    if (latest) {
      latest.data = {
        ...DEMO_TRF_EXTRACTION,
        confidence_scores: { ...DEMO_TRF_EXTRACTION.confidence_scores },
      };
      latest.fieldConfidence = demoFieldConfidence(DEMO_TRF_EXTRACTION);
      latest.strategy = 'demo';
      latest.status = 'approved';
      latest.markModified('data');
      latest.markModified('fieldConfidence');
      await latest.save();
      await Document.updateOne(
        { documentId: doc.documentId },
        { $set: { displayTitle: DEMO_TRF_EXTRACTION.suggested_title, status: 'completed' } }
      );
    }
  }

  console.log('\nDemo account ready:');
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  OTP:   123456`);
  console.log(`  Name:  ${DEMO_USER_NAME}`);
  console.log(`  Org:   ${DEMO_ORG_NAME}`);
  console.log(`  Project: ${DEMO_PROJECT_NAME}`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
