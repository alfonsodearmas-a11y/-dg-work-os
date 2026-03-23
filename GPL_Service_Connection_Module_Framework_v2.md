# GPL Service Connection Efficiency Module
## Architecture & Implementation Framework v2

**Purpose**: Complete specification for rebuilding the GPL Service Connection Efficiency module in DG Work OS. Designed to be handed directly to Claude Code for implementation.

**Version Note**: v2 corrects the pipeline model. Estimates/Designs are NOT a separate parallel track. They are Stage 1 of the Track B (Capital Works) pipeline, with their own 12-day SLA that is measured independently from the 30-day customer-facing SLA.

---

## 1. The Pipeline Model

### 1.1 Track A: Simple Connection (No Capital Works Required)

```
Application --> Metering Installation --> Connected
                    3-day SLA
```

One stage. One SLA. Straightforward.

### 1.2 Track B: Capital Works Required (Multi-Stage Pipeline)

```
                     +------------------------------------------+
                     |        GPL's 12-DAY STANDARD             |
                     |   (separate from 30-day clock)           |
                     |                                          |
Application -->  DESIGN / ESTIMATE  -->  Customer Satisfies STC
                  (12-day SLA)            (pays quotation)
                                               |
                     +------------------------------------------+
                     |     CUSTOMER-FACING 30-DAY CLOCK         |
                     |                                          |
                     |   EXECUTION          METERING            |
                     |  (Capital Works) --> (Installation)      |
                     |   ~26 days            ~3 days            |
                     |                                          |
                     +------------------------------------------+
```

Three stages, two SLA standards:

| Stage | What Happens | SLA | Clock |
|---|---|---|---|
| Design/Estimate | GPL produces the quotation for capital contribution | **12 days** | Separate standard. Customer has NOT satisfied STC yet, so this period is NOT part of the 30-day commitment. |
| Execution | Primary/secondary network construction (capital works) | Part of **30 days** | Starts when customer satisfies STC. ~26 days of the 30. |
| Metering | Meter installation after capital works complete | Part of **30 days** | Final ~3 days of the 30. |

**Critical insight**: The outstanding estimates represent applications where GPL hasn't even given the customer a price yet. These customers CANNOT start their 30-day clock because GPL hasn't produced the estimate. This is a pre-pipeline bottleneck, and at only 36-42% SLA compliance on completed estimates, it is the weakest link in the entire system.

### 1.3 What the Excel Sheets Map To

| Sheet Name Pattern | Pipeline Position |
|---|---|
| "Outstanding NS 3 days" | Track A: Outstanding simple connections |
| "Out NS Cap Works 26 days" | Track B, Stage 2: Outstanding execution |
| "Outstanding Estimates" | Track B, Stage 1: Outstanding designs (pre-STC) |
| "Completed NS 3 days" | Track A: Completed simple connections |
| "Completed NS 26 days" | Track B, Stage 2: Completed execution |
| "Completed Estimates" | Track B, Stage 1: Completed designs |

### 1.4 Open Question: Stage Handoff Visibility

When an application moves from Design (Stage 1) to Execution (Stage 2), we do not yet know whether GPL's spreadsheets show it in both sheets during transition or only in the destination sheet. This needs to be confirmed with GPL. The system should handle both cases:

- **Clean handoff**: Application disappears from Estimates sheet and appears in Cap Works sheet. The diff engine detects a "completed" design and a "new" capital works entry for the same account.
- **Overlap period**: Application appears in both sheets briefly. The system should recognize same-account records across stages and NOT double-count them in pipeline totals.

Either way, the system should attempt to link records across stages using account_number to build a full lifecycle timeline for Track B applications.

---

## 2. Data Architecture

### 2.1 Snapshot Model

Every upload creates one dated snapshot containing the full pipeline state.

### 2.2 Multi-Sheet File Handling (CRITICAL FIX)

GPL's Excel files embed historical snapshots. The March 5 file contains March 5, March 4, AND March 3 sheets.

**Rule**: Extract the date from each sheet name. Only process sheets belonging to the latest date found in the file. Skip embedded historical sheets.

### 2.3 Database Schema

