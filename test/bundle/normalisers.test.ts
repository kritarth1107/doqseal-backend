import { describe, it, expect } from 'vitest';
import {
  normaliseName,
  normaliseNameTokens,
  normaliseDate,
  datesMatch,
  normaliseAmount,
  normalisePAN,
  isValidPAN,
  normaliseAadhaar,
  isValidAadhaar,
  normaliseIFSC,
  isValidIFSC,
  normaliseGSTIN,
  isValidGSTIN,
  parseAddressComponents,
  normalisePhone,
  normaliseEmail,
  normaliseTestName,
  testNamesMatch,
} from '../../service/bundle/engine/normalisers';

describe('normaliseName', () => {
  it('removes common titles', () => {
    expect(normaliseName('Mr. John Doe')).toBe('john doe');
    expect(normaliseName('Mrs. Jane Doe')).toBe('jane doe');
    expect(normaliseName('Dr. Smith')).toBe('smith');
    expect(normaliseName('Shri Ram Kumar')).toBe('ram kumar');
  });

  it('normalises case and whitespace', () => {
    expect(normaliseName('  JOHN   DOE  ')).toBe('john doe');
    expect(normaliseName('John  Doe')).toBe('john doe');
  });

  it('handles empty and null values', () => {
    expect(normaliseName(null)).toBe('');
    expect(normaliseName(undefined)).toBe('');
    expect(normaliseName('')).toBe('');
  });
});

describe('normaliseNameTokens', () => {
  it('returns sorted tokens', () => {
    expect(normaliseNameTokens('John Doe')).toEqual(['doe', 'john']);
    expect(normaliseNameTokens('Mr. Doe John')).toEqual(['doe', 'john']);
  });
});

describe('normaliseDate', () => {
  it('parses ISO dates', () => {
    expect(normaliseDate('2024-01-15')).toBe('2024-01-15');
    expect(normaliseDate('2024-01-15T10:30:00Z')).toBe('2024-01-15');
  });

  it('parses DD/MM/YYYY format', () => {
    expect(normaliseDate('15/01/2024')).toBe('2024-01-15');
    expect(normaliseDate('1/1/2024')).toBe('2024-01-01');
  });

  it('handles year-only (Aadhaar DOB)', () => {
    expect(normaliseDate('1990')).toBe('1990');
  });

  it('handles Date objects', () => {
    const date = new Date('2024-01-15');
    expect(normaliseDate(date)).toBe('2024-01-15');
  });

  it('returns null for invalid dates', () => {
    expect(normaliseDate('invalid')).toBe(null);
    expect(normaliseDate(null)).toBe(null);
  });
});

describe('datesMatch', () => {
  it('matches exact dates', () => {
    expect(datesMatch('2024-01-15', '2024-01-15')).toBe(true);
  });

  it('matches year-only to full date', () => {
    expect(datesMatch('1990', '1990-05-15')).toBe(true);
    expect(datesMatch('1990-05-15', '1990')).toBe(true);
  });

  it('returns false for different dates', () => {
    expect(datesMatch('2024-01-15', '2024-01-16')).toBe(false);
    expect(datesMatch('1990', '1991-01-01')).toBe(false);
  });
});

describe('normaliseAmount', () => {
  it('handles numeric values', () => {
    expect(normaliseAmount(1000)).toBe(1000);
    expect(normaliseAmount('1000')).toBe(1000);
  });

  it('handles Indian currency notation', () => {
    expect(normaliseAmount('Rs. 1,000')).toBe(1000);
    expect(normaliseAmount('₹1,00,000')).toBe(100000);
  });

  it('handles lakh/crore notation', () => {
    expect(normaliseAmount('5 lakh')).toBe(500000);
    expect(normaliseAmount('1.5 crore')).toBe(15000000);
    expect(normaliseAmount('2L')).toBe(200000);
    expect(normaliseAmount('1Cr')).toBe(10000000);
  });

  it('returns null for invalid amounts', () => {
    expect(normaliseAmount('invalid')).toBe(null);
    expect(normaliseAmount(null)).toBe(null);
  });
});

describe('normalisePAN', () => {
  it('normalises PAN format', () => {
    expect(normalisePAN('ABCDE1234F')).toBe('ABCDE1234F');
    expect(normalisePAN('abcde1234f')).toBe('ABCDE1234F');
    expect(normalisePAN('ABCDE 1234 F')).toBe('ABCDE1234F');
  });
});

