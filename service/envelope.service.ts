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
import { decryptBuffer } from '../utils/envelope-encryption.util';
import { getEncryptedObject } from '../utils/blob-storage.util';
import config from '../config/app.config';

export class EnvelopeService {
  private assertEsignEnabled() {
    if (!config.features.esignEnabled) {
      throw new Error('E-sign is disabled');
    }
  }

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
    this.assertEsignEnabled();
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
    this.assertEsignEnabled();
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
    this.assertEsignEnabled();
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
    this.assertEsignEnabled();
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
    const signingUrl = `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/sign/public/${signer.accessToken}`;
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

  public async getEnvelopeByToken(accessToken: string) {
    this.assertEsignEnabled();
    const envelope = await Envelope.findOne({
      'signers.accessToken': accessToken,
      deletedAt: null,
    }).lean();

    if (!envelope) {
      throw new Error('Signing link not found or expired');
    }

    const signer = envelope.signers.find(
      (item) => item.accessToken === accessToken
    );

    if (!signer) {
      throw new Error('Signer not found');
    }

    if (envelope.status === 'voided' || envelope.status === 'draft') {
      throw new Error('Envelope is not available for signing');
    }

    const document = await Document.findOne({
      documentId: envelope.documentId,
      organisationId: envelope.organisationId,
      deletedAt: null,
    }).lean();

    return {
      envelopeId: envelope.envelopeId,
      title: envelope.title,
      message: envelope.message,
      status: envelope.status,
      signer: {
        signerId: signer.signerId,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        status: signer.status,
        signedAt: signer.signedAt,
      },
      fields: (envelope.fields || []).filter(
        (field) => field.signerId === signer.signerId
      ),
      document: document
        ? {
            documentId: document.documentId,
            filename: document.originalFilename,
            mimeType: document.mimeType,
          }
        : null,
    };
  }

  public async getEnvelopeFileByToken(accessToken: string) {
    this.assertEsignEnabled();
    const envelope = await Envelope.findOne({
      'signers.accessToken': accessToken,
      deletedAt: null,
    }).lean();

    if (!envelope) {
      throw new Error('Signing link not found or expired');
    }

    if (envelope.status === 'voided' || envelope.status === 'draft') {
      throw new Error('Envelope is not available for signing');
    }

    const document = await Document.findOne({
      documentId: envelope.documentId,
      organisationId: envelope.organisationId,
      deletedAt: null,
    }).lean();

    if (!document) {
      throw new Error('Document not found');
    }

    const encryptedBytes = await getEncryptedObject({
      storagePath: document.storagePath,
      storageUri: document.storageUri,
      storageProvider: document.storageProvider,
    });

    if (!document.isEncrypted || !document.encryption) {
      return {
        buffer: encryptedBytes,
        mimeType: document.mimeType,
        filename: document.originalFilename,
      };
    }

    const plaintext = decryptBuffer(
      {
        ciphertext: encryptedBytes,
        iv: document.encryption.iv,
        authTag: document.encryption.authTag,
        encryptedDEK: document.encryption.encryptedDEK,
        dekIv: document.encryption.dekIv,
        dekAuthTag: document.encryption.dekAuthTag,
      },
      envelope.organisationId
    );

    return {
      buffer: plaintext,
      mimeType: document.mimeType,
      filename: document.originalFilename,
    };
  }

  public async signEnvelope(
    accessToken: string,
    fieldValues: Record<string, string> = {}
  ) {
    this.assertEsignEnabled();
    const envelope = await Envelope.findOne({
      'signers.accessToken': accessToken,
      deletedAt: null,
    });

    if (!envelope) {
      throw new Error('Signing link not found or expired');
    }

    if (envelope.status === 'voided' || envelope.status === 'draft') {
      throw new Error('Envelope is not available for signing');
    }

    const signerIndex = envelope.signers.findIndex(
      (item) => item.accessToken === accessToken
    );

    if (signerIndex === -1) {
      throw new Error('Signer not found');
    }

    const signer = envelope.signers[signerIndex];

    if (signer.role === 'cc') {
      throw new Error('This recipient cannot sign');
    }

    if (signer.status === 'signed') {
      throw new Error('Already signed');
    }

    const signerFields = envelope.fields.filter(
      (field) => field.signerId === signer.signerId
    );

    for (const field of signerFields) {
      const value = fieldValues[field.fieldId]?.trim?.() ?? fieldValues[field.fieldId] ?? '';
      if (field.required && !value) {
        throw new Error(`${field.label || field.type} is required`);
      }
    }

    for (const field of envelope.fields) {
      if (
        field.signerId === signer.signerId &&
        fieldValues[field.fieldId] !== undefined
      ) {
        field.value = fieldValues[field.fieldId];
      }
    }

    envelope.signers[signerIndex].status = 'signed';
    envelope.signers[signerIndex].signedAt = new Date();

    const signingRoles = envelope.signers.filter((item) => item.role !== 'cc');
    const allSigned = signingRoles.every((item) => item.status === 'signed');

    if (allSigned) {
      envelope.status = 'completed';
      envelope.completedAt = new Date();
    } else if (envelope.status === 'sent') {
      envelope.status = 'in_progress';
    }

    envelope.markModified('fields');
    envelope.markModified('signers');
    await envelope.save();

    return {
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      signerStatus: envelope.signers[signerIndex].status,
      completedAt: envelope.completedAt,
    };
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
