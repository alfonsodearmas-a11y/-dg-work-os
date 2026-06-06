-- Extend referral_source_type to support task-sourced referrals.
-- See lib/referrals/pre-fill.ts composeTaskPreFill for the matching app code.

ALTER TYPE referral_source_type ADD VALUE IF NOT EXISTS 'task';
