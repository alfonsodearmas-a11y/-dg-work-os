import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAuth, mockFrom } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockFrom: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db-admin', () => ({ supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a) } }));
import { supabaseChain as chain } from '@/tests/supabase-mock';

import { GET, PATCH } from '@/app/api/airstrips/settings/route';

const settings = { default_interval_days: 90, upcoming_window_days: 14, verification_stale_after_days: 90, updated_at: '2026-06-25' };
const patchReq = () => new NextRequest('http://localhost:3000/api/airstrips/settings', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ default_interval_days: 90 }),
});

describe('airstrip settings — cadence thresholds are superadmin-edit-only', () => {
  beforeEach(() => vi.clearAllMocks());

  it('superadmin CAN edit (PATCH 200)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'superadmin', agency: null } });
    mockFrom.mockReturnValue(chain({ data: settings, error: null }));
    const res = await PATCH(patchReq());
    expect(res.status).toBe(200);
  });

  it('HAS agency_manager CANNOT edit (PATCH 403)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
    const res = await PATCH(patchReq());
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled(); // denied before any write
  });

  it('HAS agency_manager CAN read thresholds (GET 200)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
    mockFrom.mockReturnValue(chain({ data: settings, error: null }));
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
