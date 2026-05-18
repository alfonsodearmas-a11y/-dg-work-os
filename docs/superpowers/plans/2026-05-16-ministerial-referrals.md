# Ministerial Referrals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tracking + document generation feature for formal referrals from the DG's office to the Minister. Primary artifact is a printable PDF; the system tracks delivery, Minister direction, and closure. Includes a read-mostly view for the Minister and a status echo back to the source item (tender / project / etc.).

**Architecture:** Two new Supabase tables (`ministerial_referrals`, `referral_audit_log`) with a PostgreSQL sequence backing the `MPUA-MR-YYYY-NNNN` reference number. Server-rendered Next.js pages with `requireRole` gating. PDF rendered with the already-installed `@react-pdf/renderer` library, returning a Buffer from a Node-runtime API route. Status transitions are driven by log-entry mutations (delivery, direction, closure) with DG-only manual override. All mutations write to an append-only audit log.

**Tech Stack:** Next.js 16 App Router, Supabase (`supabaseAdmin`), `@react-pdf/renderer` v4.5.1, NextAuth v5, Tailwind v4, Vitest for unit tests of pure helpers.

---

## Decisions confirmed in this plan (do not re-litigate during execution)

1. **PDF library + fonts:** Use `@react-pdf/renderer` (already installed; mirrors the font registration pattern in `lib/pdf/intel-brief-render.tsx`). No puppeteer, no new microservice. **Fonts:** Inter for everything in the PDF — body, headers, reference numbers, timestamps. Single font family throughout. Inter TTFs are already shipped in `/public/fonts/` and used by the intel-brief PDF; this matches the established convention for PDF artifacts in this codebase. No new font binaries to download or commit. Letterhead uses existing `/public/ministry-logo.png`.
2. **Reference numbers:** Single global PostgreSQL `SEQUENCE referral_ref_seq` (starts at 1, monotonic, never recycled). Display format `MPUA-MR-${YYYY}-${nnnn}` where `YYYY` is the **Guyana local year** (`America/Guyana`, UTC-4, no DST) at the time the sequence is allocated, and `nnnn` is the zero-padded sequence value (4 digits, expands beyond 9999 naturally). Using Guyana TZ prevents referrals submitted late-evening on 31 December local time from being stamped with the next year.
3. **Em-dash policy:** Reject U+2014 (—) only on save of free-text fields (`recommendation`, `background`, `current_status`, `closure_note`, `minister_direction`, `minister_notes`). En-dashes (U+2013) and hyphens are permitted. Generated text (PDF body, pre-fill text, notification previews) must not contain em-dashes; pre-fill helpers strip and replace with a comma + space.
4. **Audit reliability:** Mutations that change `status` or any logged field use the `lib/db-pg.ts` `transaction()` helper to write the row update + audit insert atomically (cross-table ACID). Read-only or non-status edits use `supabaseAdmin` with a synchronous audit insert after the update; if the audit insert fails the route returns 500 (better to fail loud than diverge).
5. **Module access plumbing:** Register two slugs in the `modules` table: `ministerial-referrals` (default_roles: `['dg', 'ps']` — PS gets sidebar visibility and read-only API access from day one) and `minister-referrals` (default_roles: `['minister']`). API GET routes use `requireRole(['dg', 'ps'])`; all mutation routes use `requireRole(['dg'])`. Sidebar visibility and API authorization are aligned: PS sees the link and can read; only DG can write.
6. **Minister listing scope:** Minister sees referrals with `status IN ('submitted', 'with_minister', 'direction_given', 'closed')` — never drafts. All referrals are addressed to the Minister by construction (documented in a SQL comment on the table; see Task 1 Step 2).
7. **Source pre-fill:** Tender → `tender` table; Project → `projects` table; agency_issue / other → no pre-fill, agency required from form. Fields populated: `agency`, `title`, `days_overdue` (computed from source-specific date), `contract_value` (project only), `background` (auto-composed paragraph), `current_status` (auto-composed paragraph). All pre-fill text is em-dash-sanitized before save.
8. **Status banner on source items:** Tender cards and project rows that have an active (non-closed, non-drafted) referral show the banner. Implementation: one helper `getActiveReferralForSource(sourceType, sourceId)` reused by both views. Tender card paths (verified): `components/procurement/ProcurementCard.tsx` (kanban tile) and `components/procurement/ProcurementDetailPanel.tsx` (drawer).
9. **PDF failure on submit is atomic:** If `renderReferralPDF` throws during submission, the entire submit transaction rolls back: status stays `drafted`, no reference number is allocated (the sequence value is consumed but that is acceptable — sequences are allowed to have gaps; the spec forbids reuse, not gaps), `submitted_at` stays NULL, and the API returns 500 with a clear error. PDF is regenerated on every download request, so transient render failures on submit are recoverable by resubmitting.

---

## File Structure

### New files

```
supabase/migrations/
  114_ministerial_referrals.sql           # Table, enums, sequence
  115_referral_audit_log.sql              # Audit table
  116_referrals_modules_seed.sql          # Insert into modules table

lib/referrals/
  types.ts                                # Shared types (server + client safe)
  em-dash-guard.ts                        # rejectEmDash, stripEmDash
  reference-number.ts                     # formatReferenceNumber, allocateReferenceNumber
  audit.ts                                # writeAuditEntries
  queries.ts                              # CRUD: listReferrals, getReferralById,
                                          # createReferralDraft, submitReferral,
                                          # updateReferralFields, closeReferral,
                                          # deleteDraftReferral, getActiveReferralForSource,
                                          # getLastReferralForSource
  pre-fill.ts                             # resolvePreFill(sourceType, sourceId)
  status-machine.ts                       # validateTransition, deriveNextStatus

lib/pdf/
  referral-render.tsx                     # renderReferralPDF(params)

app/api/referrals/
  route.ts                                # GET (list) + POST (create draft / submit)
  [id]/route.ts                           # GET + PATCH + DELETE
  [id]/pdf/route.ts                       # GET (regenerate PDF on demand)
  [id]/acknowledge/route.ts               # POST (Minister)
  [id]/note/route.ts                      # POST (Minister)

app/referrals/
  page.tsx                                # DG list view
  [id]/page.tsx                           # DG detail view
  _components/
    ReferralsTable.tsx                    # client: filters + rows
    ReferralDetailClient.tsx              # client: edit delivery/outcome inline
    ReferralAuditList.tsx                 # client: audit log render

app/minister/referrals/
  page.tsx                                # Minister list view
  [id]/page.tsx                           # Minister detail (renders document inline)
  _components/
    MinisterReferralActions.tsx           # Acknowledge + Add Note

components/today/
  EscalateModal.tsx                       # opens from UrgentHero
  ReferralForm.tsx                        # form body (used inside EscalateModal)

components/referrals/
  ReferralStatusBadge.tsx                 # shared badge
  ReferralSourceBanner.tsx                # "Referred to Minister …" banner

tests/unit/referrals/
  em-dash-guard.test.ts
  reference-number.test.ts
  status-machine.test.ts
  pre-fill.test.ts
```

### Modified files

```
components/today/UrgentHero.tsx           # replace 2 buttons with Escalate; add meta line
lib/today/types.ts                        # extend TodaySignal with `lastEscalation`
lib/today/signals.ts                      # enrich top signal with last referral lookup
components/layout/Sidebar.tsx             # add /referrals and /minister/referrals items
components/procurement/                   # one location showing tender cards — wire
  (whichever card list is the home for tender rows)   ReferralSourceBanner where applicable
```

---

## Database schema

### `ministerial_referrals`

