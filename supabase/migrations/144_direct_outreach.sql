-- 144_direct_outreach.sql
--
-- Direct Outreach — Works Visibility. Local mirror of the Presidential Direct
-- Outreach (OP Direct) case load so the minister has live visibility over the
-- works needed: open backlog by agency, days-idle stall flags, imported comment
-- history, and auto-detected completion/target dates with overdue flags.
--
-- Source of truth stays in OP Direct (opdirect.dakeung.com); these tables are a
-- read-only sync target refreshed by /api/cron/direct-outreach-sync (weekdays)
-- or the superadmin "Refresh from OP Direct" button. Additive only.

-- ── Cases (one row per OP Direct case, all statuses) ─────────────────────────

CREATE TABLE public.direct_outreach_cases (
  case_id                integer PRIMARY KEY,          -- OP Direct case_id
  client_id              integer,
  client_name            text,
  client_phone           text,
  client_address         text,
  public_servant         text,
  agency_id              integer,
  agency                 text,                         -- 'GPL' | 'GWI' | 'PUA'
  status_id              integer,
  status                 text,                         -- Open | Referred | Follow Up | In Queue | Unreachable | Not Actionable | Resolved
  description            text,
  priority               integer,
  priority_flag          text,                         -- derived: 'Normal' (priority=0) | 'Elevated'
  theme                  text,                         -- derived: classifyTheme() keyword classification
  outreach_id            integer,
  outreach_location      text,
  outreach_date          text,                         -- kept verbatim from OP Direct (format not guaranteed)
  category_name          text,
  unclassified_category  text,
  latitude               double precision,
  longitude              double precision,
  creator                text,
  created_at             timestamptz,
  -- Sync rollups (derived from the imported comment history)
  latest_update          text,                         -- latest substantive comment
  latest_update_date     timestamptz,
  latest_update_by       text,
  comment_count          integer NOT NULL DEFAULT 0,   -- substantive comments only
  last_activity_at       timestamptz,                  -- newest history entry of any kind
  committed_date         date,                         -- auto-detected completion/target date (heuristic — verify)
  committed_source       text,                         -- the comment the date was extracted from
  committed_by           text,                         -- username of that comment
  synced_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX direct_outreach_cases_status_idx ON public.direct_outreach_cases (status);
CREATE INDEX direct_outreach_cases_agency_idx ON public.direct_outreach_cases (agency);
CREATE INDEX direct_outreach_cases_open_idx
  ON public.direct_outreach_cases (agency, status)
  WHERE status <> 'Resolved';

-- ── Imported comment history (idempotent on OP Direct case_detail_id) ────────

CREATE TABLE public.direct_outreach_updates (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_ref      integer NOT NULL UNIQUE,              -- OP Direct case_detail_id
  case_id        integer NOT NULL REFERENCES public.direct_outreach_cases(case_id) ON DELETE CASCADE,
  agency         text,
  creator_agency text,
  status         text,
  comment        text,
  username       text,
  created_at     timestamptz
);

CREATE INDEX direct_outreach_updates_case_idx ON public.direct_outreach_updates (case_id, created_at DESC);

-- ── Sync state singleton ─────────────────────────────────────────────────────

CREATE TABLE public.direct_outreach_sync_state (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at timestamptz,
  cases_seen     integer,
  updates_seen   integer
);

INSERT INTO public.direct_outreach_sync_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── Open-backlog view (aging computed here, now()-relative) ──────────────────

CREATE VIEW public.direct_outreach_open_v AS
SELECT
  c.*,
  (current_date - c.created_at::date)                                  AS days_open,
  (current_date - coalesce(c.last_activity_at, c.created_at)::date)    AS days_idle,
  CASE
    WHEN current_date - c.created_at::date <= 30  THEN '0-30'
    WHEN current_date - c.created_at::date <= 90  THEN '31-90'
    WHEN current_date - c.created_at::date <= 180 THEN '91-180'
    WHEN current_date - c.created_at::date <= 365 THEN '181-365'
    ELSE 'Over 365'
  END                                                                  AS age_bucket,
  (c.committed_date IS NOT NULL AND c.committed_date < current_date)   AS committed_overdue
FROM public.direct_outreach_cases c
WHERE c.status <> 'Resolved';

-- ── RLS (mirrors the hinterland tables' convention) ──────────────────────────
-- Reads: any authenticated user. Writes: only via the server (lib/db-pg pool as
-- table owner / service role through requireRole routes), which bypasses RLS —
-- so no write policy is defined (default deny for clients).

ALTER TABLE public.direct_outreach_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_outreach_cases_read ON public.direct_outreach_cases
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

ALTER TABLE public.direct_outreach_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_outreach_updates_read ON public.direct_outreach_updates
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

ALTER TABLE public.direct_outreach_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY direct_outreach_sync_state_read ON public.direct_outreach_sync_state
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
