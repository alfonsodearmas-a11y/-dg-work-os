# Procurement Module — Reformulation Plan

**Author:** Claude (Opus 4.7, 1M ctx) · **Date:** 2026-04-17 · **Status:** Decisions locked in §9. No code has been written.
**Source of truth going forward:** `PSIP Monitoring Form` sheet of the weekly MPUA PSIP xlsx.

---

## 0. TL;DR

The current Procurement module is built around a **budget-centric, manually-created "package"** model with a bulk CSV importer bolted on, an auxiliary **Trello mirror**, and a narrow **GWI-only PSIP Sync** as a late addition. The data model, the UI, and the ingestion flow are all misaligned with what you actually want to track, which is: **for every leaf procurement action in the PSIP sheet, what stage is it at?** Budget, NPTAB number, contract-sum metadata, the oversight-project link, and the standalone "New Tender" form are all incidental at best.

The cheapest honest fix is a hard cutover: new tables, a new ingest pipeline, new upload-with-dry-run page, reuse of the existing Kanban / list / detail / analytics UI (with budget columns stripped and two new metadata flags added). We are throwing away the freehand CSV bulk-upload, the GWI-only PSIP Sync, and the demo seeder. We are **keeping** the Trello → tenders mirror because Lethem and HECI are explicitly out of PSIP scope and live in Trello — but unifying Trello and PSIP tenders into a single `tender` table with a `source` column, not merging at render time.

All 11 open questions have been answered (§9). Confirmed architectural decisions at the top of §8 below.

---

## 1. Current State Audit (live app)

All screenshots in `audit-screenshots/procurement-reform/`. Tested as `dg` role (full visibility).

### 1.1 `/procurement` — Pipeline Kanban
`01-pipeline-board.png`

- Header: "Procurement Pipeline" · "Procurement tracking". Buttons: **PSIP Sync**, **Bulk Upload**, **+ New Tender**.
- Tabs: **Pipeline** | **Analytics**.
- Filter row: agencies **All · GPL · GWI · HECI · CJIA · MARAD · GCAA · HAS**. (Note: no MPUA; HAS = Hinterland Aviation Services / Harbour & Aviation Services — not a programme-341 concept.)
- View toggle: **Board** | **List**. Sync-settings gear.
- Stat strip: `Active Tenders 44` · `Avg Days to Award —` · `Stalled 0`.
- Five columns: **Pre-Advertisement Review (8) · Advertised (10) · Evaluation (32) · No-Objection (2) · Awarded (0)**. Columns sum to 52. **The "44" in the header is wrong** (it counts `procurement_packages` only; the other 8 come from `procurement_items` i.e. Trello).
- Cards: title, agency badge, days-at-stage chip (e.g. `27d` with a colour dot), method chip ("Open Tender"). HECI cards also render a calendar chip (`📅 30 Mar`) and an "Open details" affordance — these are Trello-sourced.
- "Show more · 22 remaining" pagination at 10/column.

### 1.2 `/procurement` — Analytics tab
`02-analytics.png`

- Same filter row (minus GPL since GPL has no tenders today).
- Stats: `Active Tenders 52` (note: this one is correct, header bar on Pipeline is not), `Avg Days to Award —`, `Stuck Tenders 0`.
- Cards: **Pipeline Shape** (horizontal bar by stage), **Agency Breakdown** (table: agency · active · avg days), **Requires Attention** (empty state), **Time in Stage** (bars vs. 21-day target), **Procurement Method** (donut — all 52 are `Open Tender`, which is a tell that the data is test-imported), **Completion Rate** (`0% awarded · 52 in progress`, progress bars per agency).

### 1.3 `/procurement/psip-sync`
`03-psip-sync.png`

- Title: **PSIP Sync — GWI**. Subtitle: *"Upload the 2026 PSIP Excel file to review procurement status changes before applying."*
- Single dropzone. No tabs. No stats. No history.
- Gated by `canAccessPsipSync()` — DG or GWI staff only.
- Server-side diff engine: takes an xlsx with the GWI sheet, matches rows by `psip_ref` (line-item code — i.e. column A), produces a `RecordDiff[]` list, user approves → `POST /api/procurement/psip/sync` applies changes to `procurement_packages` field-by-field.
- This is the skeleton of what the new ingest needs to become. It is currently narrow, fragile, and only targets GWI.

### 1.4 Bulk Upload modal (freehand CSV/XLSX/DOCX)
`04-bulk-upload-modal.png`

- 3-step wizard: **Upload File → Column Mapping → Validate & Import**.
- Accepts xlsx/xls/csv/docx, max 10 MB. "Download blank template", "Recent imports (3)".
- Wizard's column mapper has AI-confidence rules for `bid_reference, title, description, estimated_value, method, opening_date, tender_board, expected_delivery_date, notes`. This is a **freehand bulk importer** — totally decoupled from PSIP structure.

### 1.5 Tender detail panel (slide-over)
`05-detail-panel.png`

- Title + agency-department label.
- Badges: agency (MARAD), method (Open Tender).
- Linear 5-dot stage indicator showing current stage.
- `27d at current stage` chip.
- Description paragraph.
- `Submitted by Alfonso De Armas · Mar 21, 2026`.
- **Change Stage** button.
- **Stage History** timeline (from → to, who, when, with a `Bulk import: MARAD_PSIP_Procurement_Import.xlsx` note on the origin entry).
- Below the fold: Documents (upload + list), Notes (append-only).

### 1.6 List view
`06-list-view.png`

- Columns: select · **TENDER** (title + method) · **NPTAB NO.** · **AGENCY** · **STAGE** · **DAYS** · **DEADLINE** · **BY** · **UPDATED**.
- Pagination: `1-20 of 52` · pages `1 · 2 · 3`.
- NPTAB NO. and DEADLINE columns are all empty dashes in current data → dead weight.

### 1.7 Entry points from elsewhere
- Sidebar: persistent shopping-cart icon → `/procurement` (all roles).
- Mission Control (`/`): no direct procurement tile.
- Agency Intel pages: no direct link in; GWI-specific intel references PSIP data but not this module.
- Oversight: unused `oversight_project_id` FK; no navigation link.

---

