# Ministerial Referrals: simplification audit

Date: 2026-05-19
Status: proposal, awaiting approval. No code or migrations have been changed.
Author: Claude (audit on `fix/intel-viewall-agency-filter`)

This document is read-only analysis plus one recommended simplification. Do not implement until approved.

---

## TL;DR

The module today is a formal correspondence ledger glued onto a feature whose stated job is "a focused task list for items needing the Minister's attention." It carries roughly 3,000 lines of dedicated code (lib + UI + API + tests + migrations) and a dedicated SQL surface (2 tables, 4 enums, 1 sequence, 5 indexes, 1 trigger, 2 RLS-policied tables, 7 em-dash CHECK constraints).

If the stated framing is taken at face value, ~70% of this can be deleted. The remaining ~30% is genuinely load-bearing: the formal PDF letter, the reference number, source linkage to tenders/projects/tasks, role gating, and the cross-page status banner.

There is one critical fork the user has to answer before this can be merged: **is the formal PDF letter (`MPUA-MR-YYYY-NNNN` letterhead + signed memo) load-bearing, or is it scope creep dressed up as a feature?** The whole simplification hinges on this. The plan below assumes "yes, the letter stays" and slims around it. If the answer is "no, drop the letter too," the module collapses to a saved filter on `tasks` and most of the proposed schema goes away as well.

---

## Phase 1: Inventory

### 1a. Code surface area

| Path | LOC | What it does |
|---|---:|---|
| `supabase/migrations/114_ministerial_referrals.sql` | 105 | Table, 4 enums, sequence, indexes, RLS, 7 em-dash CHECKs, recommendation length CHECK, updated_at trigger |
| `supabase/migrations/115_referral_audit_log.sql` | 36 | Append-only audit log table + RLS |
| `supabase/migrations/116_referrals_modules_seed.sql` | 13 | Registers `ministerial-referrals` and `minister-referrals` module slugs |
| `supabase/migrations/117_referral_fk_cascade_fix.sql` | 15 | Fixes FK cascade contradiction from 115 |
| `supabase/migrations/118_referrals_source_type_add_task.sql` | 4 | Adds `task` to `referral_source_type` enum |
| `lib/referrals/types.ts` | 95 | Enum constants, label maps, `Referral` + `ReferralAuditEntry` + `ReferralSummary` + `ReferralWithReferrer` |
| `lib/referrals/queries.ts` | 427 | listReferrals, getReferralById, getReferralAuditLog, createReferralDraft, submitReferral (PG transaction + reference allocation + PDF render-as-validation), updateReferralFields, appendMinisterNote (atomic concat), deleteDraftReferral |
| `lib/referrals/pre-fill.ts` | 206 | Composes auto-pre-fill text for tender / project / task sources |
| `lib/referrals/source-lookup.ts` | 56 | `getActiveReferralForSource`, `getActiveReferralsForSources` for cross-page banner |
| `lib/referrals/audit.ts` | 47 | `writeAuditEntries`, `writeAuditEntriesTx` for the audit log |
| `lib/referrals/status-machine.ts` | 35 | `deriveNextStatus(current, trigger, manualTarget?)` for 6 triggers |
| `lib/referrals/reference-number.ts` | 41 | `MPUA-MR-YYYY-NNNN` allocation with Guyana-tz year |
| `lib/referrals/em-dash-guard.ts` | 22 | `containsEmDash`, `rejectEmDash`, `stripEmDash`, `EmDashError` |
| `lib/pdf/referral-render.tsx` | 118 | `@react-pdf/renderer` letterhead memo, A4, Inter fonts |
| `app/api/referrals/route.ts` | 147 | GET list (dg, ps); POST draft/submit (dg) |
| `app/api/referrals/[id]/route.ts` | 139 | GET detail (dg, ps); PATCH (dg); DELETE draft (dg); notification on direction-given |
| `app/api/referrals/[id]/pdf/route.ts` | 45 | GET regenerated PDF (dg, ps, minister) |
| `app/api/referrals/[id]/note/route.ts` | 45 | POST minister note (minister) |
| `app/api/referrals/[id]/acknowledge/route.ts` | 35 | POST minister acknowledge (minister) |
| `app/api/referrals/pre-fill/route.ts` | 24 | GET pre-fill payload for source (dg) |
| `app/referrals/page.tsx` | 27 | DG list page |
| `app/referrals/[id]/page.tsx` | 45 | DG detail page |
| `app/referrals/_components/ReferralsTable.tsx` | 140 | Client table, status + agency filters |
| `app/referrals/_components/ReferralDetailClient.tsx` | 353 | DG edit panel: delivery, direction, closure, manual override, audit |
| `app/referrals/_components/ReferralAuditList.tsx` | 34 | Renders audit log |
| `app/minister/referrals/page.tsx` | 24 | Minister list page |
| `app/minister/referrals/[id]/page.tsx` | 86 | Minister detail (renders memo inline) |
| `app/minister/referrals/_components/MinisterReferralsList.tsx` | 59 | Minister table |
| `app/minister/referrals/_components/MinisterReferralActions.tsx` | 124 | Minister acknowledge + add note |
| `components/referrals/NewReferralButton.tsx` | 28 | "New Referral" entry on /referrals (opens EscalateModal) |
| `components/referrals/ReferralStatusBadge.tsx` | 19 | Status pill |
| `components/referrals/ReferralSourceBanner.tsx` | 30 | "Referred to Minister … MPUA-MR-…" banner on tender / project rows |
| `components/today/EscalateModal.tsx` | 136 | SlidePanel with a 2-button menu (Refer / Queue for NPTAB) + form mount; also referral-aware |
| `components/today/ReferralForm.tsx` | 293 | The form (loads pre-fill, validates, saves draft or submits) |
| `components/today/UrgentHero.tsx` | 167 | Hero card; reads `lastEscalation` from signal payload |
| `tests/unit/referrals/em-dash-guard.test.ts` | 36 | Em-dash unit tests |
| `tests/unit/referrals/reference-number.test.ts` | 31 | Reference number unit tests |
| `tests/unit/referrals/status-machine.test.ts` | 61 | Status machine unit tests |
| `tests/unit/referrals/pre-fill.test.ts` | 129 | Pre-fill composer unit tests |

