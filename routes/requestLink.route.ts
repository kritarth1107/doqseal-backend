import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import requestLinkController from '../controller/requestLink.controller';
import userAuth from '../middleware/user.auth';

export const requestLinkRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.post('/', requestLinkController.create);
  fastify.get('/', requestLinkController.list);
  fastify.get('/:requestLinkId', requestLinkController.getOne);
  fastify.patch('/:requestLinkId', requestLinkController.update);
  fastify.get(
    '/:requestLinkId/submissions',
    requestLinkController.listSubmissions
  );
};

export const requestLinkPublicRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.get('/public/host', requestLinkController.resolveHost);
  fastify.get('/public/:slugOrToken', requestLinkController.getPublic);
  fastify.post('/public/:slugOrToken/otp/request', requestLinkController.requestOtp);
  fastify.post('/public/:slugOrToken/otp/verify', requestLinkController.verifyOtp);
  fastify.post('/public/:slugOrToken/submit', requestLinkController.submit);
};

export const collectDomainRouter: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.addHook('preHandler', userAuth);

  fastify.get(
    '/:organisationId/collect-domains',
    requestLinkController.listDomains
  );
  fastify.post(
    '/:organisationId/collect-domains',
    requestLinkController.addDomain
  );
  fastify.post(
    '/:organisationId/collect-domains/verify',
    requestLinkController.verifyDomain
  );
};

export default requestLinkRouter;
