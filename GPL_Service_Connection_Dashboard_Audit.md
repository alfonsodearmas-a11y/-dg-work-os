# GPL Service Connection Dashboard — Code Audit Report

## Independent Analysis vs Dashboard Implementation

**Date**: March 6, 2026
**Scope**: All code related to GPL service connection efficiency in DG Work OS
**Reference**: `GPL_Service_Connection_Efficiency_Analysis.md` (independent Python/pandas audit of raw Excel files)

---

## Executive Summary

The dashboard has a **fundamentally different architecture** than what the independent analysis assumes. The independent analysis provides **per-snapshot metrics** (March 3, March 4, March 5 individually). The dashboard provides:

- **Pending Analysis tab**: Latest-snapshot outstanding pipeline only (from `pending_applications` table, full-refreshed each upload)
- **Efficiency Tracking tab**: **Cumulative lifetime metrics** across all uploads (from `service_connections` table)

There is **no per-snapshot comparison view** in the dashboard. You cannot currently see "March 3: 102 outstanding, March 4: 119, March 5: 150" as a trend. This is the most significant architectural gap.

Beyond that, this audit found **11 specific issues** across data handling, calculation accuracy, and missing features.

### Files Audited

| File | Role |
|---|---|
| `lib/pending-applications-parser.ts` | Excel parser (multi-sheet, header detection, date diffs) |
| `lib/service-connection-analysis.ts` | Efficiency metrics (SLA, mean, median per track) |
| `lib/service-connection-types.ts` | Type definitions, SLA target constants |
| `lib/service-connection-track.ts` | Track classification (A / B / Design) |
| `lib/service-connection-diff.ts` | Diff engine (detect completions between uploads) |
| `lib/pending-applications-analysis.ts` | Outstanding pipeline analysis (funnel, aging, red flags) |
| `lib/pending-applications-types.ts` | Pending record types |
| `app/api/pending-applications/upload/route.ts` | Upload route (parse, diff, insert) |
| `app/api/service-connections/stats/route.ts` | Efficiency stats API |
| `app/api/service-connections/analysis/route.ts` | Analysis + longest-waiting API |
| `components/intel/pending-applications/EfficiencyPanel.tsx` | Efficiency Tracking UI |
| `components/intel/pending-applications/GPLAnalysisPanel.tsx` | Pending Analysis UI |
| `supabase/migrations/018_service_connections.sql` | DB schema |
| `supabase/migrations/019_add_design_track.sql` | Design track constraint |

---

## 1. Summary Counts

### Outstanding Counts (Pending Analysis tab)

**Where computed**: `pending-applications-analysis.ts:32-58` via `computeGPLAnalysis()`, fed from the `pending_applications` table.

**Problem: Multi-sheet file inflation.** The parser (`pending-applications-parser.ts:188`) iterates ALL sheets in the workbook except "Summary". The independent analysis confirms that the March 5 file embeds March 4 sheets. When uploaded, the parser processes BOTH March 4 and March 5 outstanding sheets, inserting records from both into `pending_applications` (which does a DELETE + INSERT with no deduplication — `upload/route.ts:214-244`).

| Metric | Independent (March 5) | Dashboard (after March 5 upload) | Match? |
|---|---|---|---|
| Outstanding Metering | 150 | **150 + 119 = ~269** (minus overlap) | NO — inflated |
| Outstanding Networks | 186 | **186 + 61 = ~247** (minus overlap) | NO — inflated |
| Outstanding Estimates | 62 | **62 + 195 = ~257** (minus overlap) | NO — inflated |

**Root cause**: `pending-applications-parser.ts:188` — no filtering by date within multi-date files. All outstanding sheets are parsed regardless of which snapshot date they represent.

**If only the latest-date sheets are in the file** (single-date file uploaded), the counts would match correctly.

### Completed Counts (Efficiency Tracking tab)

**Where computed**: `service-connection-analysis.ts:39` — filters `c.status === 'completed'` from `service_connections` table.

**Problem: Cumulative, not per-snapshot.** After uploading the March 5 file (containing embedded March 4 completed sheets), `insertCompletedConnections()` (`upload/route.ts:34-87`) does an UPSERT on `(customer_reference, service_order_number)`. This correctly deduplicates, but the counts are **cumulative across all embedded sheets**, not per-snapshot.

