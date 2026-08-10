import { FastifyRequest, FastifyReply } from 'fastify';
import jobService from '../service/job.service';
import responseUtil from '../utils/response.util';
import { resolveOrganisationId } from '../utils/org-access.util';

export class JobController {
  public async getOne(request: FastifyRequest, reply: FastifyReply) {
    const sessionUser = (request as any).user;
    const { jobId } = request.params as { jobId: string };

    try {
      const organisationId = resolveOrganisationId(request);
      const job = await jobService.getJob(
        sessionUser.userId,
        organisationId,
        jobId
      );

      return responseUtil.success(reply, 'Job retrieved successfully', job);
    } catch (error: any) {
      const status = error.message === 'Job not found' ? 404 : 500;
      return responseUtil.error(
        reply,
        error.message || 'Failed to retrieve job',
        status
      );
    }
  }
}

export default new JobController();