/**
 * Build any missing indexes declared in the mongoose schemas.
 *
 * Production boots with autoIndex off (see config/database.config.ts), so run
 * this once after deploying a schema that adds an index. It only creates
 * missing indexes; it never drops one. Run it off-peak on a small cluster.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/sync-indexes.ts            # build
 *   npx ts-node --transpile-only scripts/sync-indexes.ts --dry-run  # list only
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MongoDB connection string is not configured');

  const modelDir = path.join(__dirname, '..', 'model');
  for (const file of fs.readdirSync(modelDir).sort()) {
    if (/\.model\.(ts|js)$/.test(file) && !file.endsWith('.d.ts')) {
      await import(path.join(modelDir, file));
    }
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    for (const name of mongoose.modelNames().sort()) {
      const model = mongoose.model(name);
      const declared = model.schema.indexes().length;
      if (dryRun) {
        console.log(`[indexes] ${model.collection.name}: ${declared} declared`);
        continue;
      }
      const started = Date.now();
      await model.createIndexes();
      console.log(`[indexes] ${model.collection.name}: ok (${Date.now() - started} ms)`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[indexes] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