Plus two consumers outside the module:

- `lib/today/signals.ts` (lines 22, 567, 568, 580): enriches Today signals with `lastEscalation` via `getActiveReferralsForSources`.
- `lib/tender/queries.ts` (lines 3, 209): enriches tender list with `activeReferral` for the banner.
- `lib/notifications.ts` (line 69, 635) + `lib/notifications/classify-tier.ts` (line 17, 108): one event type `referral_direction_given` wired in the global notification system.
- `app/nptab-reports/_components/NptabReportDetailClient.tsx` and `app/api/nptab-reports/...`: import `containsEmDash` / `EmDashError` from `lib/referrals/em-dash-guard`. The em-dash guard has crept into NPTAB code as a shared utility.

**Dedicated total: roughly 3,000 LOC across 36 files** (ignoring the two superpowers plan docs in `docs/superpowers/plans/`, which together add another ~3,200 lines of planning prose).

### 1b. Database surface area

Every object below exists only because of this module:

| Kind | Name | Notes |
|---|---|---|
| Table | `ministerial_referrals` | 28 columns, including 6 lifecycle timestamps, 4 enum columns, 7 em-dash CHECKs, recommendation min-length CHECK |
| Table | `referral_audit_log` | 6 columns, append-only, RLS |
| Enum | `referral_source_type` | tender, project, agency_issue, task, other |
| Enum | `referral_requested_action` | review, decision, intervention, information |
| Enum | `referral_status` | drafted, submitted, with_minister, direction_given, closed |
| Enum | `referral_delivery_method` | email, hand_delivered, in_meeting, other |
| Sequence | `referral_ref_seq` | Global monotonic, never recycled |
| Index | `referrals_status_idx`, `referrals_agency_idx`, `referrals_referred_by_idx`, `referrals_submitted_at_idx`, `referrals_source_idx`, `referral_audit_log_referral_idx` | 6 indexes total |
| RLS policy | `referrals_service_role`, `referrals_authenticated_select`, `audit_service_role`, `audit_authenticated_select` | service_role read+write, authenticated read-only |
| Trigger | `set_referrals_updated_at` | reuses generic `update_updated_at_column()` |
| FK | `referred_by -> users(id)` ON DELETE RESTRICT; `referral_id -> ministerial_referrals(id)` ON DELETE CASCADE; `changed_by -> users(id)` ON DELETE RESTRICT (after the 117 fix) |
| Module slugs | `ministerial-referrals` (dg, ps), `minister-referrals` (minister) in the `modules` table |

No views. No stored procedures. No materialized state outside the two tables. Migration 117 exists only to fix a contradiction introduced by 115 (NOT NULL combined with ON DELETE SET NULL).

### 1c. Behavior and lifecycle

**Entry points (how a referral is created):**

