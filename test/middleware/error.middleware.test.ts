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

  describe('production behavior - errors WITHOUT statusCode return 500 and hide message', () => {
    it('new Error("User not found") returns 500 hidden', () => {
      const error = new Error('User not found');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('User');
    });

    it('"You do not have access" returns 500 hidden', () => {
      const error = new Error('You do not have access to this organisation');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('"quota exceeded" returns 500 hidden', () => {
      const error = new Error('API quota exceeded');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('"already exists" returns 500 hidden', () => {
      const error = new Error('Email already exists');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('"Token expired" returns 500 hidden', () => {
      const error = new Error('Token expired. Please log in again.');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('"Organisation context required" returns 500 hidden', () => {
      const error = new Error('Organisation context required (x-organisation-id header)');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('Mongo E11000 duplicate key returns 500 hidden', () => {
      const error = new Error('E11000 duplicate key error collection: db.users index: email_1');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('E11000');
      expect(reply._body.message).not.toContain('duplicate');
    });

    it('axios-style error with .status=404 returns 500 hidden (we only read statusCode)', () => {
      const error = {
        message: 'Resource not found on remote API',
        status: 404, // axios-style, NOT Fastify's statusCode
      } as unknown as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
    });

    it('internal error with "invalid" in message returns 500 hidden', () => {
      const error = new Error('Database connection invalid - check credentials');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('Database');
    });
  });

  describe('production behavior - errors WITH statusCode use that status', () => {
    it('statusCode=503 returns 503 WITH message (not hidden)', () => {
      const error = {
        message: 'Service temporarily unavailable',
        statusCode: 503,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(503);
      expect(reply._body.message).toBe('Service temporarily unavailable');
    });

    it('statusCode=415 returns 415 with message', () => {
      const error = {
        message: 'Unsupported Media Type: application/xml',
        statusCode: 415,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(415);
      expect(reply._body.message).toBe('Unsupported Media Type: application/xml');
    });

    it('statusCode=413 returns 413 with message', () => {
      const error = {
        message: 'Request body is too large',
        statusCode: 413,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(413);
      expect(reply._body.message).toBe('Request body is too large');
    });

    it('statusCode=400 returns 400 with message', () => {
      const error = {
        message: 'Invalid JSON in request body',
        statusCode: 400,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.message).toBe('Invalid JSON in request body');
    });

    it('statusCode=401 returns 401 with message', () => {
      const error = {
        message: 'Unauthorized access',
        statusCode: 401,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(401);
      expect(reply._body.message).toBe('Unauthorized access');
    });

    it('statusCode=404 returns 404 with message', () => {
      const error = {
        message: 'Endpoint not found',
        statusCode: 404,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(404);
      expect(reply._body.message).toBe('Endpoint not found');
    });

    it('statusCode=500 returns 500 with hidden message', () => {
      const error = {
        message: 'Sensitive internal error with secrets',
        statusCode: 500,
      } as FastifyError;

      errorHandler(error, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.message).toBe('Internal Server Error');
      expect(reply._body.message).not.toContain('Sensitive');
    });
  });

  describe('Zod validation errors (FST_ERR_VALIDATION)', () => {
    it('returns 400 with validation details', () => {
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

  describe('typed AppError instances (new bundle errors)', () => {
    it('NotFoundError returns 404 with message', () => {
      const error = new NotFoundError('Document', 'doc-123');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(404);
      expect(reply._body.message).toContain('not found');
      expect(reply._body.code).toBe('NOT_FOUND');
    });

    it('ForbiddenError returns 403 with message', () => {
      const error = new ForbiddenError('Admin access required');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(403);
      expect(reply._body.message).toBe('Admin access required');
      expect(reply._body.code).toBe('FORBIDDEN');
    });

    it('ValidationError returns 400 with message', () => {
      const error = new ValidationError('Email format is invalid');

      errorHandler(error as any, request, reply);

      expect(reply._status).toBe(400);
      expect(reply._body.message).toBe('Email format is invalid');
      expect(reply._body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('does not leak internal details in production', () => {
    it('does not include error details in production for 500', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Connection to mongodb://user:password@host failed');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.error).toBeUndefined();
      expect(JSON.stringify(reply._body)).not.toContain('password');
      expect(JSON.stringify(reply._body)).not.toContain('mongodb');
    });

    it('includes error details in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Debug info here');

      errorHandler(error as FastifyError, request, reply);

      expect(reply._status).toBe(500);
      expect(reply._body.error).toBeDefined();
      expect(reply._body.error.message).toBe('Debug info here');
    });
  });
});
