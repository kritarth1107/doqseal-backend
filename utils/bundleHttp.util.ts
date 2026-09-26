import { FastifyReply } from 'fastify';
import responseUtil from './response.util';
import { isAppError } from './errors.util';

const ROLE_ERROR = /^Requires (owner|admin|member) role or higher$/;
const ACCESS_ERROR = 'You do not have access to this organisation';

/**
 * Error reply for the bundle review endpoints. Typed errors keep their status;
 * membership and role failures from assertOrgRole (plain Errors) become 403
 * instead of 500. Anything else is a 500 with the fallback message.
 */
export function sendBundleError(reply: FastifyReply, error: unknown, fallback: string) {
  if (isAppError(error)) {
    return responseUtil.error(reply, error.message, error.statusCode);
  }
  const message = error instanceof Error ? error.message : '';
  if (ROLE_ERROR.test(message) || message === ACCESS_ERROR) {
    return responseUtil.error(reply, message, 403);
  }
  return responseUtil.error(reply, message || fallback, 500);
}
