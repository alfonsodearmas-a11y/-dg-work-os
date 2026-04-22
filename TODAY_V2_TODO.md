# Today v2 follow-ups

## 1. Tender `days_at_current_stage` understates time in stage — RESOLVED

**Symptom (now fixed).** `/api/today` returned zero tender SLA breaches even
when procurement rows looked visibly stuck.

**Root cause.** `enrichTender` in `lib/tender/queries.ts` fell back to
`tender.updated_at` when no stage `tender_field_change` row existed.
`updated_at` is bumped by the `trg_tender_updated_at` trigger on *any* column
update — a description edit, a contractor change, a remarks tweak, or a
re-ingest from the weekly PSIP xlsx that touches any field. Those unrelated
writes reset the apparent time-in-stage even though the stage itself had not
changed.

**Fix shipped in commit `aa210d2`.** Rewrote `enrichTender` to derive
`days_at_current_stage` strictly from PSIP date columns:
- `advertised` → `date_advertised`
- `evaluation` → `date_closed`
- `awaiting_award` → `date_eval_sent_nptab ?? date_eval_sent_mtb_rtb ?? date_closed`
- `design`, `award`, `is_rollover=true`, `has_exception=true` → null

`updated_at` and `created_at` fallbacks removed. `Tender.days_at_current_stage`
is now `number | null`. Today's SLA fetcher skips null rows.

**Live impact (2026-04-21, role=dg):** breach count 0 → 4 critical, all GWI.

## 2. Operational finding: GWI owns 100% of current SLA breaches

All 4 current tender SLA breaches are GWI. Not a code issue — a real
operational pattern worth surfacing on the home page. No action in this
follow-up list; the breaches will self-resolve as PSIP dates advance or
the tenders transition to award.

## 3. `incomplete_psip_data` signal — future Today v2 signal type

19 tenders are currently at advertised/evaluation/awaiting_award stages
with no corresponding date column filled in (i.e. stage was declared but
the date that would have produced that stage is blank). These are silently
excluded from breach detection today.

**Breakdown (2026-04-21):** MARAD 3, HECI 8, GPL 3, GWI 2, GCAA 1,
HINTERLAND_AIRSTRIPS 2.

**Proposal for a future signal type `incomplete_psip_data`:**
- Surfaces tenders where `stage ∈ {advertised, evaluation, awaiting_award}`
  AND the PSIP date column required by that stage is null
  AND `is_rollover = false` AND `has_exception = false`.
- Aggregate per agency; emit one rollup signal per agency with ≥ N missing.
- Headline: "{Agency} has {count} tenders missing required PSIP dates".
- href: `/procurement?agency={code}&missing_dates=true` (filter not built yet).
- Severity bands TBD; likely similar to the stagnant rollup (≥3 medium,
  ≥5 high, ≥10 critical).

Not in scope for Today v1.1. Capture now, design later.

## 4. Agency attribution of PSIP edits — not possible without native Sheets

Current PSIP flow: DG exports the agency-edited Google Sheets .xlsx and
uploads it weekly. We cannot determine which agency user last edited which
cell because:
- .xlsx has no per-cell edit history.
- Google Sheets' revision history would tell us, but requires the native
  Google Sheets API with file-level access and per-editor audit.
- The PSIP is non-negotiable as an .xlsx for agency workflow reasons.

The stagnant-tender signal (Today v1.1 Part 3) sidesteps this by diffing
consecutive weekly uploads, which tells us *whether* a row changed but not
*who* changed it. That is the best we can do without a format change.

Revisit if the PSIP ever migrates to native Google Sheets as the system of
record.

## 5. `date_eval_sent_mtb_rtb` — potentially unused column

Current live state: zero tenders have a populated `date_eval_sent_mtb_rtb`
value. Only `date_eval_sent_nptab` is populated (7 rows). The fallback
order `nptab ?? mtb_rtb ?? closed` in `computeDaysInStage` still honours
the MTB/RTB column, but if it stays empty across subsequent PSIP uploads,
consider dropping it from the schema (and the parser) to reduce column
churn. Not urgent; wait 4–6 more upload cycles before deciding.