## 2. Codebase Map

Produced via subagent `Explore` pass; summarised here. Full DDL for every migration is included so you can `grep` table and column names and they will match.

### 2.1 Routes & pages
| Path | Purpose |
|---|---|
| `app/procurement/page.tsx` | Pipeline tab + Analytics tab + bulk upload + new-tender + PSIP sync link |
| `app/procurement/psip-sync/page.tsx` | GWI-only PSIP diff upload |
| `app/procurement/loading.tsx` | Skeleton |

### 2.2 Components (`components/procurement/*`)
`ProcurementKanban` (board) · `ProcurementListView` (table) · `ProcurementDetailPanel` (slide-over) · `ProcurementCard` · `ProcurementAnalytics` + `analytics/*` (4 files) · `ProcurementNewPackageForm` · `BulkUploadModal` + `BulkUploadStep3` · `ProcurementStageBadge` · `ProcurementStageIndicator` · `DaysAtStageIndicator` · `ProcurementValueDisplay` · `ProcurementPipelineValue` · `ProcurementStageDistribution` · `ProcurementDurationChart` · `ProcurementStalledTable` · `ProcurementBulkBar` · `AgencyBadge` · `PsipRefBadge` · `PsipSyncDiff`.

### 2.3 API surface (`app/api/procurement/*`)
| Method | Path | Tables touched |
|---|---|---|
| GET | `/api/procurement` | `procurement_packages` + `procurement_items` (merged) |
| POST | `/api/procurement` | `procurement_packages`, `procurement_stage_history`, `procurement_notes` |
| GET | `/api/procurement/[id]` | 4 tables (package + history + docs + notes) |
| PATCH | `/api/procurement/[id]` | `procurement_packages.psip_ref` only (GWI) |
| DELETE | `/api/procurement/[id]` | cascade |
| POST | `/api/procurement/advance` | stage update + history insert |
| POST | `/api/procurement/bulk` | `procurement_import_batches` + batch inserts |
| GET | `/api/procurement/bulk` | last 5 batches |
| DELETE | `/api/procurement/bulk` | cascading batch rollback |
| POST/DELETE | `/api/procurement/[id]/documents` | Supabase Storage + `procurement_documents` |
| POST | `/api/procurement/[id]/notes` | `procurement_notes` |
| POST | `/api/procurement/psip/sync` | applies diffs to `procurement_packages` |
| POST/DELETE | `/api/procurement/demo` | **DG-only demo seeder** |

### 2.4 Database — full DDL (annotated)
Migrations, oldest first:

**052 `procurement_tracking.sql`** — initial model
```sql
CREATE TABLE procurement_packages (
  id UUID PK, agency TEXT, title TEXT, description TEXT,
  estimated_value NUMERIC NOT NULL,                 -- budget, will be dropped
  procurement_method TEXT CHECK (...),
  current_stage TEXT CHECK (...) DEFAULT 'submitted',
  submitted_by UUID REFERENCES users(id),
  oversight_project_id UUID REFERENCES projects(id), -- orphan link
  created_at, updated_at);
CREATE TABLE procurement_stage_history (...);   -- single-axis change log
CREATE TABLE procurement_documents (...);
CREATE TABLE procurement_notes (...);
```

**054** adds `draft` stage + `expected_delivery_date`.
**055** adds `procurement_import_batches` (CSV batches) + `bid_reference`, `tender_board`, `opening_date`, `import_batch_id` cols.
**056** renames stages: → `pre_advertisement, advertised, evaluation, no_objection, awarded`. Drops `draft/submitted`.
**058** adds `nptab_number`.
**066 `trello_procurement_sync.sql`** — parallel, **different enum** system:
```sql
CREATE TYPE procurement_stage AS ENUM (
  'not_advertised','advertised','evaluation',
  'nptab_no_objection','contract_awarded');         -- NB: different names
CREATE TABLE procurement_boards (...);              -- Trello boards per agency
CREATE TABLE procurement_items (...);               -- Trello cards mirror
CREATE TABLE trello_item_stage_history (...);
```
**077 `procurement_psip_sync.sql`** — GWI PSIP columns:
```sql
ALTER TABLE procurement_packages ADD COLUMN
  psip_ref TEXT,
  date_first_advertised DATE, tender_closing_date DATE,
  date_eval_submitted_mtb DATE, date_eval_submitted_nptab DATE,
  date_of_award DATE, psip_remarks TEXT,
  psip_last_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX ... ON (agency, psip_ref) WHERE psip_ref IS NOT NULL;
```

### 2.5 `lib/` helpers
- `lib/procurement-types.ts` — `ProcurementStage`, `ProcurementMethod`, `ProcurementPackage`, stage/method config constants.
- `lib/procurement-queries.ts` (~500 lines) — all Supabase reads/writes.
- `lib/procurement-psip-sync.ts` (~500 lines) — xlsx parser + diff engine + apply. Status-to-stage map is hardcoded inside.
- `lib/procurement/bulk-upload-parser.ts` — xlsx/csv/docx → `{headers, rows}`. **Port-worthy.**
- `lib/procurement/column-mapper.ts` — AI-confidence column mapping. Not useful for PSIP (fixed schema).
- `lib/procurement/row-validator.ts` — per-row validator. Partially portable.
- `lib/procurement/data-cleaner.ts` — date/money/text cleaners. **Port-worthy** (date parser is useful).

### 2.6 Integration points (non-procurement files that reach in)
- `components/layout/Sidebar.tsx:85` — sidebar link.
- `lib/trello.ts` — stage map `{list name → procurement_stage}`. Owns Trello→DB sync for `procurement_items`.
- `components/oversight/types.ts` — `tender_board_type` field on oversight project schema (reference only).
- `lib/project-queries.ts` — no active join to procurement (the `oversight_project_id` FK is inbound-only and unused).
- `components/intel/GWI*.tsx` — reference PSIP upload concept but do not import from the procurement module.

### 2.7 Kanban internals
- Columns defined in `lib/procurement-types.ts` → `STAGE_CONFIG` (label + color + order).
- Drag & drop calls `POST /api/procurement/advance` → updates `current_stage` + inserts `procurement_stage_history`.
- 10 cards/column paginated client-side; stalled tenders sort first, then estimated_value desc.
- Mobile tab-switcher; board↔list toggle stored in localStorage.

