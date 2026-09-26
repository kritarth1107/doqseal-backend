import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/org-access.util', () => ({ assertOrgRole: vi.fn(async () => undefined) }));

import Bundle from '../../model/bundle.model';
import BundleDocument from '../../model/bundleDocument.model';
import Document from '../../model/document.model';
import bundleService from '../../service/bundle.service';
import { getBundlePipeline } from '../../service/bundle/pipeline/runtime';

async function seed() {
  await Bundle.create({
    bundleId: 'b1',
    organisationId: 'org_a',
    templateId: 'tpl',
    templateVersion: 1,
    createdBy: 'user_1',
  });
  await Document.create({
    documentId: 'd1',
    organisationId: 'org_a',
    originalFilename: 'd1.pdf',
    mimeType: 'application/pdf',
    size: 1,
    uploadedBy: 'user_1',
  });
}

describe('attaching documents with the pipeline off', () => {
  it('attaches, removes and attaches the same document again', async () => {
    expect(getBundlePipeline()).toBeNull();
    await seed();
    const params = { userId: 'user_1', organisationId: 'org_a', bundleId: 'b1', documentIds: ['d1'] };

    expect((await bundleService.attachDocuments(params)).added).toBe(1);
    await bundleService.removeDocument('user_1', 'org_a', 'b1', 'd1');
    expect((await bundleService.attachDocuments(params)).added).toBe(1);

    const rows = await BundleDocument.find({ organisationId: 'org_a', bundleId: 'b1' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt ?? null).toBeNull();
    expect(rows[0].classification ?? null).toBeNull();
    // Attaching again while linked adds nothing.
    expect((await bundleService.attachDocuments(params)).added).toBe(0);
  });
});
