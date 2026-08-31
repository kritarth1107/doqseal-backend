/** Shared demo-account constants and canned TRF extraction (no AI). */

export const DEMO_EMAIL = 'demo@doqseal.com';
export const DEMO_OTP = '123456';
export const DEMO_USER_NAME = 'Doqseal Demo';
export const DEMO_ORG_NAME = 'Zeroknow Technologies';
export const DEMO_ORG_SLUG = 'zeroknow-technologies';
export const DEMO_PROJECT_NAME = 'Test Request Forms(TRFs)';

export const DEMO_PROJECT_HINT = `Kindly review the documents and ensure the following details are checked and matched:

Patient Name
Age
Gender
Client Code
Test Requirements (CBC, TSH)`;

export const DEMO_PROJECT_FIELDS = [
  {
    key: 'patient_name',
    label: 'Patient Name',
    type: 'string',
    required: true,
  },
  {
    key: 'patient_age',
    label: 'Age',
    type: 'number',
    required: true,
  },
  {
    key: 'patient_gender',
    label: 'Gender',
    type: 'string',
    required: true,
  },
  {
    key: 'client_code',
    label: 'Client Code',
    type: 'string',
    required: true,
  },
  {
    key: 'tests_requested',
    label: 'Test Requirements',
    type: 'string',
    required: true,
  },
] as const;

/** Simulated processing window before extraction is revealed (~8s feels under 10s) */
export const DEMO_PROCESSING_MS = 8_000;

/** Canned extraction for Lupin TRF — B Vijay Kumar / CBC + TSH */
export const DEMO_TRF_EXTRACTION = {
  document_type: 'Lupin Diagnostics Test Requisition Form',
  category: 'Medical',
  sub_category: 'Laboratory',
  page_count: 1,
  suggested_title: 'B Vijay Kumar — CBC, TSH',
  summary:
    'Lupin Diagnostics test requisition for patient B Vijay Kumar (58 years, Male). Client code CD/SLS 4378. Handwritten tests requested: CBC and TSH.',
  project_context:
    'TRF checklist: Patient Name, Age, Gender, Client Code, Test Requirements',
  pages: [{ page: 1, title: 'Test Requisition Form' }],
  lab_name: 'Lupin Diagnostics',
  patient_name: 'B Vijay Kumar',
  patient_age: 58,
  patient_gender: 'Male',
  client_code: 'CD/SLS 4378',
  tests_requested: 'CBC, TSH',
  auto_tags: [
    'lupin',
    'diagnostics',
    'trf',
    'laboratory',
    'cbc',
    'tsh',
    'handwritten',
  ],
  confidence_scores: {
    patient_name: 0.96,
    patient_age: 0.95,
    patient_gender: 0.97,
    client_code: 0.94,
    tests_requested: 0.95,
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
    lab_name: 0.98,
    suggested_title: 0.94,
    summary: 0.93,
  };
}
