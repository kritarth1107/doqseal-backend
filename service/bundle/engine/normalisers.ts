/**
 * Value Normalisers for Bundle Engine
 * Pure functions for normalizing extracted values before comparison.
 * No I/O - only string/value transformations.
 */

/**
 * Normalises a name by removing titles, extra spaces, and standardizing case.
 * Handles common Indian name titles and variations.
 */
export function normaliseName(value: unknown): string {
  if (value == null) return '';
  const str = String(value).trim();
  if (!str) return '';

  const titles = [
    'mr',
    'mrs',
    'ms',
    'miss',
    'dr',
    'shri',
    'smt',
    'kumari',
    'prof',
    'sri',
    'shrimati',
    'late',
  ];

  let normalised = str
    .toLowerCase()
    .replace(/[.,']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const title of titles) {
    normalised = normalised.replace(new RegExp(`^${title}\\s+`, 'i'), '');
    normalised = normalised.replace(new RegExp(`\\s+${title}$`, 'i'), '');
  }

  return normalised.trim();
}

/**
 * Normalises a name and returns sorted tokens for order-independent comparison.
 */
export function normaliseNameTokens(value: unknown): string[] {
  const normalised = normaliseName(value);
  if (!normalised) return [];
  return normalised.split(/\s+/).filter(Boolean).sort();
}

/**
 * Normalises a date to ISO format (YYYY-MM-DD).
 * Handles various Indian date formats and Aadhaar year-only DOB.
 */
export function normaliseDate(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{4}$/.test(str)) {
    return str;
  }

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const ddmmyyyySlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyySlash) {
    const dd = ddmmyyyySlash[1].padStart(2, '0');
    const mm = ddmmyyyySlash[2].padStart(2, '0');
    const yyyy = ddmmyyyySlash[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const mmddyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mmddyyyy) {
    const mm = mmddyyyy[1].padStart(2, '0');
    const dd = mmddyyyy[2].padStart(2, '0');
    const yy = mmddyyyy[3];
    const yyyy = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Checks if two dates match, handling year-only Aadhaar DOBs.
 */
export function datesMatch(date1: unknown, date2: unknown): boolean {
  const norm1 = normaliseDate(date1);
  const norm2 = normaliseDate(date2);

  if (norm1 === null || norm2 === null) return false;
  if (norm1 === norm2) return true;

  if (norm1.length === 4 && norm2.startsWith(norm1)) return true;
  if (norm2.length === 4 && norm1.startsWith(norm2)) return true;

  return false;
}

/**
 * Normalises an amount, handling Indian currency formats (lakh/crore) and digit grouping.
 */
export function normaliseAmount(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  let str = String(value).trim().toLowerCase();
  if (!str) return null;

  str = str.replace(/[₹,]/g, '').replace(/rs\.?\s*/gi, '').trim();

  const croreMatch = str.match(/^([\d.]+)\s*(?:cr|crore|crores)$/i);
  if (croreMatch) {
    const num = parseFloat(croreMatch[1]);
    return isNaN(num) ? null : num * 10000000;
  }

  const lakhMatch = str.match(/^([\d.]+)\s*(?:l|lac|lakh|lakhs)$/i);
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1]);
    return isNaN(num) ? null : num * 100000;
  }

  const thousandMatch = str.match(/^([\d.]+)\s*(?:k|thousand)$/i);
  if (thousandMatch) {
    const num = parseFloat(thousandMatch[1]);
    return isNaN(num) ? null : num * 1000;
  }

  str = str.replace(/,/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Normalises a PAN (Permanent Account Number).
 */
export function normalisePAN(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validates PAN format.
 */
export function isValidPAN(value: unknown): boolean {
  const pan = normalisePAN(value);
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

/**
 * Normalises an Aadhaar number, returning last 4 digits (masked format).
 */
export function normaliseAadhaar(value: unknown): string {
  if (value == null) return '';
  const digits = String(value).replace(/[^0-9]/g, '');
  if (digits.length < 4) return '';
  return digits.slice(-4);
}

/**
 * Validates Aadhaar format (12 digits).
 */
export function isValidAadhaar(value: unknown): boolean {
  if (value == null) return false;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length === 12;
}

/**
 * Normalises an IFSC code.
 */
export function normaliseIFSC(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validates IFSC format.
 */
export function isValidIFSC(value: unknown): boolean {
  const ifsc = normaliseIFSC(value);
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
}

/**
 * Normalises a GSTIN.
 */
export function normaliseGSTIN(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Validates GSTIN format.
 */
export function isValidGSTIN(value: unknown): boolean {
  const gstin = normaliseGSTIN(value);
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin);
}

/**
 * Address components for partial matching.
 */
export interface AddressComponents {
  houseNumber?: string;
  street?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

/**
 * Extracts address components from a raw address string.
 */
export function parseAddressComponents(value: unknown): AddressComponents {
  if (value == null) return {};

  const str = String(value).trim().toLowerCase();
  if (!str) return {};

  const components: AddressComponents = {};

  const pincodeMatch = str.match(/\b(\d{6})\b/);
  if (pincodeMatch) {
    components.pincode = pincodeMatch[1];
  }

  const statePatterns: Record<string, string[]> = {
    maharashtra: ['maharashtra', 'mh'],
    karnataka: ['karnataka', 'ka'],
    delhi: ['delhi', 'new delhi', 'dl'],
    tamilnadu: ['tamil nadu', 'tamilnadu', 'tn'],
    telangana: ['telangana', 'ts'],
    kerala: ['kerala', 'kl'],
    gujarat: ['gujarat', 'gj'],
    rajasthan: ['rajasthan', 'rj'],
    uttarpradesh: ['uttar pradesh', 'up'],
    madhyapradesh: ['madhya pradesh', 'mp'],
    westbengal: ['west bengal', 'wb'],
    bihar: ['bihar', 'br'],
    andhra: ['andhra pradesh', 'ap'],
    punjab: ['punjab', 'pb'],
    haryana: ['haryana', 'hr'],
    chhattisgarh: ['chhattisgarh', 'cg'],
  };

  for (const [normalised, patterns] of Object.entries(statePatterns)) {
    for (const pattern of patterns) {
      if (str.includes(pattern)) {
        components.state = normalised;
        break;
      }
    }
    if (components.state) break;
  }

  const majorCities = [
    'mumbai',
    'delhi',
    'bangalore',
    'bengaluru',
    'hyderabad',
    'chennai',
    'kolkata',
    'pune',
    'ahmedabad',
    'jaipur',
    'lucknow',
    'surat',
    'kanpur',
    'nagpur',
    'indore',
    'thane',
    'bhopal',
    'visakhapatnam',
    'patna',
    'vadodara',
    'ghaziabad',
    'ludhiana',
    'agra',
    'nashik',
    'faridabad',
    'meerut',
    'rajkot',
    'raipur',
  ];

  for (const city of majorCities) {
    if (str.includes(city)) {
      components.city = city;
      break;
    }
  }

  return components;
}

/**
 * Normalises a phone number to digits only, handling Indian formats.
 */
export function normalisePhone(value: unknown): string {
  if (value == null) return '';
  let digits = String(value).replace(/[^0-9+]/g, '');

  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

/**
 * Normalises email to lowercase.
 */
export function normaliseEmail(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Generic string normalisation for comparison.
 */
export function normaliseString(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Test name synonyms for diagnostics use case.
 */
const TEST_SYNONYMS: Record<string, string[]> = {
  cbc: ['complete blood count', 'complete blood picture', 'cbp', 'hemogram', 'haemogram'],
  hba1c: ['glycated hemoglobin', 'glycated haemoglobin', 'hemoglobin a1c', 'a1c'],
  rbs: ['random blood sugar', 'random glucose'],
  fbs: ['fasting blood sugar', 'fasting glucose', 'fasting blood glucose'],
  ppbs: ['post prandial blood sugar', 'pp blood sugar', 'pp glucose'],
  lft: ['liver function test', 'liver profile', 'hepatic function panel'],
  rft: ['renal function test', 'kidney function test', 'kidney profile'],
  kft: ['kidney function test', 'renal function test', 'renal profile'],
  tsh: ['thyroid stimulating hormone', 'thyroid function'],
  lipid: ['lipid profile', 'cholesterol panel', 'lipid panel'],
  urine: ['urine routine', 'urine analysis', 'urinalysis', 'urine r/m', 'urine r/e'],
  ecg: ['electrocardiogram', 'ekg', 'electrocardiography'],
  crp: ['c-reactive protein', 'c reactive protein'],
  esr: ['erythrocyte sedimentation rate', 'sed rate'],
};

/**
 * Normalises a test name for comparison.
 */
export function normaliseTestName(value: unknown): string {
  if (value == null) return '';
  let str = normaliseString(value);
  str = str.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const [canonical, synonyms] of Object.entries(TEST_SYNONYMS)) {
    if (str === canonical || synonyms.some((s) => str === s || str.includes(s))) {
      return canonical;
    }
  }

  return str;
}

/**
 * Checks if two test names match (including synonyms).
 */
export function testNamesMatch(test1: unknown, test2: unknown): boolean {
  const norm1 = normaliseTestName(test1);
  const norm2 = normaliseTestName(test2);
  return norm1 === norm2;
}