### 2.8 Bulk Upload flow (freehand)
- UI: `BulkUploadModal` 3-step wizard.
- Parser: `parseSpreadsheet()` + `parseDocx()`.
- Column map: `mapColumns(headers)` → AI confidence.
- Validator: `validateRows()` → per-row status (valid/warning/blocked).
- API: `POST /api/procurement/bulk` → creates `procurement_import_batches` + inserts packages + history in chunks of 50.
- Rollback: `DELETE /api/procurement/bulk {batchId}` → cascading delete, marks batch `rolled_back`.

### 2.9 Stage history / change log
- `procurement_stage_history` is the **only** change log today. Append-only. Records only stage transitions, not field edits.
- No field-level change log. A description edit does not leave a trail.

### 2.10 Dead / suspect code
- `/api/procurement/demo` route (305 lines) — DG-only seeder of 12 demo packages. Kill.
- `procurement_packages.oversight_project_id` — FK unused by any UI path. Drop.
- `procurement_packages.bid_reference`, `tender_board`, `opening_date`, `nptab_number` — freehand bulk upload metadata; no PSIP analogue. Drop.
- Stage enum mismatch between `procurement_packages` (text check: `pre_advertisement…awarded`) and `procurement_items` (enum: `not_advertised…contract_awarded`). Merge logic today papers over this at render. Clean it up.
- `draft` stage was introduced (054) then removed (056). Residual churn, nothing active.

---

## 3. Gap Analysis

### 3.1 In code but not reachable from UI
- `oversight_project_id` link (no form field, no detail display).
- `DELETE /api/procurement/demo` (no UI button).
- PATCH on `procurement_packages.psip_ref` — only GWI staff can trigger via PSIP Sync page.

### 3.2 In UI but half-wired / empty
- List view columns `NPTAB NO.` and `DEADLINE` — always empty dashes in today's data. `nptab_number` is a real column but the PSIP import doesn't populate it; the freehand bulk importer does, sort of.
- Header stat "Active Tenders 44" is miscounted vs. column sum 52 and vs. Analytics 52. **Bug.**
- Analytics Procurement Method donut shows 100% Open Tender — not a UI bug, a data-reality bug: everything was bulk-imported with the same default method. Real PSIP data will fix this.
- "Stuck/Stalled" metric is hardcoded to 30 days — reasonable but should be settable.

### 3.3 Built on shaky foundations
- **Agency list is hardcoded** in the form combobox (`GPL, GWI, HECI, CJIA, MARAD, GCAA, HAS`). Adding an agency = code change. The PSIP-derived list should include `MPUA` (programme 341) and `Hinterland Airstrips` (programme 344/1601100) which don't exist today. `HAS` is also ambiguous — not defined in PSIP.
- **Two parallel procurement tables** (`procurement_packages` and `procurement_items`) with two different stage enums, both rendered in the same kanban. Any PSIP ingest into `procurement_packages` will not touch Trello data, which is correct for Lethem/HECI but we must be honest about the duality in the schema and the UI.
- **Status column not modelled.** There is no concept of "this tender's status row said `Rollover`", no concept of `See Remarks`, no concept of a stage being inferred. The current app just maps PSIP "Design" → `pre_advertisement` in `lib/procurement-psip-sync.ts` and throws away the signal.
- **No field-level change log.** Stage moves are logged; everything else is lost. Your primary use case ("what moved this week") barely works today and only for stage changes.
- **No review queue** for ambiguous ingest matches. Current PSIP Sync does exact `psip_ref` match only. If a tender row has no `psip_ref` (i.e. a child row with blank column A), the current code will either skip it or insert a duplicate.
- **Budget is pervasive.** `estimated_value NOT NULL` is required to create a package. The analytics card ranks packages by estimated_value desc. Your spec says no budget. Every one of these references has to go.

---

## 4. Source of Truth Model — PSIP verification

I parsed `Ministry of Public Utilities 2026 PSIP.xlsx` (`PSIP Monitoring Form` only) and validated your brief against the data.

### 4.1 Sheet facts (confirmed)
- Range: `A1:R1070`, 1070 rows. Only the header + ~194 non-empty B rows are meaningful; everything after ~row 251 is blank.
- Headers span rows 1–4 (multi-row merged header). Data starts ~row 5.
- Columns: `A=NO., B=desc, C=2026 Budget, D=Method, E=Tender Advertise, F=Tender Closed, G=Date Eval Sent MTB/RTB, H=Date Eval Sent NPTAB, I=Date of Award, J=Tender Status, K=Contractor, L=Contract Sum, M=Exp to Date, N=Duration, O=Start, P=End, Q=Status%, R=Remarks`.

### 4.2 Status column (J) — distinct values and counts
| Value | Count | Notes |
|---|---|---|
| `Award` | 74 | ok |
| `award` | 1 | **row 187** — lowercase, normalize to `Award`. Confirmed. |
| `Design` | 30 | ok |
| `Evaluation` | 26 | ok |
| `Advertised` | 22 | ok |
| `Rollover` | 11 | metadata flag, not a stage |
| `See Remarks` | 4 | metadata flag, not a stage |
| `Awaiting Award` | 3 | ok |
| *(blank)* | 13 | infer from dates |

### 4.3 Method column (D) — distinct values
`Open Tender (107) · Sole Source (41) · Quotation (18) · Restrictive (4) · Public Tender (2) · Comm.Participation (2) · Nil (1)`. Seven values. Your brief listed all seven except `Public Tender` which I confirm exists.

### 4.4 Programme & sub-programme codes — confirmed
Exactly matches your brief. 3-digit programme codes: `341, 342, 343, 344, 345`. 7-digit sub-programmes: `1403900, 1601100, 1601500, 1602000, 2513800, 2606600, 2606700, 2607000, 2611300, 2802100, 2802200, 2802600`.

