import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const { mockAuth, mockEscalateProject, mockDeescalateProject, mockFrom } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockEscalateProject: vi.fn(),
  mockDeescalateProject: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/project-queries', () => ({
  escalateProject: (...args: any[]) => mockEscalateProject(...args),
  deescalateProject: (...args: any[]) => mockDeescalateProject(...args),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { POST, DELETE } from '@/app/api/projects/[id]/escalate/route';

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

const paramsPromise = (id: string) => Promise.resolve({ id });

describe('POST /api/projects/[id]/escalate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEscalateProject.mockResolvedValue(undefined);

    // Mock supabase queries for notifications — the escalate route calls:
    // 1. from('projects').select(...).eq('id', id).single()
    // 2. from('users').select('id').in('role', [...]).eq('is_active', true)
    // 3. from('notifications').insert(...)
    // 4. from('users').select('id').eq('role', ...).eq('agency', ...).eq('is_active', true)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { project_name: 'Test Project', sub_agency: 'GPL' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'users') {
        // Must be chainable (.eq().eq().eq()) AND awaitable
        const result = { data: [{ id: 'admin-1' }], error: null };
        const chain: any = {
          then: (resolve: any) => resolve(result),
        };
        chain.select = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        return chain;
      }
      if (table === 'notifications') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('succeeds with valid reason', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Timeline slipping badly' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockEscalateProject).toHaveBeenCalledWith('proj-1', 'Timeline slipping badly', 'user-1');
  });

  it('returns 400 with empty reason', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with missing reason', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Test' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/projects/[id]/escalate (de-escalate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeescalateProject.mockResolvedValue(undefined);
  });

  it('succeeds for dg role', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeescalateProject).toHaveBeenCalledWith('proj-1');
  });

  it('succeeds for minister role', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-2', role: 'minister', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: paramsPromise('proj-1') });
    expect(res.status).toBe(200);
  });

  it('succeeds for ps role', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-3', role: 'ps', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: paramsPromise('proj-1') });
    expect(res.status).toBe(200);
  });

  it('returns 403 for officer role', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-4', role: 'officer', agency: 'GPL' },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Insufficient permissions');
  });

  it('returns 403 for agency_admin role', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-5', role: 'agency_admin', agency: 'GPL' },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/escalate', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: paramsPromise('proj-1') });
    expect(res.status).toBe(403);
  });
});
