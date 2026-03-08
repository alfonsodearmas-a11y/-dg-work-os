import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const { mockAuth, mockGetProjectNotes, mockAddProjectNote } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetProjectNotes: vi.fn(),
  mockAddProjectNote: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/project-queries', () => ({
  getProjectNotes: (...args: any[]) => mockGetProjectNotes(...args),
  addProjectNote: (...args: any[]) => mockAddProjectNote(...args),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
    }),
  },
}));

import { GET, POST } from '@/app/api/projects/[id]/notes/route';

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

const paramsPromise = (id: string) => Promise.resolve({ id });

describe('GET /api/projects/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns notes in descending order', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const mockNotes = [
      { id: 'note-2', note_text: 'Second note', created_at: '2025-02-01T00:00:00Z' },
      { id: 'note-1', note_text: 'First note', created_at: '2025-01-01T00:00:00Z' },
    ];
    mockGetProjectNotes.mockResolvedValue(mockNotes);

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes');
    const res = await GET(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('note-2');
    expect(mockGetProjectNotes).toHaveBeenCalledWith('proj-1');
  });

  it('returns 401 for unauthenticated user', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes');
    const res = await GET(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });
});

describe('POST /api/projects/[id]/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates note with valid body', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const createdNote = {
      id: 'note-new',
      project_id: 'proj-1',
      user_id: 'user-1',
      note_text: 'Important update',
      note_type: 'general',
      created_at: '2025-03-01T00:00:00Z',
    };
    mockAddProjectNote.mockResolvedValue(createdNote);

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: 'Important update' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.note_text).toBe('Important update');
    expect(mockAddProjectNote).toHaveBeenCalledWith('proj-1', 'user-1', 'Important update', 'general');
  });

  it('creates note with specified note_type', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const createdNote = {
      id: 'note-new',
      note_text: 'Status changed',
      note_type: 'status_update',
    };
    mockAddProjectNote.mockResolvedValue(createdNote);

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: 'Status changed', note_type: 'status_update' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.note_type).toBe('status_update');
  });

  it('rejects empty note_text with 400', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: '' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing note_text with 400', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'dg', agency: null },
    });

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes', {
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

    const req = makeRequest('http://localhost:3000/api/projects/proj-1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_text: 'Test' }),
    });

    const res = await POST(req, { params: paramsPromise('proj-1') });
    const body = await res.json();

    expect(res.status).toBe(401);
  });
});
