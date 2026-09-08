/**
 * Ensures demo@doqseal.com user + org exist (no canned projects/docs).
 * Canned TRF showcase content is intentionally not seeded anymore.
 *
 * Usage: npx ts-node --transpile-only scripts/seed-demo-account.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import User from '../model/user.model';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import demoService from '../service/demo.service';
import {
  DEMO_EMAIL,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_USER_NAME,
} from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

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

  await demoService.ensureDemoWorkspace(user);
  console.log(`Demo workspace ready for ${DEMO_EMAIL} (OTP 123456).`);
  console.log('Showcase projects/docs are cleared — use real AI extraction.');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
