// GET /api/direct-outreach/officers — the superadmin assign-anyone picker.
// db-pg is mocked at the pool level so the REAL getAssignableOfficers SQL runs
// and can be asserted: every active human regardless of agency/role, only
// role='system' excluded, no hardcoded agency allowlist.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { mockRequireModuleAccess, mockQuery } = vi.hoisted(() => ({
  mockRequireModuleAccess: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  requireModuleAccess: mockRequireModuleAccess,
}));

vi.mock('@/lib/db-pg', () => ({
  query: mockQuery,
  transaction: vi.fn(),
}));

import { GET } from '@/app/api/direct-outreach/officers/route';

// The full-human set the endpoint must not filter: a MARAD manager (outside
// the GWI/GPL/PUA workbook agencies), a plain non-manager human, an
// agency-less superadmin. role='system' rows never leave the SQL.
const HUMANS = [
  { id: 'u-marad', name: 'Marad Manager', role: 'agency_manager', agency: 'MARAD' },
  { id: 'u-heci', name: 'Heci Manager', role: 'agency_manager', agency: 'HECI' },
  { id: 'u-staff', name: 'Plain Staffer', role: 'staff', agency: null },
  { id: 'u-super', name: 'DG', role: 'superadmin', agency: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: HUMANS, rowCount: HUMANS.length });
});

describe('GET /api/direct-outreach/officers', () => {
  it('superadmin gets every active human user — MARAD/HECI and non-manager humans included', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: 'u-super', role: 'superadmin', agency: null } },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.users.map((u: { id: string }) => u.id);
    expect(ids).toContain('u-marad'); // non-outreach-workbook agency
    expect(ids).toContain('u-heci');
    expect(ids).toContain('u-staff'); // plain non-manager human
    expect(ids).toContain('u-super');
  });

  it('the SQL excludes ONLY non-humans and deactivated accounts — no role/agency allowlist', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: 'u-super', role: 'superadmin', agency: null } },
    });
    await GET();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toMatch(/role\s*<>\s*'system'/); // the users table's only service-account marker
    expect(sql).toMatch(/is_active/);
    expect(sql).toMatch(/ORDER BY name/i);
    // No hardcoded agencies anywhere in this path — driven off the users table.
    for (const agency of ['GWI', 'GPL', 'PUA', 'MARAD', 'HECI', 'CJIA', 'GCAA', 'HAS']) {
      expect(sql).not.toContain(`'${agency}'`);
    }
    expect(sql).not.toMatch(/agency\s*=/);
    expect(sql).not.toMatch(/role\s*=\s*'agency_manager'/);
  });

  it('agency_manager gets 403 (managers keep the case-agency picker)', async () => {
    mockRequireModuleAccess.mockResolvedValue({
      session: { user: { id: 'u-marad', role: 'agency_manager', agency: 'MARAD' } },
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('unauthenticated passes the auth-helper response through', async () => {
    mockRequireModuleAccess.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