1. From `UrgentHero` on `/today` (Most Urgent card): user clicks Escalate, picks "Refer to Minister" in the SlidePanel menu, form is pre-filled from the source signal (tender / project).
2. From `TaskDetailPanel` (Task Board): same EscalateModal, sourceType `task`, pre-fill from the task row.
3. From `ProjectDetailPanel` in delayed-projects: same EscalateModal, sourceType `project`.
4. From `/referrals` itself: "New Referral" button mounts the same EscalateModal with sourceType `other` and no sourceId. This is the only sourceless path.

In all four cases the entry point is the SAME `EscalateModal` -> `ReferralForm`.

**Lifecycle (the 5-state machine):**

1. `drafted` -> save without submit; partial validation; deletable.
2. `drafted -> submitted` on submit: PG transaction allocates a reference number, validates recommendation >= 50 chars, renders the PDF as a validation step then throws the buffer away, sets `submitted_at`.
3. `submitted -> with_minister` on Minister acknowledge.
4. `submitted | with_minister -> direction_given` when DG logs Minister direction. Fires `referral_direction_given` notification to the original DG referrer.
5. `submitted | with_minister | direction_given -> closed` when DG saves a closure note.
6. Manual status override (DG only, requires reason) writes status + reason to the audit log.
7. Drafts may be deleted. Submitted referrals are immortal (must be closed instead).

`delivered_at`, `direction_logged_at`, `closed_at` are filled automatically when the corresponding field is first set.

**Who can do what:**

- DG: create, edit, submit, deliver, log direction, close, manually override, delete drafts, download PDF.
- PS: read-only across DG views (list + detail + PDF). Cannot mutate.
- Minister: read submitted+ (no drafts) at `/minister/referrals`, acknowledge, append notes, download PDF.
- Everyone else: no access.

**Side effects:**

- One notification: `referral_direction_given` to the original DG referrer when Minister direction is logged, mapped to tier `important`.
- Two read-side enrichments: `lib/today/signals.ts` attaches `lastEscalation` to tender_sla and delayed_project signals; `lib/tender/queries.ts` attaches `activeReferral` to tender list rows.
- `ReferralSourceBanner` renders in `components/procurement/ProcurementCard.tsx` (kanban tile) and `components/procurement/ProcurementDetailPanel.tsx` (drawer).

**UI surface:**

- `/referrals` (dg, ps): table + 5 status pill filters + agency dropdown + "New Referral" button (dg only).
- `/referrals/[id]` (dg, ps): detail with 5 panels (Details, Delivery Log, Outcome Log, Override status, Audit log).
- `/minister/referrals` (minister): table.
- `/minister/referrals/[id]` (minister): inline letter render + acknowledge + add-note + download PDF.
- `EscalateModal` SlidePanel from anywhere in the app.
- `ReferralSourceBanner` on tender cards and tender detail.
- `UrgentHero` shows "Last escalation: Referred to Minister, <date>, <ref-number>" when present.

### 1d. Three-layer em-dash rule check

- **Layer 1 (DB):** 7 CHECK constraints on `ministerial_referrals` columns (title, background, current_status, recommendation, closure_note, minister_direction, minister_notes). Defined in 114.
- **Layer 2 (API):** `rejectEmDash` and `EmDashError` in `lib/referrals/em-dash-guard.ts`. Called from `lib/referrals/queries.ts` via `guardEmDashes()` in createReferralDraft, submitReferral, updateReferralFields, and from `appendMinisterNote` directly. Routes translate `EmDashError` into a 422 response. **This guard has leaked into NPTAB code** (`app/api/nptab-reports/queue/route.ts`, `app/api/nptab-reports/[id]/route.ts`, `app/nptab-reports/_components/NptabReportDetailClient.tsx`) which now imports from `@/lib/referrals/em-dash-guard`. The guard is no longer module-local.
- **Layer 3 (UI):** `containsEmDash` is used in `ReferralForm`, `ReferralDetailClient`, `MinisterReferralActions` to render a red hint and to disable the submit button.

**Flag:** the API layer (Layer 2) is duplicative work. The DB CHECK already produces a constraint-violation error (Postgres `23514`) on every field. Layer 2 exists to translate that into a nicer message earlier. The translation could be done at the error-handler boundary instead of by guarding every patch object up front. Layer 1 + Layer 3 + a single shared error-mapper would be cleaner and have the same UX.

**Flag:** the em-dash guard's adoption by NPTAB means deleting `lib/referrals/em-dash-guard.ts` will break NPTAB. Any simplification needs to either preserve this file (move it to `lib/text/`) or refactor NPTAB to a generic validator.

---

## Phase 2: Diagnose

### What is the module actually doing today vs. what it needs to do?

**Stated job (per the prompt):** surface items that require the Minister's attention as a focused task list.

