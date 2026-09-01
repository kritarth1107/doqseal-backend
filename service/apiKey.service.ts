import ApiKey, { IApiKey } from '../model/apiKey.model';
import {
  generateAppId,
  generateSecretKey,
  maskSecretHint,
  verifySecretKey,
} from '../utils/apiKeyCrypto.util';
import quotaService from './quota.service';

export type CreatedApiKeyCredentials = {
  _id: string;
  name: string;
  appId: string;
  secretKey: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export type ApiKeyListItem = {
  _id: string;
  name: string;
  appId: string;
  secretHint: string;
  status: string;
  expiresAt?: Date | null;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
    avatar?: string;
    email: string;
  };
};

export class ApiKeyService {
  private async uniqueAppId(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const appId = generateAppId();
      const exists = await ApiKey.exists({ appId });
      if (!exists) return appId;
    }
    throw new Error('Failed to generate a unique APP ID. Please try again.');
  }

  public async createApiKey(params: {
    organisationId: string;
    name: string;
    createdBy: string;
    expiresInDays?: number;
  }): Promise<CreatedApiKeyCredentials> {
    const { organisationId, name, createdBy, expiresInDays } = params;

    const plan = await quotaService.getPlanLimits(organisationId);
    if (plan.dailyApiRequestLimit === 0) {
      throw new Error(
        `API keys are not available on the ${plan.name} plan. Upgrade to enable API access.`
      );
    }

    const appId = await this.uniqueAppId();
    const { secretKey, secretHint } = generateSecretKey(appId);

    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const apiKey = await ApiKey.create({
      organisationId,
      name,
      appId,
      secretHint,
      createdBy,
      expiresAt,
      status: 'ACTIVE',
    });

    try {
      const { dispatchOrganisationWebhooks } = await import('./webhook.service');
      await dispatchOrganisationWebhooks(organisationId, {
        event: 'api_key.created',
        organisationId,
        metadata: { appId, name, keyId: String(apiKey._id) },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[webhook] api_key.created dispatch failed', error);
    }

    return {
      _id: String(apiKey._id),
      name: apiKey.name,
      appId,
      secretKey,
      expiresAt: apiKey.expiresAt ?? null,
      createdAt: apiKey.createdAt,
    };
  }

  public async listOrganisationKeys(
    organisationId: string
  ): Promise<ApiKeyListItem[]> {
    await ApiKey.updateMany(
      {
        organisationId,
        status: 'ACTIVE',
        expiresAt: { $ne: null, $lt: new Date() },
      },
      { status: 'EXPIRED' }
    );

    const rows = await ApiKey.aggregate([
      { $match: { organisationId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: 'userId',
          as: 'creator',
        },
      },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          appId: 1,
          secretHint: 1,
          status: 1,
          expiresAt: 1,
          createdAt: 1,
          createdBy: {
            id: '$creator.userId',
            name: '$creator.name',
            avatar: '$creator.avatar',
            email: '$creator.email',
          },
        },
      },
    ]);

    return rows.map((row) => ({
      ...row,
      secretHint: maskSecretHint(row.secretHint),
    }));
  }

  public async revokeKey(
    organisationId: string,
    keyId: string
  ): Promise<void> {
    const existing = await ApiKey.findOne({
      _id: keyId,
      organisationId,
      status: { $ne: 'REVOKED' },
    }).lean();

    if (!existing) {
      throw new Error(
        'API Key not found or does not belong to this organisation'
      );
    }

    await ApiKey.updateOne({ _id: keyId }, { status: 'REVOKED' });

    try {
      const { dispatchOrganisationWebhooks } = await import('./webhook.service');
      await dispatchOrganisationWebhooks(organisationId, {
        event: 'api_key.revoked',
        organisationId,
        metadata: { appId: existing.appId, name: existing.name, keyId },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[webhook] api_key.revoked dispatch failed', error);
    }
  }

  /** Authenticate an API request (for future public API routes) */
  public async authenticateApiKey(
    appId: string,
    secretKey: string
  ): Promise<IApiKey | null> {
    const record = await ApiKey.findOne({
      appId: appId.toUpperCase(),
      status: 'ACTIVE',
    });

    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) {
      await ApiKey.updateOne({ _id: record._id }, { status: 'EXPIRED' });
      return null;
    }
    if (!verifySecretKey(record.appId, secretKey, record.secretHint)) {
      return null;
    }

    await ApiKey.updateOne(
      { _id: record._id },
      { lastUsedAt: new Date() }
    ).catch(() => undefined);

    return record;
  }
}

export default new ApiKeyService();
