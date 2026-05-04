# Action Items Pipeline — Design Spec

**Author:** Alfonso De Armas (DG, MPUA)
**Date:** 2026-05-03 (rev 2026-05-03b)
**Status:** Approved design, awaiting implementation
**Supersedes:** `action_items_plan.md` (single-meeting-type, 1–2 day build estimate)

---

## Changelog (rev 2026-05-03b — module-relationship correction)

The original spec treated Action Items as a new module with its own `action_items` table, agency-grouped consumption views, `/mine` view, freestanding manual-add form, and item-detail view. That was a category error: DGOS already has the **Tasks** module (UI: "War Room", route: `/tasks`) which is the destination for all MPUA staff commitments. Tasks already has agency grouping, a My Tasks filter, an Add Task form, item-detail views, status (new/active/blocked/done), assignee, due dates, and ~93 existing rows across the seven portfolio agencies.

**Action Items is not a new module. It is the extraction pipeline that creates Tasks.**

What changed in this revision:

- §1 (scope): rewritten to draw the boundary between extraction-pipeline scope and Tasks-module scope.
- §3 (schema): the `action_items` table is **removed**. Its lifecycle and routing columns become `ALTER TABLE tasks ADD COLUMN` statements on the existing `tasks` table. The other four new tables (`action_item_extractions`, `action_item_events`, `meetings_seen`, `failed_extractions`) stay; `action_item_events.item_id` now references `tasks(id)`.
- §6 (consumption): rewritten — items live in War Room. No new agency-tree, no `/mine`, no `/action-items/[id]`, no `/action-items/agency/[name]`. The verification surface is added to War Room (or a dashboard widget; final placement chosen in revised Plan 2).
- §8 (manual-add): the freestanding manual-add form is **dropped** — the existing Add Task form in War Room is the freestanding entry point. The inline manual-add component (used by the review queue) stays as a small wrapper that posts to the existing `POST /api/tasks` with extraction-source defaults.
- §11.5 (visibility): the `visibility_scope` column moves to `tasks`; the `canSeeItem` rule operates on tasks. Extraction-side visibility (review-queue access, who can see `meetings_seen`) is unchanged.
- §12 (closure / verification): rewritten as a tasks-status-machine extension — adds `awaiting_verification` and `superseded` to the existing four statuses, with the same dispute / pushback loop hung off the new states.
- §14 (file/folder structure): all `app/action-items/{page,mine,agency/[name],[id],new}/page.tsx` entries removed. Routes that remain under `/action-items/*`: `/review`, `/review/[extractionId]`, `/meetings`, `/process`, `/eval`. War Room (`/tasks`) is the consumption surface.

What stays Action Items-specific (extraction pipeline only):

- Fireflies polling + transcript handling.
- Claude API extraction with versioned prompts.
- Validation pipeline (banned phrases, verb taxonomy, required fields, quote substring).
- Resolution pipeline (owner, due date, agency, priority).
- Political-risk gate.
- Review queue UI at `/action-items/review[/...]`.
- Supersession matcher (operating on tasks now).
- Earned-trust tracker.
- `meetings_seen` log + meetings list at `/action-items/meetings`.
- `failed_extractions` log.
- Eval dashboard at `/action-items/eval`.
- Four of the five originally-proposed new tables: `action_item_extractions`, `action_item_events`, `meetings_seen`, `failed_extractions`.

The locked decisions in §0 are unchanged in spirit — only the implementation surface for the *canonical commitment layer* moves from a new `action_items` table to the existing `tasks` table.

---

## 0 — Locked decisions (anchors)

These are non-negotiable in v1. Each was settled during brainstorming.

