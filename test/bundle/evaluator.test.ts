import { describe, it, expect } from 'vitest';
import {
  evaluateAppliesWhen,
  isDocTypeRequired,
  checkCompleteness,
  evaluate,
} from '../../service/bundle/engine/evaluator';
import type {
  DocumentTypeConfig,
  ProfileValues,
  DocumentData,
  RuleConfig,
} from '../../service/bundle/engine/types';

describe('evaluateAppliesWhen', () => {
  it('returns true for null/empty condition', () => {
    expect(evaluateAppliesWhen(null, {})).toBe(true);
    expect(evaluateAppliesWhen({}, {})).toBe(true);
  });

  it('matches simple equality', () => {
    expect(evaluateAppliesWhen({ payer: 'insurance' }, { payer: 'insurance' })).toBe(true);
    expect(evaluateAppliesWhen({ payer: 'insurance' }, { payer: 'cash' })).toBe(false);
  });

  it('supports $eq operator', () => {
    expect(evaluateAppliesWhen({ payer: { $eq: 'insurance' } }, { payer: 'insurance' })).toBe(true);
  });

  it('supports $ne operator', () => {
    expect(evaluateAppliesWhen({ payer: { $ne: 'cash' } }, { payer: 'insurance' })).toBe(true);
    expect(evaluateAppliesWhen({ payer: { $ne: 'cash' } }, { payer: 'cash' })).toBe(false);
  });

  it('supports $in operator', () => {
    expect(evaluateAppliesWhen({ payer: { $in: ['insurance', 'corporate'] } }, { payer: 'insurance' })).toBe(true);
    expect(evaluateAppliesWhen({ payer: { $in: ['insurance', 'corporate'] } }, { payer: 'cash' })).toBe(false);
  });

  it('supports $gt/$gte/$lt/$lte operators', () => {
    expect(evaluateAppliesWhen({ amount: { $gt: 100 } }, { amount: 150 })).toBe(true);
    expect(evaluateAppliesWhen({ amount: { $gt: 100 } }, { amount: 50 })).toBe(false);
    expect(evaluateAppliesWhen({ amount: { $gte: 100 } }, { amount: 100 })).toBe(true);
    expect(evaluateAppliesWhen({ amount: { $lt: 100 } }, { amount: 50 })).toBe(true);
    expect(evaluateAppliesWhen({ amount: { $lte: 100 } }, { amount: 100 })).toBe(true);
  });

  it('supports $exists operator', () => {
    expect(evaluateAppliesWhen({ payer: { $exists: true } }, { payer: 'cash' })).toBe(true);
    expect(evaluateAppliesWhen({ payer: { $exists: true } }, {})).toBe(false);
    expect(evaluateAppliesWhen({ payer: { $exists: false } }, {})).toBe(true);
  });

  it('supports $and operator', () => {
    expect(
      evaluateAppliesWhen(
        { $and: [{ payer: 'insurance' }, { amount: { $gt: 100 } }] },
        { payer: 'insurance', amount: 150 }
      )
    ).toBe(true);
    expect(
      evaluateAppliesWhen(
        { $and: [{ payer: 'insurance' }, { amount: { $gt: 100 } }] },
        { payer: 'insurance', amount: 50 }
      )
    ).toBe(false);
  });

  it('supports $or operator', () => {
    expect(
      evaluateAppliesWhen(
        { $or: [{ payer: 'insurance' }, { payer: 'corporate' }] },
        { payer: 'insurance' }
      )
    ).toBe(true);
    expect(
      evaluateAppliesWhen(
        { $or: [{ payer: 'insurance' }, { payer: 'corporate' }] },
        { payer: 'cash' }
      )
    ).toBe(false);
  });

  it('supports $not operator', () => {
    expect(evaluateAppliesWhen({ $not: { payer: 'cash' } }, { payer: 'insurance' })).toBe(true);
    expect(evaluateAppliesWhen({ $not: { payer: 'cash' } }, { payer: 'cash' })).toBe(false);
  });

  it('supports array value as $in shorthand', () => {
    expect(evaluateAppliesWhen({ payer: ['insurance', 'corporate'] }, { payer: 'insurance' })).toBe(true);
    expect(evaluateAppliesWhen({ payer: ['insurance', 'corporate'] }, { payer: 'cash' })).toBe(false);
  });
});