```sql
CREATE TYPE referral_source_type AS ENUM ('tender', 'project', 'agency_issue', 'other');
CREATE TYPE referral_requested_action AS ENUM ('review', 'decision', 'intervention', 'information');
CREATE TYPE referral_status AS ENUM ('drafted', 'submitted', 'with_minister', 'direction_given', 'closed');
CREATE TYPE referral_delivery_method AS ENUM ('email', 'hand_delivered', 'in_meeting', 'other');

CREATE TABLE ministerial_referrals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referred_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type              referral_source_type NOT NULL,
  source_id                TEXT,                              -- nullable; type varies by source_type
  agency                   TEXT NOT NULL,                     -- UPPERCASE canonical form
  title                    TEXT NOT NULL,
  days_overdue             INTEGER,
  contract_value           NUMERIC,
  background               TEXT NOT NULL DEFAULT '',
  current_status           TEXT NOT NULL DEFAULT '',
  recommendation           TEXT NOT NULL,
  requested_action         referral_requested_action NOT NULL,
  reference_number         TEXT UNIQUE,                       -- nullable while drafted
  status                   referral_status NOT NULL DEFAULT 'drafted',
  submitted_at             TIMESTAMPTZ,
  delivery_method          referral_delivery_method,
  delivered_to             TEXT,
  delivered_at             TIMESTAMPTZ,
  minister_direction       TEXT,
  direction_logged_at      TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  closure_note             TEXT,
  minister_acknowledged_at TIMESTAMPTZ,
  minister_notes           TEXT,
  CONSTRAINT recommendation_min_length CHECK (
    status = 'drafted' OR char_length(trim(recommendation)) >= 50
  ),
  CONSTRAINT no_em_dash_recommendation CHECK (recommendation NOT LIKE '%' || chr(8212) || '%'),
  CONSTRAINT no_em_dash_background CHECK (background NOT LIKE '%' || chr(8212) || '%'),
  CONSTRAINT no_em_dash_current_status CHECK (current_status NOT LIKE '%' || chr(8212) || '%')
);

CREATE SEQUENCE referral_ref_seq START 1;

CREATE INDEX referrals_status_idx ON ministerial_referrals(status);
CREATE INDEX referrals_agency_idx ON ministerial_referrals(agency);
CREATE INDEX referrals_referred_by_idx ON ministerial_referrals(referred_by);
CREATE INDEX referrals_submitted_at_idx ON ministerial_referrals(submitted_at DESC);
CREATE INDEX referrals_source_idx ON ministerial_referrals(source_type, source_id);

ALTER TABLE ministerial_referrals ENABLE ROW LEVEL SECURITY;
-- service_role bypass + authenticated SELECT (filtered in app layer; PS read-only enforced in API)
CREATE POLICY referrals_service_role ON ministerial_referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY referrals_authenticated_select ON ministerial_referrals FOR SELECT TO authenticated USING (true);

-- updated_at trigger
CREATE TRIGGER set_referrals_updated_at BEFORE UPDATE ON ministerial_referrals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();   -- reuse existing fn if present, else create

-- Documentation-only: every referral is addressed to the Minister.
COMMENT ON TABLE ministerial_referrals IS
  'Formal referrals from the DG office to the Minister of Public Utilities and Aviation. '
  'All rows are addressed to the Minister by construction. If the system ever needs to '
  'refer items to PS, Cabinet, or another principal via the same machinery, add an '
  'addressed_to column (enum) and migrate existing rows to ''minister''.';
```

### `referral_audit_log`

```sql
CREATE TABLE referral_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id   UUID NOT NULL REFERENCES ministerial_referrals(id) ON DELETE CASCADE,
  changed_by    UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  field_changed TEXT NOT NULL,                         -- column name or virtual 'status_transition'
  old_value     TEXT,                                  -- TEXT-serialized
  new_value     TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX referral_audit_log_referral_idx ON referral_audit_log(referral_id, timestamp DESC);

ALTER TABLE referral_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_service_role ON referral_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY audit_authenticated_select ON referral_audit_log FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy for authenticated => append-only by service role only
```

### `modules` seed

```sql
INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES
  ('ministerial-referrals', 'Ministerial Referrals', 'Track formal referrals to the Minister', 'FileSignature', ARRAY['dg', 'ps'], true, 75),
  ('minister-referrals', 'Referrals to Minister', 'Read inbound referrals', 'Inbox', ARRAY['minister'], true, 76)
ON CONFLICT (slug) DO NOTHING;
```

Note: PS receives sidebar visibility AND read-only API access via `default_roles`. The API layer enforces read-only for PS independently — see Decision 5.

---

## Status state machine

```
drafted ──submit──> submitted ──ack (Minister)──> with_minister
                       │                              │
                       │                              └──direction──> direction_given ──close──> closed
                       │
                       └────────────direction────────> direction_given ──close──> closed

Manual override (DG only) can move between any two states; audit log records the transition reason as 'manual_override'.

Mark Delivered (delivery_method + delivered_to logged):
  drafted     → submitted (auto-generates reference_number and PDF, sets submitted_at)
  submitted   → unchanged
  with_minister, direction_given, closed → unchanged (but delivered_at + log row are written)
```

Implemented as a pure function in `lib/referrals/status-machine.ts`:

```ts
export type ReferralStatus = 'drafted' | 'submitted' | 'with_minister' | 'direction_given' | 'closed';
export type TransitionTrigger =
  | 'submit'
  | 'mark_delivered'
  | 'log_direction'
  | 'minister_acknowledge'
  | 'close'
  | 'manual';

export function deriveNextStatus(
  current: ReferralStatus,
  trigger: TransitionTrigger,
  manualTarget?: ReferralStatus
): ReferralStatus { /* … */ }
```

---

# Tasks

### Task 1: Migration 114 — `ministerial_referrals` table + enums + sequence

**Files:**
- Create: `supabase/migrations/114_ministerial_referrals.sql`

- [ ] **Step 1:** Check whether `set_updated_at()` function already exists in earlier migrations. Run: `grep -rn "set_updated_at\|CREATE FUNCTION" supabase/migrations/ | head -20`. If it exists, reuse; otherwise include in this migration:
  ```sql
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;
  ```

- [ ] **Step 2:** Write the migration file with the full DDL from the **`ministerial_referrals`** schema block above, including all 4 enums, the sequence, the table, the indexes, the RLS policies, and the trigger.

- [ ] **Step 3:** Apply locally:
  ```bash
  npx supabase db push   # or the project's standard apply command
  ```
  Verify: `psql … -c "\d ministerial_referrals"` shows all columns and constraints.

- [ ] **Step 4:** Sanity test the em-dash CHECK:
  ```sql
  INSERT INTO ministerial_referrals (referred_by, source_type, agency, title, recommendation, requested_action)
  VALUES ('<existing-user-uuid>', 'tender', 'GPL', 'test', 'a — b', 'review');
  -- Expect: ERROR: violates check constraint "no_em_dash_recommendation"
  ```
  Then `DELETE FROM ministerial_referrals WHERE title = 'test';` to clean any rows that did slip through.

- [ ] **Step 5:** Commit:
  ```bash
  git add supabase/migrations/114_ministerial_referrals.sql
  git commit -m "feat(referrals): add ministerial_referrals table, enums, and sequence"
  ```

---

### Task 2: Migration 115 — `referral_audit_log`

**Files:**
- Create: `supabase/migrations/115_referral_audit_log.sql`

- [ ] **Step 1:** Write the migration with the full DDL from the **`referral_audit_log`** schema block above.

- [ ] **Step 2:** Apply locally and verify with `\d referral_audit_log`.

- [ ] **Step 3:** Commit:
  ```bash
  git add supabase/migrations/115_referral_audit_log.sql
  git commit -m "feat(referrals): add referral_audit_log table (append-only)"
  ```

---

### Task 3: Migration 116 — seed modules table

**Files:**
- Create: `supabase/migrations/116_referrals_modules_seed.sql`

- [ ] **Step 1:** Write the migration with the **`modules` seed** block above.

- [ ] **Step 2:** Apply and verify:
  ```sql
  SELECT slug, name, default_roles FROM modules WHERE slug LIKE '%referral%';
  ```
  Expect two rows.

- [ ] **Step 3:** Commit:
  ```bash
  git add supabase/migrations/116_referrals_modules_seed.sql
  git commit -m "feat(referrals): register referral modules for sidebar gating"
  ```

---

### Task 4: Shared types — `lib/referrals/types.ts`

**Files:**
- Create: `lib/referrals/types.ts`

- [ ] **Step 1:** Write the file:
  ```ts
  export type ReferralSourceType = 'tender' | 'project' | 'agency_issue' | 'other';
  export type ReferralRequestedAction = 'review' | 'decision' | 'intervention' | 'information';
  export type ReferralStatus = 'drafted' | 'submitted' | 'with_minister' | 'direction_given' | 'closed';
  export type ReferralDeliveryMethod = 'email' | 'hand_delivered' | 'in_meeting' | 'other';

  export interface Referral {
    id: string;
    created_at: string;
    updated_at: string;
    referred_by: string;
    source_type: ReferralSourceType;
    source_id: string | null;
    agency: string;
    title: string;
    days_overdue: number | null;
    contract_value: number | null;
    background: string;
    current_status: string;
    recommendation: string;
    requested_action: ReferralRequestedAction;
    reference_number: string | null;
    status: ReferralStatus;
    submitted_at: string | null;
    delivery_method: ReferralDeliveryMethod | null;
    delivered_to: string | null;
    delivered_at: string | null;
    minister_direction: string | null;
    direction_logged_at: string | null;
    closed_at: string | null;
    closure_note: string | null;
    minister_acknowledged_at: string | null;
    minister_notes: string | null;
  }

  export interface ReferralAuditEntry {
    id: string;
    referral_id: string;
    changed_by: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
    timestamp: string;
  }

  export interface ReferralWithReferrer extends Referral {
    referrer_name: string | null;
    referrer_email: string | null;
  }

  export interface ReferralSummary {
    id: string;
    reference_number: string | null;
    submitted_at: string | null;
    agency: string;
    title: string;
    requested_action: ReferralRequestedAction;
    status: ReferralStatus;
    days_since_submission: number | null;
  }

  export const REQUESTED_ACTION_LABELS: Record<ReferralRequestedAction, string> = {
    review: 'For Review',
    decision: 'For Decision',
    intervention: 'For Intervention',
    information: 'For Information',
  };

  export const STATUS_LABELS: Record<ReferralStatus, string> = {
    drafted: 'Drafted',
    submitted: 'Submitted',
    with_minister: 'With Minister',
    direction_given: 'Direction Given',
    closed: 'Closed',
  };
  ```