One brief-vs-data note: **`341` contains sub-programme `2513800 Furniture and Equipment`** which your brief didn't explicitly call out. 6 programme-341 tenders exist. They attribute to **MPUA**. This means:
- The in-app agency filter currently has no "MPUA" option, so these tenders would be invisible under the current UI. Proposal: add MPUA.
- Alternatively: exclude programme 341 entirely and treat MPUA admin procurement as out-of-scope. Your brief includes 341 → MPUA. I will assume include. See Q1.

### 4.5 Parent/child structure — confirmed exactly
- 57 rows have a line-item code in column A (`H-xxx`, `C-xxx`, `U-xxx`, `PO-xxxx`).
- 14 of those have child rows below them → treat parent as `programme_activity` label only; children are tenders.
- 43 parents have no children → the parent row itself is the tender.
- 112 leaf rows are direct children of parents.

Your count of "14 parent rows that have children" is exact. I walked the sheet.

### 4.6 Programme-344 duplicate rule — verified
Rows **202–203** (under the bare `344 Aviation` header, no sub-programme) are exact description duplicates of rows **218–219** (under sub-programme `1601100 Hinterland/Coastal Airstrips`). Both describe RFPs for Rose Hall and Lethem greenfield airports. The logic "if a row appears under a programme header with no sub-programme and the same description appears later under a sub-programme, skip the earlier copy" cleanly eliminates both. **Hardcoding row numbers would be wrong** — the desc-match rule is the right rule.

### 4.7 Expected post-ingest tender count (dry run of the algorithm)
With the exclusion rules applied (`2606600`, `2606700`, programme-header dupes), my simulated ingest produces:

| Agency | Tenders |
|---|---:|
| GWI | 83 |
| GPL | 25 |
| Hinterland Airstrips | 11 |
| MARAD | 10 |
| MPUA | 6 |
| CJIA | 2 |
| GCAA | 2 |
| **Total in-scope** | **139** |

Plus 14 rows excluded as Lethem/HECI (handled via Trello) and 2 rows excluded as programme-344 duplicates.

Status distribution of the ingest: 54 Award + 1 lowercase award (→ 55), 22 Advertised, 22 Design, 15 Evaluation, 11 Rollover, 3 See Remarks, 13 blank (→ infer from dates). Matches the manual status-count with parent-count-adjustment.

### 4.8 Where the brief and the data mostly agree but I'd tighten the wording
- The brief says *"Method of Procurement (`Open Tender`, `Quotation`, `Sole Source`, `Restrictive`, `Comm.Participation`, `Public Tender`, `Nil`)"*. Confirmed, add nothing.
- The brief's method enum should accept both `Comm.Participation` (the sheet's spelling) **and** a canonical form (`Comm Participation` without the period) — normalize on ingest.
- `Nil` is one of 1 rows — reasonable to store as `nil` or as `NULL` with a marker; I'd just keep enum value `nil` for fidelity. Alternative: drop the `nil` row on ingest since "Nil" means "no procurement method required" — which arguably means this isn't a tender. Flag Q2.
- `Public Tender` (2 rows) — is this synonymous with `Open Tender` or distinct? If synonymous, normalize. If distinct, keep. Q3.

---

## 5. Proposed Data Model

Hard cutover. New tables. The old `procurement_packages` family is dropped (or renamed & archived — your call, see §8). Trello tables are **kept** but renamed to a single `tender` source type.

### 5.1 Core DDL (illustrative)
```sql
-- Agency is an enum; hardcoding is fine, the list is stable.
-- No LETHEM — it's folded into HECI's Trello board.
CREATE TYPE tender_agency AS ENUM (
  'MPUA','GPL','GWI','CJIA','GCAA','MARAD','HINTERLAND_AIRSTRIPS','HECI');

CREATE TYPE tender_stage AS ENUM (
  'design','advertised','evaluation','awaiting_award','award');

-- 'public_tender' normalized to 'open_tender' on ingest.
-- 'nil' method rows are skipped on ingest, not stored as tenders.
CREATE TYPE tender_method AS ENUM (
  'open_tender','quotation','sole_source','restrictive',
  'comm_participation');

CREATE TYPE tender_source AS ENUM ('psip','trello','manual');

CREATE TYPE tender_stage_source AS ENUM (
  'status_column',        -- row J had one of the 5 real stages
  'inferred_from_dates',  -- row J was Rollover / See Remarks / blank
  'manual_override');     -- user changed it in-app after ingest

CREATE TABLE programme (
  code          TEXT PRIMARY KEY,      -- '341', '342', ...
  name          TEXT NOT NULL
);

CREATE TABLE sub_programme (
  code          TEXT PRIMARY KEY,      -- '2611300', '1601100', ...
  name          TEXT NOT NULL,
  programme_code TEXT NOT NULL REFERENCES programme(code),
  agency        tender_agency NOT NULL,
  is_excluded   BOOLEAN NOT NULL DEFAULT false  -- true for 2606600, 2606700
);

CREATE TABLE upload (
  id            UUID PK DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'preview'
                   CHECK (status IN ('preview','applied','cancelled')),
  stats         JSONB NOT NULL DEFAULT '{}'  -- {new, updated, missing, queued, skipped, ...}
);

CREATE TABLE tender (
  id                        UUID PK DEFAULT gen_random_uuid(),
  source                    tender_source NOT NULL DEFAULT 'psip',
  external_id               TEXT,          -- trello card id, null for psip/manual
  description               TEXT NOT NULL,
  agency                    tender_agency NOT NULL,
  programme_code            TEXT REFERENCES programme(code),
  sub_programme_code        TEXT REFERENCES sub_programme(code),
  programme_activity        TEXT,          -- parent row desc, nullable
  line_item_code            TEXT,          -- column A when present on the tender's own row
  stage                     tender_stage NOT NULL,
  stage_source              tender_stage_source NOT NULL DEFAULT 'status_column',
  method                    tender_method,
  is_rollover               BOOLEAN NOT NULL DEFAULT false,
  has_exception             BOOLEAN NOT NULL DEFAULT false,
  date_advertised           DATE,
  date_closed               DATE,
  date_eval_sent_mtb_rtb    DATE,
  date_eval_sent_nptab      DATE,
  date_of_award             DATE,
  contractor                TEXT,
  implementation_start_date DATE,
  implementation_end_date   DATE,
  implementation_status_pct INT,
  remarks                   TEXT,
  last_raw_row              JSONB,         -- the row as-ingested, for debugging
  first_seen_upload_id      UUID REFERENCES upload(id),
  last_seen_upload_id       UUID REFERENCES upload(id),
  missing_from_last_upload  BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tender (agency);
CREATE INDEX ON tender (stage);
CREATE INDEX ON tender (programme_code, sub_programme_code);
CREATE INDEX ON tender (missing_from_last_upload) WHERE missing_from_last_upload;
-- Trello items get a hard identity via external_id:
CREATE UNIQUE INDEX ON tender (source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE tender_field_change (
  id            BIGSERIAL PK,
  tender_id     UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  field_name    TEXT NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  upload_id     UUID REFERENCES upload(id),
  changed_by    UUID REFERENCES users(id),  -- null when upload-driven
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tender_field_change (tender_id, changed_at DESC);
CREATE INDEX ON tender_field_change (upload_id);
CREATE INDEX ON tender_field_change (field_name, changed_at DESC);

CREATE TABLE tender_match_review (
  id                UUID PK DEFAULT gen_random_uuid(),
  upload_id         UUID NOT NULL REFERENCES upload(id),
  incoming_row      JSONB NOT NULL,         -- full row dict, plus scope keys
  candidate_tender_ids UUID[] NOT NULL,
  scores            JSONB NOT NULL,         -- {tender_id: score}
  status            TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','matched','created','skipped')),
  resolution_tender_id UUID REFERENCES tender(id),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id)
);

-- Kept from 066, with field renames, for Trello-sourced tenders:
CREATE TABLE trello_board (
  id              UUID PK DEFAULT gen_random_uuid(),
  agency          tender_agency NOT NULL,    -- HECI or LETHEM
  trello_board_id TEXT NOT NULL UNIQUE,
  board_name      TEXT NOT NULL,
  list_mapping    JSONB NOT NULL DEFAULT '{}',  -- Trello list name → tender_stage
  webhook_id      TEXT,
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at, updated_at);
```

