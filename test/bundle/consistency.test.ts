import { describe, it, expect } from 'vitest';
import { checkConsistency } from '../../service/bundle/pipeline/consistency';

const doc = (documentId: string, keyFields: Record<string, string>) => ({ documentId, typeKey: null, keyFields });

describe('cross-document consistency', () => {
  it('finds no conflict when values agree after normalisation', () => {
    expect(
      checkConsistency([
        doc('a', { full_name: 'Ravi Kumar', date_of_birth: '1990-01-02', gender: 'Male', pan: 'abcde1234f' }),
        doc('b', { name: 'RAVI  KUMAR', dob: '02/01/1990', sex: 'M', pan_number: 'ABCDE1234F' }),
        doc('c', { full_name: 'R Kumar' }),
      ])
    ).toEqual([]);
  });

  it('flags a name mismatch with the values from each document', () => {
    const conflicts = checkConsistency([doc('a', { full_name: 'Ravi Kumar' }), doc('b', { full_name: 'Sunita Sharma' })]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'full_name', severity: 'review' });
    expect(conflicts[0].values.map((v) => v.documentId)).toEqual(['a', 'b']);
  });

  it('flags date of birth, gender, PAN and Aadhaar mismatches', () => {
    const conflicts = checkConsistency([
      doc('a', { date_of_birth: '1990-01-02', gender: 'F', pan: 'ABCDE1234F', aadhaar_last4: '1234' }),
      doc('b', { date_of_birth: '1991-01-02', gender: 'male', pan: 'ZZZZZ9999Z', aadhaar: 'XXXX XXXX 9876' }),
    ]);
    expect(conflicts.map((c) => c.field)).toEqual(['date_of_birth', 'gender', 'pan', 'aadhaar_last4']);
    const aadhaar = conflicts.find((c) => c.field === 'aadhaar_last4')!;
    expect(aadhaar.values.map((v) => v.value)).toEqual(['1234', '9876']);
  });

  it('ignores fields present on only one document and unparseable dates', () => {
    expect(
      checkConsistency([
        doc('a', { full_name: 'Ravi Kumar', date_of_birth: 'not a date' }),
        doc('b', { pan: 'ABCDE1234F', date_of_birth: '1990-01-02' }),
      ])
    ).toEqual([]);
  });

  it('returns nothing for zero or one document', () => {
    expect(checkConsistency([])).toEqual([]);
    expect(checkConsistency([doc('a', { full_name: 'x' })])).toEqual([]);
  });
});
