import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAuth, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockAuth: vi.fn(), mockFrom: vi.fn(), mockRpc: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), rpc: (...a: unknown[]) => mockRpc(...a) },
}));
import { supabaseChain as chain } from '@/tests/supabase-mock';

import { GET as listGET, POST as createPOST } from '@/app/api/airstrips/contractors/route';
import { POST as assignPOST, DELETE as clearDELETE } from '@/app/api/airstrips/[id]/contractor/route';

const hasManager = { user: { id: 'u', role: 'agency_manager', agency: 'HAS' } };

beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue(hasManager); });

describe('contractor management — HAS agency_manager is allowed', () => {
  it('HAS manager can list contractors (GET 200)', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    const res = await listGET(new NextRequest('http://localhost:3000/api/airstrips/contractors'));
    expect(res.status).toBe(200);
  });

  it('HAS manager can create a contractor (POST 201)', async () => {
    mockFrom.mockReturnValue(chain({ data: { id: 'c1', name: 'J. Williams' }, error: null }));
    const req = new NextRequest('http://localhost:3000/api/airstrips/contractors', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'J. Williams' }),
    });
    const res = await createPOST(req);
    expect(res.status).toBe(201);
  });
});

describe('contractor assignment is atomic (airstrip_assign_contractor RPC)', () => {
  it('assign routes through the RPC after confirming the contractor exists', async () => {
    mockFrom.mockReturnValue(chain({ data: { id: 'c1' }, error: null })); // contractor exists check
    mockRpc.mockResolvedValue({ data: null, error: null });
    const req = new NextRequest('http://localhost:3000/api/airstrips/a1/contractor', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contractor_id: 'c1' }),
    });
    const res = await assignPOST(req, { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('airstrip_assign_contractor', expect.objectContaining({
      p_airstrip_id: 'a1', p_contractor_id: 'c1',
    }));
  });

  it('clear closes the open assignment via update (effective_to set)', async () => {
    mockFrom.mockReturnValue(chain({ error: null }));
    const res = await clearDELETE(new NextRequest('http://localhost:3000/api/airstrips/a1/contractor', { method: 'DELETE' }), { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('airstrip_contractors');
  });
});
