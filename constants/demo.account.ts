/** Shared demo-account constants and canned TRF extraction (no AI). */

export const DEMO_EMAIL = 'demo@doqseal.com';
export const DEMO_OTP = '123456';
export const DEMO_USER_NAME = 'Doqseal Demo';
export const DEMO_ORG_NAME = 'Zeroknow Technologies';
export const DEMO_ORG_SLUG = 'zeroknow-technologies';
export const DEMO_PROJECT_NAME = 'Test Request Forms(TRFs)';
export const DEMO_PROJECT_HINT = `Kindly review the documents and ensure the following details are checked and matched:

Center Stamp
Patient Name
Age
Sex
Clinical History
Medical Officer Stamp
Medical Superintendent Stamp`;

/** Simulated processing window before extraction is revealed */
export const DEMO_PROCESSING_MS = 10_000;

export const DEMO_TRF_EXTRACTION = {
  document_type: 'Medical Radiology Requisition + Billing Receipt',
  category: 'Medical',
  sub_category: 'Radiology',
  page_count: 2,
  suggested_title: 'Dnyaneshwar Shyamrao Munde — CT Ankle',
  summary:
    'Two-page NHM free-diagnostic pack from Krsnaa Diagnostics (Sub District Hospital, Parli). Page 1 is the radiology TRF / requisition for CT Limbs Without Contrast (clinical history: CT Ankle). Page 2 is the CREDIT billing receipt (₹1,200 gross/net, unpaid balance). Patient is BPL with centre, referring doctor, diagnostic coordinator, medical superintendent, and patient signatures present.',
  project_context: 'TRF checklist: Center Stamp, Patient Name, Age, Sex, Clinical History, Medical Officer Stamp, Medical Superintendent Stamp',
  pages: [
    { page: 1, title: 'Radiology Requisition' },
    { page: 2, title: 'Billing Receipt' },
  ],
  institution: {
    name: 'Krsnaa Diagnostics Ltd.',
    branch: 'Sub District Hospital, Parli',
    scheme: 'NHM Free Diagnostic Initiative',
    gst_number: '27AAECK2179H2ZD',
    cin: 'U74900PN2010PLC138068',
    pin: '431515',
  },
  patient: {
    name: 'Dnyaneshwar Shyamrao Munde',
    age: 36,
    gender: 'M',
    address: 'At Post - Parli V',
    patient_code: 'PARLI260300022531',
    patient_type: 'BPL',
    contact: '9320397617',
  },
  referral: {
    referred_by: 'Dr. Dhiraj Kedar',
    clinical_history: 'CT Ankle',
  },
  visit: {
    date: '2026-03-07',
    time: '15:28',
    rec_number: 'OPD/47903961',
    ipd_opd: '289/96',
    bill_type: 'CREDIT',
  },
  tests: {
    requested: ['CT Limbs Without Contrast'],
    section: 'CT SCAN',
  },
  billing: {
    gross: 1200.0,
    net: 1200.0,
    paid: 0.0,
    balance: 1200.0,
    currency: 'INR',
    amount_in_words: 'One Thousand Two Hundred Only',
  },
  verification: {
    centre_stamp: true,
    referring_doctor_signature: true,
    diagnostic_coordinator_signature: true,
    medical_superintendent_signature: true,
    patient_signature: true,
    user_signature: true,
  },
  auto_tags: [
    'medical',
    'radiology',
    'CT scan',
    'government',
    'NHM',
    'Maharashtra',
    'BPL',
    'free diagnostic',
    'billing',
  ],
  confidence_scores: {
    patient_name: 0.91,
    patient_code: 0.98,
    rec_number: 0.97,
    billing_amount: 0.99,
    tests_requested: 0.85,
    clinical_history: 0.61,
    referred_by: 0.94,
    date: 0.96,
  },
} as const;

export function isDemoEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === DEMO_EMAIL;
}

export function demoFieldConfidence(
  data: typeof DEMO_TRF_EXTRACTION
): Record<string, number> {
  const scores = data.confidence_scores as Record<string, number>;
  return {
    ...scores,
    institution: 0.95,
    patient: scores.patient_name ?? 0.9,
    referral: scores.referred_by ?? 0.9,
    visit: scores.date ?? 0.9,
    tests: scores.tests_requested ?? 0.85,
    billing: scores.billing_amount ?? 0.95,
    verification: 0.93,
  };
}