| Metric | Independent (March 5 only) | Dashboard (cumulative) | Match? |
|---|---|---|---|
| Completed Metering | 135 | ~135 (March 5 superset) | Approximately — if March 5 is superset of March 3/4 |
| Completed Networks | 7 | ~7 (March 5 superset) | Approximately |
| Completed Estimates | 22 | ~22 (March 5 superset) | Approximately |

The UPSERT prevents double-counting, so completed totals should approximately match the latest (largest) snapshot. But there is no way to see per-snapshot counts.

---

## 2. Track A (Metering, 3-Day SLA) — Completed Efficiency

### SLA Compliance

**Where computed**: `service-connection-analysis.ts:44-62`

```ts
// Line 44-47: Floor at 1 day minimum
const completionDays = completed
  .map(c => c.total_days_to_complete)
  .filter((d): d is number => d !== null && d >= 0)
  .map(d => Math.max(d, 1));  // <-- 1-day floor

// Line 54: SLA check
const withinSla = completionDays.filter(d => d <= slaTarget).length;
```

**Issue 1: #NUM! records included as 1-day completions.** The parser (`pending-applications-parser.ts:299-303`) computes `daysWaiting = Math.max(0, ...)`, so reversed-date records get **0 days**. The analysis engine then floors 0 to 1 day. These 11 records are counted as SLA-compliant (1 <= 3), inflating the rate.

**Issue 2: 1-day floor affects averages.** Any genuine 0-day completion becomes 1 day. The #NUM! records becoming 1-day pulls the average down.

