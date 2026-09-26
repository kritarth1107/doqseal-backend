import { describe, it, expect } from 'vitest';
import {
  ruleExact,
  ruleSimilarity,
  ruleNumericTolerance,
  ruleDateWindow,
  rulePresence,
  ruleComponentMatch,
  ruleRegex,
  ruleSumEquals,
  ruleCountBetween,
  ruleSetOverlap,
  ComparisonValue,
} from '../../service/bundle/engine/rules';

function makeValue(
  docId: string,
  typeKey: string,
  value: unknown
): ComparisonValue {
  return {
    documentId: docId,
    typeKey,
    fieldKey: 'test_field',
    value,
  };
}

describe('ruleExact', () => {
  it('passes when all values match', () => {
    const values = [
      makeValue('doc1', 'pan', 'ABCDE1234F'),
      makeValue('doc2', 'form', 'ABCDE1234F'),
    ];
    const result = ruleExact(values);
    expect(result.passed).toBe(true);
  });

  it('fails when values differ', () => {
    const values = [
      makeValue('doc1', 'pan', 'ABCDE1234F'),
      makeValue('doc2', 'form', 'ABCDE1234G'),
    ];
    const result = ruleExact(values);
    expect(result.passed).toBe(false);
  });

  it('passes with single value', () => {
    const values = [makeValue('doc1', 'pan', 'ABCDE1234F')];
    const result = ruleExact(values);
    expect(result.passed).toBe(true);
  });

  it('normalises names when specified', () => {
    const values = [
      makeValue('doc1', 'pan', 'John Doe'),
      makeValue('doc2', 'form', 'JOHN DOE'),
    ];
    const result = ruleExact(values, { normaliser: 'name' });
    expect(result.passed).toBe(true);
  });
});

describe('ruleSimilarity', () => {
  it('passes when names are similar enough', () => {
    const values = [
      makeValue('doc1', 'pan', 'John Doe'),
      makeValue('doc2', 'form', 'JOHN DOE'),
    ];
    const result = ruleSimilarity(values, { threshold: 0.7 });
    expect(result.passed).toBe(true);
  });

  it('fails when names are too different', () => {
    const values = [
      makeValue('doc1', 'pan', 'John Doe'),
      makeValue('doc2', 'form', 'Jane Smith'),
    ];
    const result = ruleSimilarity(values, { threshold: 0.85 });
    expect(result.passed).toBe(false);
  });
});

describe('ruleNumericTolerance', () => {
  it('passes when amounts are within tolerance', () => {
    const values = [
      makeValue('doc1', 'slip', 50000),
      makeValue('doc2', 'statement', 52000),
    ];
    const result = ruleNumericTolerance(values, { tolerancePct: 15 });
    expect(result.passed).toBe(true);
  });

  it('fails when amounts exceed tolerance', () => {
    const values = [
      makeValue('doc1', 'slip', 50000),
      makeValue('doc2', 'statement', 70000),
    ];
    const result = ruleNumericTolerance(values, { tolerancePct: 15 });
    expect(result.passed).toBe(false);
  });

  it('handles string amounts', () => {
    const values = [
      makeValue('doc1', 'slip', 'Rs. 50,000'),
      makeValue('doc2', 'statement', '52000'),
    ];
    const result = ruleNumericTolerance(values, { tolerancePct: 15 });
    expect(result.passed).toBe(true);
  });
});

describe('ruleDateWindow', () => {
  it('passes when dates are within window', () => {
    const values = [
      makeValue('doc1', 'id', '2024-01-15'),
      makeValue('doc2', 'form', '2024-02-01'),
    ];
    const result = ruleDateWindow(values, { windowDays: 90 });
    expect(result.passed).toBe(true);
  });

  it('fails when dates exceed window', () => {
    const values = [
      makeValue('doc1', 'id', '2024-01-15'),
      makeValue('doc2', 'form', '2024-06-15'),
    ];
    const result = ruleDateWindow(values, { windowDays: 90 });
    expect(result.passed).toBe(false);
  });
});