**Actual job today:** a parallel formal-correspondence ledger that:

1. Issues a unique reference number per submission, Guyana-tz aware.
2. Renders a formal A4 PDF letter with letterhead, addressee, subject, four sections, and signature block.
3. Tracks delivery method, who it was delivered to, and when.
4. Tracks Minister's direction text and timestamp.
5. Tracks closure note and timestamp.
6. Maintains an append-only per-column audit log of every change.
7. Runs a 5-state lifecycle with a state machine helper and dedicated tests.
8. Auto-pre-fills the form from tender, project, or task sources.
9. Bans em-dashes at three layers across 7 columns.
10. Renders a back-banner on source items so tenders / projects know they've been escalated.
11. Lets the Minister acknowledge and write back notes.
12. Lets the DG manually override status with a reason.

Items 1, 2, 8, 10 are correspondence machinery and source linkage. Items 3 through 7, 9, 11, 12 are lifecycle, audit, and writing-style policy that the stated framing does not call for.

The mismatch is glaring. The module is two products in one trench: a "ledger of formal letters from DG to Minister" and a "Minister's attention queue."

### Over-engineering, ranked

1. **Two-table parallel-universe schema for a task-style entity.** Cost: high. Everything bends around it: a dedicated form, a dedicated list view, a dedicated detail view, a dedicated audit table, a dedicated state machine, a dedicated reference number, a dedicated banner. Reason it exists: the original spec scoped this as a formal-correspondence ledger, not a flag on tasks. Why unnecessary: items 3-7 listed above duplicate things the `tasks` table already does (status, assignee, due, notes, activity, agency) or would be straightforward to add as one or two columns.

2. **5-status state machine + dedicated state machine helper + dedicated tests.** Cost: medium-high. `status` is redundant with the timestamp columns: `submitted_at`, `delivered_at`, `direction_logged_at`, `closed_at` already encode the same lifecycle, fully ordered. The state machine exists to provide three things: input validation ("don't submit twice"), nicer enum read-side, and an exception path for manual override. A simpler "is_open boolean / closed_at timestamp" model would do the work of items 1-7 of the state machine with no dedicated module.

3. **Append-only per-field audit log table + transactional cross-table writes.** Cost: high (operational complexity, RLS, dedicated lib, the FK cascade contradiction we already had to fix in 117). Reason: defensiveness about formal correspondence trails. Why suspect: tasks and projects in this repo do not have anything like this. There is no compliance requirement documented anywhere in the repo (`grep -i audit docs/` finds no policy). If audit becomes a real requirement, it would be cheaper to add a generic activity-log table once across tasks and referrals, not a per-feature log.

4. **Em-dash policy enforced at three layers across seven columns.** Cost: medium. It is a writing-style preference, not a correctness invariant. The leak into NPTAB shows this preference has begun to spread without a home. Right answer: one validator module (rename to `lib/text/punctuation-guard.ts`), one DB CHECK on the columns that need it for the rendered PDF (the four memo sections), drop the rest, keep the UI hint.

5. **Reference number sequence + Guyana-tz year math + unit tests for tz edge cases.** Cost: low-medium. Justified if and only if formal PDFs are load-bearing. If we keep the PDF, this stays. If we drop the PDF, this whole helper can go.

6. **`drafted` status + dedicated draft semantics + delete-draft path + 50-character minimum check.** Cost: medium. Drafts are a feature in service of the formal-letter framing ("I'm composing a letter, save my work, let me review before signing"). If the artifact is just "flag a task for the Minister's attention with a note," draft mode is moot.

7. **`delivery_method`, `delivered_to`, `delivered_at`, `minister_direction`, `minister_acknowledged_at`, `minister_notes` as separate columns with timestamp side-effects in the update path.** Cost: medium. These are six fields and three implicit timestamps glued on for tracking the lifecycle of a single physical letter. Most of this can be expressed as task comments / notes if we collapse to tasks.

8. **Manual status override with `manualOverrideReason` and a dedicated audit entry format `<new_state>|reason=<text>`.** Cost: low. Exists only because the lifecycle is complicated enough to need an escape hatch. Goes away when the lifecycle simplifies.

9. **Notes-as-text-concatenation with a PG `FOR UPDATE` lock to avoid read-modify-write races on a single column.** Cost: low-medium. The pattern in `appendMinisterNote` (lock, concat, write) is correct but is solving a problem we created by stuffing notes into one column. Comments table would be simpler.