1. **Attribution.** Every AI-generated commitment is attributed to the meeting itself, not to the AI and not to the DG personally. Card text reads *"Generated from [Meeting Name], [Date]. Reviewed by DG Office."* (reviewed) or *"Generated from [Meeting Name], [Date]. Not yet reviewed."* (auto-accepted). Manual items keep War Room's existing attribution (creator + date). The string is computed at render time from `tasks.source` + supporting lookups, never stored.
2. **Scope of recording.** Fireflies records only meetings on the DG's MPUA Google Workspace calendar. No personal accounts, no NCN/UG/City Council. Every transcript in Fireflies is in-scope. No detection logic in the pipeline.
3. **Meeting type taxonomy.** Three types only: `internal | agency | external`. Type is auto-detected at ingest from Fireflies metadata; manual override available.
4. **Modality taxonomy.** Three modalities: `virtual | in_person | mixed`. Auto-detected from Fireflies metadata.
5. **Agency taxonomy.** Seven portfolio agencies enumerated: `GPL | GWI | GCAA | CJIA | MARAD | HCI | HA`. Plus `MPUA-DG | MPUA-Minister | MPUA-PS`. The existing `tasks.agency` column carries this routing value (CHECK constraint added in migration 102).
6. **Failure ranking.** Political risk first, time burden second, accuracy drift third. All design tradeoffs honor this order.
7. **Owner uniqueness.** Single owner per item. The existing `tasks.owner_user_id` carries this. `delegated_to_id` (new column) handles DG-led-staff-executed items.
8. **Closure model.** Owner self-close → status `awaiting_verification` → DG one-tap confirm/dispute. DG can bulk-close directly. `dg_managed` users (Minister, PS, President) skip self-close — only DG closes their items.
9. **Canonical commitment layer is `tasks`.** Manual tasks (existing) and AI-extracted commitments (new) share schema, lifecycle, and visibility. AI extraction is an additional creation path, not a parallel store.
10. **Visibility ≠ ownership.** Default visibility is per meeting type. Owner pool can include staff who can't see the item by default (e.g., external-meeting item owned by Kesh, visible to DG only until shared).
11. **No regression metrics in schema.** No `re_promise_count`, no auto-cancel on supersession, no fields that quantify how often someone re-committed.

---

## 1 — Scope: what's in v1, what's not

### What this project owns (Action Items pipeline)

- New tables: `action_item_extractions`, `action_item_events`, `meetings_seen`, `failed_extractions`.
- `users` widening: `aliases`, `closure_mode`, `is_agency_head`.
- `tasks` widening: extraction provenance (`source`, `extraction_id`, `extraction_item_idx`, `source_meeting_id`, `source_timestamp`, `source_quote`, `confidence_overall`, `confidence_reasons`, `task_embedding`), verification flow (`awaiting_verification` and `superseded` status values, `completion_note`, `completed_by`, `verified_by`, `verified_at`, `dispute_note`, `disputed_at`), supersession (`supersedes_id`), visibility (`visibility_scope`), and a routing widening (`agency_name` CHECK plus `delegated_to_id`).
- Extraction pipeline for **internal virtual** meetings only at launch. In-person prompt drafted/versioned but unwired.
- Validation pipeline (banned phrases, verb taxonomy, required fields, quote substring after normalization).
- Resolution pipeline (meeting-scoped owner first, global fallback, due-date rules, priority rules, agency).
- Political-risk gate (full ruleset).
- Review queue at `/action-items/review[/...]` — three-bucket layout, keyboard shortcuts, inline manual-add.
- `meetings_seen` log + daily 7am observability digest, plus the meetings list at `/action-items/meetings`.
- Vercel Cron poller, watermark on transcript-ready time, idempotency lock.
- Verification flow on tasks: owner self-close, DG verify, dispute path with full event log.
- Daily verification surface (DG sees `awaiting_verification` items; design choice — War Room section vs. dashboard widget — locked in revised Plan 2).
- Inline manual-add component used by the review queue. **No new freestanding form** — the existing Add Task form in War Room is the freestanding entry point.

### What this project does NOT own (already in DGOS)

- The Tasks/War Room module itself: agency-grouped consumption, My Tasks filter, Add Task form, task detail page, status board, assignee dropdown, due dates, blocked reason, subtasks, templates, activity log, mentions. None of this is rebuilt; the verification flow plugs into it.
- The existing `POST /api/tasks` create endpoint, `PATCH /api/tasks/[id]`, etc. The pipeline writes via these endpoints with extraction-source fields populated.

### Not in v1 (deferred)

- Extraction for in_person, mixed, agency, external meetings. These appear in `meetings_seen` with a "Process manually" button → opens War Room's Add Task form pre-populated with meeting metadata via query params.
- Earned auto-accept (built but disabled at launch; threshold logic ships, activation gated until eval passes).
- Supersession matcher: built; shipped as suggestion-only in review queue from week 1; weekly drift job can wait until week 2.
- Webhooks. Polling every 10 min only.
- Cross-module record matching (Procurement, Projects, War Room as separate matchers). Items live only in `tasks` in v1.
- Co-owner first-class support.
- Mobile UI.
- Sentiment / talk-time / "conversation intelligence" of any kind.