describe('rulePresence', () => {
  it('passes when all required types are present', () => {
    const values = [
      makeValue('doc1', 'pan', 'value'),
      makeValue('doc2', 'aadhaar', 'value'),
    ];
    const result = rulePresence(values, ['pan', 'aadhaar']);
    expect(result.passed).toBe(true);
  });

  it('fails when required type is missing', () => {
    const values = [makeValue('doc1', 'pan', 'value')];
    const result = rulePresence(values, ['pan', 'aadhaar']);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('aadhaar');
  });
});

describe('ruleComponentMatch', () => {
  it('passes when address components match', () => {
    const values = [
      makeValue('doc1', 'id', '123 MG Road, Mumbai 400001'),
      makeValue('doc2', 'form', '456 SB Road, Mumbai 400001'),
    ];
    const result = ruleComponentMatch(values, { components: ['pincode', 'city'] });
    expect(result.passed).toBe(true);
  });

  it('fails when components differ', () => {
    const values = [
      makeValue('doc1', 'id', 'Mumbai 400001'),
      makeValue('doc2', 'form', 'Delhi 110001'),
    ];
    const result = ruleComponentMatch(values, { components: ['pincode', 'city'] });
    expect(result.passed).toBe(false);
  });
});

describe('ruleRegex', () => {
  it('passes when pattern matches', () => {
    const values = [
      makeValue('doc1', 'pan', 'ABCDE1234F'),
      makeValue('doc2', 'form', 'FGHIJ5678K'),
    ];
    const result = ruleRegex(values, { pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' });
    expect(result.passed).toBe(true);
  });

  it('fails when pattern does not match', () => {
    const values = [
      makeValue('doc1', 'pan', 'ABCDE1234F'),
      makeValue('doc2', 'form', 'INVALID'),
    ];
    const result = ruleRegex(values, { pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' });
    expect(result.passed).toBe(false);
  });
});

describe('ruleSumEquals', () => {
  it('passes when sum is within range', () => {
    const values = [
      makeValue('doc1', 'item1', 100),
      makeValue('doc2', 'item2', 200),
    ];
    const result = ruleSumEquals(values, { min: 250, max: 350 });
    expect(result.passed).toBe(true);
    expect(result.values._sum).toBe(300);
  });

  it('fails when sum is outside range', () => {
    const values = [
      makeValue('doc1', 'item1', 100),
      makeValue('doc2', 'item2', 200),
    ];
    const result = ruleSumEquals(values, { min: 400, max: 500 });
    expect(result.passed).toBe(false);
  });
});

describe('ruleCountBetween', () => {
  it('passes when count is within range', () => {
    const result = ruleCountBetween(3, { min: 2, max: 5 });
    expect(result.passed).toBe(true);
  });

  it('fails when count is below minimum', () => {
    const result = ruleCountBetween(1, { min: 2, max: 5 });
    expect(result.passed).toBe(false);
  });

  it('fails when count exceeds maximum', () => {
    const result = ruleCountBetween(6, { min: 2, max: 5 });
    expect(result.passed).toBe(false);
  });
});

describe('ruleSetOverlap', () => {
  it('passes when sets have sufficient overlap', () => {
    const set1 = ['CBC', 'HbA1c', 'LFT'];
    const set2 = ['Complete Blood Count', 'Liver Function Test'];
    const result = ruleSetOverlap(set1, set2, { minOverlap: 2, normalise: 'test' });
    expect(result.passed).toBe(true);
  });

  it('fails when overlap is insufficient', () => {
    const set1 = ['CBC', 'HbA1c'];
    const set2 = ['RFT', 'TSH'];
    const result = ruleSetOverlap(set1, set2, { minOverlap: 1, normalise: 'test' });
    expect(result.passed).toBe(false);
  });
});