10. **PDF render-as-validation during submit, then throw the buffer away.** Cost: low. This is genuinely weird (see `submitReferral` in `lib/referrals/queries.ts:258` and the comment "The Buffer is discarded; downloads always re-render on demand"). Either the render is part of the persistent artifact (then store it) or it is a smoke test (then run it once on save, not on every submit and again on every download).

11. **The "DG override status" panel in `ReferralDetailClient`.** Cost: low. Live UI for a path that should be rare. If the lifecycle simplifies, this disappears with everything else.

12. **Two sidebar entries + two module slugs for what is one concept ("referrals to the Minister").** Cost: low. Pure organizational duplication driven by role gating. A single concept-aware sidebar item gated by role would do the same work.

13. **`source_type = 'other'` plus a dedicated "sourceless" branch in `ReferralForm`** that lets the DG type a referral from nothing. Cost: low. Useful, but again only makes sense if the module remains a free-form correspondence ledger.

### What is load-bearing and must stay

1. **The PDF letter artifact**, IF formal correspondence with the Minister via signed memos is real workflow. The letter has letterhead, addressee, four sections, signature block, and is rendered in a way that the Minister can print. If the DG actually sends these, the artifact stays.
2. **The unique reference number**, only if (1) stays. Reference numbers exist to be cited.
3. **Source linkage** (`source_type` + `source_id`) is load-bearing for the back-banner on tenders and projects, which is a real UX win on `/tenders` and `/projects`.
4. **Role gating** (DG/PS read-write split, Minister read-only inbound view).
5. **The Minister's inbound view itself.** The Minister needs to see the things flagged for them, separately from the noise. This is the central framing.
6. **Two existing notifications** (`referral_direction_given`) and the `lastEscalation` payload that feeds `UrgentHero`. These are wired across the wider app.

Everything else is in scope to delete or fold.

---

## Phase 3: Plan

### Recommended end state, in 3 to 5 sentences

Keep one table (`ministerial_referrals`), keep the PDF letter, keep the reference number, and keep the source linkage. Collapse the lifecycle to two booleans (`is_open`, `minister_seen`) with three timestamps (`submitted_at`, `minister_acknowledged_at`, `closed_at`), drop the state machine, drop the audit log table in favor of using the existing notifications + a generic activity feed if one is needed later, drop the manual override path, drop `delivery_method` / `delivered_to` / `delivered_at` / `direction_logged_at`. Move `minister_notes` to a small `referral_notes` table so the lock-and-concat workaround dies. Drop em-dash CHECKs except on the four PDF-rendered fields (subject, background, current_status, recommendation), and rename `lib/referrals/em-dash-guard.ts` to `lib/text/punctuation-guard.ts` so NPTAB does not import from a feature folder. Drop the `/referrals` page entirely; replace it with a saved filter on `/tasks` and surface the formal-memo flow as a single action ("Refer to Minister") on any task. The Minister keeps `/minister/referrals` but it becomes a flat read-list with two actions (Acknowledge, Add note) and the inline memo.

**The Director General experience:** any task can be flagged "Refer to Minister." Doing so opens the existing form, generates a memo, allocates a reference number, persists the row, and links the task to it. The task becomes the single source of truth for "what is this about." The `ministerial_referrals` row exists only to back the PDF and the reference number.

**The Minister experience:** `/minister/referrals` lists flagged items as today. Click in, read the memo, click Acknowledge or write a note. That is the whole loop.

### Data model changes

**Drop:**

- `referral_audit_log` (entire table, RLS, index, FK).
- Enum `referral_status` (replaced by booleans + timestamps).
- Enum `referral_delivery_method`.
- Columns: `delivery_method`, `delivered_to`, `delivered_at`, `direction_logged_at`.
- Six of the seven em-dash CHECKs (keep only on `recommendation`; the others are not rendered to PDF text).
- The `recommendation_min_length` CHECK that special-cases the draft state. Replace with a single >= 50 check enforced at the API boundary; drafts go away.

**Add:**

- `ministerial_referrals.is_open BOOLEAN NOT NULL DEFAULT TRUE` (UPDATE existing rows: `is_open = (closed_at IS NULL)`).
- `ministerial_referrals.minister_seen BOOLEAN NOT NULL DEFAULT FALSE` (UPDATE existing: `minister_seen = (minister_acknowledged_at IS NOT NULL)`).
- `referral_notes` table: `id, referral_id (FK ON DELETE CASCADE), author_id (FK), body, created_at`. Replaces the lock-and-concat on `minister_notes`. RLS: service_role read-write; authenticated read.
- `tasks.referral_id UUID REFERENCES ministerial_referrals(id) ON DELETE SET NULL`. So a task can advertise that it has been formally referred.

**Keep:**

