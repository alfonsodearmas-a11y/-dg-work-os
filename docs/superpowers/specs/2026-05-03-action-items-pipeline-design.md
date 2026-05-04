# Action Items Pipeline — Design Spec

**Author:** Alfonso De Armas (DG, MPUA)
**Date:** 2026-05-03
**Status:** Approved design, awaiting implementation plan
**Supersedes:** `action_items_plan.md` (single-meeting-type, 1–2 day build estimate)

---

## 0 — Locked decisions (anchors)

These are non-negotiable in v1. Each was settled during brainstorming.

1. **Attribution.** Every AI-generated action item is attributed to the meeting itself, not to the AI and not to the DG personally. Card text reads *"Generated from [Meeting Name], [Date]. Reviewed by DG Office."* (reviewed) or *"Generated from [Meeting Name], [Date]. Not yet reviewed."* (auto-accepted). Manual items read *"Added by DG, [Date]."* The string is computed at render time from `source` + lookup, never stored.
2. **Scope of recording.** Fireflies records only meetings on the DG's MPUA Google Workspace calendar. No personal accounts, no NCN/UG/City Council. Every transcript in Fireflies is in-scope. No detection logic in the pipeline.
3. **Meeting type taxonomy.** Three types only: `internal | agency | external`. Type is auto-detected at ingest from Fireflies metadata; manual override available.
4. **Modality taxonomy.** Three modalities: `virtual | in_person | mixed`. Auto-detected from Fireflies metadata (Meet/Zoom integration vs. mobile recording).
5. **Agency taxonomy.** Seven portfolio agencies enumerated: `GPL | GWI | GCAA | CJIA | MARAD | HCI | HA`. Plus `MPUA-DG | MPUA-Minister | MPUA-PS`. Enforced via CHECK constraint.
6. **Failure ranking.** Political risk first, time burden second, accuracy drift third. All design tradeoffs honor this order.
7. **Owner uniqueness.** Single owner per item. No co-owners as first-class. `delegated_to_id` handles DG-led-staff-executed items.
8. **Closure model.** Owner self-close → status `awaiting_verification` → DG one-tap confirm/dispute. DG can bulk-close directly. `dg_managed` users (Minister, PS, President) skip self-close — only DG closes their items.
9. **Canonical commitment layer.** `action_items` is the canonical layer for MPUA staff commitments, not just AI output. Manual items are first-class.
10. **Visibility ≠ ownership.** Default visibility is per meeting type. Owner pool can include staff who can't see the item by default (e.g., external-meeting item owned by Kesh, visible to DG only until shared).
11. **No regression metrics in schema.** No `re_promise_count`, no auto-cancel on supersession, no fields that quantify how often someone re-committed.

---

## 1 — Scope: what's in v1, what's not

### In v1 (D-cut, ~4–7 day build)

- Full schema (users widening, action_items, action_item_extractions, action_item_events, meetings_seen, failed_extractions).
- Extraction pipeline for **internal virtual** meetings only.
- Two prompt variants (virtual, in_person) — only virtual wired to the pipeline; in_person prompt drafted and versioned but unused at launch.
- Validation pipeline (banned phrases, verb taxonomy, required fields, quote substring after normalization).
- Resolution pipeline (meeting-scoped owner first, global fallback at ≥0.95 with single-first-name uniqueness, due-date rules, priority rules).
- Political-risk gate (full ruleset).
- Review queue (meeting-grouped, three-bucket layout, keyboard shortcuts, inline manual-add).
- Consumption views (agency → owner → item; `/action-items`, `/action-items/mine`, `/action-items/agency/[name]`).
- Closure + verification flow (owner self-close, DG verify, dispute path with full event log).
- Manual-add: inline (during review) **and** freestanding (from meetings_seen card for non-extracted meetings).
- `meetings_seen` log + daily 7am observability digest.
- Vercel Cron poller with watermark on transcript-ready time and idempotency lock.

### Not in v1 (deferred)

- Extraction for in_person, mixed, agency, external meetings. These appear in `meetings_seen` with a "Process manually" button → freestanding manual-add form pre-populated with meeting metadata.
- Earned auto-accept (built but disabled at launch; threshold logic ships, activation gated until eval passes).
- Supersession matcher (built; shipped as suggestion-only in review queue from week 1; weekly drift job can wait until week 2).
- Webhooks. Polling every 10 min only.
- Cross-module record matching (Procurement, Projects, War Room). Items live only in `action_items` in v1.
- Co-owner first-class support.
- Mobile UI.
- Sentiment / talk-time / "conversation intelligence" of any kind.

