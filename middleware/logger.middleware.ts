import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import logger from '../utils/logger.util';

/**
 * Fastify lifecycle hooks to track fatal errors securely.
 */
const slowRequestMs = (): number => {
    const n = Number.parseInt(process.env.SLOW_REQUEST_MS ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : 300;
};

export const loggerHook = {
    onError: async (request: FastifyRequest, reply: FastifyReply, error: FastifyError) => {
         logger.error(`[AUDIT] FATAL ERROR CATCH`, { error: error.message, stack: error.stack, url: request.url });
    },

    /**
     * Request timing. Logs the route pattern (no ids or query strings), status
     * and server time for slow requests, or for every request when
     * LOG_REQUEST_TIMINGS=true.
     */
    onResponse: async (request: FastifyRequest, reply: FastifyReply) => {
        const ms = Math.round(reply.elapsedTime);
        if (process.env.LOG_REQUEST_TIMINGS !== 'true' && ms < slowRequestMs()) return;
        const route = request.routeOptions?.url ?? 'unmatched';
        console.log(`[timing] ${request.method} ${route} ${reply.statusCode} ${ms}ms`);
    },
};

export default loggerHook;
