import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import logger from '../utils/logger.util';
import { isAppError } from '../utils/errors.util';

/**
 * Global Error Handler - Catches and standardizes all application errors
 * Automatically handles Zod validation errors and internal server faults
 *
 * IMPORTANT: This handler must remain identical to production for all non-bundle errors.
 * The only addition is the AppError branch for new bundle-specific typed errors.
 */
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Log the error for internal tracking
    logger.error('🔥 Global Error Caught', { 
        error: error.message, 
        stack: error.stack, 
        url: request.url,
        method: request.method
    });

    // Handle typed AppError instances (new bundle errors only)
    // This is the ONLY addition to production's error handler
    if (isAppError(error)) {
        const statusCode = error.statusCode;
        const message = statusCode === 500 ? 'Internal Server Error' : error.message;
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
    
    // ============================================================
    // PRODUCTION BEHAVIOR BELOW - DO NOT MODIFY
    // ============================================================

    // Handle Zod Validation Errors (FST_ERR_VALIDATION)
    if (error.code === 'FST_ERR_VALIDATION') {
        return reply.status(400).send({
            success: false,
            message: 'Schema Validation Failure',
            error: error.validation,
            details: 'The request payload or parameters did not match the required schema.'
        });
    }

    // Determine status code and message
    // ONLY reads error.statusCode (not .status) - this is intentional
    const statusCode = error.statusCode || 500;
    // Hide message ONLY when statusCode is exactly 500
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;

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