---

## 2 — Tech stack

- **Runtime:** Existing DG Work OS Next.js 16 App Router app, deployed on Vercel.
- **DB:** Supabase (existing project). All new tables and column-extensions live alongside existing ones. No new database.
- **Auth:** Existing NextAuth v5 + Google Workspace OAuth. Existing `requireRole()` and agency-scoped permissions.
- **AI extraction:** Anthropic SDK directly. Model `claude-opus-4-7`. Prompt versioning via filename. Tool-use for guaranteed JSON shape.
- **Data handling:** Anthropic with zero-data-retention contract. If ZDR not contractually in place by launch, route through Vercel AI Gateway with ZDR enabled. Document the chosen path in `lib/action-items/extraction/extract.ts` header comment.
- **Embeddings (for supersession matcher):** OpenAI `text-embedding-3-small`. Stored on `tasks.task_embedding VECTOR(1536)` using pgvector. Confirm pgvector enabled on Supabase project before migration runs.
- **Cron:** Vercel Cron, `*/10 * * * *`, hits `/api/action-items/poll-fireflies`.
- **SQL migrations:** Output to `.sql` files under `supabase/migrations/`. Manual execution via Supabase Dashboard. Do not auto-run.

---

## 3 — Data model

### 3.1 Widen `users` (unchanged from rev 1)

```sql
ALTER TABLE users ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN is_agency_head BOOLEAN NOT NULL DEFAULT false;
```

### 3.2 Widen `tasks` (NEW — replaces the old `action_items` table)

The existing `tasks` table already carries the canonical commitment record. The pipeline adds extraction provenance, verification flow, supersession, and visibility-scope columns; it also widens the status check.

```sql
-- Extraction provenance (NULL for manually created tasks)
ALTER TABLE tasks ADD COLUMN source              TEXT NOT NULL DEFAULT 'manual'
                                                CHECK (source IN ('manual','extraction'));
ALTER TABLE tasks ADD COLUMN extraction_id       UUID REFERENCES action_item_extractions(id);
ALTER TABLE tasks ADD COLUMN extraction_item_idx INTEGER;
ALTER TABLE tasks ADD COLUMN source_meeting_id   TEXT;             -- Fireflies meeting id (text, not UUID)
ALTER TABLE tasks ADD COLUMN source_timestamp    TEXT;
ALTER TABLE tasks ADD COLUMN source_quote        TEXT;
ALTER TABLE tasks ADD COLUMN owner_name_raw      TEXT;             -- as-spoken; only set by extraction
ALTER TABLE tasks ADD COLUMN delegated_to_id     UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN verb_category       TEXT
                                                CHECK (verb_category IN
                                                  ('correspondence','decision','information',
                                                   'scheduling','project_update','analysis')
                                                  OR verb_category IS NULL);
ALTER TABLE tasks ADD COLUMN due_trigger         TEXT;             -- 'when DBIS is operational' etc.
ALTER TABLE tasks ADD COLUMN confidence_overall  NUMERIC(3,2);
ALTER TABLE tasks ADD COLUMN confidence_reasons  TEXT[];
ALTER TABLE tasks ADD COLUMN task_embedding      VECTOR(1536);

-- Verification flow
ALTER TABLE tasks ADD COLUMN completion_note     TEXT;
ALTER TABLE tasks ADD COLUMN completed_by        UUID REFERENCES users(id);
-- completed_at already exists from migration 029
ALTER TABLE tasks ADD COLUMN verified_by         UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN verified_at         TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN dispute_note        TEXT;
ALTER TABLE tasks ADD COLUMN disputed_at         TIMESTAMPTZ;

-- Supersession (self-FK)
ALTER TABLE tasks ADD COLUMN supersedes_id       UUID REFERENCES tasks(id);

-- Visibility (default agency_normal; extraction sets dg_only for external meetings)
ALTER TABLE tasks ADD COLUMN visibility_scope    TEXT NOT NULL DEFAULT 'agency_normal'
                                                CHECK (visibility_scope IN ('agency_normal','dg_only'));

-- Status: widen to include awaiting_verification + superseded
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('new','active','blocked','done',
                    'awaiting_verification','superseded'));

-- Source-conditional integrity: extraction tasks must carry provenance
ALTER TABLE tasks ADD CONSTRAINT extraction_provenance_required CHECK (
  source = 'manual' OR
  (extraction_id IS NOT NULL
   AND source_meeting_id IS NOT NULL
   AND extraction_item_idx IS NOT NULL
   AND confidence_overall IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_tasks_status_due_open
  ON tasks(status, due_date)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX idx_tasks_owner_status_open
  ON tasks(owner_user_id, status)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX idx_tasks_supersedes ON tasks(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX idx_tasks_extraction ON tasks(extraction_id) WHERE extraction_id IS NOT NULL;
CREATE INDEX idx_tasks_embedding  ON tasks USING ivfflat (task_embedding vector_cosine_ops)
  WHERE task_embedding IS NOT NULL;
```