- [ ] **Step 2:** Commit:
  ```bash
  git add lib/referrals/types.ts
  git commit -m "feat(referrals): add shared referral types"
  ```

---

### Task 5: Em-dash guard + test

**Files:**
- Create: `lib/referrals/em-dash-guard.ts`
- Create: `tests/unit/referrals/em-dash-guard.test.ts`

- [ ] **Step 1: Write the failing test**

  ```ts
  // tests/unit/referrals/em-dash-guard.test.ts
  import { describe, it, expect } from 'vitest';
  import { containsEmDash, rejectEmDash, stripEmDash } from '@/lib/referrals/em-dash-guard';

  describe('em-dash guard', () => {
    it('detects U+2014 em dash', () => {
      expect(containsEmDash('foo — bar')).toBe(true);
      expect(containsEmDash('foo — bar')).toBe(true);
    });

    it('does not flag hyphens or en-dashes', () => {
      expect(containsEmDash('foo - bar')).toBe(false);
      expect(containsEmDash('foo – bar')).toBe(false); // en dash
    });

    it('rejectEmDash throws with a useful message', () => {
      expect(() => rejectEmDash('a — b', 'recommendation')).toThrowError(
        /recommendation may not contain em-dashes/
      );
    });

    it('stripEmDash replaces em-dashes with ", "', () => {
      expect(stripEmDash('a — b — c')).toBe('a, b, c');
      expect(stripEmDash('clean')).toBe('clean');
    });
  });
  ```

- [ ] **Step 2: Run; verify it fails**
  ```bash
  npx vitest run tests/unit/referrals/em-dash-guard.test.ts
  ```
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement**
  ```ts
  // lib/referrals/em-dash-guard.ts
  const EM_DASH = '—';

  export function containsEmDash(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.includes(EM_DASH);
  }

  export function rejectEmDash(value: string | null | undefined, fieldName: string): void {
    if (containsEmDash(value)) {
      throw new Error(`${fieldName} may not contain em-dashes (U+2014). Use a comma or rephrase.`);
    }
  }

  export function stripEmDash(value: string): string {
    return value.split(EM_DASH).join(', ').replace(/ {2,}/g, ' ');
  }
  ```

- [ ] **Step 4: Verify pass**
  ```bash
  npx vitest run tests/unit/referrals/em-dash-guard.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add lib/referrals/em-dash-guard.ts tests/unit/referrals/em-dash-guard.test.ts
  git commit -m "feat(referrals): em-dash guard with unit tests"
  ```

---

### Task 6: Reference number helper + test

**Files:**
- Create: `lib/referrals/reference-number.ts`
- Create: `tests/unit/referrals/reference-number.test.ts`

- [ ] **Step 1: Write the failing test**

  ```ts
  import { describe, it, expect } from 'vitest';
  import { formatReferenceNumber, guyanaYearOf } from '@/lib/referrals/reference-number';

  describe('formatReferenceNumber', () => {
    it('zero-pads to 4 digits', () => {
      expect(formatReferenceNumber(1, 2026)).toBe('MPUA-MR-2026-0001');
      expect(formatReferenceNumber(42, 2026)).toBe('MPUA-MR-2026-0042');
      expect(formatReferenceNumber(9999, 2026)).toBe('MPUA-MR-2026-9999');
    });

    it('does not truncate beyond 9999', () => {
      expect(formatReferenceNumber(12345, 2027)).toBe('MPUA-MR-2027-12345');
    });
  });

  describe('guyanaYearOf', () => {
    it('returns Guyana local year (UTC-4) — late-evening 31 Dec UTC is still that year in Guyana', () => {
      // 2026-12-31T23:30:00Z is 19:30 in Guyana — still 2026
      expect(guyanaYearOf(new Date('2026-12-31T23:30:00Z'))).toBe(2026);
    });

    it('returns Guyana local year — early hours 1 Jan UTC is still previous year in Guyana', () => {
      // 2027-01-01T03:30:00Z is 23:30 on 31 Dec 2026 in Guyana — still 2026
      expect(guyanaYearOf(new Date('2027-01-01T03:30:00Z'))).toBe(2026);
    });

    it('rolls to new year once it is past midnight in Guyana', () => {
      // 2027-01-01T04:30:00Z is 00:30 on 1 Jan 2027 in Guyana
      expect(guyanaYearOf(new Date('2027-01-01T04:30:00Z'))).toBe(2027);
    });
  });
  ```

- [ ] **Step 2: Run; verify fail.**

- [ ] **Step 3: Implement**
  ```ts
  // lib/referrals/reference-number.ts
  import { query } from '@/lib/db-pg';

  /**
   * Returns the calendar year in Guyana local time (America/Guyana, UTC-4, no DST).
   * Using Intl avoids hardcoding the offset and is correct even if Guyana ever
   * adopts DST in the future (it currently does not).
   */
  export function guyanaYearOf(d: Date): number {
    const yearStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guyana',
      year: 'numeric',
    }).format(d);
    return Number(yearStr);
  }

  export function formatReferenceNumber(seq: number, year: number): string {
    const padded = seq.toString().padStart(4, '0');
    return `MPUA-MR-${year}-${padded}`;
  }

  /**
   * Allocates the next sequence value atomically. The year stamped on the
   * reference number is the Guyana local year at allocation time.
   */
  export async function allocateReferenceNumber(now: Date = new Date()): Promise<string> {
    const result = await query("SELECT nextval('referral_ref_seq') AS seq");
    const seq = Number(result.rows[0].seq);
    return formatReferenceNumber(seq, guyanaYearOf(now));
  }
  ```

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit**
  ```bash
  git add lib/referrals/reference-number.ts tests/unit/referrals/reference-number.test.ts
  git commit -m "feat(referrals): reference number helper with Guyana-local year"
  ```

---

### Task 7: Status machine + test

**Files:**
- Create: `lib/referrals/status-machine.ts`
- Create: `tests/unit/referrals/status-machine.test.ts`

- [ ] **Step 1: Write the failing test**

  ```ts
  import { describe, it, expect } from 'vitest';
  import { deriveNextStatus } from '@/lib/referrals/status-machine';

  describe('deriveNextStatus', () => {
    it('submit moves drafted -> submitted', () => {
      expect(deriveNextStatus('drafted', 'submit')).toBe('submitted');
    });

    it('mark_delivered promotes drafted -> submitted but leaves others alone', () => {
      expect(deriveNextStatus('drafted', 'mark_delivered')).toBe('submitted');
      expect(deriveNextStatus('submitted', 'mark_delivered')).toBe('submitted');
      expect(deriveNextStatus('with_minister', 'mark_delivered')).toBe('with_minister');
      expect(deriveNextStatus('closed', 'mark_delivered')).toBe('closed');
    });

    it('minister_acknowledge moves submitted -> with_minister, others unchanged', () => {
      expect(deriveNextStatus('submitted', 'minister_acknowledge')).toBe('with_minister');
      expect(deriveNextStatus('direction_given', 'minister_acknowledge')).toBe('direction_given');
    });

    it('log_direction moves to direction_given from submitted or with_minister', () => {
      expect(deriveNextStatus('submitted', 'log_direction')).toBe('direction_given');
      expect(deriveNextStatus('with_minister', 'log_direction')).toBe('direction_given');
    });

    it('close moves to closed from any non-drafted state', () => {
      expect(deriveNextStatus('submitted', 'close')).toBe('closed');
      expect(deriveNextStatus('direction_given', 'close')).toBe('closed');
    });

    it('manual override returns explicit target', () => {
      expect(deriveNextStatus('submitted', 'manual', 'closed')).toBe('closed');
    });

    it('throws when submitting from non-drafted state', () => {
      expect(() => deriveNextStatus('submitted', 'submit')).toThrowError(/cannot submit/i);
    });

    it('throws when closing a draft', () => {
      expect(() => deriveNextStatus('drafted', 'close')).toThrowError(/cannot close a draft/i);
    });
  });
  ```

