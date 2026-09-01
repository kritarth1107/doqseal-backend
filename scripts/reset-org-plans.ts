/**
 * One-off: set all organisations to Free plan except demo (Growth).
 * Run: npx ts-node scripts/reset-org-plans.ts
 */
import mongoose from 'mongoose';
import Organisation from '../model/organisation.model';
import config from '../config/app.config';

async function main() {
  await mongoose.connect(config.database.uri);

  const demoResult = await Organisation.updateMany(
    { isDemo: true, deletedAt: null },
    { $set: { planDetails: { planId: 'growth' } } }
  );

  const freeResult = await Organisation.updateMany(
    {
      deletedAt: null,
      $or: [{ isDemo: { $ne: true } }, { isDemo: { $exists: false } }],
    },
    { $set: { planDetails: { planId: 'free' } } }
  );

  console.log(`Demo orgs → Growth: ${demoResult.modifiedCount}`);
  console.log(`Other orgs → Free: ${freeResult.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