Notes:

- The existing `tasks.agency` is **freeform TEXT** today (it carries values like `gpl`, `mpua`, etc., often lowercased). The extraction pipeline writes the canonical 9-value enum (`GPL`, `MPUA-DG`, …). Migration 102 does **not** add a CHECK constraint on `tasks.agency` because the existing 93 rows would fail it. Instead, the extraction-side code writes values from the canonical enum, and a follow-up data-cleanup task (out of v1 scope) can normalize the legacy rows before constraining.
- The existing `tasks.title` carries the canonical sentence today; for extracted items, the pipeline writes the AI-rewritten task text into `title` and uses `description` for the source quote redundantly when useful. Plan 4 finalizes the field mapping.
- The existing `tasks.priority` enum (`low|medium|high|critical`) is retained — extraction maps the spec's P0–P3 to this scale (P0→`critical`, P1→`high`, P2→`medium`, P3→`low`). The internal P-tier value is kept inside `confidence_reasons` or a future column if needed.

### 3.3 `action_item_extractions` (unchanged from rev 1)

```sql
CREATE TABLE action_item_extractions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id              TEXT NOT NULL,
  meeting_title           TEXT,
  meeting_date            TIMESTAMPTZ,
  meeting_type            TEXT NOT NULL CHECK (meeting_type IN ('internal','agency','external')),
  modality                TEXT NOT NULL CHECK (modality IN ('virtual','in_person','mixed')),
  meeting_type_overridden BOOLEAN NOT NULL DEFAULT false,
  modality_overridden     BOOLEAN NOT NULL DEFAULT false,
  agency_name             TEXT CHECK (agency_name IN
                            ('GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
                             'MPUA-DG','MPUA-Minister','MPUA-PS') OR agency_name IS NULL),
  transcript_url          TEXT,
  transcript_hash         TEXT,
  prompt_version          TEXT NOT NULL,
  model                   TEXT NOT NULL,
  raw_response            JSONB NOT NULL,
  token_count_input       INTEGER,
  token_count_output      INTEGER,
  extraction_duration_ms  INTEGER,
  items_extracted         INTEGER NOT NULL DEFAULT 0,
  items_accepted          INTEGER NOT NULL DEFAULT 0,
  items_edited            INTEGER NOT NULL DEFAULT 0,
  items_rejected          INTEGER NOT NULL DEFAULT 0,
  items_added_manually    INTEGER NOT NULL DEFAULT 0,
  review_status           TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN
                            ('pending','in_review','complete','skipped','failed')),
  reviewed_by             UUID REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, prompt_version)
);
```

### 3.4 `action_item_events` (FK retargeted to `tasks`)

```sql
CREATE TABLE action_item_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
                  ('created','accepted','edited','rejected','status_change',
                   'dispute_raised','dispute_resolved','superseded_by','supersedes',
                   'attribution_error_flagged')),
  actor_id      UUID REFERENCES users(id),
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_task ON action_item_events(task_id, occurred_at DESC);
```

The column is `task_id` (renamed from `item_id` in rev 1). The existing DGOS `task_activities` table (from migration 029) is a *human-action* log scoped to the Tasks UI; `action_item_events` is the *pipeline-action* log scoped to extraction provenance and verification flow. The two tables coexist by design — they answer different questions.

### 3.5 `meetings_seen` (unchanged from rev 1)

