# OP Direct outbox bridge

Posts pending DG Work OS **Direct Outreach** updates to **OP Direct**
(`https://opdirect.dakeung.com`) as case comments.

## The rule

Every Direct Outreach mutation in DG OS — officer **assignment/unassignment**,
**working-status** change, **remark**, **target-date** change — enqueues one row
in `direct_outreach_opdirect_outbox` (migration 152) **in the same transaction**
as the change itself. This bridge drains that queue: one row → one OP Direct
case comment. When the row carries `op_status_target` (only
`resolved_pending_verification` → **Resolved**; the single map lives in
`lib/direct-outreach/outbox.ts` `OP_STATUS_TARGETS`), the bridge sets that
status in the **same save** — OP's Update form requires a comment, so
status+comment always post together. **Category is never changed.**

The comment posted is:

```
[DGOS-<outbox uuid>] <author>: <composed update text>
```

The `[DGOS-…]` prefix is the idempotency marker (see below); the author label
keeps officer attribution visible even though the OP-side author is whoever's
logged into the bridge session.

## Session model (no stored credentials)

The bridge drives a **persistent Chromium profile**
(`~/.opdirect-bridge-profile`, override with `BRIDGE_PROFILE_DIR`). On first run
it opens OP Direct; if you land on `/auth/login`, **log in manually** in that
window — the run continues automatically once `/ministry` loads and the session
cookie persists in the profile for later runs. The script never types, stores,
or automates credentials.

## Setup

1. `BRIDGE_TOKEN` — a shared secret set BOTH in the Vercel production env (the
   DG OS API checks it constant-time on `outbox/export`, `outbox/ack`,
   `outbox/[id]/fail`) and locally (shell or `.env.local`).
2. `DG_OS_BASE_URL` — e.g. `https://dashboard.mpua.gov.gy`.
3. `OPDIRECT_BASE_URL` — optional, defaults to `https://opdirect.dakeung.com`.

`.env.local` is read with existing-env-wins semantics.

## Running

```bash
npm run bridge:opdirect                              # post everything pending
npx tsx scripts/opdirect-outbox-bridge.ts --dry-run  # everything except Save+ack; logs exact comments
npx tsx scripts/opdirect-outbox-bridge.ts --limit 5  # first 5 pending rows only
```

With an **empty queue** the bridge prints `0 pending` and exits **without
opening OP Direct at all**.

Per row (~1.5 s apart) it:

1. Fetches `/api/cases/{id}/history`; if the `[DGOS-…]` marker is already there
   (and the status target, if any, is already OP's current status) the row is
   **acked without re-posting** — this is what makes re-runs after a crash or a
   failed ack safe/resumable.
2. Otherwise: finds the case via the `/ministry` Search box, opens it, sets the
   Status dropdown when a target is set, types the comment (required by OP),
   clicks **Save**.
3. Re-fetches history to **verify** the marker (and status) actually landed and
   captures OP's per-comment id, then acks the row (`posted`).
4. On any error — including a missing selector, which always fails **loudly** —
   the row is marked `failed` with `last_error` and the run continues; failed
   rows are re-queued from the OP Direct outbox tab (superadmin → Direct
   Outreach → OP Direct outbox → Retry).

Exit code is non-zero when any row failed. The final summary lists
posted/skipped/failed with case ids.

## Queue triage (DG OS UI)

Superadmin → `/direct-outreach` → **OP Direct outbox** tab: pending/posted/
skipped/failed counts, each row's composed comment + `DGOS` ref, **Retry**
(failed|skipped → pending) and **Skip** (pending → skipped).
