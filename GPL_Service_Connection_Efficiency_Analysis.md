# GPL Service Connection Efficiency Analysis
## Period: February 28 -- March 5, 2026
### Raw Data Audit for DG Work OS Dashboard Comparison

---

## Methodology

This analysis was computed directly from seven raw Excel files using Python (pandas, numpy, openpyxl). Every row count, SLA rate, and efficiency metric was independently derived from the underlying data, not from GPL's summary formulas. Where the spreadsheet's own formulas produced errors (#NUM!), the root cause was traced and the correct values calculated manually.

For central tendency measures, both mean and median are reported. Where outliers skew the mean significantly, a **trimmed mean** using the IQR method (excluding values beyond Q3 + 1.5 * IQR) is provided as the more reliable measure. Outliers are individually identified with account numbers, names, locations, and age so they can be actioned separately from the efficiency statistics.

---

## 1. Summary Sheet Trending (Day-Over-Day)

| Metric | March 3 | March 4 | March 5 | Delta 3->4 | Delta 4->5 |
|---|---|---|---|---|---|
| Outstanding Metering | 102 | 119 | 150 | +17 | +31 |
| Outstanding Networks | 62 | 61 | 186 | -1 | +125 |
| Outstanding Total | 164 | 180 | 336 | +16 | +156 |
| Outstanding Estimates | 180 | 195 | 62 | +15 | -133 |
| Completed Metering | 80 | 106 | 135 | +26 | +29 |
| Completed Networks | 2 | 2 | 7 | 0 | +5 |
| Completed Total | 82 | 108 | 142 | +26 | +34 |
| Completed Estimates | 12 | 13 | 22 | +1 | +9 |

### Completion Rates (Completed / Total Applications):
- **March 3:** 33.3% (82/246) connections | 6.2% (12/192) estimates
- **March 4:** 37.5% (108/288) connections | 6.2% (13/208) estimates
- **March 5:** 29.7% (142/478) connections | 26.2% (22/84) estimates

### Critical Observation: March 5 Reclassification

The Networks outstanding count jumped from 61 (March 4) to 186 (March 5), a +125 increase. Simultaneously, Estimates outstanding dropped from 195 to 62 (-133). This is a **reporting structure change**, not a pipeline explosion. The March 5 file moved estimate-stage applications into the Networks/Capital Works category. The comparable combined figure is: Networks + Estimates = 248 (March 5) vs 256 (March 4). The dashboard must account for this shift or day-over-day trends will be misleading.

---

## 2. Track A: Simple Metering Connections (3-Day SLA)

### 2A. Completed Connections

| Snapshot | N Completed | Valid Days Data | #NUM! Errors | SLA Compliance | Mean Days | Median | Trimmed Mean |
|---|---|---|---|---|---|---|---|
| March 3 | 80 | 75 | 0 | **97.3%** (73/75) | 1.89 | 2.0 | 1.82 |
| March 4 | 106 | 100 | 0 | **96.0%** (96/100) | 1.90 | 2.0 | 1.80 |
| March 5 | 135 | 124 | 11 | **96.8%** (120/124) | 1.91 | 2.0 | 1.83 |

The completion efficiency is remarkably consistent across all three snapshots. The mode is 2 days. The IQR is tight (Q1=1, Q3=2), confirming that the typical metering connection takes 1-2 days. Only 2-4 completions exceeded the 3-day SLA in any snapshot.

**SLA Breach Details (March 5 cumulative):**

| Customer | Location | Days Taken | Staff |
|---|---|---|---|
| SAVITRIE PERSAUD | Soesdyke | 5 | Madona Prescott |
| ASHOKA BUILDCON (GUYANA INC) | Eccles | 4 | Crystal Edwards |
| ABIONA ROBERTS | Turkeyen | 4 | Asha Shanks |
| KAILESH SAMMY | Covent Garden | 4 | Asha Shanks |

### 2B. #NUM! Error Investigation (March 5)

11 records in the March 5 completed metering sheet show #NUM! instead of a day count. Root cause: the "Date Work Completed" field contains dates BEFORE the "Date/Time Created" field, producing negative values that Excel cannot render. Examples:

| Customer | Date Created | Date Work Completed | Calculated Days |
|---|---|---|---|
| BEBE NAZIMA HAFIZ | 2026-03-02 15:54 | 2026-03-02 00:00 | -1 (same-day, time reversal) |
| GENESIS GABRIELLA LAYNE | 2026-03-02 08:36 | 2026-02-19 00:00 | -12 (wrong completion date) |
| ALLYCIA DAVIE NOHAR | 2026-02-26 15:30 | 2026-02-19 00:00 | -8 (wrong completion date) |

Two patterns exist: (1) same-day completions where the work completed timestamp is midnight of the same day but the created timestamp is that afternoon, producing -1; and (2) genuinely incorrect completion dates that predate the application by 4-12 days. The dashboard should treat pattern (1) as 0-day completions. Pattern (2) is a data entry error that GPL needs to correct at source.

### 2C. Outstanding Metering

| Snapshot | N Outstanding | SLA Compliant (<=3d) | Mean Elapsed | Median | Max |
|---|---|---|---|---|---|
| March 3 | 102 | 52.0% (53) | 7.0 days | 2 | 83 |
| March 4 | 119 | 80.7% (96) | 5.4 days | 1 | 84 |
| March 5 | 150 | 74.7% (112) | 4.8 days | 2 | 85 |

**Why the mean is misleading here:** The mean of 4.8-7.0 days vastly overstates the typical wait. This is caused by 3-7 chronic legacy applications that have been sitting for 50-85 days. Removing these outliers, the effective mean for the active pipeline is under 3 days. The **median of 1-2 days** is the honest measure of current operational pace.

**Ageing Buckets (March 5):**

| Bucket | Count | Percentage |
|---|---|---|
| Current (0-3 days) | 112 | 74.7% |
| Recent breach (4-7 days) | 26 | 17.3% |
| Moderate (8-14 days) | 4 | 2.7% |
| Stale (15-30 days) | 3 | 2.0% |
| Critical (31-60 days) | 2 | 1.3% |
| Severe (61+ days) | 3 | 2.0% |

**Chronic Outliers (Metering):**

| Account | Customer | Location | Days Outstanding | Since |
|---|---|---|---|---|
| 0984208 | FARIDA MOHAMED | Bartica | 83-85 | Dec 11, 2025 |
| 0972118 | SANDRINE LINDORE | Bartica | 79-81 | Dec 15, 2025 |
| 0937593 | GV E-NDMA | Covent Garden | 79-81 | Dec 15, 2025 |
| 0988843 | COSMO ORIN FRANCE | Pln. Bell Vue | 50-52 | Jan 13, 2026 |

Two of these are in Bartica, which suggests a geographic/logistical bottleneck. The E-NDMA (government) account at 80 days is notable given it is a government entity.

---

## 3. Track B: Capital Works (26-Day Execution / 30-Day Total SLA)

### 3A. Completed Capital Works

| Snapshot | N Completed | SLA Compliance (<=30d) | Mean | Median | Outlier |
|---|---|---|---|---|---|
| March 3 | 2 | 100% | 11.0 | 11.0 | None |
| March 4 | 2 | 100% | 11.0 | 11.0 | None |
| March 5 | 7 | 85.7% (6/7) | 21.6 | 16.0 | Vanessa Kerrett: 75 days |

The March 5 mean of 21.6 days is heavily distorted by one outlier (Vanessa Kerrett at 75 days, from Albertown, application dating to December 15, 2025). The **trimmed mean is 11.0 days**, suggesting that when capital works do get completed, they typically finish well within the 30-day window.

Sample size is extremely small (2-7 records), so these statistics carry low confidence. The real concern is the outstanding backlog, not the completed efficiency.

### 3B. Outstanding Capital Works

| Snapshot | N Outstanding | <=26 day SLA | <=30 day SLA | >30 day breach | Mean | Median |
|---|---|---|---|---|---|---|
| March 3 | 62 | 66.1% | 72.6% | 27.4% (17) | 29.6 | 20 |
| March 5 | 186 | 75.3% | 80.6% | 19.4% (36) | 21.3 | 10 |

The March 5 count of 186 includes reclassified estimate-stage applications. The lower median (10 days) reflects this influx of newer applications pulling down the central tendency.

**Ageing Buckets (March 5):**

| Bucket | Count | Percentage |
|---|---|---|
| Current (0-10 days) | 95 | 51.1% |
| Active (11-20 days) | 25 | 13.4% |
| Near SLA (21-26 days) | 20 | 10.8% |
| Grace (27-30 days) | 10 | 5.4% |
| Breach (31-60 days) | 21 | 11.3% |
| Severe (61+ days) | 15 | 8.1% |

**Severe Outliers (>60 days, Capital Works, March 5):**

| Account | Customer | Location | Days | Since |
|---|---|---|---|---|
| 0976198 | SUNIL NARINE | Bartica | 123 | Nov 3, 2025 |
| 0960043 | DEBBIE VANESSA NORTH | Corentyne | 119 | Nov 7, 2025 |
| 0977783 | MS. KIZZY MELISSA RODNEY | No.22/Bel Air | 116 | Nov 10, 2025 |
| 0949363 | U-MOBILE (CELLULAR) INC. | N/A | 99 | Nov 27, 2025 |
| 0978958 | MARGARET LUCRECIA LANCASTER | New Amsterdam | 98 | Nov 28, 2025 |

These applications predate the reporting period by months. Bartica and Corentyne/New Amsterdam locations appear repeatedly, suggesting regional infrastructure constraints.

---

## 4. Estimates / Designs (12-Day SLA)

### 4A. Completed Estimates

| Snapshot | N | SLA Compliance (<=12d) | Mean | Median | Trimmed Mean |
|---|---|---|---|---|---|
| March 3 | 12 | **41.7%** (5/12) | 18.3 | 15.5 | 14.3 |
| March 4 | 13 | **38.5%** (5/13) | 18.2 | 16.0 | 14.4 |
| March 5 | 22 | **36.4%** (8/22) | 19.9 | 14.5 | 13.9 |

**This is the weakest-performing category by far.** Only about 38% of completed estimates met the 12-day SLA. Even the trimmed mean (13.9 days) exceeds the target. The median of 14.5 days suggests the design/estimation process has a structural bottleneck.

**Outliers:**
- KEY ACCOUNTS AND MARKETING UNIT (63 days, all snapshots, staff: Crystal Edwards)
- SEHON SHERWYN RITCH (95 days, March 5 only, staff: Delon Reddock)

### 4B. Outstanding Estimates (March 5)

| Bucket | Count | Percentage |
|---|---|---|
| Current (0-5 days) | 9 | 14.5% |
| Active (6-12 days) | 6 | 9.7% |
| Breach (13-20 days) | 16 | 25.8% |
| Stale (21-30 days) | 14 | 22.6% |
| Critical (31+ days) | 17 | 27.4% |

75.4% of outstanding estimates are already in breach of the 12-day SLA. The P90 is 57 days, P95 is 108 days.

---

## 5. Staff Performance Analysis (Completed Metering, March 5)

| Staff | Completions | Avg Days | Median Days | Notes |
|---|---|---|---|---|
| Asha Shanks | 55 | 1.8 | 2.0 | Highest volume by far (44% of all completions) |
| Abigail Roberts | 12 | 1.8 | 2.0 | Solid efficiency |
| Delon Reddock | 11 | 2.5 | 3.0 | Slowest among top 5 |
| Tomecia Rodrigues | 8 | 1.9 | 2.0 | Consistent |
| Crystal Roberts | 6 | 1.5 | 1.5 | Fastest among top 5 |
| Anjalika Amsterdam | 6 | 1.8 | 2.0 | Consistent |
| Suzanna Balgrim | 4 | 2.0 | 2.0 | |
| Tashana Lake | 4 | 2.5 | 3.0 | |
| Madona Prescott | 1 | 5.0 | 5.0 | Only completion was an SLA breach |

---

## 6. Data Integrity Findings

### 6A. Cross-File Consistency

All summary sheet counts match actual row counts in every file. March 3 sheets embedded within the March 4 file are identical to the standalone March 3 file. March 4 sheets embedded within the March 5 file are identical to the standalone March 4 file. **The data is internally consistent.**

### 6B. Issues Identified

1. **11 #NUM! errors** in March 5 completed metering (negative day calculations from reversed date fields)
2. **3 accounts appear in BOTH** outstanding metering AND capital works (TILOCHNEE SINGH, SHAUNIQUE SHONAYA DOUGAN, MSN AIR SERVICE INCORPORATED) -- potential double-counting in the summary totals
3. **2 duplicate entries** within capital works: Gibraltar-Courtland Community Development (account 0929513, appears twice) and Key Accounts Marketing Unit (account 0928268, appears twice)
4. **March 5 reclassification** breaks day-over-day comparability between Networks and Estimates categories
5. **February 26 Open NS** file has an empty second sheet
6. **Feb 26\_1 and Feb 27\_1** files are duplicates of their counterparts

---

## 7. Dashboard Comparison Reference

These are the exact numbers the DG Work OS dashboard should reflect for each snapshot date. Any deviation from these values indicates a calculation error in the dashboard logic.

### March 3
- Track A Outstanding: 102 | SLA: 52.0% | Mean: 7.0d | Median: 2d
- Track B Outstanding: 62 | SLA (30d): 72.6% | Mean: 29.6d | Median: 20d
- Estimates Outstanding: 180
- Completed Metering: 80 (75 valid) | SLA: 97.3% | Mean: 1.89d
- Completed Capital: 2 | Mean: 11.0d
- Completed Estimates: 12 | SLA: 41.7% | Mean: 18.3d

### March 4
- Track A Outstanding: 119 | SLA: 80.7% | Mean: 5.4d | Median: 1d
- Track B Outstanding: 61
- Estimates Outstanding: 195
- Completed Metering: 106 (100 valid) | SLA: 96.0% | Mean: 1.90d
- Completed Capital: 2 | Mean: 11.0d
- Completed Estimates: 13 | SLA: 38.5% | Mean: 18.2d

### March 5
- Track A Outstanding: 150 | SLA: 74.7% | Mean: 4.8d | Median: 2d
- Track B Outstanding: 186 (reclassified) | SLA (30d): 80.6% | Mean: 21.3d | Median: 10d
- Estimates Outstanding: 62
- Completed Metering: 135 (124 valid, 11 #NUM!) | SLA: 96.8% | Mean: 1.91d
- Completed Capital: 7 | Mean: 21.6d (trimmed: 11.0d)
- Completed Estimates: 22 | SLA: 36.4% | Mean: 19.9d (trimmed: 13.9d)

### February Baselines (from Open NS files)
- Feb 25 COB: Metering 159 (71.7% in timeline) | Networks 61 (77.0%) | Design 153 | Total 373
- Feb 26 COB: Metering 167 (59.9% in timeline) | Networks 56 (82.1%) | Design 160 | Total 383

---

## 8. Key Takeaways for Executive Action

**Track A (Metering) is performing well.** 96-97% SLA compliance on completions, median 2 days. The outstanding pipeline has a handful of chronic legacy cases that need escalation, but current operations are efficient.

**Track B (Capital Works) has structural challenges.** Small completion volumes (2-7 in the entire period), a growing backlog of 186 outstanding, and 15 applications over 60 days old. Geographic clusters in Bartica, Corentyne, and New Amsterdam suggest infrastructure or logistics constraints.

**Estimates/Designs is the bottleneck.** Only 36-42% SLA compliance. Even the trimmed mean exceeds the 12-day target. 75% of the outstanding estimate pipeline is already in breach. This is where operational improvement would have the highest impact on the overall 30-day service connection timeline.

**Data quality needs attention.** The #NUM! errors, cross-category duplicates, and reclassification between snapshots will cause dashboard display issues if not handled programmatically.