```sql
CREATE TABLE meetings_seen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_meeting_id  TEXT NOT NULL UNIQUE,
  meeting_title         TEXT,
  meeting_date          TIMESTAMPTZ,
  detected_type         TEXT CHECK (detected_type IN ('internal','agency','external')),
  detected_modality     TEXT CHECK (detected_modality IN ('virtual','in_person','mixed')),
  detected_agency_name  TEXT,
  attendee_emails       TEXT[],
  transcript_ready_at   TIMESTAMPTZ,
  pipeline_action       TEXT NOT NULL CHECK (pipeline_action IN
                          ('extracted','skipped_out_of_scope','queued','failed','manually_processed')),
  skip_reason           TEXT,
  extraction_id         UUID REFERENCES action_item_extractions(id),
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.6 `failed_extractions` (unchanged from rev 1)

```sql
CREATE TABLE failed_extractions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_meeting_id  TEXT NOT NULL,
  attempted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  failure_reason        TEXT NOT NULL CHECK (failure_reason IN
                          ('claude_error','malformed_json','transcript_unavailable',
                           'speaker_collapse_virtual','transcript_partial','quota_exceeded','other')),
  failure_detail        TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  resolved_at           TIMESTAMPTZ,
  resolved_by           TEXT
);
```

---

## 4 — Detection: meeting type, modality, agency

Unchanged from rev 1. Detection runs at ingest, before extraction; output written to both `meetings_seen` (always) and `action_item_extractions` (when extraction runs). See rev 1 §4 for the rules — they are not affected by the module-relationship correction.

---

## 5 — Extraction prompt (versioned)

Unchanged from rev 1 in structure. Two prompt files, both producing the same JSON schema:

- `lib/action-items/prompts/extraction-virtual-v0.1.ts`
- `lib/action-items/prompts/extraction-inperson-v0.1.ts`

Per-prompt-version source-of-truth rule: bump filename when the prompt body changes; never edit a versioned prompt in place. The prompt schema, addenda, and meeting metadata block are unchanged from rev 1 §5.1–§5.5.

---

## 6 — Validation, resolution, priority

### 6.1 Validation

Runs on every accepted item, regardless of source. Same check set as rev 1: banned phrases, verb taxonomy, required fields, quote substring after normalization (extraction-source items only).

### 6.2 Resolution: owner

Two-stage as before — meeting-scoped first, global fallback at confidence ≥0.95 with single-first-name uniqueness, role-string fallback for in-person items. Resolution failure → `owner_user_id=NULL` not allowed (`tasks.owner_user_id` is NOT NULL); the item cannot leave the queue without resolution. Until resolution succeeds, the item lives only as a row inside `action_item_extractions.raw_response.items[i]` — no `tasks` row is inserted.

### 6.3 Resolution: due date

Same rules as rev 1 §6.3. Maps onto `tasks.due_date` (DATE) and `tasks.due_trigger` (TEXT). The existing `tasks.due_date` is DATE, not TIMESTAMPTZ — extraction truncates to date. (The lost time-of-day precision is acceptable for v1; the daily 18:00/09:00/17:00 conventions in rev 1 §6.3 still drive the *date*, and the time conventions become UI-side display defaults.)

### 6.4 Resolution: agency

Same precedence as rev 1: AI-inferred → owner's home agency → reviewer override. Writes to `tasks.agency` using the canonical 9-value enum string.

### 6.5 Priority assignment

Same tier rules as rev 1 §6.5. Mapping to the existing `tasks.priority` enum:

| Internal P-tier | `tasks.priority` value |
|-----------------|-----------------------|
| P0 | `critical` |
| P1 | `high` |
| P2 | `medium` |
| P3 | `low` |

Safety keywords: maintained in `lib/action-items/resolution/safety-keywords.ts` — unchanged.

---

## 7 — Political-risk gate

Unchanged from rev 1 §7. The gate decides whether an extracted item enters the review queue as **mandatory review** or **quick scan**. It does not interact with `tasks` directly — the gate's output is an annotation on the extraction-side review record. Items only land in `tasks` after they leave the queue.

---

## 8 — Review experience

### 8.1 Queue: meeting cards

Route: `/action-items/review`. Unchanged.

### 8.2 Single-meeting review: three buckets

Route: `/action-items/review/[extractionId]`. Unchanged in shape (mandatory / quick-scan / auto-accepted, transcript snippet on left, item form on right, keyboard shortcuts).

### 8.3 Inline manual-add

Pressing `M` opens a small form pre-filled with the meeting's metadata. Submit appends to bucket 1 (mandatory) for explicit accept. The form is implemented in `components/action-items/InlineExtractionAddItem.tsx` — a thin wrapper around the same `POST /api/tasks` create path used elsewhere, with `source='extraction'` set internally and the meeting's `extraction_id` populated.

### 8.4 Supersession suggestion

For every extracted item, run the matcher (§9). Surface candidates from `tasks` (not from the deleted `action_items` table). Threshold 0.75. Reviewer one-tap; never auto-link.

### 8.5 Freestanding manual-add — REMOVED (use existing Add Task)

The freestanding `/action-items/new` form is **dropped**. The existing Add Task form in War Room is the freestanding entry point for manual commitments. The "Process manually" CTA on `meetings_seen` cards (Plan 3) opens War Room's Add Task form pre-populated with meeting metadata via query params (`/tasks?action=add&meeting_id=...&meeting_title=...`).

---

## 9 — Supersession matcher

Same scoring formula as rev 1, but the candidate set is now drawn from `tasks`:

```
WHERE status IN ('new','active','blocked','awaiting_verification')
  AND owner_user_id = candidate.owner_user_id
  AND agency = candidate.agency_name        -- string compare; canonical enum
  AND created_at >= now() - interval '60 days'