```sql
-- Each upload creates one snapshot
CREATE TABLE gpl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  file_name TEXT,
  track_a_outstanding INT,
  track_a_completed INT,
  track_b_design_outstanding INT,
  track_b_execution_outstanding INT,
  track_b_design_completed INT,
  track_b_execution_completed INT,
  track_b_total_outstanding INT GENERATED ALWAYS AS
    (track_b_design_outstanding + track_b_execution_outstanding) STORED,
  data_quality_warnings JSONB DEFAULT '[]',
  warning_count INT DEFAULT 0,
  user_id UUID REFERENCES auth.users(id)
);

-- Outstanding records
CREATE TABLE gpl_outstanding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('A', 'B')),
  stage TEXT NOT NULL CHECK (stage IN ('metering', 'design', 'execution')),
  row_number INT,
  customer_number TEXT,
  account_number TEXT,
  customer_name TEXT,
  service_address TEXT,
  town_city TEXT,
  account_status TEXT,
  cycle TEXT,
  account_type TEXT,
  division_code TEXT,
  service_order_number TEXT,
  service_type TEXT,
  date_created TIMESTAMPTZ,
  current_date_ref DATE,
  days_elapsed INT,
  days_elapsed_calculated INT,
  UNIQUE(snapshot_id, account_number, service_order_number)
);

-- Completed records
CREATE TABLE gpl_completed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('A', 'B')),
  stage TEXT NOT NULL CHECK (stage IN ('metering', 'design', 'execution')),
  row_number INT,
  customer_number TEXT,
  account_number TEXT,
  customer_name TEXT,
  service_address TEXT,
  town_city TEXT,
  account_status TEXT,
  cycle TEXT,
  account_type TEXT,
  service_order_number TEXT,
  service_type TEXT,
  date_created TIMESTAMPTZ,
  date_completed DATE,
  created_by TEXT,
  days_taken INT,
  days_taken_calculated INT,
  is_data_quality_error BOOLEAN DEFAULT false,
  data_quality_note TEXT,
  UNIQUE(snapshot_id, account_number, service_order_number)
);

-- Pre-computed metrics per snapshot per track+stage
CREATE TABLE gpl_snapshot_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES gpl_snapshots(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  stage TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('outstanding', 'completed')),
  total_count INT,
  valid_count INT,
  error_count INT DEFAULT 0,
  sla_target_days INT,
  within_sla_count INT,
  sla_compliance_pct NUMERIC(5,2),
  mean_days NUMERIC(6,2),
  median_days NUMERIC(6,2),
  trimmed_mean_days NUMERIC(6,2),
  mode_days INT,
  std_dev NUMERIC(6,2),
  min_days INT,
  max_days INT,
  q1 NUMERIC(6,2),
  q3 NUMERIC(6,2),
  p90 NUMERIC(6,2),
  p95 NUMERIC(6,2),
  ageing_buckets JSONB,
  staff_breakdown JSONB,
  UNIQUE(snapshot_id, track, stage, category)
);

-- Chronic outlier watchlist
CREATE TABLE gpl_chronic_outliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL,
  customer_name TEXT,
  town_city TEXT,
  track TEXT NOT NULL,
  stage TEXT NOT NULL,
  service_order_number TEXT,
  first_seen_date DATE NOT NULL,
  first_seen_snapshot_id UUID REFERENCES gpl_snapshots(id),
  latest_snapshot_id UUID REFERENCES gpl_snapshots(id),
  latest_days_elapsed INT,
  consecutive_snapshots INT DEFAULT 1,
  date_created TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT false,
  resolved_date DATE,
  UNIQUE(account_number, service_order_number)
);
```

### 2.4 Sheet-to-Schema Mapping

| Sheet Pattern | track | stage |
|---|---|---|
| Outstanding NS 3 days | A | metering |
| Out NS Cap Works 26 days | B | execution |
| Outstanding Estimates | B | design |
| Completed NS 3 days | A | metering |
| Completed NS 26 days | B | execution |
| Completed Estimates | B | design |

---

## 3. SLA Framework

### 3.1 SLA Targets

| Track | Stage | SLA Target | Clock |
|---|---|---|---|
| A | Metering | **3 days** | From application to connection |
| B | Design | **12 days** | Separate standard. Pre-STC. |
| B | Execution | **26 days** | Part of 30-day post-STC clock |
| B | Metering | **3 days** | Part of 30-day post-STC clock |
| B | Overall (post-STC) | **30 days** | Execution + Metering combined |

### 3.2 How SLA Is Measured