- [ ] **Step 2: Run; fail.**

- [ ] **Step 3: Implement** (the function with explicit cases — no fallthroughs).

  ```ts
  // lib/referrals/status-machine.ts
  import type { ReferralStatus } from './types';

  export type TransitionTrigger =
    | 'submit'
    | 'mark_delivered'
    | 'log_direction'
    | 'minister_acknowledge'
    | 'close'
    | 'manual';

  export function deriveNextStatus(
    current: ReferralStatus,
    trigger: TransitionTrigger,
    manualTarget?: ReferralStatus,
  ): ReferralStatus {
    switch (trigger) {
      case 'submit':
        if (current !== 'drafted') throw new Error(`Cannot submit referral in state: ${current}`);
        return 'submitted';
      case 'mark_delivered':
        return current === 'drafted' ? 'submitted' : current;
      case 'minister_acknowledge':
        return current === 'submitted' ? 'with_minister' : current;
      case 'log_direction':
        if (current === 'drafted') throw new Error('Cannot log direction on a draft');
        if (current === 'closed') return current;
        return 'direction_given';
      case 'close':
        if (current === 'drafted') throw new Error('Cannot close a draft (delete it instead)');
        return 'closed';
      case 'manual':
        if (!manualTarget) throw new Error('Manual override requires a target status');
        return manualTarget;
    }
  }
  ```

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit**
  ```bash
  git add lib/referrals/status-machine.ts tests/unit/referrals/status-machine.test.ts
  git commit -m "feat(referrals): status state machine with unit tests"
  ```

---

### Task 8: Audit log writer

**Files:**
- Create: `lib/referrals/audit.ts`

- [ ] **Step 1: Implement**
  ```ts
  // lib/referrals/audit.ts
  import { supabaseAdmin } from '@/lib/db';
  import { logger } from '@/lib/logger';

  export interface AuditEntry {
    referral_id: string;
    changed_by: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
  }

  /** Inserts audit entries. Throws on failure so callers can decide to abort. */
  export async function writeAuditEntries(entries: AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await supabaseAdmin.from('referral_audit_log').insert(entries);
    if (error) {
      logger.error({ err: error, entries }, 'referral_audit_log insert failed');
      throw new Error('Failed to write audit log entries');
    }
  }

  /** Compares two snapshots and returns one AuditEntry per changed field. */
  export function diffSnapshots<T extends Record<string, unknown>>(
    before: T,
    after: Partial<T>,
    referralId: string,
    changedBy: string,
  ): AuditEntry[] {
    const out: AuditEntry[] = [];
    for (const key of Object.keys(after) as Array<keyof T>) {
      if (after[key] === before[key]) continue;
      out.push({
        referral_id: referralId,
        changed_by: changedBy,
        field_changed: String(key),
        old_value: before[key] == null ? null : String(before[key]),
        new_value: after[key] == null ? null : String(after[key]),
      });
    }
    return out;
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add lib/referrals/audit.ts
  git commit -m "feat(referrals): audit log writer with snapshot diff helper"
  ```

---

### Task 9: Source pre-fill resolver + test

**Files:**
- Create: `lib/referrals/pre-fill.ts`
- Create: `tests/unit/referrals/pre-fill.test.ts`

Pulls a tender or project by `source_id` and assembles `{ agency, title, days_overdue, contract_value, background, current_status }`, stripping em-dashes from any generated text.

