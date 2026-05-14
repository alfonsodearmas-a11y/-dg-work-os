-- Pending Applications: live days_waiting view
--
-- Why this exists:
-- pending_applications.days_waiting is stored at ingest time and goes stale
-- the moment the upload finishes. The GWI parser also silently records 0
-- whenever the source file lacks a DAYS_DIFFERENCE column, which is the
-- shape of the current GWI extracts. This view shadows the stored column
-- with a live computed value so reads are always honest.
--
-- Read-path code targets this view. Writes still target the base table.
-- The stored days_waiting column is retained for now but is no longer read.

CREATE OR REPLACE VIEW pending_applications_with_wait AS
SELECT
  id,
  agency,
  customer_reference,
  first_name,
  last_name,
  telephone,
  region,
  district,
  village_ward,
  street,
  lot,
  event_code,
  event_description,
  application_date,
  GREATEST(
    0,
    ((now() AT TIME ZONE 'America/Guyana')::date - application_date)
  )::int AS days_waiting,
  raw_data,
  imported_at,
  data_as_of,
  pipeline_stage,
  account_type,
  service_order_type,
  service_order_number,
  account_status,
  cycle,
  division_code
FROM pending_applications;

-- Grants for PostgREST exposure under each Supabase role.
GRANT SELECT ON pending_applications_with_wait TO service_role;
GRANT SELECT ON pending_applications_with_wait TO authenticated;
GRANT SELECT ON pending_applications_with_wait TO anon;

COMMENT ON VIEW pending_applications_with_wait IS
  'pending_applications with days_waiting recomputed live in Guyana local time. Read this from API routes; write to the base table.';
