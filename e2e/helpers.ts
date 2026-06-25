import { readFileSync } from 'fs';
import path from 'path';
import type { BrowserContext, Page } from '@playwright/test';

export const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3100'}`;

// A real PNG so the proxied <img> actually paints (naturalWidth > 0).
export const REAL_PNG = readFileSync(path.join(process.cwd(), 'public', 'icons', 'icon-192.png'));

type Role = 'superadmin' | 'agency_manager';

/** Set the gated E2E session cookie (no real credentials; dead in production). */
export async function loginAs(context: BrowserContext, role: Role, agency: string | null = 'HAS') {
  const user = {
    id: `e2e-${role}`,
    role,
    agency,
    name: role === 'superadmin' ? 'Owner (E2E)' : 'Akeem (E2E)',
    email: 'e2e@test.local',
  };
  await context.addCookies([
    { name: 'e2e_user', value: encodeURIComponent(JSON.stringify(user)), url: BASE_URL },
  ]);
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

export interface AirstripApiMocks {
  list: unknown;
  detail: () => unknown;          // function so a test can mutate it between fetches (e.g. after a save)
  options?: Record<string, unknown[]>;
  contractors?: unknown[];
  managers?: unknown[];
  settings?: unknown;
  onAssignContractor?: () => void; // called when POST /contractor fires
}

/**
 * Mock every airstrip API the UI touches, so NO request reaches prod. Uses
 * context-level routes (applied before navigation) and one airstrips handler that
 * dispatches by parsed path — deterministic, no glob-precedence ambiguity.
 */
export async function mockAirstripApi(page: Page, m: AirstripApiMocks) {
  const ctx = page.context();

  // Catch-all FIRST (checked last): keep the app's global providers off prod.
  await ctx.route('**/api/**', r => r.fulfill(json({})));

  // Session: echo the e2e_user cookie so the client role+agency match the gated session.
  await ctx.route('**/api/auth/me', r => {
    const cookie = r.request().headers()['cookie'] || '';
    const mm = /e2e_user=([^;]+)/.exec(cookie);
    if (!mm) return r.fulfill(json({ user: null }));
    const u = JSON.parse(decodeURIComponent(mm[1]));
    return r.fulfill(json({ user: {
      id: String(u.id), email: u.email ?? 'e2e@test.local', name: u.name ?? 'E2E User',
      image: null, role: u.role, agency: u.agency ? String(u.agency).toUpperCase() : null, title: null,
    } }));
  });

  // One handler for everything under /api/airstrips, dispatched by path.
  await ctx.route('**/api/airstrips**', r => {
    const p = new URL(r.request().url()).pathname;
    const method = r.request().method();
    if (p === '/api/airstrips') return r.fulfill(json(m.list));
    if (p.endsWith('/options')) return r.fulfill(json({ options: m.options ?? {} }));
    if (p.endsWith('/managers')) return r.fulfill(json({ managers: m.managers ?? [] }));
    if (p.endsWith('/settings')) return r.fulfill(json({ settings: m.settings ?? {} }));
    if (p.endsWith('/contractors')) {
      return method === 'POST'
        ? r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ contractor: { id: 'c-new', name: 'New Contractor' } }) })
        : r.fulfill(json({ contractors: m.contractors ?? [] }));
    }
    if (p.endsWith('/contractor')) { m.onAssignContractor?.(); return r.fulfill(json({ success: true })); }
    if (/\/photos\/[^/]+\/file$/.test(p)) return r.fulfill({ status: 200, contentType: 'image/png', body: REAL_PNG });
    if (p.endsWith('/report.pdf')) return r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') });
    if (/^\/api\/airstrips\/[^/]+$/.test(p)) return r.fulfill(json(m.detail()));  // /api/airstrips/<id>
    return r.fulfill(json(m.list));
  });
}