- `ministerial_referrals` table, minus the dropped columns.
- `referral_ref_seq`, `MPUA-MR-YYYY-NNNN` machinery, PDF render.
- Source linkage columns `source_type`, `source_id`.
- `referred_by`, `agency`, `title`, `recommendation`, `requested_action`, `background`, `current_status`, `reference_number`, `submitted_at`, `minister_acknowledged_at`, `closed_at`, `closure_note`, `minister_direction`.
- 4 indexes (status drops; reference + agency + referred_by + submitted_at + source stay; rename `referrals_status_idx` to `referrals_open_idx ON (is_open) WHERE is_open`).

**Migration strategy for existing rows:**

The branch `feature/ministerial-referrals` was merged recently. Production data volume is small (single-digit referrals at most, almost certainly only test data on staging). A clean forward-migrate:

```sql
-- 120_referrals_simplify.sql
ALTER TABLE ministerial_referrals
  ADD COLUMN is_open BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN minister_seen BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE ministerial_referrals
SET is_open = (closed_at IS NULL),
    minister_seen = (minister_acknowledged_at IS NOT NULL);

ALTER TABLE ministerial_referrals
  DROP COLUMN delivery_method,
  DROP COLUMN delivered_to,
  DROP COLUMN delivered_at,
  DROP COLUMN direction_logged_at;

DROP TYPE IF EXISTS referral_delivery_method;

ALTER TABLE ministerial_referrals
  DROP CONSTRAINT IF EXISTS recommendation_min_length,
  DROP CONSTRAINT IF EXISTS no_em_dash_background,
  DROP CONSTRAINT IF EXISTS no_em_dash_current_status,
  DROP CONSTRAINT IF EXISTS no_em_dash_closure_note,
  DROP CONSTRAINT IF EXISTS no_em_dash_minister_direction,
  DROP CONSTRAINT IF EXISTS no_em_dash_minister_notes,
  DROP CONSTRAINT IF EXISTS no_em_dash_title;

DROP INDEX IF EXISTS referrals_status_idx;
CREATE INDEX referrals_open_idx ON ministerial_referrals(is_open) WHERE is_open;
ALTER TABLE ministerial_referrals DROP COLUMN status;
DROP TYPE IF EXISTS referral_status;

-- referral_notes
CREATE TABLE referral_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES ministerial_referrals(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_em_dash_body CHECK (position(chr(8212) IN body) = 0)
);
CREATE INDEX referral_notes_referral_idx ON referral_notes(referral_id, created_at);
ALTER TABLE referral_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_notes_service ON referral_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY referral_notes_select ON referral_notes FOR SELECT TO authenticated USING (true);

-- Backfill: copy existing minister_notes text into one referral_notes row per referral.
INSERT INTO referral_notes (referral_id, author_id, body, created_at)
SELECT id, referred_by, minister_notes, COALESCE(minister_acknowledged_at, closed_at, submitted_at, created_at)
FROM ministerial_referrals
WHERE minister_notes IS NOT NULL AND length(btrim(minister_notes)) > 0;

ALTER TABLE ministerial_referrals DROP COLUMN minister_notes;

-- tasks linkage
ALTER TABLE tasks
  ADD COLUMN referral_id UUID REFERENCES ministerial_referrals(id) ON DELETE SET NULL;
CREATE INDEX tasks_referral_idx ON tasks(referral_id) WHERE referral_id IS NOT NULL;
```

```sql
-- 121_referrals_drop_audit_log.sql
DROP TABLE IF EXISTS referral_audit_log;
```

```sql
-- 122_referrals_module_slug_collapse.sql
UPDATE modules SET default_roles = ARRAY['dg', 'ps', 'minister']
  WHERE slug = 'ministerial-referrals';
DELETE FROM modules WHERE slug = 'minister-referrals';
```

(These three migration files are listed for inspection only. Do not run.)

### API surface changes

**Remove:**

- `POST /api/referrals` `action=draft` branch (drafts go away).
- `DELETE /api/referrals/[id]` (no drafts to delete; submitted referrals can only be closed).
- `PATCH /api/referrals/[id]` fields: `delivery_method`, `delivered_to`, `status`, `manualOverrideReason`. The status pill collapses to "Open" / "Closed" derived from `is_open`.
- `POST /api/referrals/[id]/acknowledge`: keep, but the body simplifies (just flip `minister_seen = true`).

**Add:**

- `POST /api/referrals/[id]/notes`: appends to `referral_notes` (replaces the lock-and-concat path; one row per note; authored by either DG or Minister).

**Consolidate:**