- [ ] **Step 1: Write the failing test** for the pure composition helpers (mock supabase client):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { composeTenderPreFill, composeProjectPreFill } from '@/lib/referrals/pre-fill';

  describe('pre-fill composers', () => {
    it('composes tender pre-fill and strips em-dashes', () => {
      const t = {
        id: 't1', agency: 'GPL', description: 'Sub 13.8 kV — relocation',
        stage: 'evaluation', date_advertised: '2026-01-01', contractor: null,
      };
      const out = composeTenderPreFill(t, new Date('2026-05-16'));
      expect(out.agency).toBe('GPL');
      expect(out.title).toBe('Sub 13.8 kV, relocation');
      expect(out.days_overdue).toBeGreaterThan(0);
      expect(out.background).not.toContain('—');
      expect(out.current_status).not.toContain('—');
    });
    // ... mirror for composeProjectPreFill
  });
  ```

- [ ] **Step 2: Run; fail.**

- [ ] **Step 3: Implement**
  ```ts
  // lib/referrals/pre-fill.ts
  import { supabaseAdmin } from '@/lib/db';
  import { stripEmDash } from './em-dash-guard';
  import type { ReferralSourceType } from './types';

  export interface ReferralPreFill {
    agency: string;
    title: string;
    days_overdue: number | null;
    contract_value: number | null;
    background: string;
    current_status: string;
  }

  export function composeTenderPreFill(t: TenderShape, now: Date): ReferralPreFill { /* … */ }
  export function composeProjectPreFill(p: ProjectShape, now: Date): ReferralPreFill { /* … */ }

  export async function resolvePreFill(
    sourceType: ReferralSourceType,
    sourceId: string | null,
  ): Promise<ReferralPreFill | null> {
    if (!sourceId) return null;
    if (sourceType === 'tender') {
      const { data } = await supabaseAdmin
        .from('tender')
        .select('id, agency, description, stage, date_advertised, date_closed, contractor')
        .eq('id', sourceId)
        .single();
      return data ? composeTenderPreFill(data, new Date()) : null;
    }
    if (sourceType === 'project') {
      const { data } = await supabaseAdmin
        .from('projects')
        .select('project_id, sub_agency, project_name, contract_value, contractor, project_end_date, completion_pct')
        .eq('project_id', sourceId)
        .single();
      return data ? composeProjectPreFill(data, new Date()) : null;
    }
    return null;
  }
  ```
  Compose the `background` paragraph from contractor, dates, stage; `current_status` from stage + percent complete + days overdue. Always run results through `stripEmDash`.

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit**
  ```bash
  git add lib/referrals/pre-fill.ts tests/unit/referrals/pre-fill.test.ts
  git commit -m "feat(referrals): source pre-fill resolver for tender/project"
  ```

---

### Task 10: Core CRUD queries

**Files:**
- Create: `lib/referrals/queries.ts`

Exposes:
- `listReferrals(filters)` — DG list view; supports `status[]`, `agency[]`, `dateFrom`, `dateTo`
- `listReferralsForMinister()` — Minister view: status IN ('submitted','with_minister','direction_given','closed'), ordered by submitted_at desc
- `getReferralById(id)` — full row + referrer join
- `getReferralAuditLog(id)` — chronological
- `createReferralDraft(input, userId)` — runs em-dash guard, returns row (no reference_number yet)
- `submitReferral(id, userId)` — uses `lib/db-pg.ts` `transaction()`:
  1. Lock row `FOR UPDATE`, assert status='drafted' and recommendation length >= 50
  2. `allocateReferenceNumber()` (Guyana-local year derived inside the helper)
  3. UPDATE status='submitted', reference_number=…, submitted_at=NOW()
  4. INSERT audit row `field_changed='status_transition', old_value='drafted', new_value='submitted'` and one for `reference_number`
  5. **Inside the same transaction**, call `renderReferralPDF(...)` to validate the PDF can be produced from this row. If it throws, the transaction rolls back: status stays drafted, no reference_number is persisted, no audit rows are written, sequence value is consumed (acceptable gap — spec forbids reuse, not gaps). The caller surfaces a 500 with a clear "PDF generation failed; please retry" message. The rendered Buffer is discarded; downloads always re-render on demand from `/api/referrals/[id]/pdf`.
- `updateReferralFields(id, patch, userId, manualStatusOverride?)` — generic editor:
  - Validates em-dash on string fields
  - Loads current row, computes diff, derives status via state machine based on which fields the patch touches:
    - `delivery_method` or `delivered_to` set ⇒ trigger='mark_delivered', sets `delivered_at=NOW()`
    - `minister_direction` set ⇒ trigger='log_direction', sets `direction_logged_at=NOW()`
    - `closure_note` set ⇒ trigger='close', sets `closed_at=NOW()`
    - `minister_acknowledged_at` set ⇒ trigger='minister_acknowledge'
    - Otherwise no status change; `manualStatusOverride` (DG-only, enforced at API layer) bypasses
  - Single transaction: UPDATE row + INSERT audit rows
- `deleteDraftReferral(id, userId)` — rejects if status != 'drafted'
- `getActiveReferralForSource(sourceType, sourceId)` — used by tender card banner; returns latest non-closed non-drafted referral or null
- `getLastReferralForSource(sourceType, sourceId)` — used by UrgentHero meta line; returns the latest of any status (or null)

- [ ] **Step 1:** Write the file as one ~250-line module. Use `supabaseAdmin` for reads; use `db-pg.transaction()` for writes that include audit entries.

- [ ] **Step 2:** Manually test against the local DB via a one-off script `scripts/test-referrals-queries.ts` (or `npx tsx -e '…'`) creating a draft and submitting it; verify reference number and audit row.

- [ ] **Step 3: Commit**
  ```bash
  git add lib/referrals/queries.ts
  git commit -m "feat(referrals): CRUD queries with transactional audit"
  ```

---

### Task 11: PDF generator (Inter)

**Files:**
- Create: `lib/pdf/referral-render.tsx`

Mirror the font registration pattern in `lib/pdf/intel-brief-render.tsx` exactly — same Inter TTFs from `/public/fonts/`. A4 portrait. Sections in order: Letterhead (logo + ministry name + address, right-aligned reference + date), Addressee ("The Honourable Minister of Public Utilities and Aviation"), Subject line, **Background**, **Current Status**, **Recommendation**, **Requested Action**, Signature block. Single font family (Inter) throughout — weight differences carry hierarchy.

- [ ] **Step 1: Implement**
  ```tsx
  /* eslint-disable react/no-unknown-property */
  // lib/pdf/referral-render.tsx
  // @react-pdf/renderer uses element names that React types don't recognize.

  import path from 'node:path';
  import {
    Document,
    Font,
    Image,
    Page,
    StyleSheet,
    Text,
    View,
    renderToBuffer,
  } from '@react-pdf/renderer';
  import type { Referral } from '@/lib/referrals/types';
  import { REQUESTED_ACTION_LABELS } from '@/lib/referrals/types';

  // ---------------------------------------------------------------------------
  // Font registration. Runs once per cold start. Inter TTFs are bundled in
  // public/fonts/ so there is no network at render time. Mirrors
  // lib/pdf/intel-brief-render.tsx.
  // ---------------------------------------------------------------------------
  const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(FONT_DIR, 'Inter-Light.ttf'), fontWeight: 300 },
      { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Inter-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);

  const NAVY = '#0a1628';
  const GOLD = '#d4af37';
  const BLACK = '#000000';

  const styles = StyleSheet.create({
    page: { padding: 56, fontFamily: 'Inter', fontSize: 11, color: BLACK },
    letterhead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 12 },
    logo: { width: 56, height: 56, marginRight: 16 },
    ministryName: { fontSize: 14, fontWeight: 700, color: NAVY },
    ministryAddress: { fontSize: 9, color: NAVY, marginTop: 2 },
    refBlock: { marginTop: 18, alignItems: 'flex-end' },
    refLine: { fontSize: 10, color: BLACK },
    addressee: { marginTop: 28, fontSize: 11, fontWeight: 700 },
    subject: { marginTop: 14, fontWeight: 700 },
    sectionHeading: { marginTop: 16, marginBottom: 4, fontSize: 12, fontWeight: 700 },
    body: { lineHeight: 1.5, textAlign: 'justify' },
    signature: { marginTop: 48 },
    sigName: { fontWeight: 700, marginTop: 36 },
    sigTitle: { fontWeight: 400, fontStyle: 'italic' },
  });

  export interface RenderReferralPDFParams {
    referral: Referral;
    referrerName: string;
    referrerTitle: string;
  }

  function formatGuyanaDate(iso: string | null): string {
    const d = iso ? new Date(iso) : new Date();
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Guyana',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  }

  export async function renderReferralPDF(params: RenderReferralPDFParams): Promise<Buffer> {
    const { referral, referrerName, referrerTitle } = params;
    const logoPath = path.join(process.cwd(), 'public', 'ministry-logo.png');
    const submittedDate = formatGuyanaDate(referral.submitted_at);

    return renderToBuffer(
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.letterhead}>
            <Image src={logoPath} style={styles.logo} />
            <View>
              <Text style={styles.ministryName}>Ministry of Public Utilities and Aviation</Text>
              <Text style={styles.ministryAddress}>Cooperative Republic of Guyana</Text>
              <Text style={styles.ministryAddress}>Brickdam, Stabroek, Georgetown</Text>
            </View>
          </View>

          <View style={styles.refBlock}>
            <Text style={styles.refLine}>Ref: {referral.reference_number ?? 'DRAFT'}</Text>
            <Text style={styles.refLine}>Date: {submittedDate}</Text>
          </View>

          <Text style={styles.addressee}>The Honourable Minister of Public Utilities and Aviation</Text>
          <Text style={styles.subject}>Subject: {referral.title}</Text>

          <Text style={styles.sectionHeading}>Background</Text>
          <Text style={styles.body}>{referral.background || 'Not provided.'}</Text>

          <Text style={styles.sectionHeading}>Current Status</Text>
          <Text style={styles.body}>{referral.current_status || 'Not provided.'}</Text>

          <Text style={styles.sectionHeading}>Recommendation</Text>
          <Text style={styles.body}>{referral.recommendation}</Text>

          <Text style={styles.sectionHeading}>Requested Action</Text>
          <Text style={styles.body}>{REQUESTED_ACTION_LABELS[referral.requested_action]}</Text>

          <View style={styles.signature}>
            <Text>Respectfully submitted,</Text>
            <Text style={styles.sigName}>{referrerName}</Text>
            <Text style={styles.sigTitle}>{referrerTitle}</Text>
          </View>
        </Page>
      </Document>,
    );
  }
  ```

- [ ] **Step 2:** Smoke test via a script:
  ```bash
  npx tsx -e "import('./lib/pdf/referral-render').then(async m => { const fs = require('fs'); const buf = await m.renderReferralPDF({ referral: { /* minimal fixture matching Referral type */ }, referrerName: 'Test', referrerTitle: 'DG' }); fs.writeFileSync('/tmp/ref.pdf', buf); console.log('written', buf.length); })"
  ```
  Open `/tmp/ref.pdf` and visually confirm letterhead, Inter body, and overall structure.

- [ ] **Step 3: Commit**
  ```bash
  git add lib/pdf/referral-render.tsx
  git commit -m "feat(referrals): A4 PDF letter renderer using Inter"
  ```

---

### Task 12: API — `POST /api/referrals` + `GET /api/referrals` (list)

**Files:**
- Create: `app/api/referrals/route.ts`

- [ ] **Step 1: Implement**
  - `export const runtime = 'nodejs'` (needed downstream if PDF is generated inline on submit)
  - `GET`: `requireRole(['dg', 'ps'])`. Parse query params `status`, `agency`, `from`, `to`. Call `listReferrals`. Return `{ referrals: ReferralSummary[] }`.
  - `POST`: `requireRole(['dg'])`. Body: `{ source_type, source_id?, agency, title, days_overdue?, contract_value?, background?, current_status?, recommendation, requested_action, action: 'draft' | 'submit' }`.
    - Validate em-dash on text fields; return 422 on violation.
    - On `action === 'submit'`: enforce `recommendation.length >= 50`; create draft, then call `submitReferral`. Return `{ referral, pdfUrl: '/api/referrals/<id>/pdf' }`.
    - On `action === 'draft'`: just create. Return `{ referral }`.
  - All catch blocks log via `logger` and return `{ error: '…' }` with 4xx/5xx.

- [ ] **Step 2:** Manual curl test:
  ```bash
  # As DG; cookie auth via browser dev session works easier — see Task 25 for end-to-end UI test
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add app/api/referrals/route.ts
  git commit -m "feat(referrals): API route to create and list referrals"
  ```

---

### Task 13: API — `GET/PATCH/DELETE /api/referrals/[id]`

**Files:**
- Create: `app/api/referrals/[id]/route.ts`

- [ ] **Step 1: Implement**
  - `export const runtime = 'nodejs'`
  - Use `await params` pattern (Next 16).
  - `GET`: `requireRole(['dg', 'ps'])`. Return `{ referral, audit: ReferralAuditEntry[] }`.
  - `PATCH`: `requireRole(['dg'])`.
    - Body fields allowed: `delivery_method`, `delivered_to`, `minister_direction`, `closure_note`, `background`, `current_status`, `recommendation`, `requested_action`, `status` (manual override only — present and `manualOverrideReason` required).
    - On manual override: call `updateReferralFields` with `manualStatusOverride: status`; audit log records `field_changed='status_transition'` with new/old + the reason in `new_value` formatted as `<state>|reason=<reason>`.
    - Otherwise: `updateReferralFields` derives next status from the patch shape.
    - Em-dash guard runs first.
    - If `minister_direction` was newly set and was previously NULL → emit a notification (Task 23).
  - `DELETE`: `requireRole(['dg'])`. Calls `deleteDraftReferral`, which rejects with 409 if status != 'drafted'.

- [ ] **Step 2: Commit**
  ```bash
  git add app/api/referrals/[id]/route.ts
  git commit -m "feat(referrals): GET/PATCH/DELETE single referral"
  ```

---

### Task 14: API — `GET /api/referrals/[id]/pdf`

**Files:**
- Create: `app/api/referrals/[id]/pdf/route.ts`

- [ ] **Step 1: Implement**
  ```ts
  export const runtime = 'nodejs';
  export const maxDuration = 120;

  export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const auth = await requireRole(['dg', 'ps', 'minister']);
    if (auth instanceof NextResponse) return auth;
    const referral = await getReferralById(id);
    if (!referral) return new NextResponse('Not found', { status: 404 });
    // Minister can only see referrals that have been submitted
    if (auth.session.user.role === 'minister' && referral.status === 'drafted') {
      return new NextResponse('Not found', { status: 404 });
    }
    const referrer = await supabaseAdmin
      .from('users')
      .select('name, formal_title, role')
      .eq('id', referral.referred_by)
      .single();
    const pdfBuffer = await renderReferralPDF({
      referral,
      referrerName: referrer.data?.name ?? 'Director General',
      referrerTitle: referrer.data?.formal_title ?? 'Director General, Ministry of Public Utilities and Aviation',
    });
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${referral.reference_number ?? 'draft'}.pdf"`,
      },
    });
  }
  ```

- [ ] **Step 2:** Hit it in the browser after Task 12 creates a submitted referral. Confirm PDF renders.

- [ ] **Step 3: Commit**
  ```bash
  git add app/api/referrals/[id]/pdf/route.ts
  git commit -m "feat(referrals): on-demand PDF generation endpoint"
  ```

---

### Task 15: API — Minister actions

**Files:**
- Create: `app/api/referrals/[id]/acknowledge/route.ts`
- Create: `app/api/referrals/[id]/note/route.ts`

- [ ] **Step 1: Implement acknowledge**
  - `POST`: `requireRole(['minister'])`. Reject if referral.status === 'drafted'.
  - Calls `updateReferralFields(id, { minister_acknowledged_at: nowIso }, userId)` — status derivation handles the submitted→with_minister bump.

- [ ] **Step 2: Implement note**
  - `POST`: `requireRole(['minister'])`. Body `{ text: string }`. Em-dash guard. Append (not replace) to `minister_notes` with a timestamp prefix:
    ```ts
    const prefix = new Date().toLocaleString('en-GB');
    const newNotes = referral.minister_notes
      ? `${referral.minister_notes}\n\n[${prefix}] ${text}`
      : `[${prefix}] ${text}`;
    ```
  - Calls `updateReferralFields(id, { minister_notes: newNotes }, userId)`.

- [ ] **Step 3: Commit**
  ```bash
  git add app/api/referrals/[id]/acknowledge/route.ts app/api/referrals/[id]/note/route.ts
  git commit -m "feat(referrals): minister acknowledge + add note endpoints"
  ```

---

### Task 16: Notification on minister direction

**Files:**
- Modify: `app/api/referrals/[id]/route.ts` (the PATCH branch from Task 13)
- Modify (or read): `lib/notifications/notification-service.ts` — find `createNotification` signature

- [ ] **Step 1:** In the PATCH handler, after the update returns, if `minister_direction` transitioned from NULL → non-NULL, build a truncated preview (Minister direction may be sensitive — keep the body short):
  ```ts
  function truncatePreview(text: string, max = 80): string {
    if (text.length <= max) return text;
    // Cut at max, trim trailing whitespace/punctuation, append ellipsis (NOT em-dash)
    return text.slice(0, max).replace(/[\s.,;:!?]+$/, '') + '…';
  }

  await createNotification({
    user_id: referral.referred_by,
    type: 'referral_direction_given',
    title: `Minister direction logged: ${referral.reference_number}`,
    body: truncatePreview(directionText, 80),
    importance_tier: 'important',
    event_type: 'referral_direction_given',
    entity_type: 'referral',
    entity_id: referral.id,
    reference_url: `/referrals/${referral.id}`,
    actor_id: session.user.id,
    scheduled_for: new Date().toISOString(),
  });
  ```
  The full direction text is only visible to the DG by clicking through to `/referrals/[id]`. The notification body is capped at 80 characters with `…` ellipsis (single Unicode char, not three dots, never an em-dash).
- [ ] **Step 2:** If the `notifications.type` CHECK constraint requires the new value, add a migration:
  - Create `supabase/migrations/117_referral_notification_type.sql`:
    ```sql
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    -- Re-add with new value included; copy current allowed list from migration 051 or latest constraint
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN (/* existing values */ , 'referral_direction_given'));
    ```
  - Check the actual constraint first: `grep -rn "notifications_type_check\|CHECK (type IN" supabase/migrations/`.

- [ ] **Step 3:** Commit
  ```bash
  git add app/api/referrals/[id]/route.ts supabase/migrations/117_referral_notification_type.sql
  git commit -m "feat(referrals): notify DG when minister direction is logged"
  ```

---

### Task 17: Sidebar updates

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1:** Add to `mainNavItems` array (around line 92, after `/documents`):
  ```ts
  { href: '/referrals', label: 'Ministerial Referrals', icon: FileSignature, moduleSlug: 'ministerial-referrals' },
  ```
  Import `FileSignature` from `lucide-react`.

- [ ] **Step 2:** Add a separate Minister-only nav section near where Admin section is defined (around line 155):
  ```ts
  const ministerNavItems = [
    { href: '/minister/referrals', label: 'Referrals to Minister', icon: Inbox, moduleSlug: 'minister-referrals' },
  ];
  const showMinister = realUser.role === 'minister' || userRole === 'minister';
  // Render below main nav, conditional on showMinister, filtered by canAccess
  ```

- [ ] **Step 3:** Verify in the browser — log in as DG (Keisha) and confirm the link is visible; as an officer it should be hidden because `canAccess('ministerial-referrals')` returns false (officer isn't in default_roles).

- [ ] **Step 4: Commit**
  ```bash
  git add components/layout/Sidebar.tsx
  git commit -m "feat(referrals): add sidebar entries for DG and Minister"
  ```

---

### Task 18: EscalateModal + ReferralForm

**Files:**
- Create: `components/today/EscalateModal.tsx`
- Create: `components/today/ReferralForm.tsx`

- [ ] **Step 1:** `EscalateModal` is a SlidePanel host with two stacked option cards: "Refer to Minister" (active) and "Queue for NPTAB Report" (disabled "Coming soon" pill). Selecting Refer swaps the panel content to `<ReferralForm preFill={...} sourceType={...} sourceId={...} onSubmitted={...} onClose={...} />`.

- [ ] **Step 2:** `ReferralForm`:
  - Fetches pre-fill on mount via `GET /api/referrals/pre-fill?source_type=…&source_id=…` (add this endpoint OR just inline-call `resolvePreFill` server-side and pass result as prop from the parent server component — preferred to avoid an extra round trip).
  - Form fields: agency (locked if pre-filled), title (locked if pre-filled), background (textarea), current_status (textarea), recommendation (textarea, **required**, live char counter "minimum 50 characters"), requested_action (select).
  - Real-time em-dash check on recommendation: if value contains U+2014, show inline error and disable Submit (use `containsEmDash`).
  - Two buttons: "Save Draft" (POST with action='draft') and "Submit" (action='submit'). On submit success: close panel, toast with `reference_number`, optimistically refresh page or revalidate.
  - Uses the same input styling as `ProcurementNewPackageForm`.

- [ ] **Step 3: Commit**
  ```bash
  git add components/today/EscalateModal.tsx components/today/ReferralForm.tsx
  git commit -m "feat(referrals): escalate modal and referral form"
  ```

---

### Task 19: Extend TodaySignal + signals fetcher

**Files:**
- Modify: `lib/today/types.ts`
- Modify: `lib/today/signals.ts`

- [ ] **Step 1:** Add to `TodaySignal`:
  ```ts
  lastEscalation: {
    reference_number: string;
    status: ReferralStatus;
    submitted_at: string;
  } | null;
  ```
  (Keep `null` when none.)

- [ ] **Step 2:** In `signals.ts`, after the top signal is selected (or for all signals — preferable for the Task 22 banner reuse), call `getLastReferralForSource(signal.kind === 'tender_sla' ? 'tender' : 'project', signal.sourceId)` and attach. For other kinds, leave null.

- [ ] **Step 3:** Type-check:
  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add lib/today/types.ts lib/today/signals.ts
  git commit -m "feat(referrals): expose last escalation on today signals"
  ```

