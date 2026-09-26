import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { ClassifierError, ClassifyRequest, createClassifierClient } from '../../service/bundle/pipeline/classifier.client';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(axios.post);

const request: ClassifyRequest = {
  requestId: 't1',
  organisationId: 'org_a',
  bundleId: 'b1',
  documentId: 'd1',
  slots: [{ key: 'identity_proof', label: 'Identity proof', hints: [] }],
  document: { documentType: null, text: 'hello', fields: {} },
};

const client = createClassifierClient({ baseUrl: 'http://ai-engine:3031', serviceToken: 'tok', timeoutMs: 1000 });

describe('classifier client', () => {

  it('sends the service token and organisation header and returns the result', async () => {
    const data = { ...request, slot: 'identity_proof', confidence: 0.9, reasons: [], alternatives: [], keyFields: {} };
    post.mockResolvedValue({ status: 200, data });
    await expect(client(request)).resolves.toEqual(data);
    const [url, body, opts] = post.mock.calls.at(-1) as any[];
    expect(url).toBe('http://ai-engine:3031/bundle/classify');
    expect(body).toBe(request);
    expect(opts.headers).toEqual({ 'X-Service-Token': 'tok', 'X-Organisation-Id': 'org_a' });
    expect(opts.timeout).toBe(1000);
  });

  it('refuses a response for another organisation or request', async () => {
    post.mockResolvedValue({ status: 200, data: { ...request, organisationId: 'org_b' } });
    await expect(client(request)).rejects.toMatchObject({ retryable: false });
    post.mockResolvedValue({ status: 200, data: { ...request, requestId: 'other' } });
    await expect(client(request)).rejects.toBeInstanceOf(ClassifierError);
  });

  it.each([
    [502, true],
    [503, true],
    [429, true],
    [500, true],
    [422, false],
    [404, false],
    [401, false],
  ])('status %i -> retryable %s', async (status, retryable) => {
    post.mockResolvedValue({ status, data: {} });
    await expect(client(request)).rejects.toMatchObject({ retryable });
  });

  it('treats network errors as retryable', async () => {
    post.mockImplementation(() => {
      throw Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
    });
    const err = await client(request).catch((e) => e);
    expect(err).toBeInstanceOf(ClassifierError);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe('ai-engine unreachable');
  });
});