- **Outstanding records**: "Time elapsed" column = days since created. Compare against stage SLA.
- **Completed records**: "Days taken" column. Compare against stage SLA.
- **Data quality errors**: EXCLUDE from SLA. Count separately.

### 3.3 Design SLA Is the Leading Indicator

At 36-42% compliance on a 12-day target, the design stage is where the system fails. Every day GPL takes beyond 12 days to produce an estimate is a day the customer cannot satisfy STC, which means the 30-day clock cannot start.

The dashboard should surface this explicitly: "X applications stuck at design stage, delaying entry into the 30-day pipeline."

---

## 4. Metrics Framework

### 4.1 Central Tendency (compute all four)

1. **Mean**: Standard arithmetic mean of valid records only
2. **Median**: Middle value (PRIMARY headline for outstanding)
3. **Trimmed Mean**: IQR method (display when outliers exist)
4. **Mode**: Most frequent value (useful for completed)

### 4.2 Ageing Buckets (Stage-Specific)

**Track A Metering (3-day SLA)**: 0-3d | 4-7d | 8-14d | 15-30d | 31-60d | 61+d

**Track B Design (12-day SLA)**: 0-5d | 6-12d | 13-20d | 21-30d | 31+d

**Track B Execution (30-day SLA)**: 0-10d | 11-20d | 21-26d | 27-30d | 31-60d | 61+d

### 4.3 Data Quality Handling

Reversed dates (completed before created): flag, set days=NULL, exclude from metrics, count visibly.
Same-day completion: 0 days. No floor. Legitimate.

---

## 5. Dashboard Views

### 5.1 Tab Structure

```
EXECUTIVE SUMMARY | TRACK B PIPELINE | EFFICIENCY & STAFF | DATA QUALITY
```

### 5.2 Executive Summary (Default)

**Top Row: 4 Headline Cards**

1. **Track A (Simple)**: Outstanding count, completed count, SLA %, median wait, delta from previous snapshot
2. **Track B (Capital Works)**: Combined outstanding (design + execution), completed count (execution), overall SLA, median
3. **Design Backlog (Pre-Pipeline)**: Outstanding estimates count, design SLA compliance, "X applications stuck before 30-day clock can start"
4. **Chronic Outliers**: Count by track/stage, top offender name and age

**Second Row: Trend Sparklines** (last 10-20 snapshots)
- Outstanding counts per track/stage
- SLA compliance % per stage
- Completion volume per stage

**Third Row: Chronic Outlier Alert Table**

### 5.3 Track B Pipeline View

**Section 1: Pipeline Funnel** showing Design --> Customer STC --> Execution --> Metering flow with counts, SLA rates, and median wait at each stage

**Section 2: Stage Comparison Table** side by side metrics

**Section 3: Ageing Distribution** per stage with color-coded horizontal bars

**Section 4: Outstanding Records Tables** (tabbed by stage)

### 5.4 Efficiency & Staff View

Completion efficiency cards per stage, staff performance table, SLA breach register, trend charts

### 5.5 Data Quality & Audit View

Upload warnings, quality trends, chronic outlier watchlist

---

## 6. Upload Processing Pipeline

1. File received
2. Sheet scanning: extract dates, filter to latest, classify track+stage+category
3. Summary validation
4. Parse each sheet (dynamic headers, column mapping, date calculation, quality checks, dedup)
5. Cross-stage duplicate check
6. Metrics computation per (track, stage, category)
7. Reclassification detection (compare vs previous snapshot)
8. Database upsert (snapshot, records, metrics)
9. Chronic outlier update
10. Validation against Summary sheet
11. Return response with warnings

---

## 7. API Endpoints

```
POST   /api/gpl/upload              Upload and process Excel file
GET    /api/gpl/snapshots           List snapshots
GET    /api/gpl/snapshots/:id       Full snapshot detail
GET    /api/gpl/latest              Latest snapshot + metrics
GET    /api/gpl/trending            Time series (filterable by stage, metric)
GET    /api/gpl/outstanding         Current outstanding (filterable by track, stage, sla_status)
GET    /api/gpl/completed           Completed records (filterable)
GET    /api/gpl/staff               Staff performance
GET    /api/gpl/outliers            Chronic outlier watchlist
GET    /api/gpl/pipeline            Track B pipeline funnel data
GET    /api/gpl/data-quality        Warnings across snapshots
```