```

Real-time use during review, weekly drift job — both unchanged in shape.

---

## 10 — Closure & verification

### 10.1 Owner self-close

Owners use the existing My Tasks view in War Room. The existing complete-task action gains a one-line `completion_note` requirement (≥10 chars) when the task came through extraction OR when it has an unresolved `dispute_note`; manual tasks without dispute history retain today's no-note close behavior. (This is the smallest UI change consistent with the spec.)

When an owner marks complete with note: `status` → `awaiting_verification`, `completed_by`, `completed_at`, `completion_note` set.

### 10.2 DG verification

DG sees all `awaiting_verification` items in a daily verification surface. Two design options for that surface — **decision pinned in revised Plan 2:**

- (A) A new top section in War Room when viewer is DG.
- (B) A dashboard widget on the home dashboard that links to a filtered War Room view.

Either way, the actions are: **Confirm** (one tap → `complete`, `verified_by`, `verified_at` set), **Dispute** (one tap → modal for note → status `new`, `dispute_note`, `disputed_at` set, owner notified).

### 10.3 DG bulk close

From any War Room view, DG can directly mark a task `done` (the existing bulk action) — extended to also clear `awaiting_verification` items by setting `verified_by`, `verified_at`. Logged as `event_type='status_change'` in `action_item_events` with `payload.via='dg_bulk_close'`.

### 10.4 dg_managed users

Items where `owner.closure_mode = 'dg_managed'` (Minister, PS, President):

- Hidden from the owner's My Tasks self-close action.
- Skip `awaiting_verification`. DG flips `new|active` → `done` directly.
- Show in War Room under their owner the same way as any other task.

### 10.5 Dispute resolution flow

The dispute path is the most politically charged interaction in the system. v1 specs the full loop, not just the status flip.

**When DG disputes** (one tap → modal):

1. DG enters `dispute_note` (required, ≥20 chars).
2. `action_item_events` row written: `event_type='dispute_raised'`, `actor_id=DG`, `payload={completion_note, dispute_note, prior_completed_at}`.
3. `tasks` row updated: `status='new'`, `dispute_note`, `disputed_at` set; `completed_by`, `completed_at`, `completion_note` cleared (preserved in the event row).
4. Owner notified via existing web push.

**Owner's options** when seeing the dispute on the task in War Room:

- **Re-attempt completion.** Marks complete again with a new `completion_note`. Status → `awaiting_verification`. Normal verification cycle.
- **Push back via comment.** Posts a comment (free text, ≥20 chars) via a small endpoint that writes an `action_item_events` row with `event_type='dispute_resolved'` payload `{action:'pushback', text:<comment>}` — does **not** change status. Item stays `new`. The comment surfaces in DG's verification surface as a *Pushbacks needing your attention* section, with the original dispute_note and the pushback comment side-by-side. DG can: re-confirm dispute (re-tap Dispute on the re-completed task), accept the pushback (mark `done` directly, treated as DG-bulk-close), or open the task for a longer reply via the existing Tasks comment UI.

**Re-disputes are allowed.** A pushback that DG re-disputes after re-completion just appends another event row. The full dispute history is queryable from the task's detail view (extended in Plan 2 with an Events section).

### 10.6 Delegation

`tasks.delegated_to_id` is set when DG is owner but task is executed by staff. Default visibility: visible to delegate.

Renders:

- DG's My Tasks: task appears with badge "delegated: Kesh".
- Kesh's My Tasks: separate section *Delegated by DG (not owned by you)*. Visible, not closable.
- Agency-grouped War Room view: under DG's row, not under Kesh's row.

---

## 11 — Consumption views

### 11.1 War Room is the consumption surface

Items live in War Room (`/tasks`). The existing agency grouping, My Tasks filter, status board, and task-detail page already cover the consumption surface. No new agency-tree, no new `/mine`, no new freestanding manual-add page.

What this project adds **inside War Room**:

- Verification surface (revised Plan 2 chooses War Room section vs dashboard widget).
- Task-detail extension showing source quote, attribution line, and the `action_item_events` log when the task came from extraction or has dispute history.
- Dispute / pushback dialogs reachable from the task detail and the verification surface.
- "Source: extraction / manual" badge in the task list view (small visual).

### 11.2 Routes that remain under `/action-items`

- `/action-items/review` — meeting cards awaiting extraction review (DG/PS only).
- `/action-items/review/[extractionId]` — three-bucket review.
- `/action-items/meetings` — `meetings_seen` list view (Plan 3).
- `/action-items/process` — manual extraction trigger form (Plan 4).
- `/action-items/eval` — eval dashboard (Plan 5; DG-only).

The sidebar carries a single **Action Items** link pointing at `/action-items/review`. War Room remains where the items themselves are seen.

### 11.3 Visibility

App-layer enforcement, consistent with existing DGOS pattern. The `canSeeTask` helper (added in revised Plan 1) operates on a Task with the new extension fields:

- DG, PS: see all tasks.
- Minister: see all tasks (read-only by existing role rules).
- Agency head / agency staff: see tasks where `agency = their.agency` (case-insensitive) OR `owner_user_id = their.id` OR `delegated_to_id = their.id`, AND `visibility_scope = 'agency_normal'`.
- `visibility_scope = 'dg_only'`: visible to DG only, regardless of agency match. Set automatically at insert when source extraction's `meeting_type = 'external'`. DG can flip to `agency_normal` to share.

The existing `tasks` RLS policy (migration 022) is **disabled** in revised Plan 1 — this project moves Tasks to app-layer enforcement, consistent with the rest of DGOS modules. Mixing RLS with app-layer guards is a footgun; the spec opts for one. (See revised Plan 1 §6 for the rationale and migration step.)

---

## 12 — Polling & failure handling

Unchanged from rev 1 §12. Cron schedule, watermark, advisory lock, and failure handling table all carry over. The only adjustment: when extraction succeeds and items are accepted, they are inserted into `tasks` (with `source='extraction'`), not `action_items`.

---

## 13 — Eval rubric (post-launch)

Unchanged from rev 1 §13. The recall / precision / owner-accuracy / overconfidence thresholds (95/90/90/3%) are computed from `action_item_extractions` counters and from review-queue decisions. Eval dashboard at `/action-items/eval`.

---

## 14 — File / folder structure

```
/app
  /action-items
    /review
      page.tsx                              # meeting card list  (KEEP)
      /[extractionId]/page.tsx              # 3-bucket review    (KEEP)
    /meetings
      page.tsx                              # meetings_seen list (Plan 3)
    /process
      page.tsx                              # manual extraction trigger (Plan 4)
    /eval
      page.tsx                              # eval dashboard (Plan 5)
    # NOTE: no page.tsx, no /mine, no /agency/[name], no /[id], no /new.
    # War Room (/tasks) is the consumption surface.

  /api
    /action-items
      /poll-fireflies/route.ts              # cron entry (Plan 3)
      /extract/route.ts                     # manual extraction trigger (Plan 4)
      /review/[extractionId]/route.ts       # batch submit decisions (Plan 4)
      /digest/route.ts                      # 7am digest generator (Plan 3)
      # NOTE: lifecycle endpoints (/complete, /verify, /dispute, /pushback)
      # operate on tasks, so they live under /api/tasks/[id]/...

  /api/tasks/[id]
    /complete/route.ts                      # owner self-close with completion_note (Plan 2)
    /verify/route.ts                        # DG confirm (Plan 2)
    /dispute/route.ts                       # DG dispute (Plan 2)
    /pushback/route.ts                      # owner pushback comment (Plan 2)

