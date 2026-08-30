/**
 * Seeds the DoqSeal demo account:
 *   email: demo@doqseal.com  OTP: 123456
 *   org: Zeroknow Technologies
 *   project: Test Request Forms(TRFs)
 *   sample PDF: assets/demo/changdev-munde.pdf (completed extraction)
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
import ExtractionJob from '../model/extractionJob.model';
import demoService from '../service/demo.service';
import documentService from '../service/document.service';
import {
  DEMO_EMAIL,
  DEMO_OTP,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PROJECT_NAME,
  DEMO_USER_NAME,
} from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

const PDF_CANDIDATES = [
  path.resolve(__dirname, '../assets/demo/changdev-munde.pdf'),
  path.resolve(process.cwd(), 'assets/demo/changdev-munde.pdf'),
  process.env.DEMO_PDF_PATH || '',
  path.resolve(
    'C:/Users/uddes/Downloads/Telegram Desktop/CHANGDEV MUNDE.pdf'
  ),
].filter(Boolean);

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

  const existingDoc = await Document.findOne({
    organisationId: orgId,
    projectId: project.projectId,
    deletedAt: null,
  }).lean();

  if (existingDoc) {
    console.log(`Sample document already present: ${existingDoc.documentId}`);
  } else {
    const pdfPath = PDF_CANDIDATES.find((p) => fs.existsSync(p));
    if (!pdfPath) {
      console.warn('No demo PDF found — skip sample upload');
    } else {
      const buffer = fs.readFileSync(pdfPath);
      const uploaded = await documentService.uploadDocument({
        userId: ensured.userId,
        organisationId: orgId,
        projectId: project.projectId,
        originalFilename: 'CHANGDEV MUNDE.pdf',
        mimeType: 'application/pdf',
        buffer,
        sharedWithOrganisation: true,
      });

      const job = await ExtractionJob.findOne({ jobId: uploaded.jobId });
      if (job) {
        job.demoRevealAt = new Date(0);
        await job.save();
        await demoService.writeDemoExtraction(job);
      }

      console.log(`Seeded sample document ${uploaded.documentId} (completed)`);
    }
  }

  console.log('\nDemo account ready:');
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  OTP:   ${DEMO_OTP}`);
  console.log(`  Name:  ${DEMO_USER_NAME}`);
  console.log(`  Org:   ${DEMO_ORG_NAME}`);
  console.log(`  Project: ${DEMO_PROJECT_NAME}`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