describe('isValidPAN', () => {
  it('validates correct PAN format', () => {
    expect(isValidPAN('ABCDE1234F')).toBe(true);
  });

  it('rejects invalid PAN', () => {
    expect(isValidPAN('ABCDE123F')).toBe(false);
    expect(isValidPAN('12345ABCDE')).toBe(false);
    expect(isValidPAN('')).toBe(false);
  });
});

describe('normaliseAadhaar', () => {
  it('returns last 4 digits', () => {
    expect(normaliseAadhaar('1234 5678 9012')).toBe('9012');
    expect(normaliseAadhaar('123456789012')).toBe('9012');
  });
});

describe('isValidAadhaar', () => {
  it('validates 12-digit Aadhaar', () => {
    expect(isValidAadhaar('123456789012')).toBe(true);
    expect(isValidAadhaar('1234 5678 9012')).toBe(true);
  });

  it('rejects invalid Aadhaar', () => {
    expect(isValidAadhaar('12345678901')).toBe(false);
    expect(isValidAadhaar('1234567890123')).toBe(false);
  });
});

describe('normaliseIFSC', () => {
  it('normalises IFSC format', () => {
    expect(normaliseIFSC('HDFC0001234')).toBe('HDFC0001234');
    expect(normaliseIFSC('hdfc0001234')).toBe('HDFC0001234');
  });
});

describe('isValidIFSC', () => {
  it('validates correct IFSC format', () => {
    expect(isValidIFSC('HDFC0001234')).toBe(true);
    expect(isValidIFSC('SBIN0123456')).toBe(true);
  });

  it('rejects invalid IFSC', () => {
    expect(isValidIFSC('HDFC1001234')).toBe(false);
    expect(isValidIFSC('HDFC00012')).toBe(false);
  });
});

describe('normaliseGSTIN', () => {
  it('normalises GSTIN format', () => {
    expect(normaliseGSTIN('27AADCB2230M1ZT')).toBe('27AADCB2230M1ZT');
    expect(normaliseGSTIN('27aadcb2230m1zt')).toBe('27AADCB2230M1ZT');
  });
});

describe('isValidGSTIN', () => {
  it('validates correct GSTIN format', () => {
    expect(isValidGSTIN('27AADCB2230M1ZT')).toBe(true);
  });

  it('rejects invalid GSTIN', () => {
    expect(isValidGSTIN('27AADCB2230M1Z')).toBe(false);
    expect(isValidGSTIN('ABCDEF123456789')).toBe(false);
  });
});

describe('parseAddressComponents', () => {
  it('extracts pincode', () => {
    const result = parseAddressComponents('123, MG Road, Mumbai 400001');
    expect(result.pincode).toBe('400001');
  });

  it('extracts city', () => {
    const result = parseAddressComponents('123, MG Road, Mumbai 400001');
    expect(result.city).toBe('mumbai');
  });

  it('extracts state', () => {
    const result = parseAddressComponents('Mumbai, Maharashtra 400001');
    expect(result.state).toBe('maharashtra');
  });
});

describe('normalisePhone', () => {
  it('removes country code and formatting', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalisePhone('91-9876543210')).toBe('9876543210');
    expect(normalisePhone('09876543210')).toBe('9876543210');
    expect(normalisePhone('9876543210')).toBe('9876543210');
  });
});

describe('normaliseEmail', () => {
  it('lowercases email', () => {
    expect(normaliseEmail('John.Doe@Example.COM')).toBe('john.doe@example.com');
  });
});

describe('normaliseTestName', () => {
  it('normalises test name synonyms', () => {
    expect(normaliseTestName('Complete Blood Count')).toBe('cbc');
    expect(normaliseTestName('CBC')).toBe('cbc');
    expect(normaliseTestName('Hemogram')).toBe('cbc');
    expect(normaliseTestName('HbA1c')).toBe('hba1c');
    expect(normaliseTestName('Glycated Hemoglobin')).toBe('hba1c');
  });
});

describe('testNamesMatch', () => {
  it('matches synonymous test names', () => {
    expect(testNamesMatch('CBC', 'Complete Blood Count')).toBe(true);
    expect(testNamesMatch('HbA1c', 'Glycated Hemoglobin')).toBe(true);
  });

  it('returns false for different tests', () => {
    expect(testNamesMatch('CBC', 'HbA1c')).toBe(false);
  });
});
