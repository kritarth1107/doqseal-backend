/**
 * Seeds demo extraction projects for an organisation.
 * Usage: ORGANISATION_ID=<uuid> CREATED_BY=<userId> npx ts-node scripts/seed-demo-projects.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Project from '../model/project.model';

dotenv.config();

const DEMO_PROJECTS = [
  {
    name: 'Test Request Form',
    description:
      'Test request forms for your diagnostic center. AI extracts center and officer stamps, patient name, age, sex, and clinical history from each uploaded document.',
    extractionHint: 'Indian diagnostic TRF, often handwritten, Hindi-English mix',
    fields: [
      { key: 'patient_name', label: 'Patient Name', type: 'string', required: true },
      { key: 'age', label: 'Age', type: 'number', required: true },
      { key: 'sex', label: 'Sex', type: 'string', required: true },
      { key: 'clinical_history', label: 'Clinical History', type: 'string', required: true },
      { key: 'center_stamp', label: 'Center Stamp', type: 'boolean', required: false },
      { key: 'medical_officer_stamp', label: 'Medical Officer Stamp', type: 'boolean', required: false },
      { key: 'medical_superintendent_stamp', label: 'Medical Superintendent Stamp', type: 'boolean', required: false },
    ],
  },
  {
    name: 'Medical Prescription',
    description:
      'E-prescriptions, doctor letterheads, and medication instructions linked to lab orders.',
    extractionHint: 'Prescription pad, doctor stamp, Hindi or English medicines',
    fields: [
      { key: 'patient_name', label: 'Patient Name', type: 'string', required: true },
      { key: 'age', label: 'Age', type: 'number', required: true },
      { key: 'doctor_name', label: 'Doctor Name', type: 'string', required: true },
      { key: 'medicines', label: 'Medicines', type: 'string', required: true },
      { key: 'dosage_instructions', label: 'Dosage Instructions', type: 'string', required: false },
      { key: 'doctor_stamp', label: 'Doctor Stamp', type: 'boolean', required: false },
    ],
  },
  {
    name: 'Insurance Documents',
    description:
      'TPA approvals, pre-auth forms, claim letters, and policy extracts for cashless flows.',
    extractionHint: 'TPA letter, insurer letterhead, policy and pre-auth identifiers',
    fields: [
      { key: 'insurer_name', label: 'Insurer Name', type: 'string', required: true },
      { key: 'policy_number', label: 'Policy Number', type: 'string', required: true },
      { key: 'pre_auth_id', label: 'Pre-auth ID', type: 'string', required: false },
      { key: 'patient_name', label: 'Patient Name', type: 'string', required: true },
      { key: 'coverage_limit_inr', label: 'Coverage Limit (INR)', type: 'number', required: false },
      { key: 'approval_status', label: 'Approval Status', type: 'string', required: true },
    ],
  },
];

async function seed() {
  const organisationId = process.env.ORGANISATION_ID;
  const createdBy = process.env.CREATED_BY;

  if (!organisationId || !createdBy) {
    throw new Error('ORGANISATION_ID and CREATED_BY env vars are required');
  }

  await mongoose.connect(process.env.MONGODB_URI as string);

  for (const demo of DEMO_PROJECTS) {
    const existing = await Project.findOne({
      organisationId,
      name: demo.name,
      deletedAt: null,
    });

    if (existing) {
      console.log(`Skipping existing project: ${demo.name}`);
      continue;
    }

    await Project.create({
      projectId: uuidv4(),
      organisationId,
      createdBy,
      status: 'active',
      crossFieldRules: [],
      ...demo,
    });

    console.log(`Created project: ${demo.name}`);
  }

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});