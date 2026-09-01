import { FastifyRequest, FastifyReply } from 'fastify';
import apiKeyService from '../service/apiKey.service';

/**
 * Middleware for public API routes authenticated via APP ID + Secret Key.
 * Expects headers: X-App-Id, Authorization: Bearer {secretKey}
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const appId = request.headers['x-app-id'];
  const authHeader = request.headers.authorization;

  if (typeof appId !== 'string' || !authHeader?.startsWith('Bearer ')) {
    reply
      .status(401)
      .send({ success: false, message: 'Missing API credentials' });
    return;
  }

  const secretKey = authHeader.slice('Bearer '.length).trim();
  const record = await apiKeyService.authenticateApiKey(appId, secretKey);

  if (!record) {
    reply
      .status(401)
      .send({ success: false, message: 'Invalid or expired API credentials' });
    return;
  }

  (request as any).apiKey = record;
  (request as any).organisationId = record.organisationId;
}

export default apiKeyAuth;
