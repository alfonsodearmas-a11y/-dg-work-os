import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError } from '@/lib/api-response';

describe('apiSuccess', () => {
  it('returns success:true with data', async () => {
    const res = apiSuccess({ name: 'test' });
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { name: 'test' } });
  });

  it('defaults to 200 status', () => {
    expect(apiSuccess('ok').status).toBe(200);
  });

  it('wraps null data', async () => {
    const body = await apiSuccess(null).json();
    expect(body).toEqual({ success: true, data: null });
  });

  it('wraps array data', async () => {
    const body = await apiSuccess([1, 2, 3]).json();
    expect(body.data).toEqual([1, 2, 3]);
  });

  it('wraps numeric data', async () => {
    const body = await apiSuccess(42).json();
    expect(body.data).toBe(42);
  });

  it('includes meta when provided', async () => {
    const body = await apiSuccess([], { page: 1, total: 50 }).json();
    expect(body.meta).toEqual({ page: 1, total: 50 });
  });

  it('includes partial meta', async () => {
    const body = await apiSuccess([], { total: 10 }).json();
    expect(body.meta).toEqual({ total: 10 });
  });

  it('omits meta when not provided', async () => {
    const body = await apiSuccess({ id: 1 }).json();
    expect(body).not.toHaveProperty('meta');
  });

  it('sets JSON content-type', () => {
    expect(apiSuccess({}).headers.get('content-type')).toContain('application/json');
  });
});

describe('apiError', () => {
  it('returns success:false with error object', async () => {
    const body = await apiError('Not found', 404).json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Not found');
  });

  it('sets 400 status', () => {
    expect(apiError('Bad request', 400).status).toBe(400);
  });

  it('sets 401 status', () => {
    expect(apiError('Unauthorized', 401).status).toBe(401);
  });

  it('sets 403 status', () => {
    expect(apiError('Forbidden', 403).status).toBe(403);
  });

  it('sets 404 status', () => {
    expect(apiError('Not found', 404).status).toBe(404);
  });

  it('sets 500 status', () => {
    expect(apiError('Internal error', 500).status).toBe(500);
  });

  it('includes error code when provided', async () => {
    const body = await apiError('Validation failed', 400, 'VALIDATION_ERROR').json();
    expect(body.error).toEqual({ message: 'Validation failed', code: 'VALIDATION_ERROR' });
  });

  it('omits code when not provided', async () => {
    const body = await apiError('fail', 500).json();
    expect(body.error).toEqual({ message: 'fail' });
  });

  it('never includes data field', async () => {
    const body = await apiError('fail', 400).json();
    expect(body).not.toHaveProperty('data');
  });

  it('sets JSON content-type', () => {
    expect(apiError('error', 500).headers.get('content-type')).toContain('application/json');
  });
});
