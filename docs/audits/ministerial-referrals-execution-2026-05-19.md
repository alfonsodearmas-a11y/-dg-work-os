# Ministerial Referrals: execution plan (Option A, the tasks-flag collapse)

Date: 2026-05-19
Status: proposal, awaiting approval. No code or migrations have been changed.

Read `ministerial-referrals-simplification-2026-05-19.md` for the prior inventory and diagnosis. Option B in that doc is discarded. This plan executes Option A: kill the parallel-universe schema, collapse to a flag on `tasks`.

---

## 1. Phase 1 re-grep: what the prior audit missed

Five concrete findings beyond what the audit doc already captured.

1. **`tasks` does not currently have `source_type` / `source_id` columns.** Only `source_meeting_id` (TEXT) and a NOT NULL `source` column representing the creation channel ('manual', 'meeting', etc.). The prompt's plan implicitly requires tender/project linkage on tasks for the banner and for `lib/today/signals.ts`. We must add new columns and we must avoid the name collision with `tasks.source`.
   - Proposed names: `linked_source_type TEXT` (CHECK in `('tender','project')`) and `linked_source_id TEXT`. NULL when a flagged task was not created from an upstream entity.
2. **`task_comments` table exists** (`supabase/task-comments.sql`) with schema `(id, task_id, user_id, body, parent_id, created_at, updated_at)`, RLS enabled, full API at `app/api/tasks/[id]/comments/route.ts`. The Minister-note loop can use this directly. No `referral_notes` table will be created.
3. **`task_activity` table exists** (`supabase/task-activity.sql`) and already records actions like `'commented'`, `'assigned_to'`, `'created'`. Refer / acknowledge / minister-close should write activity rows here for parity with the rest of the task system. Free, already wired into the task detail UI via `TaskActivityLog`.
4. **`lib/today/types.ts` imports `ReferralStatus` from `@/lib/referrals/types`** at line 6 and uses it inside the `TodaySignalLastEscalation` interface. Deleting `lib/referrals/` breaks this file. The rewrite drops `TodaySignalLastEscalation`'s reference-number / status fields and replaces them with a single nullable task pointer.
5. **Em-dash guard leak into NPTAB confirmed at three sites:**
   - `app/api/nptab-reports/queue/route.ts` (imports `EmDashError`)
   - `app/api/nptab-reports/[id]/route.ts` (imports `EmDashError`)
   - `app/nptab-reports/_components/NptabReportDetailClient.tsx` (imports `containsEmDash`)
   These must be updated in the same commit that moves the file.

Non-findings worth recording:

- The module-access table is named `user_module_access`, not `module_access`. The audit text mentioned slugs correctly; the schema-rename point is for the migration to use the right table.
- The PSIP nag's `trigger_kind = 'escalation'` and the `escalateProject` flow on `/projects/[id]/escalate` are **not** related to ministerial referrals. They set `projects.escalated = true` and send a different notification. Leave them alone.
- Module-access UI (`/admin/people`, `/admin/users`, `lib/modules/access.ts`) reads slugs out of the `modules` table. The slug delete in migration 124 is safe because there are zero rows in `user_module_access` for the two old slugs (verified below).

## 2. Staging row counts

Queried `dg-command-center` (`ozcdsnpieeetzzwjqvjo`, us-west-2) at 2026-05-19. This is the Supabase project that `.env.local` points to and matches the region in CLAUDE.md memory.

| Object | Count |
|---|---|
| `ministerial_referrals` | 0 rows |
| `referral_audit_log` | 0 rows |
| `referral_ref_seq` | `last_value=1, is_called=false` (never allocated) |
| `user_module_access` rows for the two old slugs | 0 grants |
| `modules.slug = 'ministerial-referrals'` | exists, default_roles `['dg','ps']` |
| `modules.slug = 'minister-referrals'` | exists, default_roles `['minister']` |

Also checked `mpua-staging` (`pkhmcgjxtjjevpcmzszb`): the tables do not exist there at all.