- The `EscalateModal` -> `ReferralForm` flow stays as the single entry. `New Referral` button on `/tasks` opens the same modal.

**Keep:**

- `GET /api/referrals`: list with filters.
- `GET /api/referrals/[id]`: detail.
- `PATCH /api/referrals/[id]`: for `recommendation`, `background`, `current_status`, `minister_direction`, `closure_note`.
- `GET /api/referrals/[id]/pdf`: regenerated PDF on demand.
- `GET /api/referrals/pre-fill`: pre-fill from source.

### UI changes

**Delete:**

- `app/referrals/page.tsx` (the DG list page). Replaced with a `referral_id IS NOT NULL` filter on `/tasks`.
- `app/referrals/_components/ReferralsTable.tsx`.
- `app/referrals/_components/ReferralAuditList.tsx`.
- The "Override status" section, "Delivery Log" section, and (most of) the "Outcome Log" section in `ReferralDetailClient.tsx`.

**Repurpose:**

- `app/referrals/[id]/page.tsx` stays; this is the DG-side detail of a single formal memo. Trim `ReferralDetailClient` from 353 lines to roughly 120 by removing the four panels above and keeping only Details, Direction, Closure.
- `app/minister/referrals/page.tsx` and `[id]/page.tsx` stay. The acknowledge + add-note loop stays. Notes UI moves from concatenated textarea to a comments list against `referral_notes`.
- `components/today/EscalateModal.tsx` stays. The "Refer to Minister" button inside it stays. The NPTAB option in the menu is unrelated and stays.
- `components/today/ReferralForm.tsx` stays but drops the draft button (only "Submit" remains).
- `components/referrals/ReferralStatusBadge.tsx`: replace 5-state palette with 2-state (Open / Closed).
- `components/referrals/ReferralSourceBanner.tsx` stays as-is.
- `components/referrals/NewReferralButton.tsx`: move from `/referrals` to a tasks page action.

**Move (do not delete):**

- `lib/referrals/em-dash-guard.ts` -> `lib/text/punctuation-guard.ts`. NPTAB and referrals both import from the new path. The remaining DB CHECK stays only on `recommendation` and on `referral_notes.body`.

### Three-layer em rule survival

- **Layer 1 (DB):** keep CHECK only on `ministerial_referrals.recommendation` and `referral_notes.body`. Drop the other six.
- **Layer 2 (API):** stop guarding patches explicitly. Add one error mapper in `lib/api-utils.ts` that converts Postgres error code `23514` with constraint name `no_em_dash_*` into a 422 with a friendly message. Net code change: `guardEmDashes` calls in `queries.ts` removed (about 6 sites).
- **Layer 3 (UI):** keep `containsEmDash` hint exactly as today on `recommendation` in `ReferralForm` and on the note textarea in `MinisterReferralActions`. Drop the hint from `title`, `background`, `current_status`, `closure_note`, `minister_direction` in `ReferralForm` and `ReferralDetailClient`.

This is still three layers but each layer is doing the minimum it can.

### Diff size estimate (honest)

- 5 migrations added (3 listed above, plus 2 README files if we follow the repo convention).
- `lib/referrals/`: net delete ~600 LOC (audit.ts, status-machine.ts, half of queries.ts, types.ts trimmed). New code ~200 LOC (notes queries, simplified queries).
- `lib/pdf/referral-render.tsx`: untouched.
- `app/api/referrals/`: net delete ~150 LOC.
- `app/referrals/`: net delete ~480 LOC (`page.tsx`, `ReferralsTable`, `ReferralAuditList`, half of `ReferralDetailClient`).
- `app/minister/referrals/`: net change roughly 0; notes UI rewrite is a wash.
- `components/today/ReferralForm.tsx`: net delete ~50 LOC (draft button + draft state).
- `components/referrals/`: minor edits.
- `tests/unit/referrals/`: delete `status-machine.test.ts`, trim others. Net delete ~120 LOC.
- Move + rename `em-dash-guard.ts`. Update ~5 import sites.

**Net: roughly 25 files touched, around -1,200 LOC of code, -100 LOC of SQL definitions, +3 migration files (~150 LOC).**

After: roughly 1,700 LOC dedicated to the feature, down from 3,000. About a 43% reduction.

### Risks and what could go wrong

