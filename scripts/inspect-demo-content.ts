/**
 * Inspect demo@doqseal.com org content (active vs soft-deleted).
 * Usage: npx ts-node --transpile-only scripts/inspect-demo-content.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { DEMO_EMAIL, DEMO_ORG_SLUG } from '../constants/demo.account';

dotenv.config();
dotenv.config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 25000 });
  const db = mongoose.connection.db!;

  const user = await db.collection('users').findOne({
    email: DEMO_EMAIL,
    deletedAt: null,
  });
  console.log(
    'USER',
    JSON.stringify(
      {
        userId: user?.userId,
        email: user?.email,
        name: user?.name,
        orgs: user?.organisations,
      },
      null,
      2
    )
  );

  const org = await db.collection('organisations').findOne({
    $or: [{ slug: DEMO_ORG_SLUG }, { isDemo: true }],
  });
  console.log(
    'ORG',
    JSON.stringify(
      {
        publicId: org?.publicId,
        name: org?.name,
        slug: org?.slug,
        isDemo: org?.isDemo,
        demoMeta: org?.demoMeta,
        deletedAt: org?.deletedAt,
      },
      null,
      2
    )
  );

  const orgId = org?.publicId as string | undefined;
  if (!orgId) {
    await mongoose.disconnect();
    return;
  }

  const activeProjects = await db
    .collection('projects')
    .countDocuments({ organisationId: orgId, deletedAt: null });
  const deletedProjects = await db
    .collection('projects')
    .countDocuments({ organisationId: orgId, deletedAt: { $ne: null } });
  const activeDocs = await db
    .collection('documents')
    .countDocuments({ organisationId: orgId, deletedAt: null });
  const deletedDocs = await db
    .collection('documents')
    .countDocuments({ organisationId: orgId, deletedAt: { $ne: null } });

  console.log('COUNTS', {
    activeProjects,
    deletedProjects,
    activeDocs,
    deletedDocs,
  });

  const sampleDeletedProjects = await db
    .collection('projects')
    .find({ organisationId: orgId, deletedAt: { $ne: null } })
    .project({ name: 1, projectId: 1, deletedAt: 1, status: 1, createdAt: 1 })
    .sort({ deletedAt: -1 })
    .limit(20)
    .toArray();
  console.log('DELETED_PROJECTS_SAMPLE', JSON.stringify(sampleDeletedProjects, null, 2));

  const sampleDeletedDocs = await db
    .collection('documents')
    .find({ organisationId: orgId, deletedAt: { $ne: null } })
    .project({
      originalFilename: 1,
      documentId: 1,
      projectId: 1,
      deletedAt: 1,
      createdAt: 1,
      displayTitle: 1,
    })
    .sort({ deletedAt: -1 })
    .limit(20)
    .toArray();
  console.log('DELETED_DOCS_SAMPLE', JSON.stringify(sampleDeletedDocs, null, 2));

  const activeProjectSample = await db
    .collection('projects')
    .find({ organisationId: orgId, deletedAt: null })
    .project({ name: 1, projectId: 1, createdAt: 1 })
    .limit(20)
    .toArray();
  console.log('ACTIVE_PROJECTS', JSON.stringify(activeProjectSample, null, 2));

  // When were they deleted?
  const deletedAtDates = await db
    .collection('projects')
    .aggregate([
      { $match: { organisationId: orgId, deletedAt: { $ne: null } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d %H:%M', date: '$deletedAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 10 },
    ])
    .toArray();
  console.log('PROJECT_DELETE_BATCHES', JSON.stringify(deletedAtDates, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
