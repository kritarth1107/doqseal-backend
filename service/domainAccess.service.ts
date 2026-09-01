import crypto from 'crypto';
import dns from 'dns/promises';
import Organisation from '../model/organisation.model';
import Membership from '../model/membership.model';
import User, { IUser } from '../model/user.model';
import { assertOrgRole } from '../utils/org-access.util';
import {
  emailMatchesDomain,
  extractEmailDomain,
  isPublicEmailDomain,
  normalizeDomain,
  assertEligibleVerificationDomain,
  assertUserEmailMatchesDomain,
} from '../utils/email-domain.util';
import auditService from './audit.service';

const TXT_PREFIX = 'doqseal-verification=';
const VERIFY_COOLDOWN_MS = 30_000;

export type DomainAccessStatus = {
  verifiedDomain: string | null;
  isDomainVerified: boolean;
  autoJoinEnabled: boolean;
  domainVerifiedAt: string | null;
  verificationToken: string | null;
  txtRecordHost: string | null;
  txtRecordValue: string | null;
  pendingDomain: string | null;
  adminEmailDomain: string | null;
  adminCanVerifyDomains: boolean;
};

function buildVerificationToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function expectedTxtValue(token: string): string {
  return `${TXT_PREFIX}${token}`;
}

async function lookupTxtRecords(host: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(host);
    return records.map((parts) => parts.join(''));
  } catch (err: any) {
    if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL'].includes(err?.code)) {
      return [];
    }
    throw err;
  }
}

async function domainHasVerificationTxt(
  domain: string,
  token: string
): Promise<boolean> {
  const expected = expectedTxtValue(token);
  const hosts = [`_doqseal-verification.${domain}`, domain];

  for (const host of hosts) {
    const records = await lookupTxtRecords(host);
    if (records.some((record) => record.trim() === expected)) {
      return true;
    }
  }
  return false;
}

export class DomainAccessService {
  private lastVerifyAttempt = new Map<string, number>();

  private async resolveOrganisation(orgId: string) {
    const organisation = await Organisation.findOne({
      publicId: orgId,
      deletedAt: null,
    });
    if (!organisation) throw new Error('Organisation not found');
    return organisation;
  }

  public formatStatus(
    org: {
      verifiedDomain?: string | null;
      isDomainVerified?: boolean;
      autoJoinDomain?: boolean;
      domainVerifiedAt?: Date | null;
      domainVerificationToken?: string | null;
      pendingDomain?: string | null;
    },
    adminEmail?: string | null
  ): DomainAccessStatus {
    const domain =
      org.verifiedDomain ||
      (org.isDomainVerified ? null : org.pendingDomain) ||
      null;
    const token = org.domainVerificationToken || null;
    const adminEmailDomain = adminEmail ? extractEmailDomain(adminEmail) : null;
    const adminCanVerifyDomains = Boolean(
      adminEmailDomain && !isPublicEmailDomain(adminEmailDomain)
    );

    return {
      verifiedDomain: org.isDomainVerified ? org.verifiedDomain || null : null,
      isDomainVerified: Boolean(org.isDomainVerified),
      autoJoinEnabled: Boolean(org.autoJoinDomain),
      domainVerifiedAt: org.domainVerifiedAt
        ? org.domainVerifiedAt.toISOString()
        : null,
      verificationToken: org.isDomainVerified ? null : token,
      txtRecordHost: domain ? `_doqseal-verification.${domain}` : null,
      txtRecordValue: token ? expectedTxtValue(token) : null,
      pendingDomain: org.isDomainVerified ? null : org.pendingDomain || null,
      adminEmailDomain,
      adminCanVerifyDomains,
    };
  }

  private async loadAdminUser(userId: string) {
    const user = await User.findOne({ userId, deletedAt: null });
    if (!user) throw new Error('User not found');
    return user;
  }

  private assertAdminCanManageDomain(user: IUser, domain: string) {
    assertEligibleVerificationDomain(domain);
    assertUserEmailMatchesDomain(user.email, domain);
  }

  public async getStatus(userId: string, orgId: string): Promise<DomainAccessStatus> {
    await assertOrgRole(userId, orgId, 'admin');
    const [organisation, user] = await Promise.all([
      this.resolveOrganisation(orgId),
      this.loadAdminUser(userId),
    ]);
    return this.formatStatus(organisation, user.email);
  }

