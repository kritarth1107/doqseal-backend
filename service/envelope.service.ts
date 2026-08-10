import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Envelope, {
  EnvelopeSignerRole,
  IEnvelopeField,
  IEnvelopeSigner,
} from '../model/envelope.model';
import Document from '../model/document.model';
import { assertUserInOrganisation } from '../utils/org-access.util';
import EmailUtil from '../utils/email.util';

export class EnvelopeService {
  public async createEnvelope(params: {
    userId: string;
    organisationId: string;
    documentId: string;
    title: string;
    message?: string;
    signers: {
      name: string;
      email: string;
      role?: EnvelopeSignerRole;
      order?: number;
    }[];
    fields?: {
      type: IEnvelopeField['type'];
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      signerIndex?: number;
      label?: string;
      required?: boolean;
    }[];
  }) {
    const {
      userId,
      organisationId,
      documentId,
      title,
      message,
      signers,
      fields,
    } = params;

    await assertUserInOrganisation(userId, organisationId);

    if (!title?.trim()) {
      throw new Error('Envelope title is required');
    }

    if (!signers?.length) {
      throw new Error('At least one signer is required');
    }

    const document = await Document.findOne({
      documentId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    const normalizedSigners: IEnvelopeSigner[] = signers.map((signer, index) => ({
      signerId: uuidv4(),
      name: signer.name.trim(),
      email: signer.email.trim().toLowerCase(),
      role: signer.role || 'signer',
      order: signer.order ?? index + 1,
      status: 'pending',
      accessToken: crypto.randomBytes(32).toString('hex'),
      signedAt: null,
    }));

    const normalizedFields: IEnvelopeField[] = (fields || []).map((field) => {
      const signerIndex = field.signerIndex ?? 0;
      const assignedSigner = normalizedSigners[signerIndex];

      if (!assignedSigner) {
        throw new Error(`Invalid signerIndex ${signerIndex} for field`);
      }

      return {
        fieldId: uuidv4(),
        type: field.type,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        signerId: assignedSigner.signerId,
        label: field.label || '',
        required: field.required ?? true,
        value: '',
      };
    });

    const envelope = await Envelope.create({
      envelopeId: uuidv4(),
      organisationId,
      documentId,
      title: title.trim(),
      message: message || '',
      status: 'draft',
      signers: normalizedSigners,
      fields: normalizedFields,
      createdBy: userId,
    });

    return this.toPublic(envelope);
  }

  public async listEnvelopes(userId: string, organisationId: string) {
    await assertUserInOrganisation(userId, organisationId);

    const envelopes = await Envelope.find({
      organisationId,
      deletedAt: null,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return envelopes.map((envelope) => this.toPublic(envelope));
  }

  public async getEnvelope(
    userId: string,
    organisationId: string,
    envelopeId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const envelope = await Envelope.findOne({
      envelopeId,
      organisationId,
      deletedAt: null,
    }).lean();

    if (!envelope) {
      throw new Error('Envelope not found');
    }

    return this.toPublic(envelope);
  }

  public async sendEnvelope(
    userId: string,
    organisationId: string,
    envelopeId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const envelope = await Envelope.findOne({
      envelopeId,
      organisationId,
      deletedAt: null,
    });

    if (!envelope) {
      throw new Error('Envelope not found');
    }

    if (envelope.status !== 'draft') {
      throw new Error('Only draft envelopes can be sent');
    }

    if (!envelope.signers.length) {
      throw new Error('Envelope has no signers');
    }

    const now = new Date();
    envelope.status = 'sent';
    envelope.sentAt = now;
    envelope.signers = envelope.signers.map((signer: any) => {
      const plainSigner =
        typeof signer.toObject === 'function' ? signer.toObject() : signer;

      return {
        ...plainSigner,
        status: plainSigner.role === 'cc' ? plainSigner.status : 'sent',
      };
    });

    await envelope.save();

    const emailResults = await Promise.all(
      envelope.signers
        .filter((signer) => signer.role !== 'cc')
        .map((signer) => this.sendSignerInvite(envelope, signer))
    );

    return {
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      sentAt: envelope.sentAt,
      notifications: emailResults,
    };
  }

  private async sendSignerInvite(
    envelope: { envelopeId: string; title: string; message?: string },
    signer: IEnvelopeSigner
  ) {
    const signingUrl = `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/sign/${signer.accessToken}`;
    const subject = `Please sign: ${envelope.title}`;
    const text = [
      `Hello ${signer.name},`,
      '',
      `You have been asked to sign "${envelope.title}".`,
      envelope.message ? `\n${envelope.message}\n` : '',
      `Open this link to review and sign: ${signingUrl}`,
    ].join('\n');

    try {
      await EmailUtil.sendEmail({
        to: signer.email,
        subject,
        text,
        html: `<p>${text.replace(/\n/g, '<br/>')}</p>`,
        from: 'DoqSeal <no-reply@emails.sakshya.io>',
      });

      return {
        signerId: signer.signerId,
        email: signer.email,
        delivered: true,
        stub: false,
      };
    } catch {
      console.log(
        `[envelope-stub] Would send signing invite to ${signer.email} for envelope ${envelope.envelopeId}: ${signingUrl}`
      );

      return {
        signerId: signer.signerId,
        email: signer.email,
        delivered: false,
        stub: true,
        signingUrl,
      };
    }
  }

  private toPublic(envelope: Record<string, any>) {
    return {
      envelopeId: envelope.envelopeId,
      organisationId: envelope.organisationId,
      documentId: envelope.documentId,
      title: envelope.title,
      message: envelope.message,
      status: envelope.status,
      signers: (envelope.signers || []).map((signer: IEnvelopeSigner) => ({
        signerId: signer.signerId,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        order: signer.order,
        status: signer.status,
        signedAt: signer.signedAt,
      })),
      fields: envelope.fields || [],
      createdBy: envelope.createdBy,
      sentAt: envelope.sentAt,
      completedAt: envelope.completedAt,
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
    };
  }
}

export default new EnvelopeService();