### 5.2 What I'm deliberately *not* including (challenge points)
- **`contract_sum`, `expenditure_to_date`.** Dropped. Budget scope.
- **`oversight_project_id`.** Dropped. Not used; revive only if you decide procurement-to-oversight linkage is worth wiring up.
- **`estimated_value`, `bid_reference`, `tender_board`, `opening_date`, `nptab_number`.** Dropped. No PSIP analogue; freehand-bulk-upload residue.
- **A separate `tender_stage_history` table.** Collapsed into `tender_field_change` with `field_name='stage'`. One change log, not two.
- **A Kanban-column-definitions table.** 5 stages are stable; hardcode in app.

### 5.3 Questions on the schema (to decide before I write the migration)
- Q4: `tender_field_change.new_value / old_value` as `JSONB` lets one table log text/date/enum/boolean changes uniformly at the cost of SQL ergonomics. Alternative: `old_text/old_date/old_bool` columns with a discriminator. I prefer JSONB. Agree?
- Q5: Keep `last_raw_row` JSONB forever, or trim after 4 uploads? I'd keep it forever — it's small and invaluable for debugging. You decide.

---

## 6. Proposed Ingest Pipeline

### 6.1 Exclusion & duplicate rules (applied at parse time)
```
for each row in PSIP Monitoring Form starting row 5:
  if row is a programme header (3-digit A):   record current_programme, continue
  if row is a sub-programme header (7-digit A): record current_sub_programme, continue
    if sub in {2606600, 2606700}:             mark_current_sub_excluded = true
  if sub excluded:                            log to stats.excluded_lethem_heci, continue
  if method == 'Nil':                         log to stats.skipped_nil_method, continue
  if method == 'Public Tender':               normalize to 'open_tender' (Q3)
  if row has a line-item code in A (H-/C-/U-/PO-): treat as parent candidate
  if row is divider (B starts with Rollover:/New:/Summary:/Sub-Total/Total): skip
  else treat as leaf row

parent/child collapse:
  when a parent has any following leaf rows before the next parent/header: children become tenders, parent is only a `programme_activity` tag
  when a parent has zero children: parent itself is the tender (programme_activity = parent.desc)

programme-344 dup rule:
  for every candidate tender with sub_programme_code IS NULL and programme_code='344':
    if a candidate later in the sheet has programme_code='344' and sub_programme_code IS NOT NULL and normalize(desc_A) == normalize(desc_B):
      drop the earlier one, log to stats.programme_header_dupes

normalization:
  description = collapse whitespace, trim
  status (col J): lowercase 'award' → 'Award'
  method (col D): 'Comm.Participation' → 'comm_participation' etc.
```

### 6.2 Stage resolution
```
if status in {Design, Advertised, Evaluation, Awaiting Award, Award}:
  stage = map(status); stage_source = 'status_column'; is_rollover=false; has_exception=false
elif status == 'Rollover':
  is_rollover = true
  stage = infer_from_dates(E..I); stage_source = 'inferred_from_dates'
elif status == 'See Remarks':
  has_exception = true
  stage = infer_from_dates(E..I); stage_source = 'inferred_from_dates'
else (blank):
  stage = infer_from_dates(E..I); stage_source = 'inferred_from_dates'

infer_from_dates:
  if date_of_award:         return Award
  if date_eval_sent_nptab or mtb: return Awaiting Award
  if date_closed:            return Evaluation
  if date_advertised:        return Advertised
  else:                      return Design
```

### 6.3 Identity resolution (the hard part)
Scope: `(agency, programme_code, sub_programme_code, programme_activity)`. This is key — it dramatically narrows the set and makes description matching tractable.