---

## 2 — Tech stack

- **Runtime:** Existing DG Work OS Next.js 16 App Router app, deployed on Vercel.
- **DB:** Supabase (existing project). All new tables live alongside existing ones. No new database.
- **Auth:** Existing NextAuth v5 + Google Workspace OAuth. Existing `requireRole()` and agency-scoped permissions.
- **AI extraction:** Anthropic SDK directly. Model `claude-opus-4-7`. Prompt versioning via filename. Tool-use for guaranteed JSON shape (not free-form parse).
- **Data handling:** Anthropic with zero-data-retention contract. If ZDR not contractually in place by launch, route through Vercel AI Gateway with ZDR enabled. Document the chosen path in `lib/action-items/extraction/extract.ts` header comment.
- **Embeddings (for supersession matcher):** OpenAI `text-embedding-3-small` via API. Stored on `action_items.task_embedding VECTOR(1536)` using pgvector. Confirm pgvector enabled on Supabase project before migration runs.
- **Cron:** Vercel Cron, `*/10 * * * *`, hits `/api/action-items/poll-fireflies`.
- **SQL migrations:** Output to `.sql` files under `supabase/migrations/`. Manual execution via Supabase Dashboard. Do not auto-run. (Existing project rule.)

---

## 3 — Data model

### 3.1 Widen `users`

```sql
ALTER TABLE users ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., ["Kesh","Cash","Keche"] for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';
```

Existing `users.agency` is the user's home agency. It is **independent** from `action_items.agency_name` (the agency the work concerns).

### 3.2 `action_item_extractions`

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

CREATE INDEX idx_extractions_review_status ON action_item_extractions(review_status)
  WHERE review_status IN ('pending','in_review');
CREATE INDEX idx_extractions_meeting_date ON action_item_extractions(meeting_date DESC);
```

Re-extracting a meeting under a new prompt version inserts a new row, not an UPDATE.

### 3.3 `action_items`

```sql
CREATE TABLE action_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source              TEXT NOT NULL DEFAULT 'extraction'
                        CHECK (source IN ('extraction','manual')),
  extraction_id       UUID REFERENCES action_item_extractions(id),
  extraction_item_idx INTEGER,
  source_meeting_id   TEXT,
  source_timestamp    TEXT,
  source_quote        TEXT,
  created_by          UUID REFERENCES users(id),

  -- Routing
  agency_name         TEXT NOT NULL CHECK (agency_name IN
                        ('GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
                         'MPUA-DG','MPUA-Minister','MPUA-PS')),
  owner_id            UUID NOT NULL REFERENCES users(id),
  owner_name_raw      TEXT NOT NULL,
  delegated_to_id     UUID REFERENCES users(id),

  -- Content
  verb_category       TEXT NOT NULL CHECK (verb_category IN
                        ('correspondence','decision','information',
                         'scheduling','project_update','analysis')),
  task                TEXT NOT NULL CHECK (char_length(task) <= 500),
  due_at              TIMESTAMPTZ,
  due_trigger         TEXT,
  priority            TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN
                        ('open','in_progress','awaiting_verification',
                         'complete','cancelled','superseded','disputed')),
  reviewed_by         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  completed_by        UUID REFERENCES users(id),
  completed_at        TIMESTAMPTZ,
  completion_note     TEXT,
  verified_by         UUID REFERENCES users(id),
  verified_at         TIMESTAMPTZ,
  disputed_at         TIMESTAMPTZ,
  dispute_note        TEXT,

  -- Supersession
  supersedes_id       UUID REFERENCES action_items(id),

  -- QA
  confidence_overall  NUMERIC(3,2),
  confidence_reasons  TEXT[],
  task_embedding      VECTOR(1536),

  -- Visibility (see Section 11.5)
  visibility_scope    TEXT NOT NULL DEFAULT 'agency_normal'
                        CHECK (visibility_scope IN ('agency_normal','dg_only')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Source-conditional integrity
  CONSTRAINT extraction_fields_required CHECK (
    source = 'manual' OR
    (extraction_id IS NOT NULL AND source_meeting_id IS NOT NULL
     AND extraction_item_idx IS NOT NULL AND confidence_overall IS NOT NULL)
  ),
  CONSTRAINT manual_creator_required CHECK (
    source = 'extraction' OR created_by IS NOT NULL
  )
);