---

### Task 20: Update UrgentHero — single Escalate + meta line

**Files:**
- Modify: `components/today/UrgentHero.tsx`

- [ ] **Step 1:** Replace the existing two-button block (lines ~91-100) with:
  ```tsx
  {topSignal.lastEscalation ? (
    <p className="text-xs text-navy-500 mb-2">
      Top urgency for {topSignal.ageDays ?? '—'} days. Last escalation: Referred to Minister,{' '}
      {new Date(topSignal.lastEscalation.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      , {topSignal.lastEscalation.reference_number}.
    </p>
  ) : (
    <p className="text-xs text-navy-500 mb-2">
      Top urgency for {topSignal.ageDays ?? '—'} days. Last escalation: none.
    </p>
  )}
  <button onClick={() => setEscalateOpen(true)} className="btn-gold text-sm">
    Escalate
  </button>
  <EscalateModal
    isOpen={escalateOpen}
    onClose={() => setEscalateOpen(false)}
    sourceType={topSignal.kind === 'tender_sla' ? 'tender' : 'project'}
    sourceId={topSignal.sourceId}
    preFillTitle={topSignal.title}
    preFillAgency={topSignal.agency}
  />
  ```
  Replace `—` literal with the word "none" since em-dashes are forbidden in UI labels.

