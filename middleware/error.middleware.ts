import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import logger from '../utils/logger.util';

/**
 * Global Error Handler - Catches and standardizes all application errors
 * Automatically handles Zod validation errors and internal server faults
 */
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Log the error for internal tracking
    logger.error('🔥 Global Error Caught', { 
        error: error.message, 
        stack: error.stack, 
        url: request.url,
        method: request.method
    });
    
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
    const statusCode = error.statusCode || 500;
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