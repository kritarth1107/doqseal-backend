import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import config from '../config/app.config';
import TokenBlacklist from '../utils/token-blacklist.util';
import User from '../model/user.model';
import Session from '../model/session.model';

/**
 * Validates active JWT payloads dynamically as a Fastify Hook `preHandler`.
 * Extensively cross-references the physical Database to ensure users are actively allowed.
 */
export const userAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ success: false, message: 'Authentication required. Please provide a valid Bearer token.' });
        }

        const token = authHeader.split(' ')[1];

        // 1. Verify token hasn't been explicitly revoked
        const isBlacklisted = await TokenBlacklist.isBlacklisted(token);
        if (isBlacklisted) {
            return reply.status(401).send({ success: false, message: 'Session revoked. Please log in again.' });
        }

        // 2. Cryptographically verify the local JWT utilizing the internal Secret
        const decoded = jwt.verify(token, config.jwt.secret as string) as { 
            userId: string; 
            email?: string; 
            role: string;
            firebaseToken?: string;
        };

        if (!decoded || !decoded.userId) {
             return reply.status(401).send({ success: false, message: 'Invalid token payload structure.' });
        }

        // 3. Parallelize high-fidelity Session and User lookups
        const fingerprint = (request.headers['x-fingerprint'] as string) || 'N/A';
        
        const [activeSession, activeUser] = await Promise.all([
            Session.findOne({ userId: decoded.userId, token, fingerprint, status: 'ACTIVE' }).lean(),
            User.findOne({ userId: decoded.userId }).lean()
        ]);

        if (!activeSession) {
            return reply.status(401).send({ success: false, message: 'Session expired or invalid. Please log in again.' });
        }

        if (!activeUser) {
            return reply.status(401).send({ success: false, message: 'The user account associated with this token no longer exists.' });
        }

        // 4. Strict Server-Side Authorization Bounds Execution
        const userStatus = (activeUser as any).status;
        if (userStatus === 'BANNED' || userStatus === 'SUSPENDED' || userStatus === 'DELETED') {
            return reply.status(403).send({ 
                success: false, 
                code: userStatus,
                message: `Account is ${userStatus.toLowerCase()}. Access denied.` 
            });
        }

        // 5. Expose user data to request context
        (request as any).user = activeUser;
        (request as any).firebaseToken = decoded.firebaseToken;
        
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            return reply.status(401).send({ success: false, message: 'Token has expired. Please refresh your session.' });
        }
        return reply.status(401).send({ success: false, message: 'Invalid or forged authentication token.' });
    }
};

export default userAuth;