**There is no data to migrate.** The user's prompt explicitly authorized collapsing the 3-migration plan to "just drop everything" in this case. The migration count goes from 3 to 2 (one to add columns, one to drop the parallel schema). Confirm before applying.

## 3. Final files list

**Delete (entire files):**

- `lib/referrals/types.ts`
- `lib/referrals/queries.ts`
- `lib/referrals/pre-fill.ts`
- `lib/referrals/source-lookup.ts`
- `lib/referrals/audit.ts`
- `lib/referrals/status-machine.ts`
- `lib/referrals/reference-number.ts`
- `lib/pdf/referral-render.tsx`
- `app/api/referrals/route.ts`
- `app/api/referrals/[id]/route.ts`
- `app/api/referrals/[id]/pdf/route.ts`
- `app/api/referrals/[id]/note/route.ts`
- `app/api/referrals/[id]/acknowledge/route.ts`
- `app/api/referrals/pre-fill/route.ts`
- `app/referrals/page.tsx`
- `app/referrals/[id]/page.tsx`
- `app/referrals/_components/ReferralsTable.tsx`
- `app/referrals/_components/ReferralDetailClient.tsx`
- `app/referrals/_components/ReferralAuditList.tsx`
- `app/minister/referrals/[id]/page.tsx`
- `app/minister/referrals/_components/MinisterReferralsList.tsx`
- `app/minister/referrals/_components/MinisterReferralActions.tsx`
- `components/today/ReferralForm.tsx`
- `components/referrals/NewReferralButton.tsx`
- `components/referrals/ReferralStatusBadge.tsx`
- `tests/unit/referrals/em-dash-guard.test.ts` (moves with the file rename, see below)
- `tests/unit/referrals/reference-number.test.ts`
- `tests/unit/referrals/status-machine.test.ts`
- `tests/unit/referrals/pre-fill.test.ts`

**Move / rename (no behavior change in the move commit):**

- `lib/referrals/em-dash-guard.ts` -> `lib/text/punctuation-guard.ts`
- `tests/unit/referrals/em-dash-guard.test.ts` -> `tests/unit/text/punctuation-guard.test.ts`
- `app/minister/referrals/page.tsx` -> `app/minister/attention/page.tsx`
- `components/referrals/ReferralSourceBanner.tsx` -> `components/minister/ReferredToMinisterBanner.tsx`

**Create:**

- `supabase/migrations/123_tasks_minister_attention_columns.sql`
- `supabase/migrations/124_drop_ministerial_referrals.sql`
- `lib/text/punctuation-guard.ts` (content moved from em-dash-guard.ts)
- `lib/minister-attention/queries.ts` (small helpers: list flagged tasks, get linked task for tender/project, flag, acknowledge, close)
- `components/today/ReferToMinisterDialog.tsx` (small replacement for ReferralForm: one note textarea, one submit; flips the flag via API)
- `app/api/tasks/[id]/refer/route.ts` (POST: DG flips flag + posts opening comment; DELETE: DG unflags with required reason logged as a comment)
- `app/api/tasks/[id]/minister/acknowledge/route.ts` (POST: Minister, sets `minister_seen_at`)
- `app/api/tasks/[id]/minister/close/route.ts` (POST: Minister, sets `minister_closed_at`)

**Modify (functional changes):**

