/**
 * Migration Runner
 * Runs idempotent migrations tracked in the migrations collection.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/migrations/runner.ts
 *   npx ts-node --transpile-only scripts/migrations/runner.ts --dry-run
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Migration from '../../model/migration.model';

dotenv.config();
dotenv.config({ path: '.env.local' });

export interface MigrationContext {
  db: typeof mongoose;
  dryRun: boolean;
}

export interface MigrationModule {
  name: string;
  version: string;
  up: (ctx: MigrationContext) => Promise<void>;
}

async function loadMigrations(): Promise<MigrationModule[]> {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir);

  const migrationFiles = files
    .filter(
      (f) =>
        /^\d{3,4}-.*\.ts$/.test(f) &&
        f !== 'runner.ts' &&
        !f.endsWith('.d.ts')
    )
    .sort();

  const migrations: MigrationModule[] = [];

  for (const file of migrationFiles) {
    const modulePath = path.join(migrationsDir, file);
    const mod = await import(modulePath);
    if (mod.name && mod.version && typeof mod.up === 'function') {
      migrations.push({
        name: mod.name,
        version: mod.version,
        up: mod.up,
      });
    } else {
      console.warn(`[migrations] Skipping ${file}: missing name, version, or up function`);
    }
  }

  return migrations;
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const docs = await Migration.find({ status: 'completed' }).lean();
  return new Set(docs.map((d) => d.name));
}

export async function runMigrations(dryRun = false): Promise<{
  executed: string[];
  skipped: string[];
  failed: string[];
}> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }

  console.log(`[migrations] Running migrations${dryRun ? ' (dry run)' : ''}`);

  const migrations = await loadMigrations();
  const executed = await getExecutedMigrations();

  const result = {
    executed: [] as string[],
    skipped: [] as string[],
    failed: [] as string[],
  };

  for (const migration of migrations) {
    if (executed.has(migration.name)) {
      console.log(`[migrations] Skipping ${migration.name} (already executed)`);
      result.skipped.push(migration.name);
      continue;
    }

    console.log(`[migrations] Running ${migration.name} v${migration.version}...`);

    const startTime = Date.now();
    try {
      if (!dryRun) {
        await migration.up({ db: mongoose, dryRun });
        const durationMs = Date.now() - startTime;

        await Migration.create({
          name: migration.name,
          version: migration.version,
          executedAt: new Date(),
          durationMs,
          status: 'completed',
        });

        console.log(`[migrations] Completed ${migration.name} in ${durationMs}ms`);
      } else {
        console.log(`[migrations] Would execute ${migration.name} (dry run)`);
      }
      result.executed.push(migration.name);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      console.error(`[migrations] Failed ${migration.name}: ${errMsg}`);

      if (!dryRun) {
        await Migration.create({
          name: migration.name,
          version: migration.version,
          executedAt: new Date(),
          durationMs,
          status: 'failed',
          error: errMsg,
        });
      }

      result.failed.push(migration.name);
      throw error;
    }
  }

  console.log(`[migrations] Complete: ${result.executed.length} executed, ${result.skipped.length} skipped`);
  return result;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runMigrations(dryRun)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrations] Fatal error:', err);
      process.exit(1);
    });
}