CREATE INDEX idx_items_agency_owner_status ON action_items(agency_name, owner_id, status)
  WHERE status IN ('open','in_progress','awaiting_verification');
CREATE INDEX idx_items_owner_status ON action_items(owner_id, status);
CREATE INDEX idx_items_status_due ON action_items(status, due_at)
  WHERE status IN ('open','in_progress');
CREATE INDEX idx_items_supersedes ON action_items(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX idx_items_extraction ON action_items(extraction_id);
CREATE INDEX idx_items_embedding ON action_items USING ivfflat (task_embedding vector_cosine_ops);
```

`agency_name` is always required at insert. The reviewer must set it (or the matcher resolves it from owner.agency by default) before an item leaves the queue.

### 3.4 `action_item_events`

Append-only audit log. Captures every state change, edit, dispute, supersession link.

```sql
CREATE TABLE action_item_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
                  ('created','accepted','edited','rejected','status_change',
                   'dispute_raised','dispute_resolved','superseded_by','supersedes',
                   'attribution_error_flagged')),
  actor_id      UUID REFERENCES users(id),
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_item ON action_item_events(item_id, occurred_at DESC);
```

### 3.5 `meetings_seen`

Every Fireflies meeting the poller observes, regardless of what the pipeline did with it. Drives the daily digest and reconciliation.

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

CREATE INDEX idx_meetings_seen_date ON meetings_seen(meeting_date DESC);
CREATE INDEX idx_meetings_seen_action ON meetings_seen(pipeline_action);
```

### 3.6 `failed_extractions`

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

CREATE INDEX idx_failed_extractions_unresolved ON failed_extractions(attempted_at DESC)
  WHERE resolved_at IS NULL;
```

---

## 4 — Detection: meeting type, modality, agency

Detection runs at ingest, before extraction. Output written to both `meetings_seen` (always) and `action_item_extractions` (when extraction runs).

### 4.1 Modality

- **virtual** — Fireflies metadata indicates Meet or Zoom integration source.
- **in_person** — Fireflies metadata indicates mobile/device recording, no video conference.
- **mixed** — both signals present (some attendees on call, some in room).

If Fireflies metadata is ambiguous, default to `in_person` (the more conservative choice — forces mandatory review).

### 4.2 Type

Derived from attendee email domains:

- All attendees `@mpua.gov.gy` → `internal`
- Any attendee from a portfolio agency domain (`@gpl.gy`, `@gwi.gy`, etc. — list maintained as constant) AND no other external domains → `agency`
- Any attendee from a domain not in MPUA/portfolio list → `external`

### 4.3 Agency name (only when type=agency)

The portfolio agency with the most non-MPUA attendees in the meeting. If tied, the first alphabetically. Reviewer can override.

### 4.4 Manual override

The freestanding manual-add form and the review-queue header both expose all three fields as editable. Override flips the corresponding `*_overridden` boolean.

---

## 5 — Extraction prompt (versioned)

Two prompt files, both producing the same JSON schema. Same validation runs against both.

- `lib/action-items/prompts/extraction-virtual-v0.1.ts`
- `lib/action-items/prompts/extraction-inperson-v0.1.ts`

`prompt_version` on extractions is the composite identifier (`virtual-v0.1` or `inperson-v0.1`) so per-modality precision/recall is computable.

### 5.1 Common rules (both prompts)

The full prompt body lives in the source file. Key points:

1. Owner: name as spoken; `name_raw` only — no resolution attempted in prompt.
2. Task: rewrite as canonical sentence. Approved verbs only; banned phrases never used. Max 500 chars.
3. Due: record raw phrase + attempt resolution per Section 6.2 rules.
4. Source: timestamp + verbatim quote (≤500 chars). Quote must appear word-for-word after normalization.
5. Confidence: 0.0–1.0 per field, overall = min. Calibrated.
6. Confidence reasons: explain low scores in plain text.
7. Verb category: from taxonomy.
8. No co-owners (deferred); single-owner only. If genuinely joint, pick one and note in confidence_reasons.
9. Do not infer priority. Do not link records. Both downstream.
10. Include DG's own commitments.
11. Skip cancelled items.

### 5.2 Virtual-specific addendum

> Speaker labels in this transcript are reliable. Use the labeled speaker as primary owner signal when a directive is followed by acknowledgment. Cross-reference name_raw against the meeting attendee list provided in `<meeting_metadata>`.

### 5.3 In-person-specific addendum

> Speaker labels in this transcript are unreliable or generic ("Speaker 1"). Infer ownership from textual context: directive patterns ("Kesh, you'll handle this"), addressed-name patterns, acknowledgment patterns ("yes, I'll do that" within 3 turns of a directive), and attendee list. Lower owner confidence appropriately. When the speaker is "Speaker N" and no name appears in the surrounding directive, set name_raw to "unknown" and confidence_overall ≤ 0.5.

### 5.4 Meeting metadata block

Every prompt receives:

```
<meeting_metadata>
  <date>2026-04-13</date>
  <title>Weekly Management Call</title>
  <type>internal</type>
  <modality>virtual</modality>
  <attendees>
    - Alfonso De Armas (alfonso.dearmas@mpua.gov.gy)
    - Kesh Nandlall (kesh.nandlall@gpl.gy)
    ...
  </attendees>
