import ApiKey, { IApiKey } from '../model/apiKey.model';
import crypto from 'crypto';
import quotaService from './quota.service';

/**
 * ApiKey Service - Manages generation and lifecycle of Organisation API Keys
 */
export class ApiKeyService {
  /**
   * Create a new API Key for an organisation
   */
  public async createApiKey(params: {
    organisationId: string;
    name: string;
    createdBy: string;
    expiresInDays?: number; // Optional days until expiry
  }): Promise<IApiKey> {
    const { organisationId, name, createdBy, expiresInDays } = params;

    const plan = await quotaService.getPlanLimits(organisationId);
    if (plan.dailyApiRequestLimit === 0) {
      throw new Error(
        `API keys are not available on the ${plan.name} plan. Upgrade to enable API access.`
      );
    }

    // 1. Generate the "Real Logic" API Key
    // Format: sak_[env]_[orgPrefix]_[secureEntropy]
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
    const orgPrefix = organisationId.split('-')[0]; // Use first part of Org UUID
    const entropy = crypto.randomBytes(24).toString('hex');
    
    const fullKey = `sak_${env}_${orgPrefix}_${entropy}`;
    const keyHint = `${fullKey.substring(0, 12)}...${fullKey.slice(-4)}`;

    // 2. Calculate expiration
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // 3. Save to database
    const apiKey = await ApiKey.create({
      organisationId,
      name,
      key: fullKey,
      keyHint,
      createdBy,
      expiresAt,
      status: 'ACTIVE'
    });

    return apiKey;
  }

  /**
   * List all API keys for an organisation
   */
  public async listOrganisationKeys(organisationId: string): Promise<IApiKey[]> {
    // Automatically update status for expired keys on list
    await ApiKey.updateMany(
      { 
        organisationId, 
        status: 'ACTIVE', 
        expiresAt: { $ne: null, $lt: new Date() } 
      },
      { status: 'EXPIRED' }
    );

    return ApiKey.aggregate([
      { $match: { organisationId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: 'userId',
          as: 'creator'
        }
      },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: 1,
          key: '$keyHint',
          expiresAt: 1,
          createdAt: 1,
          createdBy: {
            id: '$creator.userId',
            name: '$creator.name',
            avatar: '$creator.avatar',
            email: '$creator.email'
          }
        }
      }
    ]) as any;
  }


  /**
   * Revoke an API Key
   */
  public async revokeKey(organisationId: string, keyId: string): Promise<void> {
    const result = await ApiKey.updateOne(
      { _id: keyId, organisationId },
      { status: 'REVOKED' }
    );

    if (result.matchedCount === 0) {
      throw new Error('API Key not found or does not belong to this organisation');
    }
  }
}

export default new ApiKeyService();
