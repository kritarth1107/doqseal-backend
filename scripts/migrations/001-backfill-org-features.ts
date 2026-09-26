/**
 * Migration: Backfill organisation.features with bundles: false
 * Ensures all existing organisations have the features field initialized.
 */
import Organisation from '../../model/organisation.model';
import { MigrationContext } from './runner';

export const name = '001-backfill-org-features';
export const version = '1.0.0';

export async function up(ctx: MigrationContext): Promise<void> {
  if (ctx.dryRun) {
    const count = await Organisation.countDocuments({
      $or: [
        { features: { $exists: false } },
        { 'features.bundles': { $exists: false } },
      ],
    });
    console.log(`[migration] Would update ${count} organisations`);
    return;
  }

  const result = await Organisation.updateMany(
    {
      $or: [
        { features: { $exists: false } },
        { 'features.bundles': { $exists: false } },
      ],
    },
    {
      $set: {
        'features.bundles': false,
        'features.esign': false,
      },
    }
  );

  console.log(`[migration] Updated ${result.modifiedCount} organisations with features.bundles = false`);
}
