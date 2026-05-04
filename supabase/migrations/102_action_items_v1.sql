-- ============================================================================
-- Migration 102: Action Items v1 — Foundation
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + 5 new tables for the action items pipeline.
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated action item is attributed to the meeting itself,
-- not to the AI and not to the DG personally. This is non-negotiable
-- and reaches into the schema via action_items.source + extraction linkage.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- Widen users (locked decision: single users table carries staff metadata,
-- no separate staff_profile join table).
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, Parliamentary Secretary, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';

-- ----------------------------------------------------------------------------
-- action_item_extractions — one row per (Fireflies meeting, prompt version)
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
-- action_items — canonical commitment record
-- Single owner (delegation modeled as separate field, not co-owner).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_items (
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

  -- Visibility (spec §11.5)
  visibility_scope    TEXT NOT NULL DEFAULT 'agency_normal'
                        CHECK (visibility_scope IN ('agency_normal','dg_only')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT extraction_fields_required CHECK (
    source = 'manual' OR
    (extraction_id IS NOT NULL
     AND source_meeting_id IS NOT NULL
     AND extraction_item_idx IS NOT NULL
     AND confidence_overall IS NOT NULL)
  ),
  CONSTRAINT manual_creator_required CHECK (
    source = 'extraction' OR created_by IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_items_agency_owner_status
  ON action_items(agency_name, owner_id, status)
  WHERE status IN ('open','in_progress','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_items_owner_status
  ON action_items(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_items_status_due
  ON action_items(status, due_at)
  WHERE status IN ('open','in_progress');
CREATE INDEX IF NOT EXISTS idx_items_supersedes
  ON action_items(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_extraction
  ON action_items(extraction_id);
CREATE INDEX IF NOT EXISTS idx_items_embedding
  ON action_items USING ivfflat (task_embedding vector_cosine_ops);

-- ----------------------------------------------------------------------------
-- action_item_events — append-only audit log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_events (
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

CREATE INDEX IF NOT EXISTS idx_events_item
  ON action_item_events(item_id, occurred_at DESC);

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
-- Compatibility note: existing users_agency_check constraint (migration 021)
-- requires agency IS NULL for dg/minister/ps. is_agency_head is independent
-- of agency: Minister/PS can have is_agency_head=true with agency=NULL.
-- ----------------------------------------------------------------------------
