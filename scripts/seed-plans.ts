/**
 * Seed subscription plans into MongoDB.
 * Run: npx ts-node scripts/seed-plans.ts
 */
import mongoose from 'mongoose';
import config from '../config/app.config';
import planService from '../service/plan.service';

async function main() {
  await mongoose.connect(config.database.uri);
  const count = await planService.seedDefaultPlans();
  console.log(`Seeded ${count} plans`);
  const plans = await planService.listActivePlans();
  for (const p of plans) {
    console.log(`  - ${p.id}: ${p.name} (₹${p.priceInrMonthly ?? 'custom'})`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
