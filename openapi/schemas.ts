import { z } from 'zod';

/** Standard success envelope used across DoqSeal API responses */
export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.any().optional(),
  meta: z.any().optional(),
});

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.any().optional(),
  code: z.string().optional(),
});

export const bearerSecurity = [{ bearerAuth: [] }];

// ── Auth ──────────────────────────────────────────────
export const LoginRequestBody = z.object({
  email: z.string().email().describe('User email address'),
});

export const VerifyOtpBody = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  token: z.string().describe('OTP challenge token from login-request'),
  name: z.string().optional(),
});

export const SocialLoginBody = z.object({
  provider: z.string().describe('OAuth provider id (google, github, …)'),
  access_token: z.string(),
  id_token: z.string().optional(),
  email: z.string().email(),
  name: z.string(),
  avatar: z.string().optional(),
});

export const LogoutBody = z.object({
  type: z.enum(['current', 'all']).optional(),
  fingerprint: z.string().optional(),
});

// ── User / org ────────────────────────────────────────
export const CreateOrganisationBody = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  logoUrl: z.string().optional(),
});

export const CompleteOnboardingBody = z.object({
  name: z.string().min(2).describe('Full name'),
  organisationName: z.string().min(2).describe('Organisation or workspace name'),
  usageIntent: z.enum(['individual', 'team']),
  jobRole: z.string().min(1),
  useCases: z.array(z.string()).optional().default([]),
});

export const OrganisationIdParams = z.object({
  organisationId: z.string().describe('Organisation id'),
});

export const OrgIdParams = z.object({
  id: z.string().describe('Organisation id'),
});

export const EraseDataSubjectParams = z.object({
  id: z.string(),
  email: z.string().email(),
});

// ── Membership ────────────────────────────────────────
export const CreateInviteBody = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
});

export const InviteIdParams = z.object({
  id: z.string(),
  inviteId: z.string(),
});

export const MemberParams = z.object({
  id: z.string(),
  userId: z.string(),
});

export const UpdateMemberBody = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});

export const InviteTokenParams = z.object({
  token: z.string(),
});

// ── API keys ──────────────────────────────────────────
export const CreateApiKeyBody = z.object({
  organisationId: z.string(),
  name: z.string().min(1),
  expiresInDays: z.number().int().positive().optional(),
});

export const ApiKeyOrgParams = z.object({
  organisationId: z.string(),
});

export const ApiKeyParams = z.object({
  organisationId: z.string(),
  keyId: z.string(),
});

// ── Projects ──────────────────────────────────────────
export const CreateProjectBody = z.object({
  /** Optional — usually taken from `x-organisation-id` header */
  organisationId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  extractionHint: z.string().optional(),
  fields: z.array(z.any()).optional(),
  crossFieldRules: z.array(z.record(z.string(), z.any())).optional(),
  schema: z.any().optional(),
  /** Default true — share with everyone in the organisation */
  sharedWithOrganisation: z.boolean().optional(),
}).passthrough();

export const ProjectIdParams = z.object({
  projectId: z.string(),
});

// ── Documents ─────────────────────────────────────────
export const DocumentListQuery = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
});

export const DocumentIdParams = z.object({
  documentId: z.string(),
});

// ── Jobs ──────────────────────────────────────────────
export const JobIdParams = z.object({
  jobId: z.string(),
});

// ── Audit ─────────────────────────────────────────────
export const AuditQuery = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

// ── Chat ──────────────────────────────────────────────
export const ChatBody = z.object({
  message: z.string().min(1).max(8000),
  organisationId: z.string(),
  projectId: z.string().optional(),
});

// ── Envelopes ─────────────────────────────────────────
export const CreateEnvelopeBody = z.object({
  organisationId: z.string(),
  title: z.string().optional(),
  documentId: z.string().optional(),
  signers: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
      })
    )
    .optional(),
}).passthrough();

export const EnvelopeIdParams = z.object({
  id: z.string(),
});

export const EnvelopeTokenParams = z.object({
  token: z.string(),
});

export const SignEnvelopeBody = z.object({
  fieldValues: z.record(z.string(), z.string()).optional(),
});

export const successResponse = {
  200: ApiSuccessSchema,
};

export const errorResponses = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  500: ApiErrorSchema,
};