- [ ] **Step 2:** Visually verify in the browser. Both cases (with last escalation, without).

- [ ] **Step 3: Commit**
  ```bash
  git add components/today/UrgentHero.tsx
  git commit -m "feat(referrals): replace urgent-hero buttons with single Escalate + meta line"
  ```

---

### Task 21: `/referrals` list page (DG view)

**Files:**
- Create: `app/referrals/page.tsx`
- Create: `app/referrals/_components/ReferralsTable.tsx`

- [ ] **Step 1:** Server component:
  ```tsx
  // app/referrals/page.tsx
  export default async function ReferralsPage() {
    const result = await requireRole(['dg', 'ps']);
    if (result instanceof NextResponse) notFound();
    const referrals = await listReferrals({});
    return <ReferralsTable initial={referrals} canEdit={result.session.user.role === 'dg'} />;
  }
  ```

- [ ] **Step 2:** Client component `ReferralsTable`:
  - Columns: Reference, Date Submitted, Agency, Title, Requested Action, Status, Days Since
  - Filters: status (multi-select), agency (multi-select), date range
  - Sort: submitted_at desc default
  - Click row → `Link href="/referrals/[id]"`
  - Use `ReferralStatusBadge` for the status column

- [ ] **Step 3: Commit**
  ```bash
  git add app/referrals/page.tsx app/referrals/_components/ReferralsTable.tsx components/referrals/ReferralStatusBadge.tsx
  git commit -m "feat(referrals): DG list view with filters"
  ```

---

### Task 22: `/referrals/[id]` detail page

**Files:**
- Create: `app/referrals/[id]/page.tsx`
- Create: `app/referrals/_components/ReferralDetailClient.tsx`
- Create: `app/referrals/_components/ReferralAuditList.tsx`

- [ ] **Step 1:** Server component:
  ```tsx
  export default async function ReferralDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const result = await requireRole(['dg', 'ps']);
    if (result instanceof NextResponse) notFound();
    const referral = await getReferralById(id);
    if (!referral) notFound();
    const audit = await getReferralAuditLog(id);
    return (
      <ReferralDetailClient
        referral={referral}
        audit={audit}
        canEdit={result.session.user.role === 'dg'}
      />
    );
  }
  ```

- [ ] **Step 2:** Client component layout (three sections + audit):
  - **Header:** Reference number, status badge, agency, title, "Download PDF" button (links to `/api/referrals/[id]/pdf`)
  - **Section 1 — Referral Details:** all original submission fields (read-only display, but DG can edit recommendation/background/current_status when status === 'drafted'; show "Submit" + "Delete Draft" actions in that case)
  - **Section 2 — Delivery Log:** delivery_method (select), delivered_to (text), delivered_at (shown read-only after save)
  - **Section 3 — Outcome Log:** minister_direction (textarea), direction_logged_at (read-only), closure_note (textarea), closed_at (read-only)
  - **Status override:** small "Override status" button (DG only) → opens a tiny popover with a select + reason textarea → PATCH with `manualOverrideReason`
  - **Audit log:** Render chronological list using `ReferralAuditList`

- [ ] **Step 3:** PATCHes from this page hit `/api/referrals/[id]` directly. After success, `router.refresh()` to reload server data.

- [ ] **Step 4: Commit**
  ```bash
  git add app/referrals/[id]/page.tsx app/referrals/_components/
  git commit -m "feat(referrals): DG detail view with delivery and outcome logs"
  ```

---

### Task 23: Minister view — `/minister/referrals` list

**Files:**
- Create: `app/minister/referrals/page.tsx`
- Create: `app/minister/referrals/_components/MinisterReferralsList.tsx`

- [ ] **Step 1:** Server component restricting to `requireRole(['minister'])`. Calls `listReferralsForMinister()`. Renders a simple sortable list with reference number, agency, title, requested action, status, submitted_at.

- [ ] **Step 2: Commit**
  ```bash
  git add app/minister/referrals/page.tsx app/minister/referrals/_components/MinisterReferralsList.tsx
  git commit -m "feat(referrals): minister inbound list view"
  ```

---

### Task 24: Minister view — detail page

**Files:**
- Create: `app/minister/referrals/[id]/page.tsx`
- Create: `app/minister/referrals/_components/MinisterReferralActions.tsx`

- [ ] **Step 1:** Server component renders the document inline using web-formatted styled blocks that mirror the PDF order: Letterhead (HTML version), Ref + Date, Addressee, Subject, Background, Current Status, Recommendation, Requested Action, Signature block. The browser view uses the app default (Outfit via `next/font/google`) — the PDF renders Inter, but the inline web view stays on the web stack. Navy/gold palette only on the letterhead; body in black.

- [ ] **Step 2:** Below the document, render `MinisterReferralActions`:
  - "Download PDF" button → `/api/referrals/[id]/pdf`
  - "Mark Acknowledged" button → POST `/api/referrals/[id]/acknowledge`. Disabled if already acknowledged.
  - "Add Note" textarea (em-dash live check) → POST `/api/referrals/[id]/note`
  - List existing `minister_notes` as plain blockquotes

- [ ] **Step 3:** `requireRole(['minister'])`. If `referral.status === 'drafted'`, 404.

- [ ] **Step 4: Commit**
  ```bash
  git add app/minister/referrals/[id]/page.tsx app/minister/referrals/_components/MinisterReferralActions.tsx
  git commit -m "feat(referrals): minister detail with inline document and actions"
  ```

---

### Task 25: Source-item status banner

**Files:**
- Create: `components/referrals/ReferralSourceBanner.tsx`
- Modify: `components/procurement/ProcurementCard.tsx` (kanban tile — primary card surface)
- Modify: `components/procurement/ProcurementDetailPanel.tsx` (drawer — secondary surface)
- Modify: `lib/referrals/queries.ts` (add batched variant)
- Modify: the server-side fetcher that builds the procurement kanban data — locate at execution start with `grep -rn "listTenders\b" app/ lib/` to identify the call site that feeds `ProcurementKanban`. Attach `activeReferral` to each tender row there.

- [ ] **Step 1:** Implement `ReferralSourceBanner`:
  ```tsx
  // components/referrals/ReferralSourceBanner.tsx
  import { STATUS_LABELS, type ReferralStatus } from '@/lib/referrals/types';

  export interface ActiveReferralBrief {
    reference_number: string;
    status: ReferralStatus;
    submitted_at: string;
  }

  export function ReferralSourceBanner({ referral }: { referral: ActiveReferralBrief | null }) {
    if (!referral) return null;
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Guyana',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(referral.submitted_at));
    return (
      <div className="text-xs text-gold-500 bg-navy-800 border border-navy-700 rounded px-2 py-1 mt-2">
        Referred to Minister {date}, Ref {referral.reference_number}. Status: {STATUS_LABELS[referral.status]}.
      </div>
    );
  }
  ```

