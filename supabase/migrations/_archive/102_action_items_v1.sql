-- ============================================================================
-- Migration 102: Action Items v1 — Foundation (rev 2026-05-03b)
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + tasks widening (extraction provenance,
-- verification flow, supersession, visibility) + 4 pipeline-side tables.
-- Disables the existing tasks RLS policy from migration 022 (visibility for
-- this module's flows is enforced app-layer, consistent with the rest of
-- DGOS — mixing RLS with app-layer guards is a footgun).
--
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated commitment is attributed to the meeting itself.
-- Computed at render time from tasks.source + supporting lookups.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- Widen users
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, parl_sec, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';

-- ----------------------------------------------------------------------------
-- action_item_extractions — one row per (Fireflies meeting, prompt version)
-- Created BEFORE the tasks widen because tasks.extraction_id FKs to it.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_extractions (
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
  CONSTRAINT extractions_meeting_prompt_unique UNIQUE (meeting_id, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_extractions_review_status
  ON action_item_extractions(review_status)
  WHERE review_status IN ('pending','in_review');
CREATE INDEX IF NOT EXISTS idx_extractions_meeting_date
  ON action_item_extractions(meeting_date DESC);

-- ----------------------------------------------------------------------------
-- Widen tasks: extraction provenance, verification flow, supersession,
-- visibility scope. The canonical commitment record is tasks; extraction
-- writes into tasks with source='extraction' and provenance fields set.
-- ----------------------------------------------------------------------------

-- Extraction provenance
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual','extraction'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extraction_id       UUID REFERENCES action_item_extractions(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extraction_item_idx INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_meeting_id   TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_timestamp    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_quote        TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_name_raw      TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegated_to_id     UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verb_category       TEXT
  CHECK (verb_category IN ('correspondence','decision','information',
                           'scheduling','project_update','analysis')
         OR verb_category IS NULL);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_trigger         TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_overall  NUMERIC(3,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_reasons  TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_embedding      VECTOR(1536);

-- Verification flow
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by    UUID REFERENCES users(id);
-- completed_at already exists from migration 029 — do nothing.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_by     UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispute_note    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS disputed_at     TIMESTAMPTZ;

-- Supersession (self-FK)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES tasks(id);

-- Visibility (default agency_normal; extraction sets dg_only for external meetings)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'agency_normal'
  CHECK (visibility_scope IN ('agency_normal','dg_only'));

-- Widen status enum
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('new','active','blocked','done',
                    'awaiting_verification','superseded'));

-- Source-conditional integrity: extraction tasks must carry full provenance.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS extraction_provenance_required;
ALTER TABLE tasks ADD CONSTRAINT extraction_provenance_required CHECK (
  source = 'manual' OR
  (extraction_id IS NOT NULL
   AND source_meeting_id IS NOT NULL
   AND extraction_item_idx IS NOT NULL
   AND confidence_overall IS NOT NULL)
);

-- Disable the migration-022 RLS policy in favor of app-layer enforcement.
-- Rationale: this module's verification + dispute + visibility flows already
-- live in app-layer code (canSeeTask helper + scoped queries). Mixing RLS
-- with app-layer guards is the project's standing footgun rule.
DROP POLICY IF EXISTS tasks_access ON tasks;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

-- Indexes for the new lifecycle and supersession workloads
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_open
  ON tasks(status, due_date)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_open
  ON tasks(owner_user_id, status)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_tasks_supersedes
  ON tasks(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_extraction
  ON tasks(extraction_id) WHERE extraction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_embedding
  ON tasks USING ivfflat (task_embedding vector_cosine_ops);

COMMENT ON COLUMN tasks.source IS
  'manual = created via Add Task; extraction = created from Fireflies pipeline.';
COMMENT ON COLUMN tasks.visibility_scope IS
  'agency_normal = standard role-based visibility; dg_only = DG sees only.';
COMMENT ON COLUMN tasks.delegated_to_id IS
  'Set when DG owns the task but staff executes. Delegate sees but cannot close.';

-- ----------------------------------------------------------------------------
-- action_item_events — append-only audit log for the pipeline + verification
-- flow, attached to the task. Coexists with task_activities (the human-action
-- log scoped to the existing Tasks UI) by design — different concerns.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_events (
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

CREATE INDEX IF NOT EXISTS idx_events_task
  ON action_item_events(task_id, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- meetings_seen — every Fireflies meeting we observe (drives daily digest)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meetings_seen (
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

CREATE INDEX IF NOT EXISTS idx_meetings_seen_date
  ON meetings_seen(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_seen_action
  ON meetings_seen(pipeline_action);

-- ----------------------------------------------------------------------------
-- failed_extractions — quarantine table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS failed_extractions (
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

CREATE INDEX IF NOT EXISTS idx_failed_extractions_unresolved
  ON failed_extractions(attempted_at DESC)
  WHERE resolved_at IS NULL;

-- ----------------------------------------------------------------------------
-- Compatibility note: existing users_agency_check (migration 021) requires
-- agency IS NULL for dg/minister/ps. is_agency_head is independent —
-- Minister/PS may have is_agency_head=true with agency=NULL.
-- The existing tasks_status_check from migration 029 has been replaced above
-- with the widened set including awaiting_verification and superseded.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Register the action-items module so the admin UI can grant per-user access.
-- Ministry roles bypass module access checks (per useModuleAccess hook), so
-- the entry mainly matters for agency_admin/officer accounts that may need
-- the review queue surface in later phases.
-- ----------------------------------------------------------------------------

INSERT INTO modules (slug, name, description, default_roles)
VALUES (
  'action-items',
  'Action Items',
  'Extraction pipeline that creates Tasks from Fireflies meeting transcripts. Sidebar entry points at the review queue.',
  ARRAY['dg','minister','ps','parl_sec']
)
ON CONFLICT (slug) DO NOTHING;
