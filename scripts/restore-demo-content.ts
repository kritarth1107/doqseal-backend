/**
 * Restore soft-deleted demo org projects + documents.
 * Usage: npx ts-node --transpile-only scripts/restore-demo-content.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { DEMO_ORG_SLUG } from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 25000 });
  const db = mongoose.connection.db!;

  const org = await db.collection('organisations').findOne({
    $or: [{ slug: DEMO_ORG_SLUG }, { isDemo: true }],
  });
  if (!org?.publicId) {
    throw new Error('Demo org not found');
  }
  const orgId = org.publicId as string;

  const projects = await db.collection('projects').updateMany(
    { organisationId: orgId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null, status: 'active', updatedAt: new Date() } }
  );

  const documents = await db.collection('documents').updateMany(
    { organisationId: orgId, deletedAt: { $ne: null } },
    { $set: { deletedAt: null, updatedAt: new Date() } }
  );

  await db.collection('organisations').updateOne(
    { publicId: orgId },
    { $unset: { 'demoMeta.contentClearedAt': '' }, $set: { updatedAt: new Date() } }
  );

  const activeProjects = await db
    .collection('projects')
    .countDocuments({ organisationId: orgId, deletedAt: null });
  const activeDocs = await db
    .collection('documents')
    .countDocuments({ organisationId: orgId, deletedAt: null });

  console.log(
    JSON.stringify(
      {
        orgId,
        restoredProjects: projects.modifiedCount,
        restoredDocuments: documents.modifiedCount,
        activeProjects,
        activeDocs,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