- [ ] **Step 2:** Add the batched query helper to `lib/referrals/queries.ts`:
  ```ts
  export async function getActiveReferralsForSources(
    sourceType: ReferralSourceType,
    sourceIds: string[],
  ): Promise<Map<string, ActiveReferralBrief>> {
    if (sourceIds.length === 0) return new Map();
    const { data, error } = await supabaseAdmin
      .from('ministerial_referrals')
      .select('source_id, reference_number, status, submitted_at')
      .eq('source_type', sourceType)
      .in('source_id', sourceIds)
      .not('status', 'in', '(drafted,closed)')
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    // First row per source_id wins (newest by submitted_at desc).
    const out = new Map<string, ActiveReferralBrief>();
    for (const row of data ?? []) {
      if (!row.source_id || out.has(row.source_id)) continue;
      out.set(row.source_id, {
        reference_number: row.reference_number!,
        status: row.status,
        submitted_at: row.submitted_at!,
      });
    }
    return out;
  }
  ```

- [ ] **Step 3:** Locate the server fetcher:
  ```bash
  grep -rn "listTenders\b" app/ lib/
  ```
  In the call site that hydrates the kanban/list, after the tender array is built, call `getActiveReferralsForSources('tender', tenders.map(t => t.id))` and attach `activeReferral` to each tender object (extend the tender view-model type at that boundary — do not change the canonical `Tender` type).

- [ ] **Step 4:** Render `<ReferralSourceBanner referral={tender.activeReferral ?? null} />` inside the body of both `ProcurementCard.tsx` (below the existing stage / metadata block, above any footer) and `ProcurementDetailPanel.tsx` (top of the panel, below the title).

- [ ] **Step 5: Commit**
  ```bash
  git add components/referrals/ReferralSourceBanner.tsx components/procurement/ProcurementCard.tsx components/procurement/ProcurementDetailPanel.tsx lib/referrals/queries.ts <modified-fetcher-file>
  git commit -m "feat(referrals): show referral status banner on procurement card and detail panel"
  ```

---

### Task 26: Verification, /simplify, push, deploy

- [ ] **Step 1:** Type-check + build:
  ```bash
  npx tsc --noEmit
  npm run build
  ```
  Both must pass cleanly.

- [ ] **Step 2:** Run unit tests:
  ```bash
  npm test
  ```
  All referral test suites pass.

- [ ] **Step 3:** Manual end-to-end smoke (as DG Keisha Crighton):
  1. Visit `/`; the Most Urgent card shows "Top urgency for X days. Last escalation: none." with single **Escalate** button.
  2. Click Escalate → select **Refer to Minister** → form is pre-filled (tender title, agency, etc.).
  3. Fill recommendation (>= 50 chars, no em-dashes) → try typing "—" → button is disabled with inline error → remove → Submit. Toast shows `MPUA-MR-2026-0001`.
  4. Visit `/referrals` → row appears with status "Submitted". Click → detail view.
  5. Click **Download PDF** → letterhead, Inter body, sections render correctly with weight-based hierarchy.
  6. Add Delivery Method = "email", Delivered To = "minister@mpua.gov.gy" → save. Audit log shows 3 rows (delivery_method, delivered_to, delivered_at).
  7. Add Minister Direction = "Approved with conditions" → save. Status becomes "Direction Given", and a notification appears in the bell with the preview.
  8. Reopen Most Urgent card on `/` → meta line now reads "Last escalation: Referred to Minister, 16 May 2026, MPUA-MR-2026-0001."
  9. Open the tender card that was referred → status banner appears.
  10. Add closure note → status becomes "Closed".
  11. As Minister (signed in as Deodat Indar, the existing `role='minister'` account): visit `/minister/referrals` → see only non-drafted. Open one → see inline document rendered in Outfit body + JetBrains Mono Ref/Date line. Click Acknowledge → status becomes "With Minister" (or if direction already given, no change). Add a note → appears below in the notes list.
  12. Try to delete a submitted referral via the API → 409.

- [ ] **Step 4:** Run `/simplify` from the workspace, accept reasonable suggestions.

- [ ] **Step 5:** Commit and push:
  ```bash
  git add -A
  git commit -m "chore(referrals): final cleanup pass" || true   # only if /simplify changed anything
  git push origin <branch>
  ```

- [ ] **Step 6:** Open a PR and deploy preview. Confirm preview build is green; verify the smoke flow once on the preview URL. Then promote / merge per project workflow. (Per memory: never deploy to dashboard.mpua.gov.gy; alias to dg-work-os.vercel.app.)

---

## Self-Review checklist

- **Spec coverage**
  - Data model: every column in the spec exists in Task 1's DDL, including `delivered_at`, `minister_acknowledged_at`, all enums. ✓
  - Reference number `MPUA-MR-YYYY-NNNN` sequential, never reused: Task 1 (sequence) + Task 6 (formatter). ✓
  - Audit log table: Task 2. ✓
  - Most Urgent card: single Escalate button + meta line: Tasks 19 + 20. ✓
  - Refer to Minister + NPTAB stub: Task 18 (EscalateModal). ✓
  - DG view + filters + audit log render: Tasks 21–22. ✓
  - Status transitions tied to log entries: Task 7 (state machine) + Task 10 (queries) + Task 13 (PATCH). ✓
  - Manual override DG-only: Task 13 + 22. ✓
  - Minister view: Tasks 23–24. ✓
  - Status echo on source card: Task 25. ✓
  - Notify DG when direction logged: Task 16. ✓
  - PDF formatting: Task 11 (Inter single-family, letterhead, sections, signature, Guyana-local date format). ✓
  - Em-dash rejection everywhere: Task 5 (helper), DB CHECK constraints (Task 1), API enforcement in Tasks 12–15, UI live check in Tasks 18 & 24. ✓
  - Drafts deletable; submitted referrals not deletable but closable: Task 10 (`deleteDraftReferral`) + Task 13. ✓
  - Access control: DG full, PS read-only, Minister scoped to /minister/referrals: enforced via `requireRole` in every API route + page. Keisha needs no extra setup — already has `dg` role. ✓

- **Placeholder scan:** No "TBD", no "implement later", no "similar to Task N", no "add appropriate error handling" without specifics. Code blocks present in every coding step.

- **Type consistency:** `ReferralStatus`, `ReferralSourceType`, `ReferralRequestedAction`, `ReferralDeliveryMethod` defined once in `lib/referrals/types.ts`, referenced everywhere. `ReferralPreFill` shape used by both `composeTenderPreFill` and `composeProjectPreFill`. `STATUS_LABELS` used in both `ReferralSourceBanner` and the detail page.

---

## Open questions for the user — all resolved

1. **Keisha access:** Already has DG role, no migration needed.
2. **Minister test account:** Deodat Indar holds the `role='minister'` account; Task 26 smoke step 11 runs as Deodat Indar. No seed user needed.
3. **Tender card location:** Resolved at planning time — `components/procurement/ProcurementCard.tsx` (kanban) and `components/procurement/ProcurementDetailPanel.tsx` (drawer). The server fetcher feeding `ProcurementKanban` is identified at execution start via `grep -rn "listTenders\b" app/ lib/` (Task 25 Step 3).

---

## Changes applied versus the original plan (record of corrections)

This plan was revised after the original draft. Material changes:

1. **PDF font: Inter single-family** (already shipped in `/public/fonts/`, established convention from `lib/pdf/intel-brief-render.tsx`). Original draft used Times-Roman; an interim revision used Outfit + JetBrains Mono; final decision is Inter throughout — no new font binaries. Web inline view (Task 24) continues to use the web app default (Outfit via `next/font/google`) since it renders in the browser, not the PDF.
2. **`referred_by` FK changed from `ON DELETE SET NULL` to `ON DELETE RESTRICT`.** Contradicted `NOT NULL`. Referrals cannot be orphaned by user deletion; user deletion now requires resolving their referrals first.
3. **PS read-only access granted in `modules` seed (Task 3).** Previously deferred; now `default_roles = ['dg', 'ps']` for `ministerial-referrals`. API layer still uses `requireRole(['dg', 'ps'])` for GETs and `requireRole(['dg'])` for mutations — alignment confirmed in Decision 5.
4. **Reference-number year computed in Guyana local time** (`America/Guyana`, UTC-4, no DST) instead of UTC. `allocateReferenceNumber()` now takes no arg and derives the year from `Intl.DateTimeFormat`. Unit tests cover the Dec 31 boundary.
5. **Minister direction notification preview truncated to 80 chars + `…`** instead of 240. Full text only visible by clicking through.
6. **PDF render failure on submit rolls back the transaction.** Status stays drafted, no reference number persisted, audit not written. Sequence value is consumed (gap acceptable; reuse forbidden).
7. **SQL comment added to `ministerial_referrals`** documenting that all rows are addressed to the Minister by construction, with a forward-looking note about an `addressed_to` column if/when other principals are added.
8. **Tender card path resolved before execution** — Decision 8 and Task 25 now name `ProcurementCard.tsx` and `ProcurementDetailPanel.tsx`.
9. **Minister test account resolved** — Deodat Indar (Task 26 Step 3 sub-step 11).
