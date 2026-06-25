import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Both the dedicated status route and the bulk route must change status through the
// atomic airstrip_change_status RPC — never a parallel update + status_log insert
// (that was bug B9). These tests assert the RPC is used and no direct status_log
// write happens at the route layer.

const { mockAuth, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockAuth: vi.fn(), mockFrom: vi.fn(), mockRpc: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), rpc: (...a: unknown[]) => mockRpc(...a) },
}));
import { supabaseChain as chain } from '@/tests/supabase-mock';

import { PATCH as statusPATCH } from '@/app/api/airstrips/[id]/status/route';
import { PATCH as bulkPATCH } from '@/app/api/airstrips/bulk/route';


beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
  mockRpc.mockResolvedValue({ data: { previous_status: 'operational', airstrip: {} }, error: null });
});

describe('status route → airstrip_change_status RPC', () => {
  it('routes a single status change through the RPC and writes no status_log directly', async () => {
    const req = new NextRequest('http://localhost:3000/api/airstrips/a1/status', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ new_status: 'closed', reason: 'runway damage' }),
    });
    const res = await statusPATCH(req, { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('airstrip_change_status', expect.objectContaining({
      p_airstrip_id: 'a1', p_new_status: 'closed',
    }));
    // No direct airstrip_status_log insert at the route layer.
    expect(mockFrom).not.toHaveBeenCalledWith('airstrip_status_log');
  });
});

describe('bulk route → airstrip_change_status RPC per airstrip', () => {
  it('routes each bulk status change through the RPC, not a parallel log insert', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    const req = new NextRequest('http://localhost:3000/api/airstrips/bulk', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ airstripIds: ['a1', 'a2'], updates: { status: 'limited' }, reason: 'partial' }),
    });
    const res = await bulkPATCH(req);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith('airstrip_change_status', expect.objectContaining({ p_new_status: 'limited' }));
    expect(mockFrom).not.toHaveBeenCalledWith('airstrip_status_log');
  });
});