---

## 8. Key Design Decisions

**8.1 Design is Track B Stage 1, not a separate track.** Every outstanding estimate will eventually become an outstanding capital works entry. The funnel visualization makes this flow visible. This is the biggest conceptual correction from the previous architecture.

**8.2 Median as headline, mean as context.** Chronic outliers (80+ days) make the mean useless for Track A. Median tells you the typical experience.

**8.3 Design SLA is the leading indicator.** At 36-42% compliance, this is where the system fails. The dashboard should make this the most visible bottleneck.

**8.4 Dual SLA for Track B execution.** Show both 26-day (internal) and 30-day (customer-facing). Internal team cares about 26. DG and Minister care about 30.

**8.5 No 1-day floor.** Same-day completion = 0 days. Remove Math.max(d, 1).

**8.6 Exclude data errors, display them visibly.** Reversed dates are excluded from metrics but counted as warnings.

---

## 9. Validation Reference Data

After implementation, re-upload March 3, 4, 5 files. Must match:

### March 3
| Stage | Category | Count | Valid | SLA Target | SLA % | Mean | Median |
|---|---|---|---|---|---|---|---|
| Track A Metering | Outstanding | 102 | 102 | 3d | 52.0% | 7.0 | 2 |
| Track A Metering | Completed | 80 | 75 | 3d | 97.3% | 1.89 | 2.0 |
| Track B Design | Outstanding | 180 | 180 | 12d | -- | -- | -- |
| Track B Design | Completed | 12 | 12 | 12d | 41.7% | 18.3 | 15.5 |
| Track B Execution | Outstanding | 62 | 62 | 30d | 72.6% | 29.6 | 20 |
| Track B Execution | Completed | 2 | 2 | 30d | 100% | 11.0 | 11.0 |

### March 4
| Stage | Category | Count | Valid | SLA Target | SLA % | Mean | Median |
|---|---|---|---|---|---|---|---|
| Track A Metering | Outstanding | 119 | 119 | 3d | 80.7% | 5.4 | 1 |
| Track A Metering | Completed | 106 | 100 | 3d | 96.0% | 1.90 | 2.0 |
| Track B Design | Outstanding | 195 | 195 | 12d | -- | -- | -- |
| Track B Design | Completed | 13 | 13 | 12d | 38.5% | 18.2 | 16.0 |
| Track B Execution | Outstanding | 61 | 61 | 30d | -- | -- | -- |
| Track B Execution | Completed | 2 | 2 | 30d | 100% | 11.0 | 11.0 |

### March 5
| Stage | Category | Count | Valid | Errors | SLA Target | SLA % | Mean | Median | Trimmed Mean |
|---|---|---|---|---|---|---|---|---|---|
| Track A Metering | Outstanding | 150 | 150 | 0 | 3d | 74.7% | ~4.8 | 2 | -- |
| Track A Metering | Completed | 135 | 124 | 11 | 3d | 96.8% | 1.91 | 2.0 | 1.83 |
| Track B Design | Outstanding | 62 | 62 | 0 | 12d | 24.2% | -- | 20 | -- |
| Track B Design | Completed | 22 | 22 | 0 | 12d | 36.4% | 19.9 | 14.5 | 13.9 |
| Track B Execution | Outstanding | 186 | 186 | 0 | 30d | 80.6% | 21.3 | 10 | -- |
| Track B Execution | Completed | 7 | 7 | 0 | 30d | 85.7% | 21.6 | 16.0 | 11.0 |

Data quality warnings for March 5: 11 reversed dates, 3 cross-stage duplicates, 2 within-sheet duplicates.

---

## 10. Implementation Priority

### Phase 1: Foundation
1. Database schema (gpl_* tables)
2. Parser fixes (date filtering, negative days, dedup, Created By extraction)
3. Metrics computation engine
4. Upload pipeline
5. Executive Summary view with sparklines

### Phase 2: Pipeline Depth
6. Track B Pipeline view with funnel
7. Ageing charts (stage-specific)
8. Efficiency & Staff view
9. Chronic outlier watchlist

### Phase 3: Polish
10. Data Quality view
11. Reclassification detection
12. Geographic clustering
13. SLA breach register
14. Report export

Existing tables preserved during development. New module on gpl_* tables. Once validated against Section 9, old module deprecated.
