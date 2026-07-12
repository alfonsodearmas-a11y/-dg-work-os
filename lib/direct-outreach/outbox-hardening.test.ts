// OP Direct outbox — hardening + snapshot-survival tripwires (string-pinning
// pattern from queries-pin.test.ts): the security stance and the no-FK design
// live in SQL/source text, so pin the exact expressions that make them true.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const migration = readFileSync(
  join(ROOT, 'supabase/migrations/152_direct_outreach_opdirect_outbox.sql'),
  'utf8',
);

describe('migration 152 — RLS default-deny (145/146/147/148/150 lineage)', () => {
  it('enables RLS with ZERO policies and revokes client-role grants', () => {
    expect(migration).toContain(
      'ALTER TABLE public.direct_outreach_opdirect_outbox ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).toContain(
      'REVOKE ALL ON public.direct_outreach_opdirect_outbox FROM anon, authenticated;',
    );
    expect(migration).not.toContain('CREATE POLICY');
    expect(migration).not.toContain('GRANT');
  });

  it('status + source_kind are CHECK-constrained; dgos_ref is UNIQUE', () => {
    expect(migration).toContain(`CHECK (status IN ('pending','posted','skipped','failed'))`);
    expect(migration).toContain(
      `CHECK (source_kind IN ('assignment','unassignment','status','remark','target'))`,
    );
    expect(migration).toMatch(/dgos_ref\s+text NOT NULL UNIQUE/);
  });
});

describe('migration 152 — snapshot-replace survival (keyed by value, NO FK)', () => {
  it('carries no foreign key at all (an FK to cases would wipe the queue on upload)', () => {
    const sqlOnly = migration
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(sqlOnly).not.toMatch(/references/i);
    expect(sqlOnly).not.toMatch(/foreign key/i);
  });

  it('the workbook importer wipes ONLY cases+updates — never the outbox', () => {
    const importer = readFileSync(join(ROOT, 'lib/direct-outreach/import-xlsx.ts'), 'utf8');
    const deletes = importer.match(/DELETE FROM\s+(\w+)/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const stmt of deletes) {
      expect(['DELETE FROM direct_outreach_updates', 'DELETE FROM direct_outreach_cases']).toContain(
        stmt,
      );
    }
    expect(importer).not.toContain('direct_outreach_opdirect_outbox');
  });
});

describe('middleware — bridge routes are public-path (route-level token/session auth)', () => {
  const middleware = readFileSync(join(ROOT, 'middleware.ts'), 'utf8');

  it('export/ack/fail reach the route; retry/skip/list stay session-gated', () => {
    expect(middleware).toContain(`pathname === '/api/direct-outreach/outbox/export'`);
    expect(middleware).toContain(`pathname === '/api/direct-outreach/outbox/ack'`);
    expect(middleware).toContain(String.raw`/^\/api\/direct-outreach\/outbox\/[^/]+\/fail$/.test(pathname)`);
    expect(middleware).not.toContain('/api/direct-outreach/outbox/retry');
    expect(middleware).not.toContain(`startsWith('/api/direct-outreach/outbox')`);
  });
});

describe('bridge script — structural safety pins', () => {
  const bridge = readFileSync(join(ROOT, 'scripts/opdirect-outbox-bridge.ts'), 'utf8');

  it('empty queue exits BEFORE any browser is launched', () => {
    const emptyExit = bridge.indexOf(`console.log('0 pending')`);
    const browserLaunch = bridge.indexOf('launchPersistentContext');
    expect(emptyExit).toBeGreaterThan(-1);
    expect(browserLaunch).toBeGreaterThan(-1);
    expect(emptyExit).toBeLessThan(browserLaunch);
    expect(bridge.slice(emptyExit).slice(0, 60)).toContain('return');
  });

  it('never touches the Category dropdown and never automates credentials', () => {
    // The script must never even create a Category locator — the only mention
    // allowed is the "deliberately never touched" comment.
    expect(bridge).not.toMatch(/locator\((['"`])#updateCategory\1\)/);
    expect(bridge).not.toMatch(/password/i);
    // Only the resolved mapping ever sets a status — the value comes from the
    // queue (op_status_target), never a hardcoded second status.
    expect(bridge).toContain(`selectOption({ label: row.op_status_target })`);
  });
});
