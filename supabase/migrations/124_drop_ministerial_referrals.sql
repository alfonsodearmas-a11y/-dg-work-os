-- 124_drop_ministerial_referrals.sql
-- Drop the parallel ministerial_referrals schema.
--
-- Preconditions verified 2026-05-19 on dg-command-center (us-west-2):
--   ministerial_referrals  : 0 rows
--   referral_audit_log     : 0 rows
--   referral_ref_seq       : last_value=1, is_called=false (never used)
--   user_module_access for ('ministerial-referrals','minister-referrals'): 0 grants
-- mpua-staging does not have these tables.
-- No data backfill required.
--
-- Run AFTER 123_tasks_minister_attention_columns.sql and AFTER the
-- application code that read from the dropped tables has been removed
-- (commits 5 and 6 on branch refactor/referrals-to-tasks-flag).

-- Tables. CASCADE on the parent handles the audit-log FK.
DROP TABLE IF EXISTS referral_audit_log CASCADE;
DROP TABLE IF EXISTS ministerial_referrals CASCADE;

-- Sequence backing MPUA-MR-YYYY-NNNN reference numbers.
DROP SEQUENCE IF EXISTS referral_ref_seq;

-- Enums (referenced only by the tables above; safe to drop after the tables).
DROP TYPE IF EXISTS referral_status;
DROP TYPE IF EXISTS referral_delivery_method;
DROP TYPE IF EXISTS referral_requested_action;
DROP TYPE IF EXISTS referral_source_type;

-- Module-access cleanup. The two old slugs are replaced by one new slug
-- 'minister-attention' for the Minister's flagged-task inbox at
-- /minister/attention. nptab-reports keeps sort_order = 76; the new
-- minister-attention slug takes the sort_order = 77 slot vacated by
-- minister-referrals in the same migration.
DELETE FROM user_module_access
  WHERE module_id IN (
    SELECT id FROM modules WHERE slug IN ('ministerial-referrals', 'minister-referrals')
  );
DELETE FROM modules WHERE slug IN ('ministerial-referrals', 'minister-referrals');

INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES ('minister-attention', 'Minister Attention',
        'Tasks flagged for the Minister''s attention',
        'Inbox', ARRAY['minister'], true, 77)
ON CONFLICT (slug) DO NOTHING;
