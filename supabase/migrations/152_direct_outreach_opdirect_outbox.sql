-- 152_direct_outreach_opdirect_outbox.sql
--
-- OP Direct write-back outbox. Every DG-OS Direct Outreach mutation (officer
-- assignment/unassignment, working-status change, remark, target-date change)
-- enqueues ONE row here in the SAME transaction as the underlying change; a
-- local session-bound bridge (scripts/opdirect-outbox-bridge.ts) posts each row
-- to OP Direct as a case comment (plus a status change when op_status_target is
-- set — OP's Update form requires a comment, so status+comment save together).
--
-- Snapshot-survival design identical to 147/148/150: human-generated data keyed
-- BY VALUE on OP Direct's stable case number with deliberately NO foreign key to
-- direct_outreach_cases (the workbook upload wipes + re-inserts that table on
-- every upload; an FK would cascade-wipe the queue or break the importer).
-- officer_update_id references direct_outreach_officer_updates.id by value for
-- the same reason (and author_user_id carries no FK so a deleted user cannot
-- violate NOT NULL — author_label preserves attribution regardless).

CREATE TABLE public.direct_outreach_opdirect_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             integer NOT NULL,
  source_kind         text NOT NULL
    CHECK (source_kind IN ('assignment','unassignment','status','remark','target')),
  -- The append-only log row this entry mirrors (NULL for assignment kinds). NO FK.
  officer_update_id   uuid,
  -- Idempotency marker: the bridge prepends "[DGOS-<id>]" to the OP comment and
  -- scans /api/cases/{id}/history for it before posting, so re-runs never dupe.
  dgos_ref            text NOT NULL UNIQUE,
  -- Composed human line; the bridge posts "[dgos_ref] {author_label}: {comment_text}".
  comment_text        text NOT NULL,
  -- OP Direct status NAME to set in the same save, or NULL for comment-only.
  -- Single mapping (lib/direct-outreach/outbox.ts): resolved_pending_verification
  -- -> 'Resolved'. Category is never changed.
  op_status_target    text,
  author_user_id      uuid NOT NULL,
  author_label        text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','posted','skipped','failed')),
  -- OP Direct's per-comment id (history case_detail_id), captured on post.
  opdirect_comment_id text,
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  posted_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX direct_outreach_opdirect_outbox_status_idx
  ON public.direct_outreach_opdirect_outbox (status, created_at);
CREATE INDEX direct_outreach_opdirect_outbox_case_idx
  ON public.direct_outreach_opdirect_outbox (case_id);

-- RLS stance identical to 145/146/147/148/150: enabled, zero policies
-- (default-deny for client roles), grants revoked; the lib/db-pg pool is table
-- owner and every read/write goes through superadmin- or BRIDGE_TOKEN-gated
-- API routes.
ALTER TABLE public.direct_outreach_opdirect_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_opdirect_outbox FROM anon, authenticated;
