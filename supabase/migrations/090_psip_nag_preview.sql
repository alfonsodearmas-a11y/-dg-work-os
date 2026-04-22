-- ============================================================
-- psip_nag_preview — every email the nag system would send OR did send
--
-- Rows are written for both dry-runs (emails_enabled=false) and real
-- sends. actually_sent distinguishes: false means preview-only, true
-- means SMTP attempt (sent_at / sent_error describe the outcome).
--
-- The admin preview page reads this table newest-first. Never purged
-- by the application — retention is manual.
-- ============================================================

CREATE TABLE IF NOT EXISTS psip_nag_preview (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_kind         TEXT NOT NULL,  -- 'weekly' | 'event_new_critical' | 'escalation'
  agency               TEXT NOT NULL,
  recipient_to         TEXT NOT NULL,
  recipient_bcc        TEXT,
  subject              TEXT NOT NULL,
  body                 TEXT NOT NULL,
  would_have_sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actually_sent        BOOLEAN NOT NULL DEFAULT false,
  sent_at              TIMESTAMPTZ,
  sent_error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_psip_nag_preview_time
  ON psip_nag_preview (would_have_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_psip_nag_preview_agency_time
  ON psip_nag_preview (agency, would_have_sent_at DESC);

ALTER TABLE psip_nag_preview ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read psip_nag_preview"
  ON psip_nag_preview FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_preview"
  ON psip_nag_preview FOR ALL TO service_role USING (true) WITH CHECK (true);