```
for each incoming tender I:
  candidates = existing_tenders.filter(scope matches I)
  if candidates empty:                        result = NEW
  else:
    exact = candidates.find(normalize(desc)==normalize(I.desc))
    if exact:                                 result = UPDATE(exact)
    else:
      scores = candidates.map(c => similarity(c.desc, I.desc))
      top = max(scores)
      tied_for_top = candidates where score == top
      if top >= 0.92 and |tied_for_top| == 1: result = UPDATE(tied_for_top[0]); log to high-confidence-report
      if top >= 0.92 and |tied_for_top| > 1:
        use line_item_code tiebreaker (if present)
        if resolved:                          result = UPDATE(...)
        else:                                 result = REVIEW
      if 0.80 <= top < 0.92:                  result = REVIEW(top 3 candidates)
      if top < 0.80:                          result = NEW

similarity = max(
  ratio(normalize(desc_a), normalize(desc_b)),              -- Levenshtein
  token_sort_ratio(normalize(desc_a), normalize(desc_b))    -- for reordered phrases
)
-- embeddings optional (phase 2 improvement); Levenshtein handles 90%+ for this volume
```

Thresholds (0.92 / 0.80) are recommendations. Configurable per upload. Store on `upload.stats`.

### 6.4 Diff & apply
For each matched pair (old, new), field-diff the canonical set:
`description, stage, stage_source, method, is_rollover, has_exception, date_advertised, date_closed, date_eval_sent_mtb_rtb, date_eval_sent_nptab, date_of_award, contractor, implementation_start_date, implementation_end_date, implementation_status_pct, remarks, programme_activity, line_item_code`.

Write one `tender_field_change` row per changed field with `upload_id`. Update the tender.

For each NEW: insert tender with `first_seen_upload_id = last_seen_upload_id = upload.id`.

For each existing tender NOT touched by the upload and with `source='psip'`:
set `missing_from_last_upload = true`. **Never delete.**
Write a `tender_field_change` with `field_name='__presence'`, old `present` → new `missing`.

Trello-sourced tenders (`source='trello'`) are untouched by PSIP ingest.

### 6.5 Dry-run first
Step 1: user uploads; we parse, match, score; insert into an `upload` row with `status='preview'` and write `tender_match_review` rows as needed. We return a preview JSON:
```
{
  upload_id,
  stats: {
    new: 12, updated: 78 (with 34 field changes), missing: 5,
    review_queue: 4, excluded_lethem_heci: 14, programme_header_dupes: 2,
    inferred_stages: 19, high_confidence_matches: 3
  },
  new_tenders: [...sample 10],
  updated_tenders: [...sample 10 with field diffs],
  review_queue: [...all rows with candidates],
  missing_tenders: [...all]
}
```
Step 2: user clicks **Apply** or **Cancel**. Apply walks the staged data and commits. Cancel marks the upload `status='cancelled'`.

Every upload keeps its xlsx in Supabase Storage under `uploads/<upload_id>.xlsx` regardless of outcome.

---

## 7. Proposed UI Surfaces

**Design philosophy: reuse the existing visual system.** The Kanban, list, detail panel, and analytics page have good bones. We swap the data underneath, drop budget, add two flag badges, add one new top-level page for upload-with-dry-run, one new page for review queue, one new page for "what moved this week", and one new tab on the detail panel.

### 7.1 Existing surface → disposition
| Surface | Disposition | Justification |
|---|---|---|
| `/procurement` Pipeline Kanban | **Modify** | Keep component, rename stages (`pre_advertisement→design`, `no_objection→awaiting_award`, `awarded→award`), add `is_rollover` + `has_exception` badges on card, add `programme_activity` line on card, hide "estimated value". Fix the header count bug. |
| `/procurement` Analytics | **Modify** | Keep layout. Replace dollar rollups with counts. "Procurement Method" donut stays (counts). "Completion Rate" becomes count-based. Drop any value-weighted bar. |
| `/procurement` filter row | **Modify** | Add `MPUA` (Q1). Rename `HAS` → `Hinterland Airstrips` (Q6). `HECI` stays (Trello; Lethem folded in per Q7). No `LETHEM` option. Final list: All · MPUA · GPL · GWI · HECI · CJIA · GCAA · MARAD · Hinterland Airstrips. |
| `/procurement` List view | **Modify** | Drop `NPTAB NO.` and `DEADLINE` columns. Add `Rollover` / `Exception` flag column. Add `Sub-programme` column (collapsed under agency tooltip or expanded — designer call). |
| `/procurement` Detail panel | **Modify** | Keep. Add `is_rollover` / `has_exception` badges next to the method chip. Add `Programme activity` field. Add dates panel (Advertised / Closed / Eval-MTB / Eval-NPTAB / Award). Add `Contractor`, implementation dates, status %. **Add a Change Log tab** (was just Stage History; expand to all field changes). Remove the standalone "New Tender" button from the page header — keep in detail panel for edits. |
| `/procurement` "+ New Tender" form | **Keep, repurpose** | Remains the escape hatch for `source='manual'` tenders (Q8). Gated to `dg`, `minister`, `ps`, `agency_admin`. Drops all budget/NPTAB/bid-reference fields; adds `programme_code`, `sub_programme_code`, `programme_activity`, `is_rollover`, `has_exception`. |
| Bulk Upload modal (freehand) | **Delete** | Replaced by PSIP-aware upload-with-dry-run. Freehand CSV import is a foot-gun with the new model — there's no way to place a row without a programme/sub-programme/activity. |
| `/procurement/psip-sync` | **Replace** | Becomes the upload-with-dry-run page (see 7.2). Un-gate from GWI-only. |
| Demo seeder (`/api/procurement/demo`) | **Delete** | Dead weight. If you want seed data, commit a fixture xlsx and run it through the new ingest. |
| Sidebar link | **Keep** | Unchanged. |

### 7.2 New surfaces
| Surface | Gap it fills |
|---|---|
| `/procurement/uploads` — **Upload & dry-run preview** | Replaces PSIP Sync. Drag xlsx → preview (new / updated with field diffs / missing / review-queue / excluded counts) → **Apply** or **Cancel**. Every upload persisted in Storage + `upload` row regardless of outcome. |
| `/procurement/uploads/[id]` | Per-upload summary: what it changed. Anchor for Mondays. |
| `/procurement/review` — **Review queue** | One row per `tender_match_review.status='pending'`. Side-by-side incoming row vs. candidate tenders with scores. Buttons: "Match to this one", "Create new", "Skip". |
| `/procurement/changes` — **What moved this week** | Default filter: `upload_id = last applied upload`. Groups `tender_field_change` by `tender_id` → shows stage transitions first (the most load-bearing change), then other fields. Grouped by agency. The view you open every Monday. |
| `/procurement/missing` — **Missing tenders report** | All tenders with `source='psip'` and `missing_from_last_upload=true`. Date of last sighting. Manual "resurrect" or "archive" action. |
| Detail panel → **Change Log tab** | Replaces / extends the existing Stage History. Chronological. Each entry links back to the upload. |

