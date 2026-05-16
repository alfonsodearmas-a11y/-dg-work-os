-- Register the two referral modules so the sidebar gates correctly.
-- DG + PS get ministerial-referrals (PS read-only at the API layer).
-- Minister gets minister-referrals.

INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES
  ('ministerial-referrals', 'Ministerial Referrals',
   'Track formal referrals to the Minister',
   'FileSignature', ARRAY['dg', 'ps'], true, 75),
  ('minister-referrals', 'Referrals to Minister',
   'Read inbound referrals',
   'Inbox', ARRAY['minister'], true, 76)
ON CONFLICT (slug) DO NOTHING;
