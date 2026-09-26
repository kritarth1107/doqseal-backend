import { FastifyReply } from 'fastify';
import responseUtil from './response.util';
import { isAppError } from './errors.util';

const ROLE_ERROR = /^Requires (owner|admin|member) role or higher$/;
const ACCESS_ERROR = 'You do not have access to this organisation';
const ORG_NOT_FOUND = 'Organisation not found';
const ORG_CONTEXT_REQUIRED = /^Organisation context required/;

/**
 * Error reply for the bundle and bundle template endpoints. Typed errors keep
 * their status. The plain Errors thrown by assertOrgRole and
 * resolveOrganisationId are mapped: not a member or role too low -> 403,
 * unknown organisation -> 404, missing organisation header -> 400. Anything
 * else is a 500 with the fallback message.
 */
export function sendBundleError(reply: FastifyReply, error: unknown, fallback: string) {
  if (isAppError(error)) {
    return responseUtil.error(reply, error.message, error.statusCode);
  }
  const message = error instanceof Error ? error.message : '';
  if (ROLE_ERROR.test(message) || message === ACCESS_ERROR) {
    return responseUtil.error(reply, message, 403);
  }
  if (message === ORG_NOT_FOUND) {
    return responseUtil.error(reply, message, 404);
  }
  if (ORG_CONTEXT_REQUIRED.test(message)) {
    return responseUtil.error(reply, message, 400);
  }
  return responseUtil.error(reply, message || fallback, 500);
}
