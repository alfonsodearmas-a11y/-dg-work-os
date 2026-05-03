# Procurement Phase 2 — Shipped

Date shipped: 2026-05-03
Phase 1 reference: `audit/procurement-review-queue-investigation.md`

## What shipped

| # | Deliverable | Migration | Commit |
|---|---|---|---|
| D1 | `tender.status` state machine + `tender_status_decision` ledger + trigger + backfill | 101 | `daa1872` |
| D2 | Wire status transitions through ingest, Resurrect, Archive, Unarchive, listing surfaces | — | `fac564e` |
| D3 | Decisions Required inbox API + page + `/api/procurement/[id]/status` endpoint for missing→terminal transitions | — | `bafb9c1` |
| D4 | Activity Feed API + page (chronological merge of field changes, presence events, decisions) | — | `eee1101` |
| D5 | Redirect `/procurement/{review,missing,changes}` to inbox/activity; landing-page menu updated | — | `14e5f61` |

### Architecture

`tender.status` is now the authoritative disposition for every tender. Six states:
`active`, `missing_pending_decision`, `withdrawn`, `completed_outside_psip`, `agency_error`, `archived`.

Stored column with `AFTER INSERT` trigger on `tender_status_decision`. The ledger is the audit; the column is the indexed lookup. Each ledger row's `decision_id` links back to the universal `procurement_decision` log so transitions are discoverable from either side.

Two user-facing surfaces:
- **`/procurement/inbox`** — Decisions Required. One filterable surface for `ambiguous_match` + `ambiguous_stage` + `missing_decision` + `resurfaced_skip` + `proposed_pending`.
- **`/procurement/activity`** — read-only chronological merge of `tender_field_change` + `tender_presence_event` + `procurement_decision`.

Role enforcement remains in route handlers (`requireRole` + `canAccessAgency`), consistent with Phase 1. Ministry roles see all agencies; `agency_admin` and `officer` see their own. DG retains sole archive authority.

## What's deferred — and why

### 1. Hybrid stage authority rules

**Status:** every tender follows the source identically. One absence → `missing_pending_decision`, regardless of stage.

**Why deferred:** Phase 1 diagnostics found zero completed disappear→reappear cycles in 12 weeks of data. The system has not been running long enough for stage-specific patterns to emerge. Picking thresholds now would mean guessing.

**Replaces:** The Phase 2 sketch's hybrid model where `award`/`contract`/`implementation` would be sticky-by-default and `planning`/`design`/`evaluation` would follow the source. That model still appears correct in principle; the *thresholds* must be data-driven.

**Trigger to revisit:** four weeks after Phase 2 ships, run the diagnostic queries below. If they produce sufficient signal (≥30 cycles across ≥3 stages), tune. If signal is sparse, defer another four weeks.

### 2. Per-agency threshold variation

**Status:** all agencies use the same single-absence threshold.

**Why deferred:** same reason as above, plus the diagnostic question "do agencies have meaningfully different volatility patterns?" cannot be answered from current data. The seven MPUA agencies each have distinct PSIP authoring practices; the patterns will reveal themselves.

### 3. Approval-gate UI

**Status:** the data model accommodates approval gates (procurement_decision has `approval_state`/`approved_by`/`approved_at`/`approval_role` from migration 095). No UI exposes them. Every decision today is `approval_state='none'`.

**Why deferred:** the agency_admin → DG approval flow is governance-sensitive and benefits from being designed alongside the first real "agency_admin proposes archive" use case. Phase 1 + Phase 2 establishes the substrate; Phase 3 adds the flow without further migrations.

## Four-week checkpoint diagnostics

Run these queries four weeks after Phase 2 deploy. They replace the Phase 1 diagnostics that were used to ground the Phase 2 design.

### Q1 — Disappear/reappear cycle distribution by stage at disappearance

For each `(disappeared, reappeared)` pair, compute the days the tender was missing and bucket by the stage at time of disappearance.

