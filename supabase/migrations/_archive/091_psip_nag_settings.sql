-- ============================================================
-- psip_nag_settings — singleton global toggles
--
-- One-row table (CHECK id=1). emails_enabled is the master kill-switch:
-- while false, the cron + event-trigger write dry-run rows to
-- psip_nag_preview but never hit SMTP. bcc_to_dg controls whether the
-- DG's email is added as BCC to every outgoing message.
--
-- Ships with emails_enabled=false so real sends require a DG toggle.
-- ============================================================

CREATE TABLE IF NOT EXISTS psip_nag_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  emails_enabled  BOOLEAN NOT NULL DEFAULT false,
  bcc_to_dg       BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES users(id)
);

INSERT INTO psip_nag_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE psip_nag_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read psip_nag_settings"
  ON psip_nag_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_settings"
  ON psip_nag_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
