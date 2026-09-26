import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import logger from '../utils/logger.util';
import { isAppError } from '../utils/errors.util';

/**
 * Global Error Handler - Catches and standardizes all application errors
 * Priority order:
 * 1. Zod validation errors (FST_ERR_VALIDATION)
 * 2. Typed AppError instances (new bundle errors)
 * 3. Explicit error.statusCode/status (Fastify, body-parser, etc.)
 * 4. Message-based inference (legacy service errors only when no explicit status)
 * 5. Default 500
 *
 * IMPORTANT: Never expose internal error messages on 5xx responses.
 */
export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // Log the error for internal tracking
    logger.error('🔥 Global Error Caught', { 
        error: error.message, 
        stack: error.stack, 
        url: request.url,
        method: request.method
    });
    
    // 1. Handle Zod Validation Errors (FST_ERR_VALIDATION)
    if ('code' in error && error.code === 'FST_ERR_VALIDATION') {
        return reply.status(400).send({
            success: false,
            message: 'Schema Validation Failure',
            error: (error as FastifyError).validation,
            details: 'The request payload or parameters did not match the required schema.'
        });
    }

    // 2. Handle typed AppError instances (new bundle errors)
    if (isAppError(error)) {
        const statusCode = error.statusCode;
        const message = statusCode >= 500 ? 'Internal Server Error' : error.message;
        return reply.status(statusCode).send({
            success: false,
            message,
            code: error.code,
            error: process.env.NODE_ENV === 'development' ? {
                details: error.details,
                stack: error.stack
            } : undefined
        });
    }

    // 3. Respect explicit statusCode/status from Fastify errors (body-parser, content-type, etc.)
    // This preserves prod behavior for: 415 unsupported content type, 413 body too large, 
    // 400 invalid JSON, and any error with explicit statusCode
    const fastifyError = error as FastifyError;
    const errorCode = fastifyError.code;
    
    let explicitStatus: number | null = fastifyError.statusCode || (error as any).status || null;
    
    if (!explicitStatus && errorCode) {
        if (errorCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || errorCode === 'FST_REQ_CONTENT_TYPE_INVALID') {
            explicitStatus = 415;
        } else if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
            explicitStatus = 413;
        }
    }

    if (explicitStatus) {
        const message = explicitStatus >= 500 ? 'Internal Server Error' : error.message;
        return reply.status(explicitStatus).send({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack
            } : undefined
        });
    }

    // 4. Message-based inference for legacy service errors (only when no explicit status)
    // This handles existing service layer errors that throw with specific messages
    const legacyMessage = error.message || '';
    let statusCode = 500;
    
    if (/not found/i.test(legacyMessage)) {
        statusCode = 404;
    } else if (/do not have access|permission|requires.*role/i.test(legacyMessage)) {
        statusCode = 403;
    } else if (/authentication required|session.*expired|token.*expired|invalid.*token|log in again/i.test(legacyMessage)) {
        statusCode = 401;
    } else if (/quota|exceeded/i.test(legacyMessage)) {
        statusCode = 429;
    } else if (/already exists|duplicate/i.test(legacyMessage)) {
        statusCode = 409;
    } else if (/organisation context required/i.test(legacyMessage)) {
        statusCode = 400;
    }

    // 5. Default to 500 and NEVER expose internal messages on 5xx
    const message = statusCode >= 500 ? 'Internal Server Error' : legacyMessage;

    reply.status(statusCode).send({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? {
            message: error.message,
            stack: error.stack
        } : undefined
    });
};

export default errorHandler;