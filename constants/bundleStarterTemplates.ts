/**
 * Starter bundle templates, one or more per vertical. They are starting points
 * an organisation copies into its own workspace and edits, not policy. Used by
 * the "start from a starter" API and by scripts/seed-example-templates.ts.
 */

export type BundleStarterVertical =
  | 'diagnostics'
  | 'lending'
  | 'mutual_funds'
  | 'insurance'
  | 'vendor_onboarding';

export const BUNDLE_STARTER_VERTICAL_LABELS: Record<BundleStarterVertical, string> = {
  diagnostics: 'Diagnostics',
  lending: 'Lending',
  mutual_funds: 'Mutual funds',
  insurance: 'Insurance',
  vendor_onboarding: 'Vendor onboarding',
};

export interface BundleStarterTemplate {
  key: string;
  vertical: BundleStarterVertical;
  name: string;
  description: string;
  documentTypes: any[];
  profileFields: any[];
  rules: any[];
  outputSchema: any[];
}

export const BUNDLE_STARTER_TEMPLATES: BundleStarterTemplate[] = [
  {
    key: 'diagnostics_intake',
    vertical: 'diagnostics',
    name: 'Diagnostics Sample Intake',
    description:
      'Validates test requisition forms, prescriptions, patient ID, and payer documents for diagnostics labs.',
    documentTypes: [
      {
        key: 'trf',
        label: 'Test Requisition Form (TRF)',
        required: true,
        minCount: 1,
        maxCount: 1,
        classificationHints: ['TRF', 'requisition', 'test request'],
      },
      {
        key: 'prescription',
        label: 'Prescription',
        required: '{"payer":{"$ne":"walk_in"}}',
        minCount: 1,
        maxCount: 1,
        classificationHints: ['prescription', 'rx', 'doctor order'],
      },
      {
        key: 'patient_id',
        label: 'Patient ID Proof',
        required: true,
        minCount: 1,
        maxCount: 1,
        classificationHints: ['aadhaar', 'pan', 'voter id', 'passport', 'driving license'],
      },
      {
        key: 'insurance_card',
        label: 'Insurance Card',
        required: '{"payer":"insurance"}',
        minCount: 1,
        maxCount: 1,
        classificationHints: ['insurance card', 'health card', 'TPA card'],
      },
      {
        key: 'corporate_auth',
        label: 'Corporate Authorization',
        required: '{"payer":"corporate"}',
        minCount: 1,
        maxCount: 1,
        classificationHints: ['corporate letter', 'authorization', 'employee ID'],
      },
    ],
    profileFields: [
      {
        key: 'payer',
        label: 'Payer Type',
        type: 'select',
        options: ['walk_in', 'insurance', 'corporate'],
        required: true,
        default: 'walk_in',
      },
    ],
    rules: [
      {
        id: 'patient_name_match',
        name: 'Patient Name Match',
        category: 'cross_match',
        field: 'patient_name',
        documents: ['trf', 'prescription', 'patient_id'],
        method: 'similarity',
        params: { threshold: 0.85 },
        severity: 'blocking',
        enabled: true,
      },
      {
        id: 'patient_age_match',
        name: 'Patient Age/DOB Match',
        category: 'cross_match',
        field: 'patient_dob',
        documents: ['trf', 'patient_id'],
        method: 'date_window',
        params: { windowDays: 365 },
        severity: 'review',
        enabled: true,
      },
      {
        id: 'test_codes_match',
        name: 'Tests Match Prescription',
        category: 'cross_match',
        field: 'tests_requested',
        documents: ['trf', 'prescription'],
        method: 'set_overlap',
        params: { minOverlap: 1 },
        severity: 'review',
        enabled: true,
      },
      {
        id: 'referring_doctor_present',
        name: 'Referring Doctor Present',
        category: 'cross_match',
        field: 'referring_doctor',
        documents: ['trf'],
        method: 'presence',
        severity: 'info',
        enabled: true,
      },
    ],
    outputSchema: [
      { key: 'patient_name', label: 'Patient Name', type: 'string', sources: [{ documentTypeKey: 'patient_id', fieldPath: 'name', priority: 1 }, { documentTypeKey: 'trf', fieldPath: 'patient_name', priority: 0 }] },
      { key: 'patient_dob', label: 'Date of Birth', type: 'date', sources: [{ documentTypeKey: 'patient_id', fieldPath: 'dob', priority: 1 }] },
      { key: 'patient_gender', label: 'Gender', type: 'string', sources: [{ documentTypeKey: 'trf', fieldPath: 'patient_sex', priority: 0 }] },
      { key: 'tests_requested', label: 'Tests Requested', type: 'array', sources: [{ documentTypeKey: 'trf', fieldPath: 'tests_requested', priority: 0 }] },
      { key: 'referring_doctor', label: 'Referring Doctor', type: 'string', sources: [{ documentTypeKey: 'prescription', fieldPath: 'doctor_name', priority: 1 }, { documentTypeKey: 'trf', fieldPath: 'referring_doctor', priority: 0 }] },
    ],
  },
  {
    key: 'retail_loan_salaried',
    vertical: 'lending',
    name: 'Retail Loan - Salaried',
    description:
      'Validates loan applications for salaried individuals with income and identity verification.',
    documentTypes: [
      { key: 'application_form', label: 'Loan Application Form', required: true, minCount: 1, maxCount: 1 },
      { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
      { key: 'aadhaar', label: 'Aadhaar Card', required: true, minCount: 1, maxCount: 1 },
      { key: 'salary_slip', label: 'Salary Slip', required: true, minCount: 3, maxCount: 6 },
      { key: 'bank_statement', label: 'Bank Statement (6 months)', required: true, minCount: 1, maxCount: 1 },
      { key: 'form16', label: 'Form 16 / ITR', required: false, minCount: 1, maxCount: 2 },
    ],
    profileFields: [
      { key: 'loan_type', label: 'Loan Type', type: 'select', options: ['personal', 'home', 'vehicle', 'education'], required: true },
    ],
    rules: [
      { id: 'pan_exact', name: 'PAN Exact Match', category: 'cross_match', field: 'pan_number', documents: ['application_form', 'pan', 'form16'], method: 'exact', severity: 'blocking', enabled: true },
      { id: 'dob_exact', name: 'DOB Exact Match', category: 'cross_match', field: 'dob', documents: ['application_form', 'pan', 'aadhaar'], method: 'date_window', params: { windowDays: 0 }, severity: 'blocking', enabled: true },
      { id: 'name_similarity', name: 'Name Consistency', category: 'cross_match', field: 'applicant_name', documents: ['application_form', 'pan', 'aadhaar', 'bank_statement'], method: 'similarity', params: { threshold: 0.85 }, severity: 'review', enabled: true },
      { id: 'income_tolerance', name: 'Income Consistency', category: 'cross_match', field: 'net_salary', documents: ['salary_slip', 'bank_statement'], method: 'numeric_tolerance', params: { tolerancePct: 15 }, severity: 'review', enabled: true },
      { id: 'statement_period', name: 'Statement 6 Months', category: 'validity', requiredPeriodMonths: 6, documents: ['bank_statement'], severity: 'blocking', enabled: true },
      { id: 'id_not_expired', name: 'ID Not Expired', category: 'validity', maxAgeDays: 3650, documents: ['aadhaar', 'pan'], severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'applicant_name', label: 'Applicant Name', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'name', priority: 1 }] },
      { key: 'pan_number', label: 'PAN', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'pan_number', priority: 1 }] },
      { key: 'net_salary', label: 'Net Salary', type: 'number', sources: [{ documentTypeKey: 'salary_slip', fieldPath: 'net_salary', priority: 0 }] },
      { key: 'employer_name', label: 'Employer', type: 'string', sources: [{ documentTypeKey: 'salary_slip', fieldPath: 'employer_name', priority: 0 }] },
    ],
  },
  {
    key: 'msme_loan',
    vertical: 'lending',
    name: 'MSME Loan',
    description: 'Validates loan applications for MSMEs with GST, ITR, and financial reconciliation.',
    documentTypes: [
      { key: 'application_form', label: 'Loan Application Form', required: true, minCount: 1, maxCount: 1 },
      { key: 'gst_returns', label: 'GST Returns (12 months)', required: true, minCount: 4, maxCount: 12 },
      { key: 'itr', label: 'ITR (2 years)', required: true, minCount: 2, maxCount: 3 },
      { key: 'financials', label: 'Audited Financials', required: false, minCount: 1, maxCount: 2 },
      { key: 'bank_statement', label: 'Bank Statement (12 months)', required: true, minCount: 1, maxCount: 1 },
      { key: 'udyam', label: 'Udyam Registration', required: true, minCount: 1, maxCount: 1 },
      { key: 'constitution_docs', label: 'Constitution Documents', required: true, minCount: 1, maxCount: 3 },
      { key: 'kyc_promoters', label: 'Promoter KYC', required: true, minCount: 1, maxCount: 5 },
    ],
    profileFields: [
      { key: 'constitution', label: 'Constitution', type: 'select', options: ['proprietorship', 'partnership', 'llp', 'pvt_ltd'], required: true },
    ],
    rules: [
      { id: 'gstin_match', name: 'GSTIN Consistency', category: 'cross_match', field: 'gstin', documents: ['gst_returns', 'udyam'], method: 'exact', severity: 'blocking', enabled: true },
      { id: 'turnover_reconciliation', name: 'Turnover Reconciliation', category: 'cross_match', field: 'annual_turnover', documents: ['gst_returns', 'itr', 'bank_statement'], method: 'numeric_tolerance', params: { tolerancePct: 20 }, severity: 'review', enabled: true },
      { id: 'promoter_in_constitution', name: 'Promoter in Constitution', category: 'cross_match', field: 'promoter_name', documents: ['kyc_promoters', 'constitution_docs'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'business_name', label: 'Business Name', type: 'string', sources: [{ documentTypeKey: 'udyam', fieldPath: 'business_name', priority: 1 }] },
      { key: 'gstin', label: 'GSTIN', type: 'string', sources: [{ documentTypeKey: 'gst_returns', fieldPath: 'gstin', priority: 0 }] },
      { key: 'annual_turnover', label: 'Annual Turnover', type: 'number', sources: [{ documentTypeKey: 'itr', fieldPath: 'turnover', priority: 0 }] },
    ],
  },
  {
    key: 'mf_kyc_individual',
    vertical: 'mutual_funds',
    name: 'MF KYC - Individual',
    description: 'Validates KYC documents for individual mutual fund investors.',
    documentTypes: [
      { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
      { key: 'address_proof', label: 'Address Proof', required: true, minCount: 1, maxCount: 2 },
      { key: 'photo', label: 'Passport Photo', required: true, minCount: 1, maxCount: 1 },
      { key: 'cheque', label: 'Cancelled Cheque', required: true, minCount: 1, maxCount: 1 },
      { key: 'fatca', label: 'FATCA/CRS Declaration', required: true, minCount: 1, maxCount: 1 },
    ],
    profileFields: [
      { key: 'customer_type', label: 'Customer Type', type: 'select', options: ['individual'], required: true, default: 'individual' },
    ],
    rules: [
      { id: 'pan_valid', name: 'Valid PAN Format', category: 'validity', field: 'pan_number', method: 'regex', params: { pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' }, severity: 'blocking', enabled: true },
      { id: 'name_match', name: 'Name Consistency', category: 'cross_match', field: 'name', documents: ['pan', 'address_proof', 'cheque'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'name', label: 'Investor Name', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'name', priority: 1 }] },
      { key: 'pan_number', label: 'PAN', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'pan_number', priority: 0 }] },
      { key: 'address', label: 'Address', type: 'string', sources: [{ documentTypeKey: 'address_proof', fieldPath: 'address', priority: 0 }] },
      { key: 'bank_account', label: 'Bank Account', type: 'string', sources: [{ documentTypeKey: 'cheque', fieldPath: 'account_number', priority: 0 }] },
    ],
  },
  {
    key: 'mf_kyc_non_individual',
    vertical: 'mutual_funds',
    name: 'MF KYC - Non-Individual',
    description: 'Validates KYC documents for non-individual mutual fund investors (companies, trusts).',
    documentTypes: [
      { key: 'pan', label: 'Entity PAN', required: true, minCount: 1, maxCount: 1 },
      { key: 'constitution_docs', label: 'Constitution Documents', required: true, minCount: 1, maxCount: 3 },
      { key: 'board_resolution', label: 'Board Resolution', required: true, minCount: 1, maxCount: 1 },
      { key: 'authorised_signatory_list', label: 'Authorised Signatory List', required: true, minCount: 1, maxCount: 1 },
      { key: 'signatory_kyc', label: 'Signatory KYC', required: true, minCount: 1, maxCount: 5 },
      { key: 'address_proof', label: 'Entity Address Proof', required: true, minCount: 1, maxCount: 1 },
      { key: 'cheque', label: 'Cancelled Cheque', required: true, minCount: 1, maxCount: 1 },
      { key: 'fatca', label: 'FATCA/CRS Declaration', required: true, minCount: 1, maxCount: 1 },
    ],
    profileFields: [
      { key: 'customer_type', label: 'Customer Type', type: 'select', options: ['company', 'trust', 'partnership', 'huf'], required: true },
    ],
    rules: [
      { id: 'signatory_in_resolution', name: 'Signatory in Resolution', category: 'cross_match', field: 'signatory_name', documents: ['signatory_kyc', 'board_resolution'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
      { id: 'entity_name_match', name: 'Entity Name Match', category: 'cross_match', field: 'entity_name', documents: ['pan', 'constitution_docs', 'cheque'], method: 'similarity', params: { threshold: 0.9 }, severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'entity_name', label: 'Entity Name', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'name', priority: 1 }] },
      { key: 'pan_number', label: 'PAN', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'pan_number', priority: 0 }] },
    ],
  },
  {
    key: 'mf_kyc_nri',
    vertical: 'mutual_funds',
    name: 'MF KYC - NRI',
    description: 'Validates KYC documents for NRI mutual fund investors.',
    documentTypes: [
      { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
      { key: 'passport', label: 'Passport', required: true, minCount: 1, maxCount: 1 },
      { key: 'overseas_address_proof', label: 'Overseas Address Proof', required: true, minCount: 1, maxCount: 1 },
      { key: 'india_address_proof', label: 'India Address Proof', required: false, minCount: 1, maxCount: 1 },
      { key: 'nre_nro_cheque', label: 'NRE/NRO Cancelled Cheque', required: true, minCount: 1, maxCount: 1 },
      { key: 'fatca', label: 'FATCA/CRS Declaration', required: true, minCount: 1, maxCount: 1 },
      { key: 'photo', label: 'Passport Photo', required: true, minCount: 1, maxCount: 1 },
    ],
    profileFields: [
      { key: 'customer_type', label: 'Customer Type', type: 'select', options: ['nri'], required: true, default: 'nri' },
      { key: 'account_type', label: 'Account Type', type: 'select', options: ['nre', 'nro'], required: true },
    ],
    rules: [
      { id: 'passport_not_expired', name: 'Passport Valid', category: 'validity', maxAgeDays: 3650, documents: ['passport'], severity: 'blocking', enabled: true },
      { id: 'name_match', name: 'Name Consistency', category: 'cross_match', field: 'name', documents: ['pan', 'passport', 'nre_nro_cheque'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'name', label: 'Investor Name', type: 'string', sources: [{ documentTypeKey: 'passport', fieldPath: 'name', priority: 1 }] },
      { key: 'pan_number', label: 'PAN', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'pan_number', priority: 0 }] },
      { key: 'passport_number', label: 'Passport Number', type: 'string', sources: [{ documentTypeKey: 'passport', fieldPath: 'passport_number', priority: 0 }] },
    ],
  },
  {
    key: 'transmission_claim',
    vertical: 'mutual_funds',
    name: 'Transmission Claim',
    description: 'Validates documents for mutual fund transmission claims after investor death.',
    documentTypes: [
      { key: 'death_certificate', label: 'Death Certificate', required: true, minCount: 1, maxCount: 1 },
      { key: 'claimant_kyc', label: 'Claimant KYC', required: true, minCount: 1, maxCount: 3 },
      { key: 'nominee_details', label: 'Nominee Details (from folio)', required: true, minCount: 1, maxCount: 1 },
      { key: 'bank_proof', label: 'Claimant Bank Proof', required: true, minCount: 1, maxCount: 1 },
      { key: 'indemnity', label: 'Indemnity Bond', required: '{"claim_value":{"$gt":200000}}', minCount: 1, maxCount: 1 },
      { key: 'legal_heir', label: 'Legal Heir Certificate', required: '{"has_nominee":false}', minCount: 1, maxCount: 1 },
    ],
    profileFields: [
      { key: 'has_nominee', label: 'Nominee on Record', type: 'boolean', required: true },
      { key: 'claim_value', label: 'Claim Value (Rs)', type: 'number', required: true },
    ],
    rules: [
      { id: 'claimant_is_nominee', name: 'Claimant is Nominee', category: 'cross_match', field: 'claimant_name', documents: ['claimant_kyc', 'nominee_details'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
      { id: 'death_cert_name', name: 'Death Certificate Name Match', category: 'cross_match', field: 'deceased_name', documents: ['death_certificate', 'nominee_details'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'deceased_name', label: 'Deceased Name', type: 'string', sources: [{ documentTypeKey: 'death_certificate', fieldPath: 'name', priority: 0 }] },
      { key: 'claimant_name', label: 'Claimant Name', type: 'string', sources: [{ documentTypeKey: 'claimant_kyc', fieldPath: 'name', priority: 0 }] },
      { key: 'claim_value', label: 'Claim Value', type: 'number', sources: [{ documentTypeKey: 'nominee_details', fieldPath: 'folio_value', priority: 0 }] },
    ],
  },
  {
    key: 'insurance_claim',
    vertical: 'insurance',
    name: 'Insurance Claim',
    description: 'Validates documents for insurance claim processing.',
    documentTypes: [
      { key: 'claim_form', label: 'Claim Form', required: true, minCount: 1, maxCount: 1 },
      { key: 'policy_document', label: 'Policy Document', required: true, minCount: 1, maxCount: 1 },
      { key: 'claimant_id', label: 'Claimant ID Proof', required: true, minCount: 1, maxCount: 1 },
      { key: 'discharge_summary', label: 'Discharge Summary', required: '{"claim_type":"health"}', minCount: 1, maxCount: 1 },
      { key: 'bills', label: 'Hospital Bills', required: '{"claim_type":"health"}', minCount: 1, maxCount: 10 },
      { key: 'fir', label: 'FIR Copy', required: '{"claim_type":"accident"}', minCount: 1, maxCount: 1 },
      { key: 'death_certificate', label: 'Death Certificate', required: '{"claim_type":"death"}', minCount: 1, maxCount: 1 },
      { key: 'bank_proof', label: 'Claimant Bank Proof', required: true, minCount: 1, maxCount: 1 },
    ],
    profileFields: [
      { key: 'claim_type', label: 'Claim Type', type: 'select', options: ['health', 'accident', 'death', 'maturity'], required: true },
    ],
    rules: [
      { id: 'policy_holder_match', name: 'Policy Holder Match', category: 'cross_match', field: 'insured_name', documents: ['policy_document', 'claim_form'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
      { id: 'claim_within_policy', name: 'Claim Within Policy Period', category: 'validity', documents: ['policy_document'], severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'policy_number', label: 'Policy Number', type: 'string', sources: [{ documentTypeKey: 'policy_document', fieldPath: 'policy_number', priority: 0 }] },
      { key: 'insured_name', label: 'Insured Name', type: 'string', sources: [{ documentTypeKey: 'policy_document', fieldPath: 'insured_name', priority: 0 }] },
      { key: 'claim_amount', label: 'Claim Amount', type: 'number', sources: [{ documentTypeKey: 'claim_form', fieldPath: 'claim_amount', priority: 0 }] },
    ],
  },
  {
    key: 'vendor_empanelment',
    vertical: 'vendor_onboarding',
    name: 'Vendor/Distributor Empanelment',
    description: 'Validates documents for vendor or distributor onboarding.',
    documentTypes: [
      { key: 'registration', label: 'ARN / Registration Certificate', required: true, minCount: 1, maxCount: 1 },
      { key: 'pan', label: 'PAN Card', required: true, minCount: 1, maxCount: 1 },
      { key: 'gst', label: 'GST Certificate', required: false, minCount: 1, maxCount: 1 },
      { key: 'bank_proof', label: 'Bank Proof', required: true, minCount: 1, maxCount: 1 },
      { key: 'agreement', label: 'Signed Agreement', required: true, minCount: 1, maxCount: 1 },
      { key: 'kyc', label: 'Proprietor/Partner KYC', required: true, minCount: 1, maxCount: 3 },
    ],
    profileFields: [
      { key: 'vendor_type', label: 'Vendor Type', type: 'select', options: ['distributor', 'vendor', 'channel_partner'], required: true },
    ],
    rules: [
      { id: 'name_pan_match', name: 'Name PAN Consistency', category: 'cross_match', field: 'entity_name', documents: ['registration', 'pan', 'bank_proof'], method: 'similarity', params: { threshold: 0.85 }, severity: 'blocking', enabled: true },
      { id: 'registration_valid', name: 'Registration Not Expired', category: 'validity', maxAgeDays: 365, documents: ['registration'], severity: 'blocking', enabled: true },
    ],
    outputSchema: [
      { key: 'entity_name', label: 'Entity Name', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'name', priority: 1 }] },
      { key: 'pan_number', label: 'PAN', type: 'string', sources: [{ documentTypeKey: 'pan', fieldPath: 'pan_number', priority: 0 }] },
      { key: 'registration_number', label: 'Registration Number', type: 'string', sources: [{ documentTypeKey: 'registration', fieldPath: 'registration_number', priority: 0 }] },
    ],
  },
];
