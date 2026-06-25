import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAuth, mockPrepare, mockRender } = vi.hoisted(() => ({
  mockAuth: vi.fn(), mockPrepare: vi.fn(), mockRender: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/airstrips/report/prepare-airstrip-report', () => ({ prepareAirstripReport: mockPrepare }));
vi.mock('@/lib/pdf/airstrip-report-render', () => ({ renderAirstripReportPDF: mockRender }));

import { GET } from '@/app/api/airstrips/[id]/report.pdf/route';

const params = { params: Promise.resolve({ id: 'a1' }) };
const req = () => new NextRequest('http://localhost:3000/api/airstrips/a1/report.pdf?from=2026-01-01&to=2026-06-25');

describe('GET /api/airstrips/[id]/report.pdf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies a non-HAS, non-superadmin agency_manager (403) — report not built', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'GPL' } });
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request (401)', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });

  it('returns a PDF for an authorized HAS manager', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'agency_manager', agency: 'HAS' } });
    mockPrepare.mockResolvedValue({ airstrip: { name: 'Kato' } });
    mockRender.mockResolvedValue(Buffer.from('%PDF-1.7 fake'));
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/airstrip-Kato-report\.pdf/);
    expect(mockPrepare).toHaveBeenCalledWith('a1', '2026-01-01', '2026-06-25');
  });

  it('returns 404 when the airstrip does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'superadmin', agency: null } });
    mockPrepare.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect(mockRender).not.toHaveBeenCalled();
  });
});
