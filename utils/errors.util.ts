/**
 * Typed application errors for consistent error handling
 * Replaces string-matching error handling with typed error classes
 */

export type AppErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'FEATURE_DISABLED'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export interface AppErrorOptions {
  code: AppErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    super({
      code: 'NOT_FOUND',
      message,
      statusCode: 404,
      details: { resource, identifier },
    });
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super({
      code: 'FORBIDDEN',
      message,
      statusCode: 403,
    });
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      details,
    });
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'CONFLICT',
      message,
      statusCode: 409,
      details,
    });
    this.name = 'ConflictError';
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Usage quota exceeded') {
    super({
      code: 'QUOTA_EXCEEDED',
      message,
      statusCode: 429,
    });
    this.name = 'QuotaExceededError';
  }
}

export class FeatureDisabledError extends AppError {
  constructor(feature: string) {
    super({
      code: 'FEATURE_DISABLED',
      message: `Feature not enabled: ${feature}`,
      statusCode: 403,
      details: { feature },
    });
    this.name = 'FeatureDisabledError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super({
      code: 'UNAUTHORIZED',
      message,
      statusCode: 401,
    });
    this.name = 'UnauthorizedError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Maps legacy string-based error messages to typed errors
 * Used for backward compatibility during migration
 */
export function mapLegacyError(error: Error): AppError {
  const message = error.message || '';

  if (/not found/i.test(message)) {
    return new NotFoundError(message.replace(/not found/i, '').trim() || 'Resource');
  }
  if (/do not have access|permission|requires.*role/i.test(message)) {
    return new ForbiddenError(message);
  }
  if (/quota|exceeded/i.test(message)) {
    return new QuotaExceededError(message);
  }
  if (/already exists|duplicate/i.test(message)) {
    return new ConflictError(message);
  }
  if (/invalid|required|must be|allowed/i.test(message)) {
    return new ValidationError(message);
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    message: message || 'An unexpected error occurred',
    statusCode: 500,
  });
}