| Metric | Independent (March 5) | Dashboard Expected | Discrepancy |
|---|---|---|---|
| N Completed | 124 valid (11 #NUM! excluded) | **135** (all included) | +11 records |
| SLA Compliance | 96.8% (120/124) | **~97.0%** (131/135) | +0.2pp (#NUM! counted as compliant) |
| Mean Days | 1.91 | **~1.8** ((124 x 1.91 + 11 x 1) / 135) | -0.1 days (artificially lower) |
| Median | 2.0 | **2.0** (11 extra 1s don't shift median) | Match |

**Origin of discrepancy**: `pending-applications-parser.ts:302` (`Math.max(0, ...)`) and `service-connection-analysis.ts:47` (`Math.max(d, 1)`).

### March 3 and March 4 Completed (same pattern)

| Snapshot | Independent Valid | Independent SLA | Dashboard Expected Count | Dashboard Expected SLA |
|---|---|---|---|---|
| March 3 | 75 valid of 80 | 97.3% (73/75) | **80** (5 records with 0 days -> 1) | **~97.5%** (78/80) |
| March 4 | 100 valid of 106 | 96.0% (96/100) | **106** (6 records with 0 days -> 1) | **~96.2%** (102/106) |
| March 5 | 124 valid of 135 | 96.8% (120/124) | **135** (11 records with 0 days -> 1) | **~97.0%** (131/135) |

Note: These per-snapshot values are what the dashboard *would* show if it had per-snapshot views. The actual dashboard shows a single cumulative figure across all data.

### How #NUM! Records Are Handled

The parser **never sees #NUM!** errors. It reads raw date columns directly via XLSX, not formula result cells (`pending-applications-parser.ts:156` comment: "Computes date diffs directly from raw date columns (not formula cells)"). The raw `Date/Time Created` and `Date Work Completed` columns contain valid dates — it's Excel's day-count formula that produces #NUM!.

For reversed dates (Date Work Completed before Date/Time Created):

1. **Parser** (`parser.ts:299-303`): `end - start` = negative, `Math.max(0, negative)` = **0**
2. **Upload route** (`upload/route.ts:67`): `total_days_to_complete = 0`
3. **Analysis engine** (`analysis.ts:47`): `Math.max(0, 1)` = **1**

**Result**: Records are silently included as 1-day completions. No warning, no flag, no separate count. The dashboard has **zero visibility** into data quality errors.

---

## 3. Track A — Outstanding Metering

**Where computed**: `pending-applications-analysis.ts:32-58` — Metering stage pipeline metrics.

| Metric | Independent (March 5) | Dashboard | Match? |
|---|---|---|---|
| Count | 150 | 150 (if single-date file) or inflated (if multi-date) | Conditional |
| SLA Compliant (<=3d) | 74.7% (112/150) | **74.7%** (uses same 3d threshold from `GPL_SLA.Metering`) | YES (if counts correct) |
| Mean Elapsed | 4.8 days | **~5** (integer rounding via `Math.round()`) | Precision loss |
| Median | 2 | **Not computed** for pending analysis | MISSING |
| Max | 85 | Available via `maxDays` in pipeline stage data | YES |

**Issue: Integer rounding for averages.** `computeGPLAnalysis` (`pending-applications-analysis.ts:51`) uses `Math.round(totalDays / count)` which rounds to the nearest integer. The efficiency panel's `avg()` function (`analysis.ts:23`) rounds to 1 decimal place. The pending analysis tab uses the less-precise integer version.

**Issue: No median for outstanding.** The `computeGPLAnalysis` function does not compute median for pipeline stages. The independent analysis shows median is the more honest measure (2 days vs mean of 4.8 days), since outliers at 50-85 days heavily skew the mean.

### Outstanding Metering by Snapshot (all three dates)

| Snapshot | Independent Count | Independent SLA (<=3d) | Independent Mean | Independent Median |
|---|---|---|---|---|
| March 3 | 102 | 52.0% (53) | 7.0d | 2 |
| March 4 | 119 | 80.7% (96) | 5.4d | 1 |
| March 5 | 150 | 74.7% (112) | 4.8d | 2 |

Dashboard can only show the latest uploaded snapshot's data; no trending across dates.

---

## 4. Track B (Capital Works) — Outstanding

### SLA Threshold Mismatch

**Where computed**: `pending-applications-analysis.ts:46` — uses per-stage SLA from `GPL_SLA`:

```ts
// pending-applications-analysis.ts:16
const GPL_SLA = { Execution: 26, ... };
```

The independent analysis uses a **30-day overall SLA** for outstanding capital works. The dashboard uses a **26-day execution stage SLA**.

| Metric | Independent (March 5, 30d SLA) | Dashboard (26d SLA) | Discrepancy |
|---|---|---|---|
| Outstanding Count | 186 | 186 (if single-date file) | Match (conditional) |
| SLA Compliance | 80.6% (<=30d) | **75.3%** (<=26d, from independent's own 26d column) | -5.3pp — different threshold |
| Mean | 21.3 | **~21** (integer rounding) | Precision loss |
| Median | 10 | **Not computed** | MISSING |

**Root cause**: `pending-applications-analysis.ts:13` defines `GPL_SLA.Execution = 26` (the execution stage SLA), while the customer-facing overall SLA is 30 days. The independent analysis uses the customer-facing 30-day target.

### Outstanding Capital Works by Snapshot

| Snapshot | Independent Count | Independent SLA (<=30d) | Independent SLA (<=26d) | Dashboard Uses |
|---|---|---|---|---|
| March 3 | 62 | 72.6% | 66.1% | 26d threshold |
| March 4 | 61 | N/A | N/A | 26d threshold |
| March 5 | 186 | 80.6% | 75.3% | 26d threshold |

---

## 5. Track B — Completed Capital Works

**Where computed**: `service-connection-analysis.ts:31-65` via `computeTrackMetrics(connections, 'B')`.

| Metric | Independent (March 5) | Dashboard | Match? |
|---|---|---|---|
| N Completed | 7 | ~7 (cumulative, UPSERT deduped) | Approximately |
| SLA (<=30d) | 85.7% (6/7) | Uses `SLA_TARGETS.TRACK_B_OVERALL = 30` | Match on threshold |
| Mean | 21.6 | ~21.6 (1-day floor irrelevant, min in data is 11) | Match |
| Median | 16.0 | Computed via `median()` function | Match |
| Trimmed Mean | 11.0 | **Not computed** | MISSING |

The 1-day floor (`analysis.ts:47`) doesn't affect Track B since the minimum completion time in the data is 11 days.

### Completed Capital Works by Snapshot

| Snapshot | Independent N | Independent SLA (<=30d) | Independent Mean | Outlier |
|---|---|---|---|---|
| March 3 | 2 | 100% | 11.0 | None |
| March 4 | 2 | 100% | 11.0 | None |
| March 5 | 7 | 85.7% (6/7) | 21.6 | Vanessa Kerrett: 75 days |

---

## 6. Estimates / Designs (12-Day SLA)

### Completed Estimates

**Where computed**: `service-connection-analysis.ts:31-65` via `computeTrackMetrics(connections, 'Design')`.

| Metric | Independent (March 5) | Dashboard | Match? |
|---|---|---|---|
| N Completed | 22 | ~22 (cumulative) | Approximately |
| SLA (<=12d) | 36.4% (8/22) | Uses `SLA_TARGETS.DESIGN_OVERALL = 12` | Match on threshold |
| Mean | 19.9 | ~19.9 (1-day floor irrelevant) | Match |
| Trimmed Mean | 13.9 | **Not computed** | MISSING |

### Completed Estimates by Snapshot

| Snapshot | Independent N | Independent SLA (<=12d) | Independent Mean | Independent Trimmed Mean |
|---|---|---|---|---|
| March 3 | 12 | 41.7% (5/12) | 18.3 | 14.3 |
| March 4 | 13 | 38.5% (5/13) | 18.2 | 14.4 |
| March 5 | 22 | 36.4% (8/22) | 19.9 | 13.9 |

### Outstanding Estimates

**Where computed**: `pending-applications-analysis.ts:32-58` — Designs stage pipeline metrics.

| Metric | Independent (March 5) | Dashboard | Match? |
|---|---|---|---|
| Count | 62 | 62 (if single-date file) or inflated | Conditional |
| SLA threshold | 12 days | `GPL_SLA.Designs = 12` | Match |

The independent analysis notes 75.4% of outstanding estimates are already in breach. The dashboard's pending analysis would show this via the `compliancePct` field.

---

## 7. Data Quality Issues — Detailed Assessment

### a) #NUM! Handling

**Verdict**: The parser silently converts negative day calculations to 0, then the analysis engine floors to 1. Records are NOT excluded, NOT flagged, and NOT counted separately. The dashboard has **zero visibility** into these data entry errors.

**Code path**: `parser.ts:302` -> `upload/route.ts:67` -> `analysis.ts:47`

**Impact**: 11 records in March 5 completed metering are counted as 1-day completions, inflating SLA compliance by ~0.2pp and depressing the mean by ~0.1 days.

### b) Cross-Category Duplicates

**Verdict**: NOT detected. The 3 accounts appearing in both outstanding metering AND capital works (TILOCHNEE SINGH / 0992573, SHAUNIQUE SHONAYA DOUGAN / 0985573, MSN AIR SERVICE / 0996598) would be:

- **In `pending_applications`**: Inserted as separate records (different `pipeline_stage` values). Double-counted in total outstanding.
- **In `service_connections`**: If they have different `service_order_number` values, they'd be separate records (potentially correct — same customer, two service orders). The `linkRelatedOrders` function (`service-connection-diff.ts:339-393`) attempts to cross-link same customer with different SO#s, which is correct behavior for dual-track orders. But there is no UI indicator that these are the same customer.

**Impact**: Outstanding total inflated by 3.

### c) Within-Sheet Duplicates

**Verdict**: NOT detected.

- **`pending_applications`**: Account 0929513 (Gibraltar-Courtland) and 0928268 (Key Accounts Marketing Unit), each appearing twice in the capital works sheet, are both inserted. Inflates count by 2.
- **`service_connections`**: The UPSERT unique index on `(customer_reference, service_order_number)` prevents duplicates if both keys match. Only one row survives.

**Impact**: Outstanding capital works count inflated by 2 in pending_applications.

### d) March 5 Reclassification

**Verdict**: NOT handled. The dashboard has no day-over-day trending view, so the Networks spike (61 -> 186) and Estimates drop (195 -> 62) would only be visible if someone manually compared snapshots. The `pending_application_snapshots` table stores snapshots with summary data, but no UI surfaces comparative trends.

**Impact**: If a trending view were added without handling this, it would show a misleading +125 spike in Networks.

### e) Variable Header Rows

**Verdict**: HANDLED CORRECTLY. The parser dynamically finds the header row by scanning the first 15 rows for a row with 4+ non-empty cells AND 2+ keyword matches from `HEADER_KEYWORDS` (`parser.ts:197-218`). This is robust to variable header positions (rows 3-6 depending on sheet).

### f) Variable Column Counts

**Verdict**: HANDLED CORRECTLY. Column mapping uses `findCol(...candidates)` (`parser.ts:225-231`) which searches by column name, not position. Extra trailing columns or missing Division Code columns are handled gracefully. The Division Code column is optional (`divCol >= 0 && row[divCol]` guard at `parser.ts:371`).

---

## 8. Missing Features

The following metrics from the independent analysis are **NOT displayed** in the dashboard:

| Feature | Status | Notes |
|---|---|---|
| **Per-snapshot date comparison** | MISSING | Dashboard shows latest state only. Snapshots stored in `pending_application_snapshots` but no UI surfaces them. |
| **Day-over-day deltas** | MISSING | No +17, +31, -1, +125 style trending. |
| **Completion rate** (completed/total) | MISSING | Independent shows 33.3% / 37.5% / 29.7%. Dashboard shows counts separately but doesn't compute the rate. |
| **Trimmed means (IQR method)** | MISSING | Only raw mean and median computed. No outlier-excluded averages. |
| **Track-specific aging buckets** | MISSING | Aging buckets in pending analysis are overall, not per-track. Independent analysis has different bucket boundaries per track. |
| **Staff performance** | MISSING | No staff/assignee column parsed or displayed. The parser doesn't extract a staff/assigned-to field from the Excel. |
| **Chronic outlier identification** | PARTIAL | The "longest waiting" list in `/api/service-connections/analysis` shows top 10 open orders. But no named chronic outlier table with account numbers, locations, and tenures like the independent analysis provides. |
| **#NUM! / data quality error counts** | MISSING | No data quality indicator. Parser warnings exist for unrecognized service types, but no warning for date anomalies. |
| **Outstanding median days** | MISSING | `computeGPLAnalysis` computes `avgDays` per stage but not median. The independent analysis shows median is the more honest measure. |
| **P90 / P95 percentiles** | MISSING | Not computed anywhere. Independent analysis reports P90=57d, P95=108d for outstanding estimates. |
| **Geographic bottleneck analysis** | PARTIAL | Regional distribution exists in efficiency panel, but no specific Bartica / Corentyne / New Amsterdam cluster identification. |
| **SLA breach detail tables** | MISSING | No per-record SLA breach listing (which customers breached, by how much, assigned to which staff). |
| **Cross-category duplicate warnings** | MISSING | No detection or warning when same account appears in multiple tracks. |
| **Within-sheet duplicate warnings** | MISSING | No dedup within sheets. |

---

## 9. Calculation Discrepancy Summary

| Area | Metric | Independent Value | Dashboard Behavior | Root Cause | File:Line |
|---|---|---|---|---|---|
| Track A Completed | Record count | 124 valid (March 5) | **135** (includes #NUM!) | No #NUM! exclusion | `parser.ts:302` |
| Track A Completed | SLA % | 96.8% (March 5) | **~97.0%** | #NUM! records counted as compliant | `analysis.ts:47` |
| Track A Completed | Mean days | 1.91 (March 5) | **~1.8** | #NUM! records as 1-day + 1-day floor | `analysis.ts:47` |
| Track B Outstanding | SLA % | 80.6% (30d) | **75.3% (26d)** | Different SLA threshold | `pending-analysis.ts:16` |
| Pending avg days | Precision | 1 decimal (e.g. 4.8) | **Integer** (e.g. 5) | `Math.round()` without decimal | `pending-analysis.ts:51` |
| Outstanding counts | Totals | Per-snapshot | **Inflated by embedded historical sheets** | Multi-sheet file processing | `parser.ts:188` |
| All metrics | Temporal scope | Per-snapshot date | **Cumulative / latest only** | No per-snapshot view | Architecture |

---

## 10. Recommendations (Priority Order)

### Critical

1. **Multi-sheet date filtering** — Parser should identify which sheets belong to the latest date and skip embedded historical sheets. Otherwise every upload from a multi-date file inflates outstanding counts.
   - File: `lib/pending-applications-parser.ts:188`
   - Fix: Extract date from each sheet name, only process sheets matching `dataAsOf` (the latest date found).

### High

2. **#NUM! / negative-day handling** — Either exclude records with 0-day completion from SLA calculations, or surface them as a data quality warning. At minimum, add a `data_quality_warnings` count to the upload response for negative-day records.
   - Files: `lib/pending-applications-parser.ts:299-303`, `lib/service-connection-analysis.ts:44-47`
   - Fix: Track a count of records where `end < start`, return in parse warnings, and either exclude from metrics or flag in UI.

3. **Per-snapshot metrics view** — Add a snapshot comparison UI using the existing `pending_application_snapshots` table. The data is already being stored; it just needs a frontend.
   - Files: New component + API route reading from `pending_application_snapshots`

### Medium

4. **Track B outstanding SLA threshold** — Decide whether outstanding SLA should use the 26-day execution stage target or the 30-day overall customer-facing target. The independent analysis uses 30d.
   - File: `lib/pending-applications-analysis.ts:16`
   - Fix: Add an `OVERALL` SLA per track (separate from per-stage) or use `SLA_TARGETS.TRACK_B_OVERALL = 30` for the pipeline view.

5. **Pending analysis precision** — Change `Math.round(totalDays / count)` to 1-decimal precision to match the efficiency panel's `avg()` function.
   - File: `lib/pending-applications-analysis.ts:51`
   - Fix: `Math.round((totalDays / count) * 10) / 10`

6. **Add median to pending analysis** — The outstanding pipeline stages should report median alongside average. The mean is heavily skewed by chronic outliers.
   - File: `lib/pending-applications-analysis.ts`
   - Fix: Add a `medianDays` field to `GPLPipelineStage` and compute it.

7. **Duplicate detection** — Add deduplication on `(customer_reference, service_order_number)` for `pending_applications` inserts and surface cross-category duplicates as warnings.
   - File: `app/api/pending-applications/upload/route.ts:224-244`

### Low

8. **Add trimmed means** — IQR-method trimmed means would provide more accurate central tendency, especially for estimates (where mean=19.9 but trimmed mean=13.9).
   - File: `lib/service-connection-analysis.ts`

9. **Staff performance tracking** — Parse the staff/assigned-to column from Excel sheets and compute per-staff completion metrics.
   - File: `lib/pending-applications-parser.ts`

10. **Track-specific aging buckets** — Replace or supplement the overall 6-tier aging buckets with per-track buckets using appropriate boundaries (Track A: 0-3d, 4-7d, ...; Track B: 0-10d, 11-20d, ...; Estimates: 0-5d, 6-12d, ...).
    - File: `lib/pending-applications-analysis.ts`

11. **Remove or reconsider 1-day floor** — The `Math.max(d, 1)` in `computeTrackMetrics` treats same-day completions as 1 day. This is debatable for metering connections. Consider using 0 as the floor.
    - File: `lib/service-connection-analysis.ts:47`

---

## Appendix: Data Flow Diagram

```
Excel Upload (multi-sheet: Outstanding/Completed per track per date)
    |
    v
Parser (pending-applications-parser.ts)
    - Iterates ALL sheets (except Summary)       <-- Issue: no date filtering
    - Detects headers dynamically (rows 1-15)    <-- Correct
    - Maps columns by name search               <-- Correct
    - Computes days from raw dates               <-- Correct (bypasses formula cells)
    - Math.max(0, ...) on negative days          <-- Issue: silent zero-floor
    - Classifies track from service type / sheet name
    |
    +--> Outstanding records
    |       |
    |       v
    |   Diff Engine (service-connection-diff.ts)
    |       - Compares vs existing open service_connections
    |       - Disappeared orders -> marked completed
    |       - New orders -> inserted as open
    |       - Stage changes -> tracked in stage_history
    |       |
    |       v
    |   pending_applications table (DELETE + INSERT, no dedup)  <-- Issue: multi-date inflation
    |       |
    |       v
    |   Pending Analysis (pending-applications-analysis.ts)
    |       - Pipeline funnel with per-stage SLA (26d for Execution)  <-- Issue: not 30d
    |       - Overall aging buckets (not per-track)                   <-- Issue: not track-specific
    |       - Integer-rounded averages                                <-- Issue: precision
    |       - No median                                               <-- Issue: missing
    |
    +--> Completed records
            |
            v
        insertCompletedConnections (upload/route.ts)
            - UPSERT on (customer_reference, service_order_number)  <-- Correct dedup
            - total_days_to_complete = days_taken (may be 0)
            |
            v
        service_connections table (cumulative lifecycle)
            |
            v
        computeEfficiencyMetrics (service-connection-analysis.ts)
            - Math.max(d, 1) floor on all days        <-- Issue: 0->1 inflation
            - Per-track SLA (3d / 30d / 12d)           <-- Correct thresholds
            - Mean + Median (1 decimal precision)       <-- Correct precision
            - No trimmed mean                           <-- Missing
            - No #NUM! detection                        <-- Missing
            - No per-snapshot breakdown                 <-- Missing
```
