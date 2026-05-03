-- ============================================================
-- tender_presence_event — typed log for tender disappearance/reappearance
--
-- Replaces the '__presence' sentinel rows previously written into
-- tender_field_change. tender_field_change is the audit log for *field*
-- diffs; mixing presence events into it polluted the audit surface and
-- inflated row volume (78% of pre-R3 field_change rows were sentinels).
--
-- Two event types:
--   - 'disappeared': set when an upload's apply phase observes a tender
--     that was previously present but is missing from the new workbook.
--     upload_id = the upload that observed the absence; actor_id = NULL
--     (system-driven).
--   - 'reappeared':  set when a user resurrects a tender from the Missing
--     queue (R4 will extend this to sticky tracking) or when an upload's
--     apply phase brings a missing tender back via auto-match. upload_id
--     is set when the trigger was an upload; actor_id when user-driven.
--
-- agency is denormalized at write time, matching procurement_decision —
-- multi-role and Activity Feed queries are agency-scoped, and this table
-- is store-forever.
--
-- Historical '__presence' rows in tender_field_change are NOT migrated;
-- they remain as a bounded artifact of the pre-R3 era.
-- ============================================================

CREATE TABLE IF NOT EXISTS tender_presence_event (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id   UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('disappeared', 'reappeared')),
  agency      TEXT NOT NULL,
  upload_id   UUID REFERENCES upload(id),
  actor_id    UUID REFERENCES users(id),
  actor_role  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Provenance must point to either an upload or an actor (or both, if a
  -- user action happened during an upload context). Pure phantom events
  -- with neither attribution are rejected.
  CONSTRAINT tender_presence_event_attribution CHECK (
    upload_id IS NOT NULL OR actor_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_tender_presence_event_tender_time
  ON tender_presence_event (tender_id, at DESC);

CREATE INDEX IF NOT EXISTS idx_tender_presence_event_agency_time
  ON tender_presence_event (agency, at DESC);

CREATE INDEX IF NOT EXISTS idx_tender_presence_event_type_time
  ON tender_presence_event (event_type, at DESC);

ALTER TABLE tender_presence_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tender_presence_event"
  ON tender_presence_event FOR SELECT TO authenticated USING (true);

CREATE POLICY "svc full tender_presence_event"
  ON tender_presence_event FOR ALL TO service_role
  USING (true) WITH CHECK (true);