- `components/layout/Sidebar.tsx`: remove `/referrals` and `/minister/referrals` items; add `/minister/attention` (icon `Inbox`, role `['minister']`).
- `components/today/EscalateModal.tsx`: replace the inline mount of `ReferralForm` with `ReferToMinisterDialog`. The NPTAB option stays.
- `components/today/UrgentHero.tsx`: drop the `topSignal.lastEscalation.reference_number` rendering; show "Flagged for Minister, <date>" with a link to the task when set.
- `components/procurement/ProcurementCard.tsx`: update import path and prop name for the renamed banner.
- `components/procurement/ProcurementDetailPanel.tsx`: same.
- `components/tasks/TaskDetailPanel.tsx`: add "Referred to Minister" badge; add action buttons (DG: Refer / Unflag; Minister: Acknowledge / Close); existing comments thread stays.
- `lib/today/types.ts`: drop the import from `@/lib/referrals/types`; replace `TodaySignalLastEscalation` with `{ taskId: string; flaggedAt: string }` or remove entirely and inline the optional field.
- `lib/today/signals.ts`: drop the `getActiveReferralsForSources` call (lines 22, 567, 568, 580); replace with a single Supabase read against `tasks` filtered by `linked_source_type`/`linked_source_id` and `requires_minister_attention = TRUE AND minister_closed_at IS NULL`.
- `lib/tender/types.ts`: drop `activeReferral: ActiveReferralBrief | null`; replace with `activeMinisterReferralTaskId: string | null`.
- `lib/tender/queries.ts`: rewrite the join in the same shape as today, using the new tasks query.
- `lib/notifications.ts`: drop the `referral_direction_given` entry from `EventPrefMap` (line 69) and `EVENT_PREF_DEFAULTS` (line 635); add `task_referred_to_minister` and `task_minister_comment` entries with `{ in_app: true, email: 'instant' }`.
- `lib/notifications/classify-tier.ts`: drop the `'referral_direction_given'` union member (line 17) and case (line 108); add cases for the two new events, both tier `important`.
- `app/api/tasks/[id]/comments/route.ts`: when the parent task has `requires_minister_attention = TRUE`, additionally fire `task_minister_comment` to the task watchers + the original `referred_to_minister_by` user (so the DG sees the Minister's note). Existing comment notifications stay.
- All three NPTAB import sites (listed in finding 5 above): rewrite imports to `@/lib/text/punctuation-guard`. No logic change.

## 4. Migration files in full

### `supabase/migrations/123_tasks_minister_attention_columns.sql`

```sql
-- 123_tasks_minister_attention_columns.sql
-- Adds the Minister-attention flag and the upstream-source linkage to tasks.
-- Replaces the parallel ministerial_referrals schema (dropped in 124).
-- Must run BEFORE 124_drop_ministerial_referrals.sql.
--
-- Column naming note: linked_source_* deliberately avoids colliding with
-- tasks.source (NOT NULL, represents the task's creation channel:
-- 'manual', 'meeting', etc., unrelated to upstream entity linkage).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requires_minister_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referred_to_minister_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referred_to_minister_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS minister_seen_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS minister_closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_source_type          TEXT
    CHECK (linked_source_type IS NULL OR linked_source_type IN ('tender', 'project')),
  ADD COLUMN IF NOT EXISTS linked_source_id            TEXT;

-- Minister inbox query: flagged + still open.
CREATE INDEX IF NOT EXISTS tasks_minister_attention_idx
  ON tasks(requires_minister_attention, minister_closed_at)
  WHERE requires_minister_attention = TRUE;

-- Cross-page banner lookup: given a tender or project id, find the flagged task.
CREATE INDEX IF NOT EXISTS tasks_linked_source_idx
  ON tasks(linked_source_type, linked_source_id)
  WHERE linked_source_id IS NOT NULL;

COMMENT ON COLUMN tasks.requires_minister_attention IS
  'TRUE when the DG has flagged this task as requiring the Minister''s attention.';
COMMENT ON COLUMN tasks.linked_source_type IS
  'Upstream entity type when this task originated from a tender or project. NULL otherwise.';
COMMENT ON COLUMN tasks.linked_source_id IS
  'Upstream entity primary key (tender.id or projects.project_id) when linked_source_type is set.';
```

### `supabase/migrations/124_drop_ministerial_referrals.sql`

```sql
-- 124_drop_ministerial_referrals.sql
-- Drop the parallel ministerial_referrals schema.
--
-- Preconditions verified 2026-05-19 on dg-command-center (us-west-2):
--   ministerial_referrals  : 0 rows
--   referral_audit_log     : 0 rows
--   referral_ref_seq       : last_value=1, is_called=false
--   user_module_access for ('ministerial-referrals','minister-referrals'): 0 grants
-- mpua-staging does not have these tables.
-- No data backfill required.
--
-- Run AFTER 123_tasks_minister_attention_columns.sql and AFTER the application
-- code that read from the dropped tables has been removed in the same release.

DROP TABLE IF EXISTS referral_audit_log CASCADE;
DROP TABLE IF EXISTS ministerial_referrals CASCADE;

DROP SEQUENCE IF EXISTS referral_ref_seq;

DROP TYPE IF EXISTS referral_status;
DROP TYPE IF EXISTS referral_delivery_method;
DROP TYPE IF EXISTS referral_requested_action;
DROP TYPE IF EXISTS referral_source_type;

DELETE FROM user_module_access
  WHERE module_id IN (
    SELECT id FROM modules WHERE slug IN ('ministerial-referrals', 'minister-referrals')
  );
DELETE FROM modules WHERE slug IN ('ministerial-referrals', 'minister-referrals');

INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES ('minister-attention', 'Minister Attention',
        'Tasks flagged for the Minister''s attention',
        'Inbox', ARRAY['minister'], true, 76)
ON CONFLICT (slug) DO NOTHING;
```

No third migration. The "drop module slugs" step is folded into 124 because there's no data risk and no logical reason to split.

## 5. Notification event renames

| Action | Event |
|---|---|
| Drop | `referral_direction_given` (currently fired by `PATCH /api/referrals/[id]` on first non-null `minister_direction`) |
| Add | `task_referred_to_minister` (fires to Minister role users when DG flips `requires_minister_attention = TRUE`) |
| Add | `task_minister_comment` (fires to task watchers + `referred_to_minister_by` user when a Minister-role user comments on a flagged task) |

Both new events: tier `important`, defaults `{ in_app: true, email: 'instant' }`, matching the dropped event.

Wire sites:
- Emit `task_referred_to_minister` from `POST /api/tasks/[id]/refer`.
- Emit `task_minister_comment` from `POST /api/tasks/[id]/comments` when the actor's role is `minister` and the task has `requires_minister_attention = TRUE`.

## 6. Diff size estimate (honest)

| Bucket | LOC | Notes |
|---|---:|---|
| Delete (entire files) | -1,720 | Sum of file sizes from the deletion list. Includes ~120 LOC of `EscalationControls` references that stay (separate project-escalation feature, untouched) so this is referrals-only. |
| Create new files | +280 | 2 migrations (~100), `punctuation-guard.ts` (moved, ~25), `minister-attention/queries.ts` (~80), `ReferToMinisterDialog.tsx` (~60), 3 small API routes (~50 each). |
| Modify existing files | ~+200 / -250 net | Sidebar, EscalateModal, UrgentHero, procurement card x2, TaskDetailPanel, today/types.ts, today/signals.ts, tender/types.ts, tender/queries.ts, notifications.ts, classify-tier.ts, tasks/[id]/comments POST, 3 NPTAB import updates. |
| Tests | -260 (delete referrals tests), +60 (move punctuation-guard tests) | |

**Net: roughly 35 files touched, around -1,690 LOC, +180 LOC of new code, +100 LOC of SQL.** This is the honest estimate, not optimistic. The original audit's Option B proposal was ~-1,200 net; deleting the PDF + reference number machinery instead of slimming it gets us another ~500 LOC of reduction.

After: roughly 1,300 LOC of dedicated code, down from ~3,000. About a 57% reduction.

## 7. Commit order

Each commit leaves `main` buildable, type-clean, and runnable. Branch name suggestion: `refactor/referrals-to-tasks-flag`.

1. **`refactor(text): move em-dash guard out of lib/referrals`**
   - Move `lib/referrals/em-dash-guard.ts` -> `lib/text/punctuation-guard.ts`.
   - Move `tests/unit/referrals/em-dash-guard.test.ts` -> `tests/unit/text/punctuation-guard.test.ts`.
   - Update imports in 3 NPTAB files and in `lib/referrals/queries.ts`, `lib/referrals/pre-fill.ts`, both `app/referrals/_components/*` clients, both `app/minister/referrals/_components/*` clients, `components/today/ReferralForm.tsx`, `components/today/EscalateModal.tsx` indirect, `app/api/referrals/route.ts`, `app/api/referrals/[id]/route.ts`, `app/api/referrals/[id]/note/route.ts`, `app/api/referrals/pre-fill/route.ts`.
   - No behavior change. NPTAB never breaks at any point.

2. **`feat(tasks): add minister-attention columns (migration only)`**
   - File: `supabase/migrations/123_tasks_minister_attention_columns.sql`. File only, do not run.

3. **`feat(tasks): minister-attention API + dialog + Minister inbox page`**
   - Create `lib/minister-attention/queries.ts`.
   - Create `POST /api/tasks/[id]/refer`, `DELETE /api/tasks/[id]/refer`, `POST /api/tasks/[id]/minister/acknowledge`, `POST /api/tasks/[id]/minister/close`.
   - Create `components/today/ReferToMinisterDialog.tsx`.
   - Mount the dialog inside `EscalateModal` (replacing `ReferralForm`).
   - Add the badge + action buttons in `TaskDetailPanel.tsx`.
   - Create `app/minister/attention/page.tsx` (file move + content rewrite; old `MinisterReferralsList` is deleted, the new page is a simple filtered tasks list).
   - Sidebar update: drop `/referrals` and `/minister/referrals` items; add `/minister/attention`.
   - At this commit, both the new path AND the old `/referrals` UI still exist. The new path reads from the new task columns; the old UI still reads from `ministerial_referrals` (still empty on staging).

4. **`feat(notifications): swap referral_direction_given for task_referred_to_minister + task_minister_comment`**
   - Edit `lib/notifications.ts`, `lib/notifications/classify-tier.ts`.
   - Wire `task_referred_to_minister` from the `POST /refer` route.
   - Wire `task_minister_comment` from `POST /api/tasks/[id]/comments`.

5. **`refactor(today, tender): replace lastEscalation/activeReferral with task pointers`**
   - Rewrite `lib/today/types.ts`, `lib/today/signals.ts`.
   - Rewrite `lib/tender/types.ts`, `lib/tender/queries.ts`.
   - Update `components/today/UrgentHero.tsx`.
   - Move + rename `ReferralSourceBanner` -> `components/minister/ReferredToMinisterBanner.tsx` and update both procurement consumers.

6. **`chore(referrals): delete dead module`**
   - Delete the entire deletion list from section 3.
   - Delete the three remaining referrals tests.

7. **`feat(db): drop ministerial_referrals schema (migration only)`**
   - File: `supabase/migrations/124_drop_ministerial_referrals.sql`. File only, do not run.

Migrations 123 and 124 are applied manually after the PR merges, in order, by the user. Per the workflow constraint.

---

## Approval checklist for the user

Open questions where I made a choice that I would like a yes/no on before any code is written:

1. **Column naming on `tasks`:** `linked_source_type` + `linked_source_id` (to avoid the `tasks.source` collision). OK?
2. **Two migrations, not three** (no data migration needed: 0 rows). OK?
3. **New module slug `minister-attention`** for the Minister's flagged-task inbox at `/minister/attention`. OK?
4. **API shape:** `POST /api/tasks/[id]/refer`, `DELETE /api/tasks/[id]/refer`, `POST /api/tasks/[id]/minister/acknowledge`, `POST /api/tasks/[id]/minister/close`. The unflag (DELETE /refer) requires a reason in the body which gets logged as a task comment. OK?
5. **Renamed banner location:** `components/minister/ReferredToMinisterBanner.tsx`. OK?
6. **Tier for both new notifications:** `important` (same as the dropped `referral_direction_given`). OK?

Confirm these and I will execute commits 1 through 7 in order.

Stopping here. No code or DB change.
