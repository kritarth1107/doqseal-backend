/**
 * Consolidation for Bundle Engine
 * Consolidates extracted data from multiple documents into a single record.
 * Pure functions with no I/O.
 */

import type {
  DocumentData,
  OutputSchemaField,
  ConsolidatedField,
  FieldProvenance,
} from './types';

/**
 * Gets a nested value from an object using dot notation path.
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Consolidates a single field from multiple document sources.
 */
export function consolidateField(
  outputField: OutputSchemaField,
  documents: DocumentData[]
): ConsolidatedField {
  const sortedSources = [...outputField.sources].sort(
    (a, b) => b.priority - a.priority
  );

  const docByType = new Map<string, DocumentData[]>();
  for (const doc of documents) {
    const existing = docByType.get(doc.typeKey) || [];
    existing.push(doc);
    docByType.set(doc.typeKey, existing);
  }

  let bestValue: unknown = undefined;
  const provenance: FieldProvenance[] = [];

  for (const source of sortedSources) {
    const docsOfType = docByType.get(source.documentTypeKey);
    if (!docsOfType || docsOfType.length === 0) continue;

    for (const doc of docsOfType) {
      const field = doc.fields[source.fieldPath];
      if (field === undefined) continue;

      const value = field.value;
      if (value === undefined || value === null || value === '') continue;

      provenance.push({
        documentId: doc.documentId,
        documentTypeKey: source.documentTypeKey,
        fieldPath: source.fieldPath,
        confidence: field.confidence,
        page: field.page,
      });

      if (bestValue === undefined) {
        bestValue = value;
      }
    }
  }

  return {
    value: bestValue,
    provenance,
  };
}

/**
 * Consolidates all fields from multiple documents into a single record.
 */
export function consolidateRecord(
  outputSchema: OutputSchemaField[],
  documents: DocumentData[]
): Record<string, ConsolidatedField> {
  const record: Record<string, ConsolidatedField> = {};

  for (const field of outputSchema) {
    record[field.key] = consolidateField(field, documents);
  }

  return record;
}

/**
 * Applies field mapping to transform output keys.
 */
export function applyFieldMapping(
  record: Record<string, ConsolidatedField>,
  fieldMapping: Record<string, string>
): Record<string, ConsolidatedField> {
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    return record;
  }

  const mapped: Record<string, ConsolidatedField> = {};

  for (const [key, value] of Object.entries(record)) {
    const mappedKey = fieldMapping[key] || key;
    mapped[mappedKey] = value;
  }

  return mapped;
}

/**
 * Extracts just the values from a consolidated record (without provenance).
 */
export function extractValues(
  record: Record<string, ConsolidatedField>
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(record)) {
    values[key] = field.value;
  }

  return values;
}

/**
 * Creates a record hash for comparison (to detect changes between runs).
 */
export function hashRecord(record: Record<string, ConsolidatedField>): string {
  const values = extractValues(record);
  const sorted = Object.keys(values)
    .sort()
    .map((k) => `${k}:${JSON.stringify(values[k])}`)
    .join('|');

  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16);
}
