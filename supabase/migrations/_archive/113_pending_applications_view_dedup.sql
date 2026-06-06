-- Dedupe pending_applications_with_wait at the view layer.
--
-- Why this exists:
-- The GPL parser walks every sheet in the uploaded workbook. GPL extracts
-- contain multiple daily snapshot sheets ("OUT NS Cap Works 26days Mar5",
-- Mar8, Mar9, ..., Mar15, etc.), so the same outstanding application gets
-- inserted once per sheet it appears in. Customer SUNIL NARINE
-- (customer_reference 0681113, service_order_number 3461404) appeared 9
-- times in the May 4 GPL upload. Total GPL rows: 14,497 inflated, vs
-- 2,870 distinct (customer_reference, service_order_number).
--
-- This redefinition adds a ROW_NUMBER dedup keyed on
-- (agency, customer_reference, service_order_number), keeping the row
-- with the highest id (which corresponds to the most recently inserted
-- snapshot for that application). The fix is at the read layer so it
-- applies immediately to every consumer without touching the parser
-- and without any data backfill.
--
-- Idempotent. The view name does not change. Re-running this migration
-- replaces the view definition with the same content.

CREATE OR REPLACE VIEW pending_applications_with_wait AS
WITH ranked AS (
  SELECT
    pa.*,
    ROW_NUMBER() OVER (
      PARTITION BY agency,
                   COALESCE(customer_reference, id::text),
                   COALESCE(service_order_number, '')
      ORDER BY id DESC
    ) AS rn
  FROM pending_applications pa
)
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
FROM ranked
WHERE rn = 1;

COMMENT ON VIEW pending_applications_with_wait IS
  'pending_applications, deduped per (agency, customer_reference, service_order_number) keeping the most recently inserted row, with days_waiting recomputed live in Guyana local time. GPL workbooks contain multiple daily snapshot sheets; without dedup, the same application appears once per snapshot day.';