</meeting_metadata>
```

Date is what "today" / "tomorrow" / "this week" resolve relative to.

### 5.5 Output via tool-use

Extraction calls Claude with a tool whose `input_schema` is the JSON schema. The model returns the items as a tool_use block. No free-form parsing of the assistant message.

---

## 6 — Validation, resolution, priority

### 6.1 Validation

Runs on every accepted item, regardless of source.

- **Banned phrases** (case-insensitive substring match on `task`): `follow up on`, `follow up with`, `touch base`, `circle back`, `look into`, `handle`, `address the issue of`, `work on` (when followed by no specific deliverable). Hit → flagged in review.
- **Verb taxonomy**: first verb in canonical sentence must be in the approved list for its `verb_category`. Hit → flagged.
- **Required fields**: `task`, `verb_category`, `agency_name`, `owner_id` non-null at accept time.
- **Quote substring** (extraction-source items only): `source_quote` must appear in the transcript after normalization (lowercase, collapse whitespace, strip `[inaudible]` / `[crosstalk]` / `[applause]` markers, normalize smart quotes, normalize em/en dashes). Miss → hard fail; item rejected pre-review.

### 6.2 Resolution: owner

Two-stage per Locked decision Q4:

1. **Meeting-scoped**: candidates = meeting attendees + MPUA seed staff. Match `name_raw` (lowered, stripped) against `users.name` and `users.aliases`. Unique match in scope → assign.
2. **Global fallback** (only if stage 1 yields nothing): match against full MPUA + portfolio universe. Accept only if confidence ≥0.95 AND first name unique across the entire pool.
3. **Role fallback** (in_person only): if `name_raw` is a role string (`minister`, `ps`, `the gpl chair`), look up `users WHERE agency=<agency_name> AND is_agency_head=true` (or `closure_mode='dg_managed'` and matching role).

Resolution failure → `owner_id=NULL`, item forced to mandatory review. Cannot leave the queue without owner_id set.

### 6.3 Resolution: due date

| Phrase                           | Resolved to                                    |
|----------------------------------|------------------------------------------------|
| `today` / `EOD today`            | `meeting_date` 18:00 America/Guyana            |
| `tomorrow` / `by morning`        | `meeting_date + 1 day` 09:00                   |
| `this week`                      | Friday of meeting week, 17:00                  |
| `next week`                      | Friday of following week, 17:00                |
| `ASAP`                           | `meeting_date + 3 weekdays`, flagged for confirm |
| `when ready` / `in due course`   | NULL; `due_trigger` required                   |
| (no temporal language)           | NULL with confidence 0.5; mandatory review     |

Edge case: if `meeting_date` is Friday afternoon and phrase is `this week`, resolve to following Friday 17:00.

"Weekdays" = Mon–Fri, no holiday calendar.

### 6.4 Priority assignment (post-extraction, programmatic)

| Tier | Rule |
|------|------|
| P0 | Deadline ≤24h AND (safety keyword present in `task` OR `quote` OR speaker is Minister/President) |
| P1 | Deadline ≤5 weekdays AND speaker is Minister or PS |
| P2 | Deadline 6–28 days |
| P3 | No deadline OR deadline >28 days |

Safety keywords: `safety, fire, accident, fatality, injury, hazard, evacuation, emergency, outage, blackout, spill, contamination`. Maintain in `lib/action-items/resolution/safety-keywords.ts`.

(Original plan had a "blocks another tracked project" clause — removed because v1 has no cross-module record matching.)

---

## 7 — Political-risk gate

An item is **mandatory review** if ANY:

- `meeting.type IN ('agency', 'external')`
- `meeting.modality IN ('in_person', 'mixed')`
- `owner.is_agency_head = true`
- `owner.id = DG`
- `confidence_overall < 0.85`
- Any validation flag raised
- `owner_id IS NULL`
- `due_at IS NULL AND due_trigger IS NULL`
- The source extraction's transcript had `>30%` `[inaudible]` markers (set by failure handler in §12.3)

Items not caught by the gate go to **quick-scan** (pre-checked, batch-confirm).

Earned auto-accept (deferred activation):

- Tracked per `agency_name`, rolling window of 20 most recent meetings.
- Eligible when: ≥4 meetings reviewed, ≥90% items accepted unedited, zero attribution-error flags in window.
- Even when eligible, items must also pass the political-risk gate AND have `confidence_overall ≥ 0.9`.
- Single attribution-error flag from DG (logged as `event_type='attribution_error_flagged'` in `action_item_events`) resets the window: combination drops to full review for 4 meetings.
- v1 ships with the tracker built but **disabled**. Activation gated until 4-meeting eval passes.

In v1, only `(internal, virtual, agency_name='MPUA-DG')` is realistically eligible.

---

## 8 — Review experience

### 8.1 Queue: meeting cards

Route: `/action-items/review`.

Each card:

```
[type icon] [modality icon]  Weekly Management Call — 13 Apr 2026
internal · virtual · MPUA-DG
18 items · 7 require review · 11 quick-scan · 0 auto-accepted
[Open]
```

### 8.2 Single-meeting review: three buckets

Route: `/action-items/review/[extractionId]`.

Layout: transcript snippet on the left (timestamp jump), proposed item on the right.

- **🔴 Mandatory review** (top): one-at-a-time, all fields editable. Default focus on the field flagged by the gate (low confidence highlighted yellow).
- **🟡 Quick scan** (middle): list view with pre-checked checkboxes. Untick to reject; click to expand and edit.
- **🟢 Auto-accepted** (collapsed): visible but folded.

Keyboard shortcuts: `A` accept, `E` edit, `R` reject, `J/K` next/previous, `Enter` save, `S` mark as supersession candidate (opens picker), `M` add manual item to this meeting.

All fields are editable for every item, regardless of confidence — confidence only governs *flagging*, never *editability* (Q11 fix from plan critique).

### 8.3 Inline manual-add

`M` opens a small form pre-filled with the meeting's metadata. Same field set as freestanding form (Section 8.5). Submit appends to bucket 1 (mandatory) for explicit accept.

### 8.4 Supersession suggestion

For every extracted item, run the matcher (Section 9). If a candidate scores ≥0.75 AND its agency_name+owner_id match, surface in the item card:

> ⚠ This may supersede *Issue notification of termination to InterEnergy* (Kesh Nandlall, GPL, opened 14 days ago). [Link as supersession] [Not the same]

Never auto-link. Reviewer one-tap.

### 8.5 Freestanding manual-add

Route: `/action-items/new`. Also reachable from any `meetings_seen` card with `pipeline_action='skipped_out_of_scope'` via "Process manually" button — pre-populates `source_meeting_id`, meeting metadata.

Required fields: `agency_name`, `owner_id`, `verb_category`, `task`. Optional: `due_at` or `due_trigger`, `delegated_to_id`, `priority` (auto-computed if blank). Validation runs the same as extraction items. Created item enters the relevant agency view directly as `open` (skips review queue — DG is the creator, no triage needed).

---

## 9 — Supersession matcher

Same logic, two callers: real-time during review, weekly background job for drift.

**Candidate set:** `action_items WHERE status IN ('open','in_progress','awaiting_verification') AND owner_id = candidate.owner_id AND agency_name = candidate.agency_name AND created_at >= now() - interval '60 days'`.

**Score:** weighted sum (weights tunable, start point):
- 0.5 × cosine similarity of `task_embedding` vectors
- 0.3 × Jaccard overlap of capitalized noun phrases (proper nouns + agency-specific terms; extracted via simple regex on capitalized 1–3 word sequences excluding sentence-initial)
- 0.2 × indicator (1.0 if `verb_category` matches, else 0)

**Surface threshold:** ≥0.75 → suggest.

**Real-time use (review queue):** Section 8.4.

**Weekly drift use:** scheduled job runs Sunday 02:00 UTC. For every item created in the past 7 days where supersession was *not* suggested at review time, re-run matcher. If score ≥0.75 against any older open item, surface in a Monday 7am "Drift report" card on DG dashboard. Non-blocking.

---

## 10 — Closure & verification

### 10.1 Owner self-close

Owners see only their items at `/action-items/mine` (filtered `WHERE owner_id = session.user.id` — app-layer, consistent with existing DGOS modules per CLAUDE.md; no Supabase RLS).

Action: mark complete with one-line `completion_note` (required, ≥10 chars). `status` → `awaiting_verification`. `completed_by`, `completed_at` set.

### 10.2 DG verification

DG's daily briefing surfaces all `awaiting_verification` items.

- **Confirm** (one tap): `status` → `complete`. `verified_by`, `verified_at` set.
- **Dispute** (one tap → modal for note): `status` → `open`. `dispute_note`, `disputed_at` set. Owner sees dispute on next page load. Event row in `action_item_events`.

### 10.3 DG bulk close

From any consumption view, DG can directly mark an item `complete` (skipping verification) when DG has first-hand knowledge. Logged as `event_type='status_change'` with payload `{from:'open', to:'complete', via:'dg_direct'}`.

### 10.4 dg_managed users

Items where `owner.closure_mode = 'dg_managed'` (Minister, PS, President):

- Not visible to the owner in `/mine` (filter excludes them — they can't close).
- Skip `awaiting_verification`. DG flips `open` → `complete` directly.
- Show in agency-grouped views under the appropriate `agency_name` (e.g., `MPUA-Minister → Indar`).

### 10.5 Delegation

`delegated_to_id` is set when DG is owner but task is executed by staff. Default visibility: visible to delegate (no opt-in switch — sensitive items shouldn't be in DGOS).

Renders:
- DG's `/mine`: item appears as DG's own with badge "delegated: Kesh".
- Kesh's owner view (`/action-items/mine`): separate section *Delegated by DG (not owned by you)*. Visible, not closable.
- Agency-grouped consumption: under `MPUA-DG → Alfonso`, not under `GPL → Kesh`.

---

## 11 — Consumption views

### 11.1 `/action-items` (default)

Agency → owner → item tree. Two columns:

- Left: agency list with open counts (`GPL (13 open)`, `GWI (8 open)`, …).
- Right: when an agency is selected, owner list with items grouped under each owner. Each item card shows canonical sentence, due date, priority badge, and "from [meeting], [date]" attribution (clickable to source).

Filters: priority, due window (today / this week / overdue), status (default: `open`, `in_progress`, `awaiting_verification`).

### 11.2 `/action-items/mine`

Items where `owner_id = session.user.id`. Same card UI, no agency-grouping (all the same owner). Special section at top: *Delegated by DG (not owned)* — visible to staff, not present for DG.

For DG: also surfaces all `awaiting_verification` items globally as a top section (entry to verification flow).

### 11.3 `/action-items/agency/[name]`

Per-agency view. Same as the right column of `/action-items`, scoped to one agency. Useful link target from other DGOS modules (Procurement, Projects).

### 11.4 Item detail

`/action-items/[id]`. Shows full metadata, source-quote with timestamp link, full event log from `action_item_events`, supersession chain (if any), edit history.

### 11.5 Visibility

App-layer enforcement, consistent with existing DGOS pattern:

- DG, PS: see all items.
- Minister: see all items (read-only).
- Agency head / agency staff: see items where `agency_name = their.agency` OR `owner_id = their.id` AND `visibility_scope = 'agency_normal'`.
- `visibility_scope = 'dg_only'`: visible to DG only, regardless of agency match. Set automatically at insert when source extraction's `meeting_type = 'external'`. DG can flip to `agency_normal` to share.

The `visibility_scope` column is defined in §3.3.

---

## 12 — Polling & failure handling

### 12.1 Cron

Vercel Cron, schedule `*/10 * * * *`, hits `POST /api/action-items/poll-fireflies`.

### 12.2 Poll algorithm

1. Acquire advisory lock `pg_try_advisory_lock(hashtext('action_items_poller'))`. If not acquired, exit (another run in flight).
2. Watermark: `since = max(transcript_ready_at) FROM meetings_seen`.
3. Call Fireflies `listTranscripts(since)`.
4. For each meeting: insert into `meetings_seen` with `INSERT ... ON CONFLICT (fireflies_meeting_id) DO NOTHING`.
5. Detection (Section 4) populates `detected_*` and `transcript_ready_at`.
6. Decide pipeline action:
   - `internal` + `virtual` → enqueue for extraction (set `pipeline_action='queued'`)
   - else → `pipeline_action='skipped_out_of_scope'`, `skip_reason='v1_scope: only internal+virtual extracted'`
7. For each queued meeting: pull full transcript, hash it (`transcript_hash`), call extractor.
8. Release advisory lock.

### 12.3 Failure handling (Q10 = B + observability)

| Failure | Detection | Handling |
|---------|-----------|----------|
| Speaker label collapse (virtual) | `>50%` of speakers labeled `Speaker N` | Don't extract. Insert into `failed_extractions` with reason `speaker_collapse_virtual`. `meetings_seen.pipeline_action='failed'`. Surface in daily digest with "voice training needed" hint. |
| Speaker label collapse (in_person/mixed) | Same | Expected. Use in-person prompt regardless. |
| `[inaudible]` >30% of transcript | Substring count | Extract anyway. Force every item to mandatory review (added clause to political-risk gate). |
| Partial transcript | Fireflies `transcript_ready` flag absent or `transcript_status != 'complete'` | Don't extract. `pipeline_action='queued'`. Re-check next poll. |
| Edited after extraction | `transcript_hash` differs from stored `extraction.transcript_hash` | Mark old extraction `review_status='superseded'`. Re-extract. |
| Transcript >60k tokens | Token count pre-call | Chunk into 30-min windows with 5-min overlap. Extract each. Dedupe via supersession matcher post-merge. Flag in dashboard as "high-cost extraction." |
| Claude error | API exception | Retry 3× exponential backoff (1s, 4s, 16s). On persistent fail: `failed_extractions` with `claude_error`, push notification to DG. |
| Malformed JSON (tool-use schema violation) | Schema validate tool_use input | Retry once with reminder message. On persistent fail: `failed_extractions` with `malformed_json`. |

### 12.4 Daily digest (7am Guyana time, push notification + dashboard card)

```
Yesterday: 4 meetings detected
  ✓ 2 extracted (1 management, 1 bilateral-internal)
  ⊘ 1 skipped (in_person — process manually)
  ✗ 1 failed (Claude error after 3 retries) [Retry now]

