-- 147_direct_outreach_assignments.sql
--
-- Direct Outreach enhancements (plan: docs/plans/direct-outreach-enhancements.md).
--
-- Officer assignment — human-entered data that must SURVIVE the snapshot-replace
-- workbook upload (import-xlsx.ts wipes and re-inserts direct_outreach_cases +
-- _updates on every upload). Therefore: deliberately NO foreign key to
-- direct_outreach_cases — case_id is OP Direct's stable external id and
-- re-attaches by value; an FK would either cascade-wipe assignments on every
-- upload or break the importer. Orphans (case dropped from a later workbook)
-- are invisible to reads (all reads join FROM the case tables) and are kept
-- deliberately, so a wrong-file upload cannot destroy assignments.

CREATE TABLE public.direct_outreach_assignments (
  case_id          integer PRIMARY KEY,
  assignee_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX direct_outreach_assignments_assignee_idx
  ON public.direct_outreach_assignments (assignee_user_id);

-- RLS stance identical to 145/146: enabled, zero policies (default-deny for
-- client roles), grants revoked; the lib/db-pg pool is table owner.
ALTER TABLE public.direct_outreach_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_assignments FROM anon, authenticated;

-- Workbook-owned display columns — safe on the wiped table precisely because
-- the workbook re-supplies them on every upload. Both headers are OPTIONAL in
-- the importer, so an older workbook without them still uploads (nulls).
ALTER TABLE public.direct_outreach_cases ADD COLUMN point_person text;
ALTER TABLE public.direct_outreach_cases ADD COLUMN region text;
