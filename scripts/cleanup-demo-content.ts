/**
 * Soft-delete demo org projects/documents while keeping demo@doqseal.com.
 *
 * Usage: npx ts-node --transpile-only scripts/cleanup-demo-content.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Organisation from '../model/organisation.model';
import Project from '../model/project.model';
import Document from '../model/document.model';
import { DEMO_EMAIL, DEMO_ORG_SLUG } from '../constants/demo.account';
import demoService from '../service/demo.service';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  await mongoose.connect(uri);

  const org = await Organisation.findOne({
    $or: [{ slug: DEMO_ORG_SLUG }, { isDemo: true }],
    deletedAt: null,
  });
  if (!org) {
    console.log(`No demo org found for ${DEMO_EMAIL}`);
    return;
  }

  // Force clear even if already marked
  (org as { demoMeta?: Record<string, unknown> }).demoMeta = {};
  org.markModified('demoMeta');
  await org.save();

  await demoService.clearDemoShowcaseContent(org.publicId as string);
  console.log(`Cleared demo content for org ${org.publicId} (${org.name})`);
  console.log(`Account ${DEMO_EMAIL} kept intact.`);

  const projects = await Project.countDocuments({
    organisationId: org.publicId,
    deletedAt: null,
  });
  const docs = await Document.countDocuments({
    organisationId: org.publicId,
    deletedAt: null,
  });
  console.log(`Remaining active projects=${projects} documents=${docs}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
