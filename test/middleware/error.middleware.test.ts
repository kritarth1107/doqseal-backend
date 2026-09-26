import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { errorHandler } from '../../middleware/error.middleware';
import { legacyErrorHandler } from '../fixtures/legacyErrorHandler';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  QuotaExceededError,
  FeatureDisabledError,
  UnauthorizedError,
} from '../../utils/errors.util';

vi.mock('../../utils/logger.util', () => ({
  default: {
    error: vi.fn(),
  },
}));

interface Captured {
  status: number | undefined;
  body: any;
}

type Handler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => unknown;

function run(handler: Handler, error: unknown): Captured {
  const captured: Captured = { status: undefined, body: undefined };
  const reply = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    send(body: unknown) {
      captured.body = body;
      return this;
    },
  } as unknown as FastifyReply;
  const request = { url: '/test', method: 'POST' } as FastifyRequest;
  handler(error as FastifyError, request, reply);
  return captured;
}

function withProps<T extends object>(err: Error, props: T): Error & T {
  return Object.assign(err, props);
}

// Each factory builds a fresh error so both handlers see an identical object.
const legacyCases: Array<[string, () => unknown]> = [
  ['plain "User not found"', () => new Error('User not found')],
  ['"You do not have access"', () => new Error('You do not have access to this project')],
  ['"quota exceeded"', () => new Error('Monthly quota exceeded')],
  ['"already exists"', () => new Error('Organisation already exists')],
  ['"Token expired"', () => new Error('Token expired')],
  ['"Organisation context required"', () => new Error('Organisation context required')],
  [
    'Mongo E11000 duplicate key',
    () =>
      withProps(new Error('E11000 duplicate key error collection: doqseal.users index: email_1 dup key'), {
        name: 'MongoServerError',
        code: 11000,
      }),
  ],
  [
    'axios-style error with .status=404',
    () =>
      withProps(new Error('Request failed with status code 404'), {
        isAxiosError: true,
        status: 404,
        response: { status: 404 },
      }),
  ],
  ['statusCode=503', () => withProps(new Error('Service temporarily unavailable'), { statusCode: 503 })],
  ['statusCode=401', () => withProps(new Error('Unauthorized'), { statusCode: 401 })],
  ['statusCode=403', () => withProps(new Error('Forbidden'), { statusCode: 403 })],
  [
    'unsupported media type (415)',
    () =>
      withProps(new Error("Unsupported Media Type: application/xml"), {
        statusCode: 415,
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      }),
  ],
  [
    'body too large (413)',
    () =>
      withProps(new Error('Request body is too large'), {
        statusCode: 413,
        code: 'FST_ERR_CTP_BODY_TOO_LARGE',
      }),
  ],
  [
    'invalid JSON body',
    () =>
      withProps(new SyntaxError('Body is not valid JSON but content-type is set to \'application/json\''), {
        statusCode: 400,
        code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      }),
  ],
  [
    'invalid JSON without statusCode',
    () => new SyntaxError('Unexpected token } in JSON at position 10'),
  ],
  [
    'Zod schema validation',
    () =>
      withProps(new Error('body/name Required'), {
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        validation: [{ instancePath: '/name', message: 'Required' }],
      }),
  ],
  ['unexpected crash (TypeError)', () => new TypeError("Cannot read properties of undefined (reading 'id')")],
  ['error with statusCode=500', () => withProps(new Error('db exploded'), { statusCode: 500 })],
  ['error with empty message', () => new Error('')],
];

describe('errorHandler: parity with the previous handler for non-AppError errors', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  for (const env of ['production', 'development']) {
    describe(`NODE_ENV=${env}`, () => {
      beforeEach(() => {
        process.env.NODE_ENV = env;
      });

      it.each(legacyCases)('%s', (_label, make) => {
        const expected = run(legacyErrorHandler, make());
        const actual = run(errorHandler, make());
        expect(actual.status).toBe(expected.status);
        if (env === 'development') {
          // Stacks differ between the two error instances; compare the rest.
          const strip = (b: any) =>
            b && b.error && typeof b.error === 'object' && 'stack' in b.error
              ? { ...b, error: { ...b.error, stack: typeof b.error.stack } }
              : b;
          expect(strip(actual.body)).toEqual(strip(expected.body));
        } else {
          expect(actual.body).toEqual(expected.body);
        }
      });
    });
  }
});

