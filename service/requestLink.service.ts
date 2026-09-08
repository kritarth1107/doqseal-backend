import crypto from 'crypto';
import dns from 'dns/promises';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import RequestLink, {
  IRequestLinkSettings,
  IRequestRequirement,
} from '../model/requestLink.model';
import RequestSubmission from '../model/requestSubmission.model';
import Organisation from '../model/organisation.model';
import { assertUserInOrganisation, assertOrgRole } from '../utils/org-access.util';
import AES from '../utils/encyption';
import EmailUtil from '../utils/email.util';
import documentService from './document.service';
import webhookService from './webhook.service';

const COLLECT_TXT_PREFIX = 'doqseal-collect=';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'collect'}-${suffix}`;
}

function normalizeMobile(mobile: string): string {
  return mobile.replace(/[^\d+]/g, '').trim();
}

function isActiveLink(link: {
  status: string;
  expiresAt?: Date | null;
  deletedAt?: Date | null;
}): boolean {
  if (link.deletedAt) return false;
  if (link.status !== 'active') return false;
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return false;
  }
  return true;
}

async function sendSmsOtp(mobile: string, otp: string): Promise<boolean> {
  const apiKey = process.env.MSG91_API_KEY;
  const templateId = process.env.MSG91_SMS_OTP_TEMPLATE_ID;
  if (!apiKey || !templateId) return false;

  await axios.post(
    'https://control.msg91.com/api/v5/flow/',
    {
      template_id: templateId,
      short_url: '0',
      recipients: [
        {
          mobiles: mobile.replace(/^\+/, ''),
          otp,
          VAR1: otp,
        },
      ],
    },
    {
      headers: {
        accept: 'application/json',
        authkey: apiKey,
        'content-type': 'application/json',
      },
    }
  );
  return true;
}

export class RequestLinkService {
  public async create(params: {
    userId: string;
    organisationId: string;
    title: string;
    description?: string;
    requirements: Array<{
      label: string;
      description?: string;
      allowedExtensions?: string[];
      required?: boolean;
    }>;
    settings?: Partial<IRequestLinkSettings>;
    projectId?: string | null;
    expiresAt?: string | null;
  }) {
    await assertUserInOrganisation(params.userId, params.organisationId);

    if (!params.title?.trim()) throw new Error('Title is required');
    if (!params.requirements?.length) {
      throw new Error('Add at least one document requirement');
    }

    const requirements: IRequestRequirement[] = params.requirements.map((r) => ({
      requirementId: uuidv4(),
      label: r.label.trim(),
      description: r.description?.trim() || null,
      allowedExtensions: (r.allowedExtensions || []).map((e) =>
        e.replace(/^\./, '').toLowerCase()
      ),
      required: r.required !== false,
    }));

    const settings: IRequestLinkSettings = {
      collectName: params.settings?.collectName !== false,
      requireEmail: Boolean(params.settings?.requireEmail ?? true),
      requireMobile: Boolean(params.settings?.requireMobile),
      verifyEmail: Boolean(params.settings?.verifyEmail),
      verifyMobile: Boolean(params.settings?.verifyMobile),
    };

    if (settings.verifyEmail) settings.requireEmail = true;
    if (settings.verifyMobile) settings.requireMobile = true;

    const requestLinkId = uuidv4();
    const publicToken = crypto.randomBytes(24).toString('hex');
    const slug = slugify(params.title);

    const doc = await RequestLink.create({
      requestLinkId,
      organisationId: params.organisationId,
      slug,
      publicToken,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      requirements,
      settings,
      projectId: params.projectId || null,
      status: 'active',
      expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
      createdBy: params.userId,
    });

    return this.toManaged(doc.toObject());
  }

  public async list(userId: string, organisationId: string) {
    await assertUserInOrganisation(userId, organisationId);
    const items = await RequestLink.find({
      organisationId,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();
    return items.map((item) => this.toManaged(item));
  }

  public async getOne(
    userId: string,
    organisationId: string,
    requestLinkId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);
    const item = await RequestLink.findOne({
      requestLinkId,
      organisationId,
      deletedAt: null,
    }).lean();
    if (!item) throw new Error('Request link not found');
    return this.toManaged(item);
  }

  public async update(
    userId: string,
    organisationId: string,
    requestLinkId: string,
    patch: {
      title?: string;
      description?: string | null;
      requirements?: Array<{
        requirementId?: string;
        label: string;
        description?: string;
        allowedExtensions?: string[];
        required?: boolean;
      }>;
      settings?: Partial<IRequestLinkSettings>;
      projectId?: string | null;
      status?: 'active' | 'paused' | 'expired';
      expiresAt?: string | null;
      deleteLink?: boolean;
    }
  ) {
    await assertUserInOrganisation(userId, organisationId);
    const item = await RequestLink.findOne({
      requestLinkId,
      organisationId,
      deletedAt: null,
    });
    if (!item) throw new Error('Request link not found');

    if (patch.deleteLink) {
      item.deletedAt = new Date();
      item.status = 'paused';
      await item.save();
      return { deleted: true, requestLinkId };
    }

    if (patch.title !== undefined) item.title = patch.title.trim();
    if (patch.description !== undefined) {
      item.description = patch.description?.trim() || null;
    }
    if (patch.projectId !== undefined) item.projectId = patch.projectId || null;
    if (patch.status) item.status = patch.status;
    if (patch.expiresAt !== undefined) {
      item.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    }
    if (patch.requirements) {
      item.requirements = patch.requirements.map((r) => ({
        requirementId: r.requirementId || uuidv4(),
        label: r.label.trim(),
        description: r.description?.trim() || null,
        allowedExtensions: (r.allowedExtensions || []).map((e) =>
          e.replace(/^\./, '').toLowerCase()
        ),
        required: r.required !== false,
      }));
    }
    if (patch.settings) {
      item.settings = {
        collectName: patch.settings.collectName ?? item.settings.collectName,
        requireEmail: patch.settings.requireEmail ?? item.settings.requireEmail,
        requireMobile:
          patch.settings.requireMobile ?? item.settings.requireMobile,
        verifyEmail: patch.settings.verifyEmail ?? item.settings.verifyEmail,
        verifyMobile:
          patch.settings.verifyMobile ?? item.settings.verifyMobile,
      };
      if (item.settings.verifyEmail) item.settings.requireEmail = true;
      if (item.settings.verifyMobile) item.settings.requireMobile = true;
    }

    await item.save();
    return this.toManaged(item.toObject());
  }

  public async listSubmissions(
    userId: string,
    organisationId: string,
    requestLinkId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);
    const link = await RequestLink.findOne({
      requestLinkId,
      organisationId,
      deletedAt: null,
    }).lean();
    if (!link) throw new Error('Request link not found');

    return RequestSubmission.find({ requestLinkId, organisationId })
      .sort({ createdAt: -1 })
      .lean();
  }

  public async getPublicBySlugOrToken(slugOrToken: string) {
    const link = await RequestLink.findOne({
      deletedAt: null,
      $or: [{ slug: slugOrToken }, { publicToken: slugOrToken }],
    }).lean();
    if (!link || !isActiveLink(link)) {
      throw new Error('This collection link is unavailable');
    }

    const org = await Organisation.findOne({
      publicId: link.organisationId,
      deletedAt: null,
    }).lean();

    return {
      slug: link.slug,
      publicToken: link.publicToken,
      title: link.title,
      description: link.description,
      requirements: link.requirements,
      settings: link.settings,
      expiresAt: link.expiresAt,
      branding: {
        organisationName: org?.name || 'DoqSeal',
        logoUrl: org?.logoUrl || null,
        website: org?.website || null,
      },
    };
  }

  public async requestOtp(params: {
    slugOrToken: string;
    channel: 'email' | 'mobile';
    email?: string;
    mobile?: string;
  }) {
    const link = await this.resolveActiveLink(params.slugOrToken);
    const settings = link.settings;

    if (params.channel === 'email') {
      if (!settings.verifyEmail) throw new Error('Email verification is not required');
      const email = (params.email || '').trim().toLowerCase();
      if (!email) throw new Error('Email is required');
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await EmailUtil.sendOTPEmail(email, otp, 'Document collection');
      const challengeToken = AES.encrypt(
        JSON.stringify({
          channel: 'email',
          target: email,
          otp,
          requestLinkId: link.requestLinkId,
          timestamp: Date.now(),
        })
      );
      return { challengeToken, channel: 'email' as const };
    }

    if (!settings.verifyMobile) throw new Error('Mobile verification is not required');
    const mobile = normalizeMobile(params.mobile || '');
    if (!mobile) throw new Error('Mobile number is required');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sent = await sendSmsOtp(mobile, otp);
    if (!sent) {
      // Fallback: still issue challenge; OTP emailed to org is not ideal —
      // use email util log path by throwing clear error in production without SMS.
      if (process.env.NODE_ENV === 'production' && process.env.MSG91_API_KEY) {
        throw new Error(
          'SMS OTP is not configured (set MSG91_SMS_OTP_TEMPLATE_ID)'
        );
      }
      // Dev / missing SMS: encode OTP so verify still works after manual share
      console.warn(`[request-link] SMS OTP for ${mobile}: ${otp}`);
    }
    const challengeToken = AES.encrypt(
      JSON.stringify({
        channel: 'mobile',
        target: mobile,
        otp,
        requestLinkId: link.requestLinkId,
        timestamp: Date.now(),
      })
    );
    return { challengeToken, channel: 'mobile' as const };
  }

  public async verifyOtp(params: {
    slugOrToken: string;
    challengeToken: string;
    otp: string;
  }) {
    const link = await this.resolveActiveLink(params.slugOrToken);
    let payload: {
      channel: string;
      target: string;
      otp: string;
      requestLinkId: string;
      timestamp: number;
    };
    try {
      payload = JSON.parse(AES.decrypt(params.challengeToken));
    } catch {
      throw new Error('Invalid or expired verification challenge');
    }

    if (payload.requestLinkId !== link.requestLinkId) {
      throw new Error('Verification challenge mismatch');
    }
    if (Date.now() - payload.timestamp > 15 * 60 * 1000) {
      throw new Error('Verification code expired');
    }
    if (String(payload.otp) !== String(params.otp).trim()) {
      throw new Error('Invalid verification code');
    }

    const proofToken = AES.encrypt(
      JSON.stringify({
        channel: payload.channel,
        target: payload.target,
        requestLinkId: link.requestLinkId,
        verifiedAt: Date.now(),
      })
    );

    return {
      proofToken,
      channel: payload.channel,
      target: payload.target,
    };
  }

  public async submit(params: {
    slugOrToken: string;
    name?: string;
    email?: string;
    mobile?: string;
    emailProofToken?: string;
    mobileProofToken?: string;
    consentPrivacy: boolean;
    consentTerms: boolean;
    consentDpa: boolean;
    files: Array<{
      requirementId: string;
      originalFilename: string;
      mimeType: string;
      buffer: Buffer;
    }>;
  }) {
    const link = await this.resolveActiveLink(params.slugOrToken);
    const settings = link.settings;

    if (!params.consentPrivacy || !params.consentTerms || !params.consentDpa) {
      throw new Error('You must accept Privacy Policy, Terms, and DPA');
    }

    const name = params.name?.trim() || '';
    const email = params.email?.trim().toLowerCase() || '';
    const mobile = normalizeMobile(params.mobile || '');

    if (settings.collectName && !name) {
      throw new Error('Name is required');
    }
    if (settings.requireEmail && !email) {
      throw new Error('Email is required');
    }
    if (settings.requireMobile && !mobile) {
      throw new Error('Mobile number is required');
    }

    let emailVerified = false;
    let mobileVerified = false;

    if (settings.verifyEmail) {
      emailVerified = this.assertProof(
        params.emailProofToken,
        'email',
        email,
        link.requestLinkId
      );
    }
    if (settings.verifyMobile) {
      mobileVerified = this.assertProof(
        params.mobileProofToken,
        'mobile',
        mobile,
        link.requestLinkId
      );
    }

    const reqMap = new Map(
      link.requirements.map((r) => [r.requirementId, r] as const)
    );
    for (const req of link.requirements) {
      if (!req.required) continue;
      const has = params.files.some((f) => f.requirementId === req.requirementId);
      if (!has) throw new Error(`Missing required document: ${req.label}`);
    }

    const uploadedFiles: Array<{
      requirementId: string;
      documentId: string;
      originalFilename: string;
    }> = [];

    const now = new Date();
    for (const file of params.files) {
      const req = reqMap.get(file.requirementId);
      if (!req) throw new Error('Unknown document requirement');

      const ext = (file.originalFilename.split('.').pop() || '').toLowerCase();
      if (
        req.allowedExtensions?.length &&
        !req.allowedExtensions.includes(ext)
      ) {
        throw new Error(
          `${req.label}: file type .${ext} is not allowed`
        );
      }

      const result = await documentService.uploadDocument({
        userId: link.createdBy,
        organisationId: link.organisationId,
        projectId: link.projectId || null,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType || 'application/octet-stream',
        buffer: file.buffer,
        consentGivenAt: now,
        sharedWithOrganisation: true,
        retentionDays: 15,
      });

      uploadedFiles.push({
        requirementId: file.requirementId,
        documentId: result.documentId,
        originalFilename: file.originalFilename,
      });
    }

    const submissionId = uuidv4();
    await RequestSubmission.create({
      submissionId,
      requestLinkId: link.requestLinkId,
      organisationId: link.organisationId,
      name: name || null,
      email: email || null,
      mobile: mobile || null,
      emailVerified,
      mobileVerified,
      consentPrivacyAt: now,
      consentTermsAt: now,
      consentDpaAt: now,
      files: uploadedFiles,
      metadata: {
        source: 'request_link',
        slug: link.slug,
      },
    });

    await webhookService.dispatchOrganisationWebhooks(link.organisationId, {
      event: 'request_link.submitted',
      organisationId: link.organisationId,
      projectId: link.projectId || null,
      documentId: uploadedFiles[0]?.documentId || null,
      status: 'submitted',
      metadata: {
        requestLinkId: link.requestLinkId,
        submissionId,
        slug: link.slug,
        name: name || null,
        email: email || null,
        mobile: mobile || null,
        files: uploadedFiles,
      },
      timestamp: new Date().toISOString(),
    });

    return {
      submissionId,
      files: uploadedFiles,
    };
  }

  public async addCollectDomain(params: {
    userId: string;
    organisationId: string;
    hostname: string;
  }) {
    await assertOrgRole(params.userId, params.organisationId, 'admin');
    const hostname = params.hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!hostname || hostname.includes(' ')) {
      throw new Error('Invalid hostname');
    }
    if (
      hostname === 'collect.doqseal.com' ||
      hostname === 'app.doqseal.com' ||
      hostname.endsWith('.doqseal.com')
    ) {
      throw new Error('Cannot claim DoqSeal system domains');
    }

    const org = await Organisation.findOne({
      publicId: params.organisationId,
      deletedAt: null,
    });
    if (!org) throw new Error('Organisation not found');

    const existing = (org.collectDomains || []).find((d) => d.hostname === hostname);
    if (existing) {
      return {
        hostname: existing.hostname,
        verified: existing.verified,
        verificationToken: existing.verificationToken,
        txtRecordHost: `_doqseal-collect.${hostname}`,
        txtRecordValue: `${COLLECT_TXT_PREFIX}${existing.verificationToken}`,
      };
    }

    const verificationToken = crypto.randomBytes(16).toString('hex');
    org.collectDomains = [
      ...(org.collectDomains || []),
      {
        hostname,
        verified: false,
        verificationToken,
        verifiedAt: null,
      },
    ];
    await org.save();

    return {
      hostname,
      verified: false,
      verificationToken,
      txtRecordHost: `_doqseal-collect.${hostname}`,
      txtRecordValue: `${COLLECT_TXT_PREFIX}${verificationToken}`,
    };
  }

  public async listCollectDomains(userId: string, organisationId: string) {
    await assertUserInOrganisation(userId, organisationId);
    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    }).lean();
    if (!org) throw new Error('Organisation not found');
    return (org.collectDomains || []).map((d) => ({
      hostname: d.hostname,
      verified: d.verified,
      verifiedAt: d.verifiedAt || null,
      txtRecordHost: `_doqseal-collect.${d.hostname}`,
      txtRecordValue: `${COLLECT_TXT_PREFIX}${d.verificationToken}`,
    }));
  }

  public async verifyCollectDomain(params: {
    userId: string;
    organisationId: string;
    hostname: string;
  }) {
    await assertOrgRole(params.userId, params.organisationId, 'admin');
    const hostname = params.hostname.trim().toLowerCase();
    const org = await Organisation.findOne({
      publicId: params.organisationId,
      deletedAt: null,
    });
    if (!org) throw new Error('Organisation not found');

    const domain = (org.collectDomains || []).find((d) => d.hostname === hostname);
    if (!domain) throw new Error('Domain not found');

    const expected = `${COLLECT_TXT_PREFIX}${domain.verificationToken}`;
    const hosts = [`_doqseal-collect.${hostname}`, hostname];
    let ok = false;
    for (const host of hosts) {
      try {
        const records = await dns.resolveTxt(host);
        const flat = records.map((p) => p.join(''));
        if (flat.some((r) => r.trim() === expected)) {
          ok = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!ok) {
      throw new Error(
        `TXT record not found. Add ${expected} at _doqseal-collect.${hostname}`
      );
    }

    domain.verified = true;
    domain.verifiedAt = new Date();
    await org.save();
    return { hostname, verified: true, verifiedAt: domain.verifiedAt };
  }

  public async resolveOrgByCollectHost(hostname: string) {
    const host = hostname.trim().toLowerCase();
    if (host === 'collect.doqseal.com' || host === 'localhost') {
      return null;
    }
    const org = await Organisation.findOne({
      deletedAt: null,
      collectDomains: {
        $elemMatch: { hostname: host, verified: true },
      },
    }).lean();
    return org
      ? {
          organisationId: org.publicId,
          organisationName: org.name,
          logoUrl: org.logoUrl || null,
        }
      : null;
  }

  private assertProof(
    token: string | undefined,
    channel: string,
    target: string,
    requestLinkId: string
  ): boolean {
    if (!token) throw new Error(`${channel} verification is required`);
    try {
      const payload = JSON.parse(AES.decrypt(token)) as {
        channel: string;
        target: string;
        requestLinkId: string;
        verifiedAt: number;
      };
      if (payload.channel !== channel) throw new Error('bad channel');
      if (payload.requestLinkId !== requestLinkId) throw new Error('bad link');
      if (payload.target !== target) throw new Error('bad target');
      if (Date.now() - payload.verifiedAt > 60 * 60 * 1000) {
        throw new Error('expired');
      }
      return true;
    } catch {
      throw new Error(`Invalid ${channel} verification`);
    }
  }

  private async resolveActiveLink(slugOrToken: string) {
    const link = await RequestLink.findOne({
      deletedAt: null,
      $or: [{ slug: slugOrToken }, { publicToken: slugOrToken }],
    }).lean();
    if (!link || !isActiveLink(link)) {
      throw new Error('This collection link is unavailable');
    }
    return link;
  }

  private toManaged(item: any) {
    const collectBase =
      process.env.COLLECT_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_COLLECT_URL ||
      'https://collect.doqseal.com';
    return {
      requestLinkId: item.requestLinkId,
      organisationId: item.organisationId,
      slug: item.slug,
      publicToken: item.publicToken,
      title: item.title,
      description: item.description,
      requirements: item.requirements,
      settings: item.settings,
      projectId: item.projectId,
      status: item.status,
      expiresAt: item.expiresAt,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      shareUrl: `${collectBase.replace(/\/$/, '')}/r/${item.slug}`,
    };
  }
}

export default new RequestLinkService();
