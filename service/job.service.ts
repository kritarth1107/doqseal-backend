import ExtractionJob from '../model/extractionJob.model';
import Extraction from '../model/extraction.model';
import Document from '../model/document.model';
import { v4 as uuidv4 } from 'uuid';
import RabbitMQUtil from '../utils/rabbitmq.util';
import { EXTRACTION_QUEUE } from '../constants/queues';
import { assertUserInOrganisation } from '../utils/org-access.util';

export class JobService {
  public async createJob(params: {
    documentId: string;
    organisationId: string;
    projectId?: string | null;
  }) {
    const { documentId, organisationId, projectId } = params;

    const job = await ExtractionJob.create({
      jobId: uuidv4(),
      documentId,
      organisationId,
      projectId: projectId || null,
      status: 'queued',
    });

    await Document.updateOne(
      { documentId },
      { $set: { status: 'queued' } }
    );

    await RabbitMQUtil.publishToQueue(EXTRACTION_QUEUE, {
      jobId: job.jobId,
    });

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      status: job.status,
    };
  }

  public async getJob(
    userId: string,
    organisationId: string,
    jobId: string
  ) {
    await assertUserInOrganisation(userId, organisationId);

    const job = await ExtractionJob.findOne({
      jobId,
      organisationId,
    }).lean();

    if (!job) {
      throw new Error('Job not found');
    }

    const extraction = await Extraction.findOne({ jobId }).lean();

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      projectId: job.projectId,
      status: job.status,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      extraction: extraction
        ? {
            extractionId: extraction.extractionId,
            data: extraction.data,
            fieldConfidence: extraction.fieldConfidence,
            validationErrors: extraction.validationErrors,
            status: extraction.status,
            version: extraction.version,
          }
        : null,
    };
  }
}

export default new JobService();