```sql
WITH events AS (
  SELECT
    tpe.tender_id,
    tpe.event_type,
    tpe.at,
    LAG(tpe.event_type) OVER w AS prev_event,
    LAG(tpe.at)         OVER w AS prev_at,
    LAG(tpe.upload_id)  OVER w AS prev_upload_id
  FROM tender_presence_event tpe
  WINDOW w AS (PARTITION BY tpe.tender_id ORDER BY tpe.at)
)
SELECT
  COALESCE(s.snapshot_fields->>'stage', t.stage::text) AS stage_at_disappear,
  count(*) AS cycle_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (e.at - e.prev_at)) / 86400.0), 1) AS avg_days_gone,
  ROUND(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (e.at - e.prev_at)) / 86400.0
  )::numeric, 1) AS median_days_gone,
  MAX(EXTRACT(EPOCH FROM (e.at - e.prev_at)) / 86400.0)::int AS max_days_gone
FROM events e
JOIN tender t ON t.id = e.tender_id
LEFT JOIN tender_upload_snapshot s
  ON s.tender_id = e.tender_id AND s.upload_id = e.prev_upload_id
WHERE e.event_type = 'reappeared'
  AND e.prev_event = 'disappeared'
GROUP BY 1
ORDER BY cycle_count DESC;
```

**Expected shape for rules to be designable:** ≥30 reappearance cycles total, distributed across ≥3 stage values. If any one stage has ≥10 cycles with median_days_gone < 14, that stage is a candidate for a delayed-trigger rule (e.g., "wait for 2 absences before flagging missing"). If a stage has ≥10 cycles with median_days_gone > 60, it is a candidate for the sticky-by-default treatment.

### Q2 — Permanent disappearance rate by stage at disappearance

Of tenders that disappeared, what fraction never reappeared?

```sql
WITH disappearances AS (
  SELECT
    tpe.tender_id,
    tpe.upload_id,
    tpe.at AS disappeared_at
  FROM tender_presence_event tpe
  WHERE tpe.event_type = 'disappeared'
),
reappearances AS (
  SELECT DISTINCT tender_id FROM tender_presence_event WHERE event_type = 'reappeared'
)
SELECT
  COALESCE(s.snapshot_fields->>'stage', t.stage::text) AS stage_at_disappear,
  count(*) FILTER (WHERE r.tender_id IS NULL) AS still_missing,
  count(*) FILTER (WHERE r.tender_id IS NOT NULL) AS reappeared,
  ROUND(
    100.0 * count(*) FILTER (WHERE r.tender_id IS NULL) / NULLIF(count(*), 0),
    1
  ) AS percent_permanent
FROM disappearances d
JOIN tender t ON t.id = d.tender_id
LEFT JOIN tender_upload_snapshot s
  ON s.tender_id = d.tender_id AND s.upload_id = d.upload_id
LEFT JOIN reappearances r ON r.tender_id = d.tender_id
GROUP BY 1
ORDER BY still_missing DESC;
```

