// Pin the hand-inlined copies of view-v4 semantics to the migration's view
// text. getCase (and getSummary's case-stats join) re-state the view's
// computed expressions so Resolved cases still render — this string-level
// tripwire fails the build when one side changes without the other.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const queriesSource = readFileSync(join(process.cwd(), 'lib/direct-outreach/queries.ts'), 'utf8');
const viewMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/151_direct_outreach_view_v4.sql'),
  'utf8',
);

// Canonical expressions the view (migration 151) and the inline copies share.
const PINNED_EXPRESSIONS = [
  // effective agency (148 lineage)
  'coalesce(o.agency, c.agency)',
  // working status default
  "coalesce(s.working_status, 'not_started')",
  // effective target (Q4: officer date outranks the heuristic)
  'coalesce(s.target_date, c.committed_date)',
  // officer-action staleness clock
  'greatest(ou.last_officer_update_at, a.assigned_at)',
];

describe('view v4 ↔ inline-copy pinning', () => {
  for (const expr of PINNED_EXPRESSIONS) {
    test(`both the view and queries.ts contain: ${expr}`, () => {
      expect(viewMigration).toContain(expr);
      expect(queriesSource).toContain(expr);
    });
  }

  test('the stale-officer threshold is the shared constant, not a drifted literal', () => {
    // queries.ts must interpolate OUTREACH_STALE_OFFICER_DAYS, never hardcode 14.
    expect(queriesSource).toContain('OUTREACH_STALE_OFFICER_DAYS');
    expect(queriesSource).not.toMatch(/days_since_officer_action > 14\b/);
  });
});
