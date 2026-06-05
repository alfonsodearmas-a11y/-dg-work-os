-- Integration tokens: stores OAuth refresh/access tokens for external services
-- Uses user_id='dg' + provider composite key (matches push_subscriptions pattern)

CREATE TABLE IF NOT EXISTS integration_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'dg',
  provider text NOT NULL,                      -- e.g. 'google_calendar'
  refresh_token text NOT NULL,
  access_token text,
  token_expiry timestamptz,
  calendar_id text,                            -- e.g. 'primary' or specific calendar ID
  account_email text,                          -- display: which Google account is connected
  scopes text,                                 -- space-separated scopes granted
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_integration_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_tokens_updated_at
  BEFORE UPDATE ON integration_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_tokens_updated_at();