### 7.3 Hard UI rules (restating for acceptance)
- No budget anywhere. No dollar columns, no dollar rollups, no dollar filters.
- Stage is the primary axis everywhere.
- `is_rollover` and `has_exception` visible on every card and list row.
- `programme_activity` visible on cards and list.
- Agency filter prominent everywhere.

### 7.4 Component reuse notes (what ports directly)
- `ProcurementKanban.tsx` — port with stage enum swap. Column defs move to new constants file.
- `ProcurementCard.tsx` — add two flag badges + activity line. Drop value display.
- `ProcurementDetailPanel.tsx` — add dates section + change log tab. Drop `estimated_value`.
- `ProcurementListView.tsx` — column swap.
- `ProcurementAnalytics.tsx` + `analytics/*` — count-based rewrites (simple).
- `PsipSyncDiff.tsx` — gets the bones of the new upload preview but is substantially rewritten.
- `DaysAtStageIndicator.tsx` — ports as-is.
- `AgencyBadge.tsx` — port, extend agency set.
- `ProcurementStageBadge.tsx`, `ProcurementStageIndicator.tsx` — port with new labels.
- `lib/procurement/data-cleaner.ts` (date parser) — port.
- `lib/procurement/bulk-upload-parser.ts` (xlsx reader shim) — port.

`ProcurementNewPackageForm` — ports with significant field-set changes (see §7.1 row).

Components that do not port: `BulkUploadModal`, `BulkUploadStep3`, `ProcurementBulkBar`, `ProcurementValueDisplay`, `PsipRefBadge`, `column-mapper`, `row-validator`.

---

## 8. Migration Plan

### 8.1 What we delete outright
- `procurement_packages`, `procurement_stage_history`, `procurement_documents`, `procurement_notes`, `procurement_import_batches` tables → replaced by `tender`, `tender_field_change`, plus a new `tender_document` / `tender_note` pair if you want (see Q9).
- All `/api/procurement/bulk*` routes, the `BulkUploadModal`, `column-mapper`, `row-validator`.
- `/api/procurement/demo`.
- `lib/procurement-psip-sync.ts` (superseded), `psip-sync` page (replaced).
- Unused FK `procurement_packages.oversight_project_id`.
- Unused cols on `procurement_packages`: `bid_reference, tender_board, opening_date, nptab_number`.

### 8.2 What we keep
- `procurement_boards`, `procurement_items`, `trello_item_stage_history` — rename to `trello_board` and fold Trello items into `tender` (`source='trello'`). Trello mirror logic keeps writing, just to the unified `tender` table now.
- `lib/trello.ts` list-name → stage map — update enum names.
- Auth helper `requireRole()`, role model — untouched.
- Storage bucket for documents — untouched.

### 8.3 Data migration
No production data in `procurement_packages` worth preserving (the current 52 rows are imports of prior PSIP snapshots and are inferior to a fresh PSIP ingest). Recommend: **wipe and re-ingest** from the next weekly PSIP. Trello items re-sync themselves on the next webhook/poll.

If you want a belt-and-braces migration: `CREATE TABLE procurement_packages_archive_20260417 AS SELECT * FROM procurement_packages` before the drop.

### 8.4 Migration order (DB)
1. `093_tender_core.sql` — enums + `programme`, `sub_programme`, `upload`, `tender` (new), `tender_field_change`, `tender_match_review`.
2. `094_tender_seed_reference.sql` — insert programme and sub-programme rows (hardcoded, 5 programmes + 12 sub-programmes).
3. `095_tender_trello_fold.sql` — rename `procurement_boards` → `trello_board`; copy `procurement_items` rows into `tender` (`source='trello'`, `external_id=trello_card_id`); drop `procurement_items`, `trello_item_stage_history`; update `lib/trello.ts` target.
4. `096_procurement_legacy_drop.sql` — archive → drop `procurement_packages*` + `procurement_import_batches` + old `procurement_stage`, `procurement_method` types.
5. Code changes: new API routes, new pages, component swaps.

### 8.5 Deprecation of the old URLs
- `/procurement/psip-sync` → 301 to `/procurement/uploads`.
- `POST /api/procurement/psip/sync` → keep for one release as a 410 Gone with a deprecation header; point at the new endpoint.

---

## 9. Decisions (locked)

All 11 questions answered 2026-04-17. Decisions are binding on the build; if any need to revisit, note it here first.

1. **Programme 341 (MPUA) — INCLUDE.** MPUA gets its own agency enum value and filter-bar button. The 6 programme-341 admin tenders will be visible to the DG/Minister/PS roles.
2. **`Nil` method rows — SKIP on ingest.** The one `Nil` row is not a real procurement action. Log to `upload.stats.skipped_nil_method` for audit; do not create a tender.
3. **`Public Tender` → `Open Tender`.** Normalize on ingest. The `method` enum will not have a separate `public_tender` value.
4. **Change-log storage — JSONB.** `tender_field_change.old_value` / `new_value` are JSONB. Uniform shape across text/date/enum/boolean fields; easier to extend.
5. **Raw-row retention — keep forever on the tender, trimmed in the upload.** `tender.last_raw_row` is kept forever (always the latest). Per-upload raw rows are preserved inside the xlsx in Supabase Storage — no need for a second copy. This gives "what did this tender look like on its last upload?" and "what did the whole sheet look like on any past upload?" without duplicating data.
6. **`HAS` → rename to `Hinterland Airstrips`.** Single value. `HINTERLAND_AIRSTRIPS` in the enum; "Hinterland Airstrips" as label.
7. **Lethem — folded into HECI's Trello.** No separate `LETHEM` agency value. PSIP exclusion rule still lists sub-programme `2606600` explicitly (so any Lethem rows that appear in future PSIP sheets are skipped, not mis-attributed). The HECI Trello board is the source of truth for both.
8. **Manual `source='manual'` tenders — KEEP.** The "+ New Tender" form survives as the escape hatch for procurements heard about before PSIP. Gated to `dg`, `minister`, `ps`, and `agency_admin` (own agency only). Form fields will be the new-world set (no budget, no NPTAB number, no bid reference).
9. **Documents & notes — KEEP.** Port forward as `tender_document` and `tender_note`. Upload/attach moves with the tender record.
10. **Oversight project linkage — DROP.** `oversight_project_id` column and any references are removed for good.
11. **Fuzzy-match thresholds — HARDCODE now, revisit after 2 real uploads.** 0.92 high-confidence / 0.80 review-threshold. Store them in one constants file so a one-line change tunes them. No UI settings knob in v1.