Pending review: 23 items across 3 meetings
Awaiting your verification: 7 items from 4 owners
```

---

## 13 — Eval rubric (post-launch)

The original Phase 0 eval runs in production for the first 4 internal-virtual meetings (the only modality+type extracted in v1). Per meeting:

- Process in review-only mode (earned auto-accept disabled at launch).
- DG reviews every item.
- System logs per-field edits, rejects, manual additions.
- After 4 meetings, compute against the labeled ground truth file (`action_items_2026-04-13.md` and three more to be labeled in same format):
  - Commitment recall
  - Commitment precision
  - Owner accuracy
  - Task quality (manual rating, 1–5)
  - Due-date accuracy
  - Overconfidence rate (high-confidence wrong answers)

**Activate earned auto-accept (per `(virtual, internal, MPUA-DG)`) when:**

- Recall ≥ 90%
- Precision ≥ 85%
- Owner accuracy ≥ 85%
- Overconfidence ≤ 5%

If thresholds miss after 4 meetings: tune to `extraction-virtual-v0.2`, run 4 more.

In-person prompt remains drafted but unwired until v1.5.

---

## 14 — File / folder structure

```
/app
  /action-items
    page.tsx                                # consumption: agency tree
    /agency/[name]/page.tsx                 # per-agency
    /mine/page.tsx                          # owner-scoped
    /new/page.tsx                           # freestanding manual-add
    /[id]/page.tsx                          # item detail + event log
    /review
      page.tsx                              # meeting card list
      /[extractionId]/page.tsx              # 3-bucket review
  /api
    /action-items
      /poll-fireflies/route.ts              # cron entry
      /extract/route.ts                     # manual extraction trigger
      /[id]/route.ts                        # GET / PATCH single
      /[id]/complete/route.ts               # owner self-close
      /[id]/verify/route.ts                 # DG confirm
      /[id]/dispute/route.ts                # DG dispute
      /[id]/supersedes/route.ts             # link supersession
      /review/[extractionId]/route.ts       # batch submit decisions
      /digest/route.ts                      # 7am digest generator (cron)

