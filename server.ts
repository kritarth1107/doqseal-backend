import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';
import { Server } from 'socket.io';
import morgan from 'morgan';
import middie from '@fastify/middie';

import config from './config/app.config';
import loggerHook from './middleware/logger.middleware';
import errorHandler from './middleware/error.middleware';
import responseUtil from './utils/response.util';
import { collectHealthReport } from './utils/health.util';

// Domain Routers
import { authRouter } from './routes/auth.route';
import { userRouter } from './routes/user.route';
import { apiKeyRouter } from './routes/apiKey.route';
import { organisationRouter } from './routes/organisation.route';
import { membershipRouter } from './routes/membership.route';
import { inviteRouter } from './routes/invite.route';
import { projectRouter } from './routes/project.route';
import { documentRouter } from './routes/document.route';
import { jobRouter } from './routes/job.route';
import { auditRouter } from './routes/audit.route';
import { envelopeRouter } from './routes/envelope.route';
import { envelopePublicRouter } from './routes/envelopePublic.route';
import { chatRouter } from './routes/chat.route';




/**
 * ServerSetup Class
 * Handles initialization, middleware configuration, and lifecycle of the Fastify server
 */
export class ServerSetup {
  public app: FastifyInstance;
  private io: Server;
  private readonly PORT: number = config.server.port;

  constructor() {
    this.app = Fastify({
      logger: false, // We use custom winston integration via hooks
      bodyLimit: 10485760 // 10MB limit
    });

    // Initialize Socket.io attached to Fastify's raw core server
    this.io = new Server(this.app.server, {
      cors: {
        origin: config.server.corsOrigins,
        methods: ["GET", "POST", "PUT"],
        allowedHeaders: ["Content-Type", "socket-id", "Authorization"],
      },
    });
  }

  /**
   * Sets up all application-level middleware
   */
  private async setupMiddleware(): Promise<void> {
    // 1. Core Security & Logging
    await this.app.register(middie);
    this.app.use(morgan('dev'));
    await this.app.register(helmet);
    await this.app.register(cors, {
      origin: config.server.corsOrigins,
      credentials: true
    });

    // 2. Multipart Uploads
    await this.app.register(multipart, {
      limits: { fileSize: 10 * 1024 * 1024 } // 10MB
    });

    // 3. Performance: Rate Limiting (Conditional)
    if (config.server.env === 'production') {
      await this.app.register(rateLimit, {
        max: config.security.rateLimiting.max,
        timeWindow: config.security.rateLimiting.windowMs,
      });
    }

    // 4. Architectural Hooks
    this.app.addHook('onError', loggerHook.onError);

    // 5. Global Error Handling
    this.app.setErrorHandler(errorHandler);

    // 6. Validation & Serialization Compilers
    this.app.setValidatorCompiler(validatorCompiler);
    this.app.setSerializerCompiler(serializerCompiler);
  }

  /**
   * Initializes WebSocket handling
   */
  // private setupWebSocket(): void {
  //   SocketUtil.init(this.io);
  //   this.io.on('connection', (socket) => {
  //     SocketUtil.handleConnection(socket);
  //   });
  // }

  /**
   * Registers all application routes
   */
  private setupRoutes(): void {
    const apiPrefix = `api/${config.server.apiVersion}`;

    // Public health — dependency status only; no secrets, URIs, or hostnames
    this.app.get('/health', async (_request, reply) => {
      const report = await collectHealthReport();
      const statusCode = report.status === 'unhealthy' ? 503 : 200;
      const message =
        report.status === 'ok'
          ? 'All systems operational'
          : report.status === 'degraded'
            ? 'API online with degraded dependencies'
            : 'API unhealthy';

      return responseUtil.success(reply, message, report, statusCode);
    });

    // Domain Route Registration
    this.app.register(authRouter, { prefix: `/${apiPrefix}/kingdom` });
    this.app.register(userRouter, { prefix: `/${apiPrefix}/user` });
    this.app.register(apiKeyRouter, { prefix: `/${apiPrefix}/api-wickets` });
    this.app.register(organisationRouter, { prefix: `/${apiPrefix}/organisations` });
    this.app.register(membershipRouter, { prefix: `/${apiPrefix}/organisations` });
    this.app.register(inviteRouter, { prefix: `/${apiPrefix}/invites` });
    this.app.register(auditRouter, { prefix: `/${apiPrefix}/organisations` });
    this.app.register(projectRouter, { prefix: `/${apiPrefix}/projects` });
    this.app.register(documentRouter, { prefix: `/${apiPrefix}/documents` });
    this.app.register(jobRouter, { prefix: `/${apiPrefix}/jobs` });
    this.app.register(envelopeRouter, { prefix: `/${apiPrefix}/envelopes` });
    this.app.register(envelopePublicRouter, { prefix: `/${apiPrefix}/envelopes` });
    this.app.register(chatRouter, { prefix: `/${apiPrefix}/chat` });



    // 404 Handler
    this.app.setNotFoundHandler((request, reply) => {
      return responseUtil.error(reply, `Endpoint ${request.method} ${request.url} not found`, 404);
    });
  }

  /**
   * Main entry point to start the server
   */
  public async start(): Promise<void> {
    try {
      await this.setupMiddleware();
      // this.setupWebSocket();
      this.setupRoutes();

      await this.app.listen({ port: this.PORT, host: '0.0.0.0' });

      console.log(`
==================================================
🚀 SAKSHYA API SERVER ACTIVATED 
==================================================
📡 Environment:  ${config.server.env}
🔌 Port:         ${this.PORT}
==================================================
      `);
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }
}

const server = new ServerSetup();
export default server;
