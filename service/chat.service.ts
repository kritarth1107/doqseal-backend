import axios from 'axios';
import config from '../config/app.config';
import { assertUserInOrganisation } from '../utils/org-access.util';
import auditService from './audit.service';

export interface ChatPayload {
  message: string;
  organisationId: string;
  projectId?: string;
}

export interface ChatResult {
  answer: string;
  citations: Array<{
    documentId?: string;
    projectId?: string;
    snippet?: string;
  }>;
  mode: string;
}

const STUB_ANSWER =
  'Chat is temporarily unavailable because the ai-engine could not be reached. ' +
  'Ensure main-backend is running on the configured AI_ENGINE_URL.';

export class ChatService {
  public async sendMessage(
    userId: string,
    payload: ChatPayload
  ): Promise<ChatResult> {
    await assertUserInOrganisation(userId, payload.organisationId);

    const baseUrl = config.aiEngine.url.replace(/\/$/, '');

    try {
      const response = await axios.post<ChatResult>(
        `${baseUrl}/chat`,
        {
          message: payload.message,
          organisationId: payload.organisationId,
          projectId: payload.projectId,
        },
        { timeout: 120_000 }
      );

      const result = response.data;

      await auditService.logEvent({
        actorId: userId,
        organisationId: payload.organisationId,
        action: 'chat.query',
        resourceType: 'project',
        resourceId: payload.projectId || payload.organisationId,
        metadata: {
          mode: result.mode,
          citationCount: result.citations?.length ?? 0,
        },
      });

      return result;
    } catch (error: any) {
      const status = error.response?.status;
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message;

      if (status && status >= 400 && status < 500) {
        throw new Error(
          typeof detail === 'string' ? detail : 'Invalid chat request'
        );
      }

      console.error('Chat proxy failure:', detail);
      return {
        answer: STUB_ANSWER,
        citations: [],
        mode: 'stub',
      };
    }
  }
}

export default new ChatService();
