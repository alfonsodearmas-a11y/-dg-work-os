-- 150_direct_outreach_officer_updates.sql
--
-- Direct Outreach v3 (plan: docs/plans/direct-outreach-v3.md) — writable
-- officer progress updates + working state.
--
-- Both tables are human-entered and must SURVIVE the snapshot-replace workbook
-- upload (import-xlsx.ts wipes direct_outreach_cases + _updates on every
-- upload). Same design as 147/148: deliberately NO foreign key to
-- direct_outreach_cases — case_id is OP Direct's stable external id and
-- re-attaches by value; orphans (case dropped from a later workbook) are
-- invisible to reads and kept deliberately.

-- Append-only progress log. A row is a remark, a working-status change, a
-- target-date change, or any combination (the CHECK requires at least one).
-- No UPDATE/DELETE path exists in the app (locked decision Q5) — this is an
-- accountability record, same ethos as direct_outreach_transfers.
CREATE TABLE public.direct_outreach_officer_updates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            integer NOT NULL,
  -- SET NULL (not CASCADE): deleting a user must not erase the record that
  -- updates happened (148 transferred_by precedent). Null renders "Former user".
  author_id          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body               text,        -- @-mentions stored as @[uuid] (Tasks wire format)
  new_working_status text
    CHECK (new_working_status IN
      ('not_started','in_progress','blocked','resolved_pending_verification')),
  new_target_date    date,
  target_cleared     boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    coalesce(btrim(body), '') <> ''
    OR new_working_status IS NOT NULL
    OR new_target_date IS NOT NULL
    OR target_cleared
  )
);
CREATE INDEX direct_outreach_officer_updates_case_idx
  ON public.direct_outreach_officer_updates (case_id, created_at DESC);
CREATE INDEX direct_outreach_officer_updates_author_idx
  ON public.direct_outreach_officer_updates (author_id, created_at DESC);

-- Current working state — one row per case, cheap PK join for the view (148
-- overrides pattern). Absence of a row = 'not_started', no target. Maintained
-- in the same transaction as the log insert so state and history never disagree.
CREATE TABLE public.direct_outreach_case_state (
  case_id        integer PRIMARY KEY,
  working_status text NOT NULL DEFAULT 'not_started'
    CHECK (working_status IN
      ('not_started','in_progress','blocked','resolved_pending_verification')),
  target_date    date,
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS stance identical to 145/146/147/148: enabled, zero policies (default-deny
-- for client roles), grants revoked; the lib/db-pg pool is table owner.
ALTER TABLE public.direct_outreach_officer_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_outreach_case_state      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_officer_updates,
              public.direct_outreach_case_state
  FROM anon, authenticated;
