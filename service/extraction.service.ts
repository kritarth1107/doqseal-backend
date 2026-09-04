import { v4 as uuidv4 } from 'uuid';
import Extraction from '../model/extraction.model';
import ExtractionCorrection from '../model/extractionCorrection.model';
import Document from '../model/document.model';
import { assertUserInOrganisation } from '../utils/org-access.util';
import { visibilityFilter } from '../utils/visibility.util';
import auditService from './audit.service';

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const key of parts) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

export class ExtractionService {
  /**
   * Patch extracted fields and log corrections for future GPT-4o tuning.
   */
  public async updateExtractionFields(params: {
    userId: string;
    organisationId: string;
    documentId: string;
    fields: Record<string, unknown>;
    note?: string | null;
  }) {
    const { userId, organisationId, documentId, fields, note } = params;
    await assertUserInOrganisation(userId, organisationId);

    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new Error('fields object is required');
    }

    const fieldKeys = Object.keys(fields);
    if (!fieldKeys.length) {
      throw new Error('At least one field update is required');
    }

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
      ...visibilityFilter(userId, 'uploadedBy'),
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    const extraction = await Extraction.findOne({ documentId })
      .sort({ createdAt: -1, version: -1 });

    if (!extraction) {
      throw new Error('No extraction found for this document');
    }

    const previousData = {
      ...((extraction.data || {}) as Record<string, unknown>),
    };
    const nextData = { ...previousData };
    const corrections: Array<{
      fieldKey: string;
      previousValue: unknown;
      correctedValue: unknown;
    }> = [];

    for (const [key, value] of Object.entries(fields)) {
      const previousValue = getNestedValue(previousData, key);
      if (JSON.stringify(previousValue) === JSON.stringify(value)) continue;
      setNestedValue(nextData, key, value);
      corrections.push({
        fieldKey: key,
        previousValue,
        correctedValue: value,
      });
    }

    if (!corrections.length) {
      return {
        extractionId: extraction.extractionId,
        documentId,
        data: extraction.data,
        updated: false,
        corrections: [],
      };
    }

    extraction.data = nextData;
    extraction.markModified('data');
    // User-approved corrections → treat as reviewed
    if (extraction.status === 'needs_review') {
      extraction.status = 'approved_with_warnings';
    }
    await extraction.save();

    // Sync display title if corrected
    if (
      typeof fields.suggested_title === 'string' &&
      fields.suggested_title.trim()
    ) {
      await Document.updateOne(
        { documentId },
        { $set: { displayTitle: fields.suggested_title.trim() } }
      );
    }

    const savedCorrections = [];
    for (const c of corrections) {
      const conf = extraction.fieldConfidence?.[c.fieldKey];
      const row = await ExtractionCorrection.create({
        correctionId: uuidv4(),
        organisationId,
        projectId: document.projectId ?? null,
        documentId,
        extractionId: extraction.extractionId,
        fieldKey: c.fieldKey,
        previousValue: c.previousValue,
        correctedValue: c.correctedValue,
        previousConfidence: typeof conf === 'number' ? conf : null,
        correctedBy: userId,
        note: note || null,
      });
      savedCorrections.push({
        correctionId: row.correctionId,
        fieldKey: row.fieldKey,
        previousValue: row.previousValue,
        correctedValue: row.correctedValue,
      });
    }

    await auditService.logEvent({
      actorId: userId,
      organisationId,
      action: 'extraction.fields_corrected',
      resourceType: 'extraction',
      resourceId: extraction.extractionId,
      metadata: {
        documentId,
        fields: corrections.map((c) => c.fieldKey),
        note: note || null,
      },
    });

    return {
      extractionId: extraction.extractionId,
      documentId,
      data: extraction.data,
      updated: true,
      corrections: savedCorrections,
    };
  }
}

export default new ExtractionService();
