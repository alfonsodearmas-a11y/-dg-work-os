-- 148_direct_outreach_transfers.sql
--
-- Agency transfer (superadmin-only override of a case's owning agency).
-- Same snapshot-survival design as 147: NO foreign keys to
-- direct_outreach_cases; case_id re-attaches by value across uploads.
--
-- effective_agency = COALESCE(override, workbook agency) is computed in the
-- direct_outreach_open_v view so every read (scope clause, filters, scorecards)
-- follows the transfer from one place. Transferring a case back to its
-- workbook agency DELETES the override (the audit row still records it), so
-- `transferred` is true only while the effective agency actually differs.

-- Current override — one row per case, cheap PK join for the view.
CREATE TABLE public.direct_outreach_agency_overrides (
  case_id integer PRIMARY KEY,
  agency  text NOT NULL,                 -- 'GWI' | 'GPL' | 'PUA' (validated in the route)
  set_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  set_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only audit of every transfer (including reverts).
CREATE TABLE public.direct_outreach_transfers (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id                  integer NOT NULL,
  from_agency              text,         -- effective agency before this transfer
  to_agency                text NOT NULL,
  cleared_assignee_user_id uuid,         -- the officer removed by this transfer, if any
  reason                   text NOT NULL, -- required (amendment A)
  transferred_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  transferred_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX direct_outreach_transfers_case_idx
  ON public.direct_outreach_transfers (case_id, transferred_at DESC);

ALTER TABLE public.direct_outreach_agency_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_outreach_transfers        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_agency_overrides,
              public.direct_outreach_transfers
  FROM anon, authenticated;

-- View v3: DROP + CREATE (not OR REPLACE) — migration 147 added point_person
-- and region to direct_outreach_cases, so c.* now expands differently and the
-- old view's frozen column order can't be replaced in place (42P16). The view
-- is a stored query with no data; nothing else depends on it, and it is
-- recreated in this same migration transaction.
DROP VIEW public.direct_outreach_open_v;
CREATE VIEW public.direct_outreach_open_v
  WITH (security_invoker = on) AS
SELECT
  c.*,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (c.created_at AT TIME ZONE 'America/Guyana')::date)              AS days_open,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (coalesce(c.last_activity_at, c.created_at) AT TIME ZONE 'America/Guyana')::date) AS days_idle,
  CASE
    WHEN c.created_at IS NULL THEN 'Unknown'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 30  THEN '0-30'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 90  THEN '31-90'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 180 THEN '91-180'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 365 THEN '181-365'
    ELSE 'Over 365'
  END                                                                   AS age_bucket,
  (c.committed_date IS NOT NULL
     AND c.committed_date < (now() AT TIME ZONE 'America/Guyana')::date) AS committed_overdue,
  coalesce(o.agency, c.agency)                                          AS effective_agency,
  (o.agency IS NOT NULL AND o.agency IS DISTINCT FROM c.agency)         AS transferred
FROM public.direct_outreach_cases c
LEFT JOIN public.direct_outreach_agency_overrides o ON o.case_id = c.case_id
WHERE c.status <> 'Resolved';

-- Belt-and-braces on top of the WITH clause (146 lineage).
ALTER VIEW public.direct_outreach_open_v SET (security_invoker = on);