### Confirmed architectural decisions (from plan review, not in the original Q list)
- **Kill the freehand Bulk Upload** (modal + `/api/procurement/bulk*` routes + column-mapper + row-validator). It cannot attach a programme/sub-programme/activity scope to incoming rows, and without scope the match-and-diff engine can only insert duplicates. If bulk manual entry is ever needed post-v1, it'll be a scoped mini-importer that demands programme + sub-programme + activity at upload time.
- **Unify Trello and PSIP into one `tender` table with a `source` column.** Trello sync keeps running but writes into `tender` with `source='trello'`. The kanban queries a single table. The two-enum leak goes away.
- **Phase 3 (upload apply) ships WITH Phase 4 (review queue + missing report) — not before.** No upload can commit if there's no human-review path for ambiguous matches and no visibility on tenders that vanished. Treating them as one phase.

---

## 10. Phased Implementation Proposal

Each phase ends at a reviewable PR. No phase silently enables breaking behaviour.

### Phase 0 — Reference data + migrations (DB only, no UI)
- Migrations 093–094: new types, new tables, seed `programme` and `sub_programme`.
- No app code changes yet. Deployable silently.

### Phase 1 — Parser + dry-run API (no UI yet, testable via curl/script)
- `lib/psip/parser.ts`: walks PSIP xlsx, produces `ParsedTender[]`.
- `lib/psip/matcher.ts`: scope + similarity scoring + review-queue candidates.
- `POST /api/procurement/uploads` (preview mode only, no apply).
- Unit tests against the committed-to-repo fixture xlsx.
- PR delivers: a CLI `pnpm tsx scripts/psip-dry-run.ts path/to.xlsx` that emits the preview JSON. No changes to the live module.

### Phase 2 — Trello fold + legacy drop (schema cutover)
- Migration 095: fold `procurement_items` → `tender` (`source='trello'`).
- Migration 096: drop legacy `procurement_packages*` family.
- New query layer `lib/tender/queries.ts` — replaces `lib/procurement-queries.ts`.
- Update `GET /api/procurement` to read from `tender`.
- Kanban + list + detail panel rewired to the new schema; **old routes still exist, old UI still renders**, just reading from `tender` now.
- Kills: `ProcurementNewPackageForm`, `BulkUploadModal`, `column-mapper`, `row-validator`, `/api/procurement/bulk*`, `/api/procurement/demo`, `/procurement/psip-sync` page.
- Trello sync writer updated to target `tender` with `source='trello'`.
- PR delivers: existing `/procurement` page rendering the same data topology from the new schema, minus the demo seeder and freehand bulk uploader.

### Phase 3 — Upload + dry-run + review queue + missing report (bundled)
Non-negotiably a single phase: applying an upload without a review queue and a missing-tenders report is how you silently lose tenders.
- `/procurement/uploads` page: drag-drop, preview, approve/cancel.
- `POST /api/procurement/uploads` with both `preview` and `apply` modes.
- `tender_match_review` writes on preview; `tender_field_change` writes on apply.
- `/procurement/review` page — pending review-queue rows, side-by-side candidates, match/create/skip.
- `/procurement/missing` page — tenders with `missing_from_last_upload=true`, resurrect/archive actions.
- Detail-panel **Change Log** tab replaces Stage History.
- Per-upload xlsx persisted to Storage. Smoke test against the committed PSIP xlsx.

### Phase 4 — "What moved this week" dashboard
- `/procurement/changes`.
- Default filter = last applied upload. Groups by agency. Stage transitions first.
- Homepage tile linking here if you want one.

### Phase 5 — Analytics rewrite
- Replace dollar-weighted rollups with count-based rollups.
- Drop `ProcurementValueDisplay`, any value-sorted lists.
- "Procurement Method" donut stays (counts). "Completion Rate" becomes count-based.

### Phase 6 — Cleanup
- Delete deprecated routes (`/procurement/psip-sync`, `POST /api/procurement/psip/sync`).
- Fix the `44 vs 52` count-bug in the header stat.
- Remove `HAS` label remnants.

---

## 11. Closing opinions (you asked for blunt)

- **Budget removal is the biggest UX improvement here**, not the ingest pipeline. Dollar rollups were driving the wrong conversations.
- **The freehand Bulk Upload should die** even if you disagree with everything else in this plan. It's a liability — no programme scope, no activity attribution, no stage inference, no review queue.
- **The single biggest risk** is fuzzy description matching on 100+ GWI tenders, many with similar phrasings (`Water Supply System - X`, `Potable Water Well - Y`). Expect a non-trivial review queue on the first upload. The fix is to lean on `(agency, sub_programme, programme_activity)` scope and line_item codes on parent-tenders aggressively — do that *before* fuzzy matching, not after.
- **Weekly-delta ingestion is not shaky in principle** — it's a well-understood problem with a canonical solution (scoped-similarity + human review queue + never-delete-on-miss). But it *is* operationally heavier than "weekly CSV in, ignore what was there". You should expect to spend ~10 minutes every Monday on the review queue for the first 4–6 weeks while thresholds get tuned and the PSIP authors' description variance is absorbed.
- **Do not ship Phase 3 without Phase 4.** An upload that commits without a review queue + a missing-tenders page is how you silently lose tenders. Non-negotiable ordering.
- **Unify Trello items into `tender` with a `source` column.** Parallel tables with different stage enums merged at render is exactly what you've got now and it's already leaking.

Stop. Ready for your decisions on Q1–Q11.
