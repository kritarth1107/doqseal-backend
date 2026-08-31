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
Test Requirements`;

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

export type DemoTrfPayload = {
  id: string;
  /** Match against originalFilename (case-insensitive). Longer / more specific first. */
  match: string[];
  /** Exact byte sizes of the known demo JPEGs (fallback if filename changes). */
  byteSizes?: number[];
  document_type: string;
  category: string;
  sub_category: string;
  page_count: number;
  suggested_title: string;
  summary: string;
  project_context: string;
  pages: Array<{ page: number; title: string }>;
  lab_name: string;
  patient_name: string;
  patient_age: number;
  patient_gender: string;
  client_code: string;
  tests_requested: string;
  auto_tags: string[];
  confidence_scores: Record<string, number>;
};

const BASE_META = {
  document_type: 'Lupin Diagnostics Test Requisition Form',
  category: 'Medical',
  sub_category: 'Laboratory',
  page_count: 1,
  project_context:
    'TRF checklist: Patient Name, Age, Gender, Client Code, Test Requirements',
  pages: [{ page: 1, title: 'Test Requisition Form' }] as Array<{
    page: number;
    title: string;
  }>,
  lab_name: 'Lupin Diagnostics',
  confidence_scores: {
    patient_name: 0.96,
    patient_age: 0.95,
    patient_gender: 0.97,
    client_code: 0.94,
    tests_requested: 0.95,
  } as Record<string, number>,
};

/**
 * One canned payload per demo TRF photo.
 * Match order matters: "(1)" / "(2)" variants before the bare timestamp name.
 */
export const DEMO_TRF_VARIANTS: DemoTrfPayload[] = [
  {
    id: 'aachal-singh',
    match: [
      '12.53.21 pm (1)',
      '12.53.21_pm_(1)',
      '12.53.21 pm (1).jpeg',
      'aachal',
    ],
    byteSizes: [181860],
    ...BASE_META,
    suggested_title: 'Aachal Singh — Blood Group, TFT, HBsAg',
    summary:
      'Lupin Diagnostics TRF for patient Aachal Singh (23 years, Female). Client code STSQ315. Tests requested: Blood Group, Thyroid Function Test (TFT), and Hepatitis B Surface Antigen (HBsAg).',
    patient_name: 'Aachal Singh',
    patient_age: 23,
    patient_gender: 'Female',
    client_code: 'STSQ315',
    tests_requested:
      'Blood Group (B group), Thyroid Function Test (TFT), Hepatitis B Surface Antigen (HBsAg)',
    auto_tags: ['lupin', 'trf', 'blood group', 'tft', 'hbsag'],
  },
  {
    id: 'yogesh-mehta',
    match: [
      '12.53.21 pm.jpeg',
      '12.53.21 pm.jpg',
      '12.53.21_pm.jpeg',
      'yogesh',
    ],
    byteSizes: [172793],
    ...BASE_META,
    suggested_title: 'Yogesh Mehta — Creatinine, Urea, Lipid Profile',
    summary:
      'Lupin Diagnostics TRF for patient Yogesh Mehta (52 years, Male). Client code not filled on the form. Tests requested: Creatinine, Urea, and Lipid Profile.',
    patient_name: 'Yogesh Mehta',
    patient_age: 52,
    patient_gender: 'Male',
    client_code: 'Not filled',
    tests_requested: 'Creatinine (Creat), Urea, Lipid Profile (Lipid pr)',
    auto_tags: ['lupin', 'trf', 'creatinine', 'urea', 'lipid'],
  },
  {
    id: 'karan-vashan',
    match: [
      '12.53.22 pm (1)',
      '12.53.22_pm_(1)',
      '12.53.22 pm (1).jpeg',
      'karan',
    ],
    byteSizes: [154365],
    ...BASE_META,
    suggested_title: 'Karan Vashan — CBC, CRP, ESR',
    summary:
      'Lupin Diagnostics TRF for patient Karan Vashan (19 years, Male). Client code PUP 4502. Tests requested: Complete Blood Count (CBC), C-Reactive Protein (CRP), and Erythrocyte Sedimentation Rate (ESR).',
    patient_name: 'Karan Vashan',
    patient_age: 19,
    patient_gender: 'Male',
    client_code: 'PUP 4502',
    tests_requested:
      'Complete Blood Count (CBC), C-Reactive Protein (CRP), Erythrocyte Sedimentation Rate (ESR)',
    auto_tags: ['lupin', 'trf', 'cbc', 'crp', 'esr'],
  },
  {
    id: 'sahil-shirke',
    match: [
      '12.53.22 pm (2)',
      '12.53.22_pm_(2)',
      '12.53.22 pm (2).jpeg',
      'sahil',
      'shirke',
    ],
    byteSizes: [186149],
    ...BASE_META,
    suggested_title: 'Sahil Shirke — HbA1c, Lipid Profile, CBC',
    summary:
      'Lupin Diagnostics TRF for patient Sahil Shirke (28 years, Male). Client code PUP 1041. Tests requested: Glycated Hemoglobin (HbA1c), Lipid Profile, and Complete Blood Count (CBC).',
    patient_name: 'Sahil Shirke',
    patient_age: 28,
    patient_gender: 'Male',
    client_code: 'PUP 1041',
    tests_requested:
      'Glycated Hemoglobin (HbA1c), Lipid Profile, Complete Blood Count (CBC)',
    auto_tags: ['lupin', 'trf', 'hba1c', 'lipid', 'cbc'],
  },
  {
    id: 'b-vijay-kumar',
    match: [
      '12.53.22 pm.jpeg',
      '12.53.22 pm.jpg',
      '12.53.22_pm.jpeg',
      'vijay',
      'b-vijay-kumar',
    ],
    byteSizes: [173680],
    ...BASE_META,
    suggested_title: 'B Vijay Kumar — CBC, TSH',
    summary:
      'Lupin Diagnostics TRF for patient B Vijay Kumar (58 years, Male). Client code CD/SLS 4378. Tests requested: Complete Blood Count (CBC) and Thyroid Stimulating Hormone (TSH).',
    patient_name: 'B Vijay Kumar',
    patient_age: 58,
    patient_gender: 'Male',
    client_code: 'CD/SLS 4378',
    tests_requested:
      'Complete Blood Count (CBC), Thyroid Stimulating Hormone (TSH)',
    auto_tags: ['lupin', 'trf', 'cbc', 'tsh'],
  },
];

/** Default when filename does not match a known demo TRF */
export const DEMO_TRF_EXTRACTION = DEMO_TRF_VARIANTS[4];

function normalizeFilename(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clonePayload(variant: DemoTrfPayload): DemoTrfPayload {
  return {
    ...variant,
    pages: [...variant.pages],
    auto_tags: [...variant.auto_tags],
    confidence_scores: { ...variant.confidence_scores },
    byteSizes: variant.byteSizes ? [...variant.byteSizes] : undefined,
  };
}

/**
 * Pick the canned TRF payload for an uploaded demo file.
 * Prefer WhatsApp filename match; fall back to exact byte size of the known JPEGs.
 */
export function resolveDemoTrfExtraction(
  originalFilename?: string | null,
  byteSize?: number | null
): DemoTrfPayload {
  const name = normalizeFilename(originalFilename);

  if (name) {
    for (const variant of DEMO_TRF_VARIANTS) {
      if (variant.match.some((needle) => name.includes(needle.toLowerCase()))) {
        return clonePayload(variant);
      }
    }
  }

  if (typeof byteSize === 'number' && byteSize > 0) {
    const bySize = DEMO_TRF_VARIANTS.find((v) =>
      (v.byteSizes || []).includes(byteSize)
    );
    if (bySize) return clonePayload(bySize);
  }

  return clonePayload(DEMO_TRF_EXTRACTION);
}

export function isDemoEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === DEMO_EMAIL;
}

export function demoFieldConfidence(
  data: DemoTrfPayload
): Record<string, number> {
  const scores = data.confidence_scores;
  return {
    ...scores,
    lab_name: 0.98,
    suggested_title: 0.94,
    summary: 0.93,
  };
}