  public async claimDomain(userId: string, orgId: string, rawDomain: string) {
    await assertOrgRole(userId, orgId, 'admin');

    const domain = normalizeDomain(rawDomain);
    const user = await this.loadAdminUser(userId);
    this.assertAdminCanManageDomain(user, domain);

    const taken = await Organisation.findOne({
      publicId: { $ne: orgId },
      isDomainVerified: true,
      verifiedDomain: domain,
      deletedAt: null,
    }).lean();
    if (taken) {
      throw new Error('This domain is already verified by another organisation');
    }

    const organisation = await this.resolveOrganisation(orgId);
    const token = buildVerificationToken();

    organisation.pendingDomain = domain;
    organisation.verifiedDomain = null;
    organisation.isDomainVerified = false;
    organisation.autoJoinDomain = false;
    organisation.domainVerificationToken = token;
    organisation.domainVerifiedAt = null;
    await organisation.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'domain.claim',
      resourceType: 'domain',
      resourceId: domain,
      metadata: { domain },
    });

    return this.formatStatus(organisation, user.email);
  }

  public async verifyDomain(userId: string, orgId: string) {
    await assertOrgRole(userId, orgId, 'admin');

    const user = await this.loadAdminUser(userId);

    const last = this.lastVerifyAttempt.get(orgId) || 0;
    if (Date.now() - last < VERIFY_COOLDOWN_MS) {
      throw new Error('Please wait a moment before checking DNS again');
    }
    this.lastVerifyAttempt.set(orgId, Date.now());

    const organisation = await this.resolveOrganisation(orgId);
    const domain = organisation.pendingDomain || organisation.verifiedDomain;
    const token = organisation.domainVerificationToken;

    if (!domain || !token) {
      throw new Error('Start by claiming a domain first');
    }

    this.assertAdminCanManageDomain(user, domain);

    const verified = await domainHasVerificationTxt(domain, token);
    if (!verified) {
      throw new Error(
        `TXT record not found. Add "${expectedTxtValue(token)}" to _doqseal-verification.${domain} (or the root domain) and try again in a few minutes.`
      );
    }

    const conflict = await Organisation.findOne({
      publicId: { $ne: orgId },
      isDomainVerified: true,
      verifiedDomain: domain,
      deletedAt: null,
    }).lean();
    if (conflict) {
      throw new Error('This domain was verified by another organisation while you were setting up');
    }

    organisation.verifiedDomain = domain;
    organisation.pendingDomain = null;
    organisation.isDomainVerified = true;
    organisation.domainVerifiedAt = new Date();
    await organisation.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'domain.verify',
      resourceType: 'domain',
      resourceId: domain,
    });

    return this.formatStatus(organisation, user.email);
  }

  public async updateSettings(
    userId: string,
    orgId: string,
    settings: { autoJoinEnabled?: boolean }
  ) {
    await assertOrgRole(userId, orgId, 'admin');
    const organisation = await this.resolveOrganisation(orgId);
    const user = await this.loadAdminUser(userId);

    if (settings.autoJoinEnabled && !organisation.isDomainVerified) {
      throw new Error('Verify your domain with DNS before enabling auto-join');
    }

    if (settings.autoJoinEnabled && organisation.verifiedDomain) {
      this.assertAdminCanManageDomain(user, organisation.verifiedDomain);
    }

    if (settings.autoJoinEnabled !== undefined) {
      organisation.autoJoinDomain = settings.autoJoinEnabled;
    }
    await organisation.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'domain.settings_update',
      resourceType: 'domain',
      resourceId: organisation.verifiedDomain || orgId,
      metadata: { autoJoinEnabled: organisation.autoJoinDomain },
    });

    return this.formatStatus(organisation, user.email);
  }

  public async releaseDomain(userId: string, orgId: string) {
    await assertOrgRole(userId, orgId, 'admin');
    const organisation = await this.resolveOrganisation(orgId);
    const user = await this.loadAdminUser(userId);
    const previous = organisation.verifiedDomain || organisation.pendingDomain;

    organisation.verifiedDomain = null;
    organisation.pendingDomain = null;
    organisation.isDomainVerified = false;
    organisation.autoJoinDomain = false;
    organisation.domainVerificationToken = null;
    organisation.domainVerifiedAt = null;
    await organisation.save();

    await auditService.logEvent({
      actorId: userId,
      organisationId: orgId,
      action: 'domain.release',
      resourceType: 'domain',
      resourceId: previous || orgId,
    });

    return this.formatStatus(organisation, user.email);
  }

  private async addMemberToOrganisation(params: {
    user: IUser;
    organisation: InstanceType<typeof Organisation>;
    role: 'member' | 'admin';
    reason: 'auto_join';
  }) {
    const orgPublicId = params.organisation.publicId as string;

    const existingMembership = await Membership.findOne({
      userId: params.user.userId,
      organisationId: params.organisation._id,
      deletedAt: null,
    }).lean();
    if (existingMembership) return null;

    await Membership.create({
      userId: params.user.userId,
      organisationId: params.organisation._id,
      role: params.role,
    });

    const organisations = params.user.organisations || [];
    organisations.push({
      organisationId: orgPublicId,
      role: params.role,
    });
    params.user.organisations = organisations;
    await params.user.save();

    params.organisation.memberCount = (params.organisation.memberCount || 0) + 1;
    await params.organisation.save();

    await auditService.logEvent({
      actorId: params.user.userId,
      organisationId: orgPublicId,
      action: 'member.auto_join',
      resourceType: 'member',
      resourceId: params.user.userId,
      metadata: {
        email: params.user.email,
        domain: params.organisation.verifiedDomain,
        reason: params.reason,
      },
    });

    return {
      organisationId: orgPublicId,
      organisationName: params.organisation.name,
      role: params.role,
    };
  }

  public async tryAutoJoinForUser(user: IUser) {
    const emailDomain = extractEmailDomain(user.email);
    if (!emailDomain || isPublicEmailDomain(emailDomain)) {
      return [];
    }

    const matchingOrgs = await Organisation.find({
      isDomainVerified: true,
      autoJoinDomain: true,
      verifiedDomain: emailDomain,
      deletedAt: null,
      isActive: true,
    });

    if (matchingOrgs.length !== 1) {
      if (matchingOrgs.length > 1) {
        console.warn(
          `[domain-access] multiple auto-join orgs for ${emailDomain}; skipping`
        );
      }
      return [];
    }

    const organisation = matchingOrgs[0];
    if (!emailMatchesDomain(user.email, organisation.verifiedDomain || '')) {
      return [];
    }

    const joined = await this.addMemberToOrganisation({
      user,
      organisation,
      role: 'member',
      reason: 'auto_join',
    });

    return joined ? [joined] : [];
  }
}

export default new DomainAccessService();