describe('isDocTypeRequired', () => {
  it('handles boolean required', () => {
    expect(isDocTypeRequired(true, {})).toBe(true);
    expect(isDocTypeRequired(false, {})).toBe(false);
  });

  it('handles string condition as JSON', () => {
    expect(isDocTypeRequired('{"payer":"insurance"}', { payer: 'insurance' })).toBe(true);
    expect(isDocTypeRequired('{"payer":"insurance"}', { payer: 'cash' })).toBe(false);
  });
});

describe('checkCompleteness', () => {
  const documentTypes: DocumentTypeConfig[] = [
    { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
    { key: 'salary_slip', label: 'Salary Slip', required: true, minCount: 3, maxCount: 6 },
    { key: 'form16', label: 'Form 16', required: false, minCount: 1, maxCount: 2 },
  ];

  it('identifies missing documents', () => {
    const documents: DocumentData[] = [];
    const result = checkCompleteness(documentTypes, documents, {});

    expect(result.allRequiredPresent).toBe(false);
    const panItem = result.checklist.find((c) => c.typeKey === 'pan');
    expect(panItem?.status).toBe('missing');
  });

  it('identifies insufficient documents', () => {
    const documents: DocumentData[] = [
      { documentId: 'doc1', typeKey: 'pan', fields: {} },
      { documentId: 'doc2', typeKey: 'salary_slip', fields: {} },
      { documentId: 'doc3', typeKey: 'salary_slip', fields: {} },
    ];
    const result = checkCompleteness(documentTypes, documents, {});

    expect(result.allRequiredPresent).toBe(false);
    const slipItem = result.checklist.find((c) => c.typeKey === 'salary_slip');
    expect(slipItem?.status).toBe('insufficient');
    expect(slipItem?.received).toBe(2);
  });

  it('passes when all requirements met', () => {
    const documents: DocumentData[] = [
      { documentId: 'doc1', typeKey: 'pan', fields: {} },
      { documentId: 'doc2', typeKey: 'salary_slip', fields: {} },
      { documentId: 'doc3', typeKey: 'salary_slip', fields: {} },
      { documentId: 'doc4', typeKey: 'salary_slip', fields: {} },
    ];
    const result = checkCompleteness(documentTypes, documents, {});

    expect(result.allRequiredPresent).toBe(true);
    const panItem = result.checklist.find((c) => c.typeKey === 'pan');
    expect(panItem?.status).toBe('present');
  });

  it('respects conditional requirements', () => {
    const conditionalTypes: DocumentTypeConfig[] = [
      { key: 'insurance_card', label: 'Insurance Card', required: '{"payer":"insurance"}', minCount: 1, maxCount: 1 },
    ];

    const docsEmpty: DocumentData[] = [];
    
    const result1 = checkCompleteness(conditionalTypes, docsEmpty, { payer: 'cash' });
    expect(result1.allRequiredPresent).toBe(true);

    const result2 = checkCompleteness(conditionalTypes, docsEmpty, { payer: 'insurance' });
    expect(result2.allRequiredPresent).toBe(false);
  });
});

describe('evaluate', () => {
  it('runs full evaluation and returns all results', () => {
    const documentTypes: DocumentTypeConfig[] = [
      { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
    ];

    const rules: RuleConfig[] = [
      {
        id: 'name_match',
        name: 'Name Match',
        category: 'cross_match',
        field: 'name',
        documents: ['pan', 'form'],
        method: 'exact',
        severity: 'blocking',
        enabled: true,
      },
    ];

    const documents: DocumentData[] = [
      { documentId: 'doc1', typeKey: 'pan', fields: { name: { value: 'John Doe' } } },
    ];

    const result = evaluate({
      documentTypes,
      rules,
      documents,
      profile: {},
    });

    expect(result.completeness).toBeDefined();
    expect(result.crossMatch).toBeDefined();
    expect(result.validity).toBeDefined();
    expect(result.quality).toBeDefined();
    expect(result.allExceptions).toBeDefined();
  });
});
