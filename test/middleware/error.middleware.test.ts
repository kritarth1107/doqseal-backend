import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorHandler } from '../../middleware/error.middleware';
import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { NotFoundError, ForbiddenError, ValidationError } from '../../utils/errors.util';

function createMockRequest(): FastifyRequest {
  return {
    url: '/test',
    method: 'POST',
  } as FastifyRequest;
}

interface MockReply extends FastifyReply {
  _status: number;
  _body: any;
}

function createMockReply(): MockReply {
  return {
    _status: 0,
    _body: null,
    status(code: number) {
      (this as MockReply)._status = code;
      return this;
    },
    send(body: any) {
      (this as MockReply)._body = body;
      return this;
    },
  } as unknown as MockReply;
}

vi.mock('../../utils/logger.util', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('errorHandler', () => {
  let request: FastifyRequest;
  let reply: MockReply;

  beforeEach(() => {
    request = createMockRequest();
    reply = createMockReply();
    process.env.NODE_ENV = 'production';
  });

  describe('respects explicit error.statusCode', () => {
    it('returns 415 for unsupported content type', () => {
      const error = {
        message: 'Unsupported Media Type: application/xml',
        statusCode: 415,
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(415);
      expect(reply._body.success).toBe(false);
      expect(reply._body.message).toBe('Unsupported Media Type: application/xml');
    });

    it('returns 413 for body too large', () => {
      const error = {
        message: 'Request body is too large',
        statusCode: 413,
        code: 'FST_ERR_CTP_BODY_TOO_LARGE',
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(413);
      expect(reply._body.success).toBe(false);
      expect(reply._body.message).toBe('Request body is too large');
    });

    it('returns 400 for invalid JSON (body parser error)', () => {
      const error = {
        message: 'Unexpected token < in JSON at position 0',
        statusCode: 400,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.success).toBe(false);
      expect(reply._body.message).toBe('Unexpected token < in JSON at position 0');
    });

    it('returns 401 for error with explicit statusCode=401', () => {
      const error = {
        message: 'Unauthorized access',
        statusCode: 401,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(401);
      expect(reply._body.success).toBe(false);
      expect(reply._body.message).toBe('Unauthorized access');
    });

    it('preserves any explicit 4xx status code', () => {
      const error = {
        message: 'Too Many Requests',
        statusCode: 429,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(429);
      expect(reply._body.message).toBe('Too Many Requests');
    });
  });

  describe('hides internal messages on 5xx', () => {
    it('returns 500 and hides message for internal error with "invalid" in message', () => {
      const error = new Error('Database connection invalid - check credentials');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.success).toBe(false);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('Database');
      expect(reply._body.message).not.toContain('credentials');
    });

    it('returns 500 and hides message for explicit 500 status', () => {
      const error = {
        message: 'Sensitive internal error details here',
        statusCode: 500,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('Sensitive');
    });

    it('returns 500 and hides message for any 5xx status', () => {
      const error = {
        message: 'Service temporarily unavailable - backend crashed',
        statusCode: 503,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(503);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('does not expose internal error details in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Connection to mongodb://secret:password@host failed');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.error).toBeUndefined();
      expect(JSON.stringify(reply._body)).not.toContain('password');
    });
  });

  describe('handles Zod validation errors', () => {
    it('returns 400 for FST_ERR_VALIDATION', () => {
      const error = {
        message: 'Validation failed',
        code: 'FST_ERR_VALIDATION',
        validation: [{ message: 'name is required' }],
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.message).toBe('Schema Validation Failure');
      expect(reply._body.error).toEqual([{ message: 'name is required' }]);
    });
  });

  describe('handles typed AppError instances', () => {
    it('returns correct status for NotFoundError', () => {
      const error = new NotFoundError('Document', 'doc-123');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(404);
      expect(reply._body.message).toContain('not found');
    });

    it('returns correct status for ForbiddenError', () => {
      const error = new ForbiddenError('Admin access required');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(403);
      expect(reply._body.message).toBe('Admin access required');
    });

    it('returns correct status for ValidationError', () => {
      const error = new ValidationError('Email format is invalid');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.message).toBe('Email format is invalid');
    });
  });

  describe('legacy message-based inference (no explicit status)', () => {
    it('returns 404 for "not found" messages', () => {
      const error = new Error('User not found');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(404);
      expect(reply._body.message).toBe('User not found');
    });

    it('returns 403 for permission errors', () => {
      const error = new Error('You do not have access to this organisation');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(403);
      expect(reply._body.message).toBe('You do not have access to this organisation');
    });

    it('returns 401 for authentication errors', () => {
      const error = new Error('Authentication required. Please provide a valid Bearer token.');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(401);
      expect(reply._body.message).toBe('Authentication required. Please provide a valid Bearer token.');
    });

    it('returns 409 for duplicate errors', () => {
      const error = new Error('Email already exists');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(409);
      expect(reply._body.message).toBe('Email already exists');
    });

    it('returns 400 for organisation context required', () => {
      const error = new Error('Organisation context required (x-organisation-id header)');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.message).toBe('Organisation context required (x-organisation-id header)');
    });
  });

  describe('does NOT use message matching when explicit status exists', () => {
    it('uses 401 status even if message contains "not found"', () => {
      const error = {
        message: 'Token not found in request',
        statusCode: 401,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(401);
      expect(reply._body.message).toBe('Token not found in request');
    });

    it('uses 415 status even if message contains "invalid"', () => {
      const error = {
        message: 'Invalid content type header',
        statusCode: 415,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(415);
      expect(reply._body.message).toBe('Invalid content type header');
    });
  });
});
