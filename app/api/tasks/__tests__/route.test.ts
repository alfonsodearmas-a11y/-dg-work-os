import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const { mockAuth, mockFrom } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('@/lib/notifications', () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '@/app/api/tasks/route';

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

describe('GET /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tasks for authenticated user', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const mockData = [
      { id: '1', title: 'Test Task', status: 'new', owner: { id: 'user-1', name: 'DG' } },
      { id: '2', title: 'Active Task', status: 'active', owner: null },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          then: undefined,
          data: mockData,
          error: null,
        }),
      }),
    });

    // Proxy-based chain mock: any method call returns the proxy, await resolves to data
    const result = { data: mockData, error: null, count: mockData.length };
    const createChain = (): unknown =>
      new Proxy(
        { then: (resolve: (v: unknown) => void) => resolve(result) },
        { get: (target, prop) => (prop === 'then' ? target.then : () => createChain()) }
      );
    mockFrom.mockReturnValue(createChain());

    const req = makeRequest('http://localhost:3000/api/tasks');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tasks).toBeDefined();
    expect(body.lastSync).toBeDefined();
  });

  it('returns 401 for unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/tasks');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates task with valid body', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const createdTask = {
      id: 'task-1',
      title: 'New Task',
      status: 'new',
      priority: 'medium',
      owner: { id: 'user-1', name: 'DG' },
    };

    // Mock tasks insert chain
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: createdTask, error: null }),
      }),
    };
    // Mock task_activity insert
    const activityInsert = {
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          insert: vi.fn().mockReturnValue(insertChain),
        };
      }
      if (table === 'task_activity') {
        return activityInsert;
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Task' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.task).toBeDefined();
    expect(body.task.title).toBe('New Task');
  });

  it('returns 400 with missing title', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'No title here' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with empty title', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });
});