**Expected shape:** stages with `percent_permanent` > 60% inform aggressive surfacing (don't wait — flag immediately). Stages with `percent_permanent` < 30% inform delayed surfacing (the absence is usually transient).

### Q3 — Per-agency volatility

How many disappearance events per agency per upload?

```sql
SELECT
  agency,
  count(*) AS total_disappearances,
  count(DISTINCT upload_id) AS uploads_with_disappearances,
  ROUND(count(*)::numeric / NULLIF(count(DISTINCT upload_id), 0), 1)
    AS avg_disappearances_per_upload
FROM tender_presence_event
WHERE event_type = 'disappeared'
  AND at >= now() - interval '4 weeks'
GROUP BY agency
ORDER BY avg_disappearances_per_upload DESC;
```

**Expected shape:** if `avg_disappearances_per_upload` varies by >2× between agencies, that justifies per-agency thresholds. If it's tight (within 1.5×), one global threshold is fine.

### Q4 — Decision distribution out of `missing_pending_decision`

What statuses did missing_pending_decision tenders end up in?

```sql
WITH first_missing AS (
  SELECT DISTINCT ON (tsd.tender_id)
    tsd.tender_id,
    tsd.decided_at AS missing_at
  FROM tender_status_decision tsd
  WHERE tsd.status_after = 'missing_pending_decision'
  ORDER BY tsd.tender_id, tsd.decided_at ASC
),
last_status AS (
  SELECT DISTINCT ON (tsd.tender_id)
    tsd.tender_id,
    tsd.status_after AS final_status,
    tsd.decided_at AS final_at
  FROM tender_status_decision tsd
  ORDER BY tsd.tender_id, tsd.decided_at DESC
)
SELECT
  ls.final_status,
  count(*) AS tender_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (ls.final_at - fm.missing_at)) / 86400.0), 1)
    AS avg_days_from_missing_to_final
FROM first_missing fm
JOIN last_status ls ON ls.tender_id = fm.tender_id
GROUP BY ls.final_status
ORDER BY tender_count DESC;
```

**Expected shape:** if `withdrawn` + `completed_outside_psip` + `agency_error` together account for ≥60%, the user community has internalized the new vocabulary and the inbox is doing its job. If `archived` dominates, users are routing through the catch-all and the new vocabulary isn't earning its keep — investigate the UX. If `active` (resurrect) dominates, the system is over-flagging — this is the strongest signal that hybrid rules are needed to suppress non-actionable absences.

### Q5 — Time-to-decision per agency

Backlog age of `missing_pending_decision` tenders.

```sql
SELECT
  t.agency,
  count(*) AS open_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - tsd.decided_at)) / 86400.0), 1)
    AS avg_days_open,
  MAX(EXTRACT(EPOCH FROM (now() - tsd.decided_at)) / 86400.0)::int
    AS max_days_open
FROM tender t
JOIN LATERAL (
  SELECT decided_at
  FROM tender_status_decision
  WHERE tender_id = t.id AND status_after = 'missing_pending_decision'
  ORDER BY decided_at DESC LIMIT 1
) tsd ON true
WHERE t.status = 'missing_pending_decision'
GROUP BY t.agency
ORDER BY open_count DESC;
```

**Expected shape:** `avg_days_open` < 14 days suggests the inbox is being worked. > 30 days suggests a backlog and the threshold is too aggressive (or the UX is friction-laden).

### Q6 — Re-emergence rate by upload index

For each disappearance, did the tender come back within N uploads?

```sql
WITH disappear_events AS (
  SELECT
    tpe.tender_id,
    tpe.upload_id AS disappeared_upload_id,
    tpe.at AS disappeared_at
  FROM tender_presence_event tpe
  WHERE tpe.event_type = 'disappeared'
),
upload_seq AS (
  SELECT id, uploaded_at,
    ROW_NUMBER() OVER (ORDER BY uploaded_at) AS seq_num
  FROM upload WHERE status = 'applied'
),
labeled AS (
  SELECT
    de.tender_id,
    de.disappeared_at,
    us_disappear.seq_num AS disappeared_seq,
    (
      SELECT MIN(us_re.seq_num)
      FROM tender_presence_event re
      JOIN upload_seq us_re ON us_re.id = re.upload_id
      WHERE re.tender_id = de.tender_id
        AND re.event_type = 'reappeared'
        AND re.at > de.disappeared_at
    ) AS reappeared_seq
  FROM disappear_events de
  JOIN upload_seq us_disappear ON us_disappear.id = de.disappeared_upload_id
)
SELECT
  CASE
    WHEN reappeared_seq IS NULL THEN 'never'
    WHEN reappeared_seq - disappeared_seq = 1 THEN 'next_upload'
    WHEN reappeared_seq - disappeared_seq = 2 THEN 'within_2'
    WHEN reappeared_seq - disappeared_seq = 3 THEN 'within_3'
    WHEN reappeared_seq - disappeared_seq <= 4 THEN 'within_4'
    ELSE '5_or_more'
  END AS re_emergence_window,
  count(*) AS event_count
FROM labeled
GROUP BY 1
ORDER BY 1;
```

**Expected shape:** if `next_upload` accounts for ≥40% of cycles, the single-absence trigger is creating substantial noise — agencies are commonly omitting then re-including rows. If `next_upload` is < 10%, single-absence is a fine signal. The rule design then becomes: "trigger missing_pending_decision after N consecutive absences" where N is calibrated to the median.

## Summary of expected vs actionable

| Query | If signal is rich | If signal is sparse |
|---|---|---|
| Q1 (cycle distribution) | Per-stage threshold rules | Stay with single-absence trigger |
| Q2 (permanent rate) | Stage-aware urgency | Treat all stages equally |
| Q3 (agency volatility) | Per-agency thresholds | One global threshold |
| Q4 (decision distribution) | UX is working — refine vocab | UX issue — revisit inbox flow |
| Q5 (time-to-decision) | Calibrate threshold to backlog tolerance | (no action) |
| Q6 (re-emergence window) | Tune N consecutive absences | Single absence stays |

If any one of Q1, Q2, or Q6 produces fewer than ~30 events of usable signal, the four-week checkpoint should be deferred another four weeks rather than tuned with thin data. The Phase 1 → Phase 2 transition was disciplined about this; the Phase 2 → Phase 3 transition should be too.
