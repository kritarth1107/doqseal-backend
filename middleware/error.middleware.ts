import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import logger from '../utils/logger.util';
import { isAppError, AppError, mapLegacyError } from '../utils/errors.util';

/**
 * Global Error Handler - Catches and standardizes all application errors
 * Handles typed AppError classes, Zod validation errors, and legacy string errors
 */
export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // Log the error for internal tracking
    logger.error('🔥 Global Error Caught', { 
        error: error.message, 
        stack: error.stack, 
        url: request.url,
        method: request.method
    });
    
    // Handle Zod Validation Errors (FST_ERR_VALIDATION)
    if ('code' in error && error.code === 'FST_ERR_VALIDATION') {
        return reply.status(400).send({
            success: false,
            message: 'Schema Validation Failure',
            error: (error as FastifyError).validation,
            details: 'The request payload or parameters did not match the required schema.'
        });
    }

    // Handle typed AppError instances
    if (isAppError(error)) {
        return reply.status(error.statusCode).send({
            success: false,
            message: error.message,
            code: error.code,
            error: process.env.NODE_ENV === 'development' ? {
                details: error.details,
                stack: error.stack
            } : undefined
        });
    }

    // Map legacy errors to typed errors for consistent handling
    // This preserves backward compatibility with existing string-based error matching
    const mappedError = mapLegacyError(error);
    
    // For legacy errors, also check the original patterns for backward compatibility
    const legacyMessage = error.message || '';
    let statusCode = mappedError.statusCode;
    
    // Preserve existing string-matching behavior
    if (/not found/i.test(legacyMessage)) {
        statusCode = 404;
    } else if (/do not have access|permission|requires.*role/i.test(legacyMessage)) {
        statusCode = 403;
    } else if (/quota|exceeded/i.test(legacyMessage)) {
        statusCode = 429;
    } else if (/already exists|duplicate/i.test(legacyMessage)) {
        statusCode = 409;
    } else if (/invalid|required|must be|allowed|large|context required/i.test(legacyMessage)) {
        statusCode = 400;
    }

    const message = statusCode === 500 ? 'Internal Server Error' : legacyMessage;

    // Send standardized error response
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