describe('errorHandler: required production behaviour', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  const hidden500: Array<[string, () => unknown]> = [
    ['User not found', () => new Error('User not found')],
    ['You do not have access', () => new Error('You do not have access')],
    ['quota exceeded', () => new Error('quota exceeded')],
    ['already exists', () => new Error('already exists')],
    ['Token expired', () => new Error('Token expired')],
    ['Organisation context required', () => new Error('Organisation context required')],
    ['Mongo E11000', () => withProps(new Error('E11000 duplicate key error'), { code: 11000 })],
    ['axios .status=404', () => withProps(new Error('Request failed with status code 404'), { status: 404 })],
    ['unexpected crash', () => new TypeError('x is not a function')],
  ];

  it.each(hidden500)('%s -> 500 with message hidden', (_label, make) => {
    const res = run(errorHandler, make());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal Server Error', error: undefined });
  });

  it('statusCode=503 -> 503 with message shown', () => {
    const res = run(errorHandler, withProps(new Error('Service temporarily unavailable'), { statusCode: 503 }));
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Service temporarily unavailable');
  });

  it('statusCode=401 -> 401', () => {
    const res = run(errorHandler, withProps(new Error('Unauthorized'), { statusCode: 401 }));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Unauthorized');
  });

  it('unsupported media type -> 415', () => {
    const res = run(
      errorHandler,
      withProps(new Error('Unsupported Media Type'), { statusCode: 415, code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' })
    );
    expect(res.status).toBe(415);
  });

  it('body too large -> 413', () => {
    const res = run(
      errorHandler,
      withProps(new Error('Request body is too large'), { statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' })
    );
    expect(res.status).toBe(413);
  });

  it('invalid JSON -> same as previous handler (400 with message from Fastify)', () => {
    const make = () =>
      withProps(new SyntaxError('Body is not valid JSON'), { statusCode: 400, code: 'FST_ERR_CTP_INVALID_JSON_BODY' });
    const res = run(errorHandler, make());
    expect(res).toEqual(run(legacyErrorHandler, make()));
    expect(res.status).toBe(400);
  });
});

describe('errorHandler: typed AppError (bundle) errors', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it.each([
    ['NotFoundError', () => new NotFoundError('Bundle', 'bdl_1'), 404, 'NOT_FOUND'],
    ['ForbiddenError', () => new ForbiddenError(), 403, 'FORBIDDEN'],
    ['ValidationError', () => new ValidationError('Invalid template'), 400, 'VALIDATION_ERROR'],
    ['ConflictError', () => new ConflictError('Template key already exists'), 409, 'CONFLICT'],
    ['QuotaExceededError', () => new QuotaExceededError(), 429, 'QUOTA_EXCEEDED'],
    ['FeatureDisabledError', () => new FeatureDisabledError('bundles'), 403, 'FEATURE_DISABLED'],
    ['UnauthorizedError', () => new UnauthorizedError(), 401, 'UNAUTHORIZED'],
  ] as Array<[string, () => AppError, number, string]>)('%s -> %i', (_label, make, status, code) => {
    const err = make();
    const res = run(errorHandler, err);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ success: false, message: err.message, code, error: undefined });
  });

  it('AppError with 5xx status hides its message', () => {
    const res = run(errorHandler, new AppError({ code: 'INTERNAL_ERROR', message: 'secret detail', statusCode: 500 }));
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('AppError details are only exposed in development', () => {
    process.env.NODE_ENV = 'development';
    const res = run(errorHandler, new ValidationError('bad', { field: 'x' }));
    expect(res.body.error.details).toEqual({ field: 'x' });
  });
});