/lib
  /action-items
    /prompts
      extraction-virtual-v0.1.ts
      extraction-inperson-v0.1.ts           # drafted, not wired in v1
    /fireflies                              # client + poll (Plan 3)
    /detection                              # type / modality / agency (Plan 3)
    /extraction                             # Claude tool-use call (Plan 4)
    /resolution                             # owner / due / priority / agency (Plan 4)
    /validation                             # banned phrases, verb taxonomy, normalize, quote substring (Plan 4)
    /matcher                                # supersession (Plan 5)
    /trust                                  # rolling 20-window per agency (Plan 5)
    /events
      log.ts                                # write to action_item_events (Plan 2)
    constants.ts                            # frozen enums (Plan 1)
    types.ts                                # row types + Zod (Plan 1)
    visibility.ts                           # canSeeTask(user, task) (Plan 1)
    format.ts                               # attribution line (Plan 2)

/components
  /action-items
    InlineExtractionAddItem.tsx             # used by review queue, posts to /api/tasks (Plan 2 build, Plan 4 wire)
    ReviewBucket.tsx                        # (Plan 4)
    TranscriptSnippet.tsx                   # (Plan 4)
    EditForm.tsx                            # (Plan 4)
    SupersessionPicker.tsx                  # (Plan 5)
    DailyDigestCard.tsx                     # (Plan 3)
    VerificationSurface.tsx                 # (Plan 2)
    PushbackQueue.tsx                       # (Plan 2)
    DisputeDialog.tsx / CompleteDialog.tsx / PushbackDialog.tsx  # (Plan 2)
    TaskEventLog.tsx                        # extension to existing task detail (Plan 2)