/lib
  /action-items
    /prompts
      extraction-virtual-v0.1.ts
      extraction-inperson-v0.1.ts           # drafted, not wired in v1
    /fireflies
      client.ts
      types.ts
      poll.ts
    /detection
      type.ts                               # internal/agency/external
      modality.ts                           # virtual/in_person/mixed
      agency.ts                             # which portfolio agency
    /extraction
      extract.ts                            # Claude tool-use call
      types.ts
      chunk.ts                              # >60k token transcript chunking
    /resolution
      owner.ts                              # meeting-scoped → global → role
      due.ts
      priority.ts
      safety-keywords.ts
    /validation
      banned-phrases.ts
      verb-taxonomy.ts
      required-fields.ts
      quote-substring.ts
      normalize.ts                          # transcript text normalization
      index.ts
    /matcher
      supersession.ts                       # used real-time + weekly drift
      embeddings.ts
    /trust
      tracker.ts                            # rolling 20-window per agency
    /events
      log.ts                                # write to action_item_events

/components
  /action-items
    AgencyTree.tsx
    OwnerSection.tsx
    ItemCard.tsx
    ReviewBucket.tsx
    TranscriptSnippet.tsx
    EditForm.tsx
    SupersessionPicker.tsx
    ManualAddInline.tsx
    ManualAddFreestanding.tsx
    DailyDigestCard.tsx
    VerificationQueue.tsx
    DelegatedSection.tsx
