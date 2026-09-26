/**
 * Migration: Create indexes for bundle collections
 * Ensures all bundle-related indexes are created properly.
 */
import { MigrationContext } from './runner';

export const name = '002-bundle-indexes';
export const version = '1.0.0';

export async function up(ctx: MigrationContext): Promise<void> {
  if (ctx.dryRun) {
    console.log('[migration] Would create bundle collection indexes');
    return;
  }

  const db = ctx.db.connection.db;
  if (!db) {
    throw new Error('Database connection not available');
  }

  const collections = [
    'bundle_templates',
    'bundle_template_versions',
    'bundles',
    'bundle_documents',
    'bundle_runs',
    'bundle_exception_actions',
  ];

  for (const collName of collections) {
    try {
      await db.createCollection(collName);
      console.log(`[migration] Created collection: ${collName}`);
    } catch (err: any) {
      if (err.code === 48) {
        console.log(`[migration] Collection ${collName} already exists`);
      } else {
        throw err;
      }
    }
  }

  console.log('[migration] Bundle collection indexes will be created by Mongoose schema definitions');
}
