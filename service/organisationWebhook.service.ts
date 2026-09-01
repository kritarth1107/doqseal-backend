import Organisation from '../model/organisation.model';
import { OrgWebhook } from '../constants/webhook.events';
import { assertOrgRole } from '../utils/org-access.util';
import {
  coerceOrgWebhooks,
  normalizeOrgWebhooks,
} from './webhook.service';

export class OrganisationWebhookService {
  public async getWebhooks(organisationId: string, userId: string) {
    await assertOrgRole(userId, organisationId, 'member');

    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    })
      .select('webhooks publicId')
      .lean();

    if (!org) {
      throw new Error('Organisation not found');
    }

    const webhooks = coerceOrgWebhooks(org);
    return {
      organisationId: org.publicId,
      webhooks,
      events: webhooks[0]?.events ?? [],
    };
  }

  public async updateWebhooks(
    organisationId: string,
    userId: string,
    webhooksInput: unknown
  ) {
    await assertOrgRole(userId, organisationId, 'admin');

    const org = await Organisation.findOne({
      publicId: organisationId,
      deletedAt: null,
    });

    if (!org) {
      throw new Error('Organisation not found');
    }

    const webhooks = normalizeOrgWebhooks(webhooksInput ?? []);
    org.webhooks = webhooks as any;
    org.markModified('webhooks');
    await org.save();

    return {
      organisationId: org.publicId,
      webhooks: coerceOrgWebhooks(org.toObject()),
    };
  }
}

export default new OrganisationWebhookService();