```

---

## 15 — What the original plan got wrong (carried-forward fixes)

Same list as rev 1, plus rev 2026-05-03b additions:

- The original plan and rev-1 spec treated Action Items as a new module. Corrected: it is the extraction pipeline that creates Tasks. The canonical commitment layer is `tasks`, not a parallel `action_items` table.
- The freestanding manual-add form is dropped. War Room's existing Add Task form is the freestanding entry point.
- The agency-grouped consumption view, `/mine`, and item-detail view are dropped. War Room already has all three.
- Visibility enforcement on `tasks` is moved from the existing RLS policy (migration 022) to app-layer, consistent with the rest of DGOS. This is a deliberate deviation from migration 022's policy; rationale documented in revised Plan 1.

(Original rev-1 fixes — `people` table doesn't exist, `meeting_id UNIQUE` blocks re-extraction, prompt receives `meeting_date`, quote substring needs normalization, confidence-gated editability bug, tool-use over free-form JSON, Vercel Cron, web push, advisory lock + ON CONFLICT, watermark on transcript_ready_at, "blocks another tracked project" priority rule removed, safety keywords defined, attribution computed at render time, no co-owner array — all still apply.)

---

## 16 — Risks & mitigations

Unchanged from rev 1 in substance. New row added:

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing `tasks.agency` data is freeform; extraction writes canonical 9-value enum, so the agency facet on War Room queries may show duplicate entries (`gpl` and `GPL`) until legacy data is normalized. | High at first | Display layer in War Room normalizes to upper-case for grouping. A separate data-cleanup migration (out of v1 scope) will canonicalize the 93 legacy rows. |
| `tasks` RLS policy disabled to move enforcement to app-layer; a missed app-layer guard becomes a leak. | Low / High impact | Visibility helper (`canSeeTask`) covered by unit tests; every list endpoint uses it; review pass in revised Plan 1 grep-checks every `from('tasks')` read. |
| Status enum widened mid-flight; older code paths assume four values. | Medium | The widened constraint is a superset; old paths still write valid values. Any code reading `status` from `tasks` is still grep-able and updated in revised Plan 2 where it intersects the verification flow. |

(Plus all rev-1 risks — extraction quality, speaker collapse, in-person prompt unused at launch, pgvector availability, Anthropic ZDR, trust never activates, agency head changes, dg_only leak, drift detector noise, 60-day window — unchanged.)

---

## 17 — Open questions for v1.5+ (intentionally not in v1)

Unchanged from rev 1 in substance. The "freestanding manual-add for non-meeting commitments" question is now **closed**: there is no such surface to deliver — Add Task in War Room already serves that need.

---

## End of design spec
