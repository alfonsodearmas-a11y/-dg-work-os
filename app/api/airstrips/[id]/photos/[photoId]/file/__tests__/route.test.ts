import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAuth, mockFrom, mockDownload } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFrom: vi.fn(),
  mockDownload: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db-admin', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => mockFrom(...a),
    storage: { from: () => ({ download: (...a: unknown[]) => mockDownload(...a) }) },
  },
}));
import { supabaseChain as chain } from '@/tests/supabase-mock';

import { GET } from '@/app/api/airstrips/[id]/photos/[photoId]/file/route';

// Thenable proxy: any chained method returns the proxy; await resolves to `result`.
const params = (id: string, photoId: string) => ({ params: Promise.resolve({ id, photoId }) });
const req = () => new NextRequest('http://localhost:3000/api/airstrips/a1/photos/p1/file');

describe('GET /api/airstrips/[id]/photos/[photoId]/file (auth-gated proxy)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies a non-HAS, non-superadmin agency_manager (403)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'GPL' } });
    const res = await GET(req(), params('a1', 'p1'));
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('returns 404 when the photo does not belong to the airstrip in the path', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
    // The handler filters .eq('airstrip_id', id); a mismatched photo yields no row.
    mockFrom.mockReturnValue(chain({ data: null, error: null }));
    const res = await GET(req(), params('a1', 'p1'));
    expect(res.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('streams the stored object (by storage_path) for an authorized HAS manager', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
    mockFrom.mockReturnValue(chain({ data: { storage_path: 'a1/general/1_x.jpg', file_name: 'x.jpg' }, error: null }));
    mockDownload.mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg' }, error: null });

    const res = await GET(req(), params('a1', 'p1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toMatch(/private/);
    expect(mockDownload).toHaveBeenCalledWith('a1/general/1_x.jpg');
  });

  it('allows a superadmin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'superadmin', agency: null } });
    mockFrom.mockReturnValue(chain({ data: { storage_path: 'p', file_name: 'x' }, error: null }));
    mockDownload.mockResolvedValue({ data: { arrayBuffer: async () => new ArrayBuffer(2), type: 'image/png' }, error: null });
    const res = await GET(req(), params('a1', 'p1'));
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated request (401)', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), params('a1', 'p1'));
    expect(res.status).toBe(401);
  });
});