1. **Existing `minister_notes` is a multi-line concatenated text blob.** The backfill into `referral_notes` produces one row per referral with the entire concatenated history. Acceptable if volume is small. If any referral has many entries, the timeline ordering will be lost (the `created_at` we set is one timestamp for the whole blob). Document this. Audit current data on staging before running the migration.
2. **The `referral_audit_log` is being thrown away.** If anyone has been quietly relying on it for compliance, this matters. The audit log appears unreferenced outside the module itself, so the risk is low but should be confirmed with the DG before drop.
3. **`drafted` state is going away.** If any production referrals are currently in `drafted` state, the migration needs to either submit them or delete them. The migration above does not handle this. Add a guard: `SELECT count(*) FROM ministerial_referrals WHERE status = 'drafted'` and decide one of (delete / promote / abort) before applying.
4. **Em-dash CHECK drops are irreversible without a new migration**, but reapplying the CHECK on existing data is straightforward if a row sneaks one in.
5. **The decision to drop the formal correspondence machinery is exactly the question the user has to answer.** If the answer is "no, the letter stays," this plan applies. If the answer is "yes, drop the letter," then the migration is much more aggressive (drop the whole `ministerial_referrals` table; add a `requires_minister_attention` flag on `tasks`; delete `lib/pdf/referral-render.tsx`, the reference-number module, the source-pre-fill module, the EscalateModal "Refer to Minister" button) and the diff doubles in size in the deletion direction.
6. **The Minister sidebar slug `minister-referrals` is being collapsed.** If any per-role default-modules logic relies on the distinct slug, that breaks. The collapse migration above sets the Minister role on the unified slug; verify the sidebar's role-aware rendering still picks it up for `minister`.
7. **`tasks.referral_id` adds a new FK on a hot table.** Index is conditional so the cost is low. Confirm.
8. **NPTAB consumers of `EmDashError` and `containsEmDash` need to update their imports** in lockstep with the rename. One PR, both touched.

### Test plan

1. **Migration smoke test:** apply the three migrations on a staging snapshot. Inspect: every `closed_at IS NULL` row has `is_open = TRUE`; every acknowledged row has `minister_seen = TRUE`; no `minister_notes` data is lost (compare `SELECT id, length(minister_notes) FROM ministerial_referrals_backup` to row counts in `referral_notes`).
2. **Unit:** existing `em-dash-guard.test.ts`, `reference-number.test.ts`, `pre-fill.test.ts` should still pass after the rename. `status-machine.test.ts` deletes.
3. **API contracts:** GET list, GET detail, GET pdf, POST submit, POST acknowledge, POST notes, PATCH (recommendation + closure_note) all return 2xx; mutations are gated to DG / Minister respectively; PS gets read-only.
4. **PDF render:** `MPUA-MR-YYYY-NNNN` reference number on a fresh submission renders correctly with the trimmed schema.
5. **Cross-page banner:** `lib/today/signals.ts` and `lib/tender/queries.ts` consumers still work after `status` is dropped (they currently filter on `status NOT IN (drafted, closed)` in `source-lookup.ts`; rewrite to `is_open = TRUE`).
6. **Notifications:** `referral_direction_given` still fires when `minister_direction` is freshly set.
7. **Browser smoke (manual or Playwright):** as DG, refer a task to the Minister; download the PDF; log a direction; close; verify the task row links to the referral. As Minister, see the inbound list; acknowledge; add a note; verify it appears in the DG view.

---

## Phase 3b: Secondary options considered and rejected

**Option A: Delete the module entirely. Replace with a `requires_minister_attention` boolean on `tasks` + a saved view.**

Rejected because the PDF letter is, on inspection, a real artifact. The DG renders these, the Minister reads them, and the reference number is cited. Dropping the artifact loses real workflow value. If the user disagrees and says "the letters are theatre," Option A becomes the right move and the simplification gets larger.

**Option B (current pick): keep one table backing the PDF artifact; slim everything else.**

Defended above.

**Option C: Generic activity-log table + keep the existing referrals lifecycle.**

Rejected because it solves the "audit log feels wrong" sub-problem but leaves the bigger problem (5-state machine, delivery tracking, manual override, em-dash machinery) untouched. We would still have a parallel-universe schema with a marginally tidier audit story.

**Option D: Materialize the PDF on submit and store it in Supabase Storage; remove the on-demand renderer.**

Rejected as orthogonal. Worth considering separately later but does not address the over-engineering claim.

---

## Phase 4: Stop

This file is the audit and the plan. No code or migrations have been changed.

**Question for the user before proceeding:**

1. Is the formal PDF letter (MPUA-MR-YYYY-NNNN with letterhead and signature block) load-bearing, or scope creep?
2. Does the DG ever actually use the manual status override path? (`ReferralDetailClient` "Override status" panel.)
3. Are there any compliance or audit requirements for `referral_audit_log` that are not visible in the repo?

Answer these and one of the two paths (Option B as written, or Option A as a fallback) becomes the implementation plan.