```

---

## 15 — What the original plan got wrong (carried-forward fixes)

For traceability against `action_items_plan.md`:

- `people` table does not exist in DGOS; widen `users` instead.
- `meeting_id UNIQUE` would have blocked re-extraction; now `UNIQUE (meeting_id, prompt_version)`.
- Prompt now receives `meeting_date` explicitly via `<meeting_metadata>` block — without it, "today"/"tomorrow" resolution is impossible.
- Quote-substring validation now has a defined normalization (`normalize.ts`).
- Confidence-gated editability bug fixed: all fields editable, confidence governs flagging only.
- Tool-use replaces free-form JSON parsing.
- Cron platform locked to Vercel Cron.
- Notification channel locked to existing web push.
- Idempotency via advisory lock + `ON CONFLICT DO NOTHING`.
- Watermark on `transcript_ready_at`, not `meeting_date`.
- Priority rule referencing "blocks another tracked project" removed (no cross-module matching in v1).
- Safety-keyword list defined (was undefined).
- Attribution string computed at render time (was stored, would go stale).
- Co-owner array dropped (deferred); single-owner with `delegated_to_id`.

---

## 16 — Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Extraction quality on first internal virtual meeting is poor | High | Eval gate before earned-trust activation. v1 ships with mandatory review on every item until thresholds met. |
| Fireflies speaker labels collapse on virtual call | Medium | Detector + quarantine. Daily digest surfaces. |
| In-person prompt unused at launch but expected by users to "just work" | Medium | Daily digest + meeting card explicitly flags `skipped_out_of_scope` with "Process manually" CTA. UX makes the skip visible. |
| pgvector not enabled on Supabase | Low (verifiable) | Pre-flight check before migration runs. If unavailable, supersession matcher falls back to noun-overlap + verb-category only. |
| Anthropic ZDR not contractually in place at launch | Medium | Switch to Vercel AI Gateway with ZDR enabled; documented in extract.ts header. |
| DG reviews 4 meetings, none of them clean enough for trust activation; review burden persists indefinitely | Medium | After 8 meetings without trust activation, redesign review UX rather than further prompt-tune (signal that the system shape is wrong, not the prompt). |
| Agency head's name changes (new CEO appointed) | Low | Two-line admin job: flip `is_agency_head` flags. Documented runbook. |
| External-meeting item visibility leak (`dg_only` flag bypassed) | Low / High impact | App-layer enforcement on every list endpoint. Test coverage required for visibility filter. |
| Drift detector false positives swamp Monday digest | Medium | Threshold tunable; start at 0.75, raise if noisy. |
| 60-day supersession candidate window misses cycles longer than 60 days | Low | Acceptable for v1. Window is a constant; trivially adjustable. |

---

## 17 — Open questions for v1.5+ (intentionally not in v1)

- When does in_person extraction wire on? Probably after 4 weeks of v1 data shows what % of meetings are skipped.
- Cross-module matching to Procurement / Projects / War Room — what's the trigger UX?
- Co-owner first-class — only if 13 April-style transcripts show >10% joint commitments.
- Webhook upgrade from polling — only if Fireflies plan supports and meeting cadence pressures the 10-min interval.

---

## End of design spec
