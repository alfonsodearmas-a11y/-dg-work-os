// GET /api/direct-outreach — the list passes the requester id (so an assignee
// sees their cross-agency case), while the summary does NOT (scorecards, KPIs,
// and rollups stay strictly agency-scoped: a GPL case must never inflate the
// assignee's-agency numbers).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRequireModuleAccess, mockGetOpenCases, mockGetSummary } = vi.hoisted(() => ({
  mockRequireModuleAccess: vi.fn(),
  mockGetOpenCases: vi.fn(),
  mockGetSummary: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));

vi.mock('@/lib/direct-outreach/queries', () => ({
  LIST_LIMIT: 2000,
  getOpenCases: mockGetOpenCases,
  getSummary: mockGetSummary,
}));

import { GET } from '@/app/api/direct-outreach/route';

const OFFICER = 'officer-1';

function get(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenCases.mockResolvedValue([]);
  mockGetSummary.mockResolvedValue({ totals: {}, agencies: [], officer_load: [], filter_options: {} });
});

describe('GET /api/direct-outreach — list vs summary visibility boundary', () => {
  it('list: an agency_manager query carries scope AND their requester id (assignee visibility)', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: OFFICER, role: 'agency_manager', agency: 'HECI' } },
    });
    const res = await GET(get('/api/direct-outreach?view=list&mine=1'));
    expect(res.status).toBe(200);
    expect(mockGetOpenCases).toHaveBeenCalledWith(
      expect.objectContaining({ assignedToMe: OFFICER }),
      'HECI',
      OFFICER,
    );
  });

  it('summary: strictly agency-scoped — no requester id reaches the aggregates', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: OFFICER, role: 'agency_manager', agency: 'HECI' } },
    });
    const res = await GET(get('/api/direct-outreach'));
    expect(res.status).toBe(200);
    expect(mockGetSummary).toHaveBeenCalledWith('HECI');
    expect(mockGetSummary).not.toHaveBeenCalledWith('HECI', expect.anything());
  });

  it('superadmin list stays unscoped', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: 'super-1', role: 'superadmin', agency: null } },
    });
    await GET(get('/api/direct-outreach?view=list'));
    expect(mockGetOpenCases).toHaveBeenCalledWith(expect.anything(), undefined, 'super-1');
  });
});
