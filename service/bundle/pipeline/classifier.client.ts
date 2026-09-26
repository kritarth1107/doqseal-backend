import axios from 'axios';
import { mintAiEngineToken } from '../../../utils/aiEngineToken.util';

/** Message contract for POST {AI_ENGINE_URL}/bundle/classify (see docs/bundle-intelligence/PIPELINE.md). */
export interface ClassifySlot {
  key: string;
  label: string;
  description?: string | null;
  hints: string[];
}

export interface ClassifyRequest {
  requestId: string;
  organisationId: string;
  bundleId: string;
  documentId: string;
  slots: ClassifySlot[];
  document: {
    documentType?: string | null;
    text?: string | null;
    fields: Record<string, unknown>;
  };
  keyFieldNames?: string[];
}

export interface ClassifyResult {
  requestId: string;
  organisationId: string;
  bundleId: string;
  documentId: string;
  slot: string | null;
  confidence: number;
  reasons: string[];
  alternatives: Array<{ slot: string; confidence: number }>;
  keyFields: Record<string, string>;
  model?: string | null;
  cached?: boolean;
}

export class ClassifierError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'ClassifierError';
  }
}

export type ClassifyFn = (request: ClassifyRequest) => Promise<ClassifyResult>;

export function createClassifierClient(options: {
  baseUrl: string;
  /** Shared secret for signing a short-lived `bundle:classify` token per call. */
  serviceToken: string;
  timeoutMs: number;
}): ClassifyFn {
  return async function classify(request: ClassifyRequest): Promise<ClassifyResult> {
    let authorization: string;
    try {
      authorization = `Bearer ${mintAiEngineToken({
        organisationId: request.organisationId,
        userId: 'bundle-pipeline',
        scope: 'bundle:classify',
        secret: options.serviceToken,
      })}`;
    } catch {
      throw new ClassifierError('ai-engine service secret is not configured', false);
    }
    let response;
    try {
      response = await axios.post<ClassifyResult>(`${options.baseUrl}/bundle/classify`, request, {
        timeout: options.timeoutMs,
        headers: { Authorization: authorization },
        validateStatus: () => true,
      });
    } catch {
      throw new ClassifierError('ai-engine unreachable', true);
    }

    const status = response.status;
    if (status >= 200 && status < 300) {
      const data = response.data;
      if (
        !data ||
        data.organisationId !== request.organisationId ||
        data.documentId !== request.documentId ||
        data.requestId !== request.requestId
      ) {
        throw new ClassifierError('ai-engine response did not match the request', false);
      }
      return data;
    }

    const retryable = status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
    throw new ClassifierError(`ai-engine responded ${status}`, retryable);
  };
}
