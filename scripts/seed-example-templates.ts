/**
 * Seeds example bundle templates for all verticals.
 * These are global templates with organisationId=null, marked as isExample=true.
 * Organisations can clone them to customize.
 *
 * Usage: npx ts-node --transpile-only scripts/seed-example-templates.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import BundleTemplate from '../model/bundleTemplate.model';
import BundleTemplateVersion from '../model/bundleTemplateVersion.model';
import { BUNDLE_STARTER_TEMPLATES as EXAMPLE_TEMPLATES } from '../constants/bundleStarterTemplates';

dotenv.config();
dotenv.config({ path: '.env.local' });


async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  for (const template of EXAMPLE_TEMPLATES) {
    const existing = await BundleTemplate.findOne({
      organisationId: null,
      isExample: true,
      name: template.name,
      deletedAt: null,
    });

    if (existing) {
      console.log(`Template "${template.name}" already exists, skipping`);
      continue;
    }

    const templateId = uuidv4();
    const draft = {
      instructions: '',
      documentTypes: template.documentTypes,
      profileFields: template.profileFields,
      rules: template.rules.map((r) => ({ ...r, origin: 'manual' })),
      outputSchema: template.outputSchema,
      automation: null,
      fieldMapping: {},
    };

    await BundleTemplate.create({
      templateId,
      organisationId: null,
      projectId: null,
      name: template.name,
      description: template.description,
      status: 'published',
      latestVersion: 1,
      draft,
      isExample: true,
      createdBy: 'system:seed',
    });

    await BundleTemplateVersion.create({
      templateId,
      organisationId: null,
      version: 1,
      snapshot: draft,
      publishedBy: 'system:seed',
      publishedAt: new Date(),
    });

    console.log(`Created example template: ${template.name}`);
  }

  console.log('Seed complete');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
