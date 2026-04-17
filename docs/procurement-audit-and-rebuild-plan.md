# Procurement Module — Audit + Rebuild Plan

## Context

The procurement module was reformulated on **2026-04-17** (commit `5933527`,
migrations 078–081) around a weekly PSIP Monitoring Form xlsx ingest. The
landing Kanban, uploads flow, review queue, missing queue, "what moved" view,
and Trello fold are all live in production at `dg-work-os.vercel.app`. The
user has since eyeballed a handful of bugs in the live app and evolved the
spec (strict method filter, award tracking, archive view, Kanban-no-Award).
This document audits what shipped vs the new spec, confirms the bugs, maps
the diff, and proposes the rebuild scope.

**Ground truth.** PSIP Monitoring Form sheet of
`/Users/alfonsodearmas/Downloads/Ministry of Public Utilities 2026 PSIP.xlsx`
(78 KB, modified 2026-04-16).

**Observation corpus.**
- Live walkthrough: Playwright-authenticated as DG (alfonso.dearmas@mpua.gov.gy).
  Screenshots at `audit-screenshots/procurement-rebuild/01..07`.
- DB snapshot: `GET /api/procurement?all=1` from the authenticated browser
  (147 rows), dumped to `.playwright-mcp/actual-tenders-parsed.json`.
- Spreadsheet reconstruction: `scripts/parse-psip-audit.mjs` applying the
  updated spec, dumped to `/tmp/psip-expected.{json,tsv,summary.json}`.
- Diff: `.playwright-mcp/diff-report.json`.

---

## 1. Summary counts — expected vs actual

**Total tenders in DB right now: 147** (139 `source='psip'` + 8 `source='trello'`).
**Total tenders that should exist after cleanup: 87** (79 PSIP + 8 Trello).
**Phantom surplus to remove: 60.** **Missing real tenders: 0.**

### By agency

| Agency | DB (now) | Expected (spec) | Delta | Cause |
|---|---:|---:|---:|---|
| GWI | 83 | 50 | −33 | Mostly `GWI 2026/CPA ...` Sole Source rows + Quotation rows (method-excluded) |
| GPL | 25 | 20 | −5 | Sole Source EPC roll-over rows, "Land Acquisition" phantom |
| HINTERLAND_AIRSTRIPS | 11 | 2 | −9 | Restrictive / Comm.Participation / Sole Source / blank-method award rows |
| MPUA | 6 | 0 | −6 | Entire 341 sub-programme 2513800 (Quotations) |
| MARAD | 10 | 4 | −6 | **6 summary-rollup phantoms** (Award/Awaiting Award/Evaluation/Advertised/Design/Rollover) |
| GCAA | 2 | 2 | 0 | OK |
| CJIA | 2 | 1 | −1 | R223 Sole Source `Procurement & Installation of Wh...` |
| HECI | 8 | 8 | 0 | All `source='trello'`; exclusion filter for 2606600/2606700 on PSIP side **is working** |
| **Total** | **147** | **87** | **−60** |  |

### By stage (DB)

| Stage | DB | Expected | Note |
|---|---:|---:|---|
| design | 48 | 27 | 21 excess = phantoms |
| advertised | 24 | 18 | 6 excess |
| evaluation | 20 | 15 | 5 excess |
| awaiting_award | 0 | 0 | Neither side — the non-excluded spreadsheet has no rows with `Awaiting Award` in col J (all such rows are under the HECI-excluded sub-programme 2606700) |
| award | 55 | 19 | 36 excess — mostly the `GWI 2026/CPA` Sole Source block |

### By method (DB)

| Method | DB count | Should be in DB? |
|---|---:|---|
| open_tender | 82 | Yes (after cleanup: 77) |
| public_tender *(normalized to open_tender at ingest)* | merged | — |
| sole_source | 24 | **No (47 total non-open phantoms)** |
| quotation | 18 | **No** |
| restrictive | 3 | **No** |
| comm_participation | 2 | **No** |
| (null) | 18 | **No** — 8 Trello (legitimate null) + 10 PSIP phantoms |

### By source

| Source | DB | Expected |
|---|---:|---:|
| psip | 139 | 79 |
| trello | 8 | 8 |
| manual | 0 | — |

### Flags in DB vs spec expectation

| Flag | DB | Expected | Note |
|---|---:|---:|---|
| `is_rollover` | 11 | 8 | 3 extras are on phantom Sole Source rows |
| `has_exception` | 3 | 3 | ✓ |
| `stage_source='inferred_from_dates'` | 27 | 11 | 16 extras are on phantom rows OR silent-default-Design rows |
| `missing_from_last_upload` | 0 | 0 | first upload, no prior baseline |
| `awarded_at` | **column doesn't exist** | n/a | Bug 5 |
| `first_appearance_already_awarded` | **column doesn't exist** | n/a | Bug 5 |

---

## 2. Known-bugs verdict

### Bug 1 — "PSIP ingest creating HECI tenders" — **MISREAD.**

All 8 HECI tenders visible on `/procurement` have `source='trello'` with a
Trello card ID in `external_id`. Zero rows satisfy
`agency='HECI' AND source='psip'`. The PSIP exclusion for sub-programmes
`2606600` / `2606700` is enforced correctly in migration 079 (`is_excluded=true`)
and in `lib/psip/parser.ts`. The 8 HECI cards the user identified are the
legitimate Trello mirror and must not be touched.

Evidence: `.playwright-mcp/actual-tenders-parsed.json` →
`tenders.filter(t => t.agency==='HECI' && t.source==='psip').length === 0`;
all 8 rows have `external_id` like `69c12eb55b36cd5386ae32e4`.

### Bug 2 — "Summary rows ingested as tenders" — **CONFIRMED.**

Six MARAD rows in the DB have descriptions `Award`, `Awaiting Award`,
`Evaluation`, `Advertised`, `Design`, `Rollover`, all with `method=null`,
`stage=design`, `source='psip'`. These are spreadsheet rows R246–R251 (the
rollup under `Summary:` at R245) being consumed as data. The divider-detection
in `lib/psip/parser.ts` matches `Rollover:` / `New:` / `Summary:` as dividers
but once past the "Summary:" line each subsequent stage-named row is treated
as a new tender because the state machine doesn't know it's in a summary
block.

### Bug 3 — "Stage silently defaults to Design" — **CONFIRMED (broader than the 6 phantoms).**

Three classes of rows in the DB have `stage='design'` even though the source
row has empty col J (status):
- The 6 MARAD summary rows above.
- 3 GWI Bartica rows (R169–R171) — "Supply and Installation of PVC Distribution
  Mains at {3 Mile Access Road / Black's Road / Fowl Cock Road}, Bartica".
  Method=Open Tender, status=blank, all dates blank. These should be rejected
  per the updated spec ("no stage signal"); current ingest defaults them to
  Design.
- 2 HINTERLAND_AIRSTRIPS rows (R208 `Phase 2: Extension of Ekereku Bottom
  Airstrip` and R209 `Rehabilitation of Kaikan Airstrip`) — status=Award,
  method=blank. These should be rejected by the method filter but are
  currently ingested with `method=null` and the award stage honored.
- 1 GWI row `New` (R105 divider ingested as data).
- 1 GPL row `Land Acquisition`.

Root cause: the parser's stage-resolution logic falls through to `'design'`
when status parses to null and date-based inference produces null. Per the
updated spec, that fall-through is wrong: the row should be rejected.

### Bug 4 — "Method filter not enforced" — **CONFIRMED (massive).**

The DB has 65 rows whose method is not Open Tender / Public Tender:
- sole_source: 24
- quotation: 18
- restrictive: 3
- comm_participation: 2
- (null): 18 (of which 8 are legitimate Trello, 10 are PSIP phantoms)

That's 44 % of the current table and aligns with the user's "roughly half the
current records" prediction. The updated spec rejects all non-Open/Public at
ingest, which removes the entire 341 Furniture & Equipment block (MPUA
Quotations), the GWI `GWI 2026/CPA ...` Sole Source block (≈24 rows), every
`Quotation`, every `Restrictive`, every `Comm.Participation`, and every
blank-method row. Reference data for comparison: enum `tender_method` declared
in migration 078 still carries `quotation`, `sole_source`, `restrictive`,
`comm_participation` values — those enum values can either be removed or
retained for the manual-create form while ingest filters ruthlessly.

### Bug 5 — "Award-tracking mechanism absent" — **CONFIRMED.**

The `tender` table has `date_of_award DATE` (from col I of the PSIP sheet —
i.e. the team's recorded award date) but does not have:
- `awarded_at TIMESTAMPTZ` — the timestamp we stamp when we first observe
  `stage='award'` during ingest (never overwritten).
- `first_appearance_already_awarded BOOLEAN` — flagging honesty about rows
  that arrived already Awarded.

Migration 078 also does not emit an "awarded since last upload" banner query,
does not archive Awarded tenders out of the Kanban's default view, and the
Kanban renders 5 columns including Award (see `components/procurement/ProcurementKanban.tsx`,
driven by `TENDER_STAGES` from `lib/tender/types.ts`). The current
`tender_field_change` log captures stage transitions and could act as a
secondary confirmation, but per spec the primary signal is `awarded_at`.

### Also check — Activity column blank in list view — **MIXED.**

The list view on `/procurement` renders every Activity cell as `—`. But the
DB has `programme_activity` populated for 83 of 147 rows (56 %). Split:
- 47 PSIP rows have matching `programme_activity` strings agreeing with the
  parent line-item row in the sheet (✓).
- 32 PSIP rows have the row's own description duplicated into
  `programme_activity` — this is a parser bug, parent-as-tender rows should
  leave `programme_activity` NULL.
- 6 MARAD phantoms — NULL (expected for summary rollup).
- 8 HECI Trello — NULL (expected; Trello cards don't carry programme metadata).

On top of that, the list column is rendering `—` regardless of value. Two
bugs stacked: (a) parser stores wrong `programme_activity` for parent-as-tender
rows, (b) list view doesn't read/render the field. Detail panel was not
verified under time constraint but likely suffers the same display bug — worth
confirming during Phase 3 of the rebuild.

### Also check — MARAD Dredging of Demerara River (R232 whitespace col A) — **CONFIRMED INGESTED.**

The row is in the DB: agency=MARAD, method=open_tender, stage=design,
has_exception=true, description="Dredging of Demerara River and main ships'
channel". The parser's whitespace handling on col A is correct (a literal
space is treated as "no line-item code", emitting the row as a standalone
child under sub-programme 1403900). That said, the stage `design` was set
because status col J was "See Remarks" (a flag) with no dates — and the
current ingest's "Nothing → Design" fallback matches the spec's inference
table for flag rows. This row is legitimate. Keep it.

---

## 3. Current State Audit — live walkthrough

All screenshots in `audit-screenshots/procurement-rebuild/`.

| # | Surface | File | Finding |
|---|---|---|---|
| 01 | `/procurement` (list view, default) | `01-list-view-initial.png` | Header + "What Moved / Review / Missing / Upload PSIP / New Tender" actions. Stats: 92 active, 147 total, 0 stalled. Agency filter pills: **All, MPUA, GPL, GWI, HECI, CJIA, MARAD, GCAA, Airstrips**. Activity column is `—` on every row. HECI rows grouped at top (Updated 23 Mar 2026 — the Trello sync date). MARAD phantoms visible at rows 9–14 with descriptions "Award", "Awaiting Award", etc. |
| 02 | `/procurement?view=board` | `02-kanban-view.png` | Identical content; only view toggled. |
| 03 | `/procurement/uploads` | `03-uploads-page.png` | Drag-drop zone ("Drop the PSIP xlsx here"). Recent uploads shows a single APPLIED upload: `Ministry of Public Utilities 2026 PSIP.xlsx` at 4/17/2026 3:25:22 PM. No per-agency preview affordance. |
| 04 | `/procurement/review` | `04-review-queue.png` | "Review Queue · Ambiguous matches from recent uploads." Empty. |
| 05 | `/procurement/missing` | `05-missing-page.png` | "Missing Tenders · PSIP rows not present in the last applied upload." Empty (expected — only one upload so far). |
| 06 | `/procurement/changes` | `06-changes-page.png` | "What Moved" — full list of 139 PSIP rows as NEW grouped by agency. First-upload-equals-everything-new behavior. |
| 07 | `/procurement` Analytics tab | `07-analytics.png` | **4 stat tiles** (Total 147, Active 92, Stalled 0, Inferred 27). **Pipeline Shape** bar: Design 48, Advertised 24, Evaluation 20, Awaiting Award 0, Award 55. **Agency Breakdown**: GWI 42a/41w, GPL 21a/4w, MARAD 10a/0w, HECI 8a/0w, MPUA 6a/0w, GCAA 2a/0w, Airstrips 2a/9w, CJIA 1a/1w. **Procurement Method**: Open Tender 82, Sole Source 24, (no method) 18, Quotation 18, Restrictive 3, Comm. Participation 2. **Flags**: Rollover 11, See Remarks 3, Stage Inferred 27. **Budget: correctly absent.** |

Nav entry points: sidebar shopping-cart icon → `/procurement`. The Mission
Control / home page and Agency Intel pages do not currently surface procurement
counts.

No `/procurement/[id]` detail page exists; the detail panel is a `dialog`
rendered inline on the list view. During walkthrough the detail panel rendered
"Tender not found" briefly (there is a `?view=board` URL variant carrying a
stale ID in state, a minor UI race, not in scope for this rebuild).

---

## 4. Codebase Map

### 4.1 Migrations

| File | Purpose | Status |
|---|---|---|
| `052_procurement_tracking.sql` | Original `procurement_packages` model (awarded stage enum, budget, check constraints on method) | Dropped (archived) in 081 |
| `066_trello_procurement_sync.sql` | `procurement_boards`, `procurement_items`, `trello_item_stage_history`, enum `procurement_stage` | Items folded into `tender` in 080; enum dropped |
| `077_procurement_psip_sync.sql` | Deprecated GWI-only PSIP sync (no tables from this that survive) | Superseded |
| `078_tender_core.sql` | **Current canonical schema.** Enums `tender_agency`, `tender_stage`, `tender_method`, `tender_source`, `tender_stage_source`, `tender_match_status`, `tender_upload_status`. Tables `tender`, `upload`, `programme`, `sub_programme`, `tender_field_change`, `tender_match_review`, `tender_document`, `tender_note`. RLS: authenticated read / service_role full. Realtime publication on `tender`. | Live |
| `079_tender_seed_reference.sql` | Programmes 341–345, 12 sub-programmes with `is_excluded=true` on 2606600 / 2606700 | Live |
| `080_tender_trello_fold.sql` | Copies `procurement_items` → `tender` with `source='trello'`, preserves Trello card IDs as `external_id`. Renames `procurement_boards` → `trello_board`. | Live |
| `081_procurement_legacy_drop.sql` | `CREATE TABLE *_archive_20260417 AS SELECT * FROM *` then `DROP CASCADE` on the old procurement_* family. | Live |

### 4.2 Current schema (tender table)

```sql
CREATE TABLE tender (
  id                          UUID PK,
  source                      tender_source NOT NULL DEFAULT 'psip',
  external_id                 TEXT,
  agency                      tender_agency NOT NULL,
  programme_code              TEXT REFERENCES programme(code),
  sub_programme_code          TEXT REFERENCES sub_programme(code),
  programme_activity          TEXT,
  line_item_code              TEXT,
  description                 TEXT NOT NULL,
  stage                       tender_stage NOT NULL,
  stage_source                tender_stage_source NOT NULL DEFAULT 'status_column',
  method                      tender_method,
  is_rollover                 BOOLEAN NOT NULL DEFAULT false,
  has_exception               BOOLEAN NOT NULL DEFAULT false,
  date_advertised             DATE,
  date_closed                 DATE,
  date_eval_sent_mtb_rtb      DATE,
  date_eval_sent_nptab        DATE,
  date_of_award               DATE,
  contractor                  TEXT,
  implementation_start_date   DATE,
  implementation_end_date     DATE,
  implementation_status_pct   INTEGER,
  remarks                     TEXT,
  last_raw_row                JSONB,
  first_seen_upload_id        UUID REFERENCES upload(id),
  last_seen_upload_id         UUID REFERENCES upload(id),
  missing_from_last_upload    BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Gaps vs updated spec: no `awarded_at`, no `first_appearance_already_awarded`.

### 4.3 API routes

All routes gated by `requireRole()` + `canAccessAgency()`.

| Path | Verb | Writes | Role |
|---|---|---|---|
| `/api/procurement` | GET | — | dg, minister, ps, agency_admin, officer |
| `/api/procurement` | POST | `tender`, `tender_field_change` | dg, minister, ps, agency_admin |
| `/api/procurement/[id]` | GET | — | dg, minister, ps, agency_admin, officer |
| `/api/procurement/[id]` | DELETE | `tender` + cascade docs/notes | dg, agency_admin |
| `/api/procurement/[id]/notes` | POST | `tender_note` | all |
| `/api/procurement/[id]/documents` | POST | `tender_document` + storage | all |
| `/api/procurement/[id]/documents/[docId]` | GET | — (signed URL) | all |
| `/api/procurement/[id]/documents/[docId]` | DELETE | `tender_document` + storage | dg, agency_admin |
| `/api/procurement/advance` | POST | `tender.stage`, `tender_field_change` | dg, agency_admin |
| `/api/procurement/uploads` | GET | — | dg, minister, ps, agency_admin |
| `/api/procurement/uploads` | POST | `upload`, `tender_match_review`, storage (`psip-uploads`) | dg, minister, ps |
| `/api/procurement/uploads/[id]` | GET | — | dg, minister, ps, agency_admin |
| `/api/procurement/review` | GET | — | dg, minister, ps, agency_admin |
| `/api/procurement/review/[id]` | POST | `tender_match_review`, `tender`, `tender_field_change` | dg, minister, ps, agency_admin |
| `/api/procurement/missing` | GET | — | all |
| `/api/procurement/missing` | POST | `tender`, `tender_field_change` | dg, minister, ps, agency_admin |
| `/api/procurement/changes` | GET | — | all |
| `/api/integrations/trello/webhook` | HEAD / POST | `tender`, `tender_field_change` | service_role |
| `/api/integrations/trello/sync` | POST | `tender`, `trello_board` | service_role |

### 4.4 Lib layer

- `lib/tender/types.ts` — canonical TS types (`Tender`, `TenderFieldChange`, `Upload`, `PipelineStats`). Constants `TENDER_STAGES` (5), `STAGE_CONFIG`, `METHOD_CONFIG`, `AGENCY_LABEL`, `AGENCY_CODES` (8).
- `lib/tender/queries.ts` — `listTenders`, `getTenderById`, `createManualTender`, `updateTenderStage`, `deleteTender`, `addTenderNote`, `addTenderDocument`, `getPipelineStats`, `listMissingTenders`. Days-at-stage computed off `tender_field_change`.
- `lib/psip/types.ts` — ingest-scoped types (`ParsedTender`, `ParseStats`, `MatchResult`, `ReviewRow`).
- `lib/psip/parser.ts` — walks the PSIP Monitoring Form sheet, applies dedup + parent/child collapse + stage inference + method normalization. Excludes sub-programmes flagged `is_excluded`.
- `lib/psip/matcher.ts` — scope-first (agency, programme, sub-programme, programme_activity) narrowing + Levenshtein + token-sort similarity. Thresholds 0.92 / 0.80.
- `lib/psip/ingest.ts` — two-phase orchestrator: `previewPsipUpload`, `applyPsipUpload`, `cancelPsipUpload`.
- `lib/trello.ts` — Trello API client, list-name → stage mapping.
- `lib/procurement/bulk-upload-parser.ts` — **kept for airstrips + delayed-projects upload; not used by procurement itself.** Do not delete.

### 4.5 Pages

| Route | File | Notes |
|---|---|---|
| `/procurement` | `app/procurement/page.tsx` | Main page — tabs Pipeline / Analytics; components below |
| `/procurement/uploads` | `app/procurement/uploads/page.tsx` | Drag-drop preview + apply |
| `/procurement/review` | `app/procurement/review/page.tsx` | Pending match-review rows |
| `/procurement/missing` | `app/procurement/missing/page.tsx` | Resurrect / archive tenders |
| `/procurement/changes` | `app/procurement/changes/page.tsx` | "What moved" feed, most recent applied upload |
| `/procurement/psip-sync` (legacy) | — | **No longer present.** The 301 redirect placeholder mentioned in the prior reformulation plan was not shipped; no user-visible breakage because the deprecated GWI-only flow is fully dead. |

No `/procurement/[id]` detail page exists; detail is a slide-over dialog on
the main list view.

### 4.6 Components (`components/procurement/`)

- `ProcurementKanban.tsx` — 5-column board; polls 60 s + realtime subscription to `tender`
- `ProcurementListView.tsx` — compact table (this is the default view in production)
- `ProcurementCard.tsx` — single card: description + programme_activity + agency badge + days-at-stage + method label + rollover/exception/inferred flags
- `ProcurementDetailPanel.tsx` — slide-over with tabs Overview / Change Log
- `ProcurementNewPackageForm.tsx` — manual-create form (the "New Tender" button)
- `ProcurementAnalytics.tsx` — counts-only analytics (no budgets)
- `ProcurementStageBadge.tsx`, `ProcurementStageIndicator.tsx`, `DaysAtStageIndicator.tsx`, `AgencyBadge.tsx` — small atoms

### 4.7 Cross-module references

None found. Oversight, Pulse, and Agency Intel pages do not import from
`lib/tender/*` or `lib/psip/*`. `components/intel/gwi/` has a
`procurement_data` domain-insight field that is local to GWI analytics and
does not reference the procurement module. The home dashboard does not
surface procurement counts.

### 4.8 Dead / cruft

- `procurement_packages_archive_20260417` family — archived snapshots from 081, read-only, legitimately retained.
- `/procurement/psip-sync` — fully deleted already (no redirect stub in prod).
- `app/api/procurement/demo`, freehand `bulk` APIs, `BulkUploadModal*`, `column-mapper`, `row-validator` — all removed in the reformulation PR.
- `lib/procurement-queries.ts`, `lib/procurement-types.ts` — removed; replaced by `lib/tender/*`.

### 4.9 Storage

- `psip-uploads` — 50 MB limit, private. Holds the raw weekly xlsx.
- `tender-documents` — 50 MB limit, private. Holds per-tender attachments.

---

## 5. Full diff (Sections 4A–4H)

Source: `.playwright-mcp/diff-report.json` and `/tmp/psip-expected.{json,tsv}`.

### 4A. Missing tenders — **0.**

Every row that the updated spec expects is in the DB today. The ingest's
inclusion logic is currently a superset of the spec; the problem is overshoot,
not undershoot.

### 4B. Phantom tenders — **60.**

Breakdown by cause (each row is a clean cause; no double-counting):

| Cause | Count | Fix |
|---|---:|---|
| Method-excluded: Sole Source | 24 | Enforce method filter at ingest |
| Method-excluded: Quotation | 18 | Enforce method filter at ingest |
| Method-excluded: Restrictive | 3 | Enforce method filter at ingest |
| Method-excluded: Community Participation | 2 | Enforce method filter at ingest |
| Method blank but ingested with `method=null` (R208 Ekereku, R209 Kaikan, R211 Anna Regina Lot 3 parent, etc.) | 4 | Reject blank method at ingest |
| Summary-rollup rows (R246–R251: MARAD Award/Awaiting Award/Evaluation/Advertised/Design/Rollover) | 6 | Detect + suppress summary block |
| Section-divider row "New" (R105) | 1 | Strengthen divider matcher to handle no-colon form |
| Silent default to Design (col J blank, no dates, Open Tender): R169–R171 (GWI Bartica) | 3 | Reject rows with no stage signal |
| GPL "Land Acquisition" phantom (no method, status=blank) | 1 | Same as above |
| Phantom children under programme 344 before any sub-programme (R202–R203 duplicates of R218–R219) | 0 | Already correctly flagged as `no_agency_match` by current ingest (not counted as phantoms) — but confirm the spec's dedup rule is active end-to-end before shipping |

Two of the phantom airstrips rows surface as `stage='award'` with
`method=null` (R208 Ekereku, R209 Kaikan). These also expose Bug 3 since col J
said "Award" but col D was blank — the ingest honored the stage despite the
missing method. Fix: method is **required**; blank method = reject.

### 4C. Wrong attribution — **0 by matched-row comparison.**

Every matched row has the agency / programme_code / sub_programme_code the
spreadsheet implies. `programme_activity` is where the bugs live:

| Issue | Count | Cause |
|---|---:|---|
| Parent-as-tender rows with `programme_activity = description` (should be NULL) | 32 | Parser bug: when a parent has no children, the row is emitted with `programme_activity` set to its own description rather than NULL |
| Rows where list-view Activity column always renders `—` regardless of DB value | 47 | UI render bug — list view not reading the field |

### 4D. Wrong stage — **0 among matched rows.**

Where the ingest kept a row that the spec also expects, the stage agrees.
The existing stage inference is functioning correctly for flag rows with
dates (27 inferred in DB vs 11 in expected, explained entirely by the
phantom-row overshoot — all the spurious inferred-Design stages belong to
rows that should have been method-filtered out).

### 4E. Wrong flags — **0 among matched rows.**

`is_rollover`, `has_exception`, `stage_source='inferred_from_dates'` are
computed correctly on the rows that make it past ingest.

### 4F. Parent/child handling — **1 systemic bug.**

Parent-as-tender rows (parent line-item code in col A with no subsequent
children — e.g. `C-004` Gravity Filters, `C-005` Technical Support
Consultancy, `C-006` Surface WTP Stewartville, `C-007` Surface WTP LBI,
`C-008` Inline Filters, `U-007` Waste Water Treatment Plant, Trello cards)
emit `programme_activity` equal to the row's own description. Should be NULL
(the parent has no super-parent context). 32 rows affected.

Parent-with-children flow (e.g. `C-001` → R102/R103, `C-002` → R107/R108/R109,
`C-003` → R111–R118) appears correct; the parent itself is suppressed and
children inherit.

### 4G. Duplicates — **0 confirmed in DB.**

The spec's "rows under a programme header before any sub-programme that
duplicate rows under a sub-programme" rule is handled in the spreadsheet side
of the pipeline: R202/R203 under 344 (before 1601100) match R218/R219 under
1601100. Current ingest's `no_agency_match` exclusion kicks in before my
dedup check reaches them (because subCode is null), so they never enter the
DB. Outcome is correct though via a different path. Worth making the dedup
rule explicit in the rebuild so if the sheet layout changes we're not
relying on a side-effect.

### 4H. Source data weirdness — informational.

Quirks observed in the 2026-04-16 workbook:
- R5 has col A = `"34"` (two-digit ministry code, not a programme). The
  parser must skip it; current behavior appears to skip it too.
- R232 col A = `" "` (single space). Correctly treated as "no line-item" by
  Unicode-trim in the current parser.
- Row 27–31 (HECI sub-programme): six "Awaiting Award" rows — all excluded
  at sub-programme gate, so Awaiting Award stage is absent from both DB and
  expected set. If HECI were ever un-excluded the stage would appear.
- Col G header spans "Date Eval Sent for Approval: MTB / RTB". The parser's
  date mapping must continue treating col G as MTB/RTB and col H as NPTAB.
- R103 contractor name is truncated mid-string (`"Sigma Engineers Ltd. Inc."`
  vs. the actual full name). This is a source-data issue; do not attempt to
  clean in-ingest.
- Col A frequently contains year-embedded codes like `GWI 2026/CPA 576`.
  These are line-item codes; the parser treats them correctly as non-numeric
  parent codes today — but only if the method filter blesses the row (all
  R125–R140 are Sole Source so currently excluded anyway).

---

## 6. Root-cause hypotheses (pre-code)

Grouping the 60 phantoms + activity-column bug by probable underlying code
bug in the ingest / rendering:

1. **Method filter not applied at ingest.** Phase 1's `lib/psip/parser.ts`
   accepts any value including nil/blank/Sole Source/Quotation/etc. into
   `method` — the enum `tender_method` still has those values, and the
   parser normalizes `public_tender` → `open_tender` but never rejects
   non-Open. 47 method-excluded phantoms + 10 blank-method phantoms.
2. **Stage-resolution has a final Design fallback.** When col J is empty,
   flag parsing yields `null`, date-based inference yields `null`, and the
   code path falls through to `'design'` with `stage_source='inferred_from_dates'`.
   Spec says this should reject. 3 Bartica + 1 GPL + 1 GWI "New" = 5 phantoms.
3. **Summary-rollup detection insufficient.** The parser catches the literal
   `Summary:` divider but once past that line each stage-named row
   (`Award`, `Advertised`, etc.) reads as a normal row because col B isn't
   suffixed with a colon. State machine needs a post-`Summary:` absorption
   mode until blank-row gap. 6 MARAD phantoms.
4. **Parent-as-tender programme_activity redundancy.** In `lib/psip/parser.ts`
   the `maybeEmit()` path for parents-without-children sets
   `programme_activity` to the row's own description. Should be NULL. 32
   cosmetic bugs.
5. **Activity-column render bug.** `components/procurement/ProcurementListView.tsx`
   (or wherever the list columns render) doesn't read `programme_activity`.
   47 rows have real values that never hit the UI.
6. **Award tracking absent by design.** Not a bug — the columns simply
   don't exist yet.

---

## 7. Proposed data model

Minimal-change delta on top of the current schema. Critique of the user's
proposal: the shape is right, but three adjustments.

### 7.1 New columns on `tender`

```sql
ALTER TABLE tender
  ADD COLUMN awarded_at                        TIMESTAMPTZ,
  ADD COLUMN first_appearance_already_awarded  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_tender_awarded_at ON tender (awarded_at DESC) WHERE awarded_at IS NOT NULL;
CREATE INDEX idx_tender_active      ON tender (agency, stage) WHERE stage <> 'award';
```

Semantics:
- `awarded_at` is set to the ingesting `upload.uploaded_at` the first time a
  tender's stage becomes `award` — either on initial ingest (row arrives with
  status=Award) or on a later transition. **Never overwritten.** Once set, no
  re-setting on subsequent uploads, no decrement, no back-dating.
- `first_appearance_already_awarded` = true when the tender is first ingested
  with stage already `award`. `awarded_at` still stamps the upload date but
  this flag tells the UI "we inherited Award state on ingest; the transition
  date is unknown".
- Manual stage transitions via `/api/procurement/advance` also set
  `awarded_at` when moving into `award` for the first time.

### 7.2 Keep `date_of_award` distinct

`tender.date_of_award` is the team's self-reported date from col I of the
PSIP sheet (DATE, no time). `awarded_at` is our own ingest observation
(TIMESTAMPTZ). They are different things; keep both. UI should show both.

### 7.3 `tender_match_review` — spec lists fields this table already has

The user's proposed schema for `tender_match_review` is compatible with what
migration 078 shipped; no changes needed.

### 7.4 `tender_field_change` is the change-log

The user's proposed `tender_change_log` table is identical in shape to the
existing `tender_field_change`. Keep the existing name — don't churn a
migration just to rename.

### 7.5 `tender_method` enum retained (decision §11-2)

Keep all 5 enum values. Ingest rejects everything except Open / Public;
manual-create form keeps the full dropdown so the DG can log a non-Open
tender (Cabinet direction, emergency procurement) outside the weekly PSIP
file without a churn migration.

### 7.7 Extend `tender_match_review` for ambiguous-stage rows

```sql
ALTER TABLE tender_match_review
  ADD COLUMN review_reason TEXT NOT NULL DEFAULT 'ambiguous_match'
    CHECK (review_reason IN ('ambiguous_match', 'ambiguous_stage'));
```

- `ambiguous_match` (existing behavior): fuzzy-match confidence 0.80–0.92;
  row presents candidate tenders for the human to pick from.
- `ambiguous_stage` (new): incoming PSIP row has Open Tender + description
  but col J blank and no dates. `candidate_tender_ids` is empty. Human
  assigns a stage or skips. On "match", the row becomes a new tender with
  the chosen stage; on "skip", the row is dropped from this upload and can
  resurface next week if the spreadsheet fills in the stage.

### 7.6 `missing_from_last_upload` scoping

The column already exists. The update path in `applyPsipUpload` should only
set it for `source='psip'` rows — Trello rows never belong to a PSIP upload
and are always "missing" from that upload. Bug if this isn't already scoped.

---

## 8. Proposed ingest pipeline

Exclusion order (each row evaluated in sequence; first match wins):

```
1. Row has no description AND no method AND no status AND no dates → REJECT
   (anti-default guard per user spec).
2. Row is a programme header (colA matches /^3\d{2}$/) → SET programme context, not a tender.
3. Row is a sub-programme header (colA matches /^\d{7}$/) → SET sub-programme context, not a tender.
4. Row is section divider: colA empty AND colB ∈ {Rollover:, New:, New, Summary:} or similar AND no stage/method data → SKIP.
5. We are past a "Summary:" line → SKIP everything until the next programme/sub-programme header or blank-row gap.
6. Row belongs to a sub-programme flagged is_excluded (2606600 Lethem, 2606700 HECI-PSIP) → EXCLUDE.
7. Row's normalized method is neither open_tender nor public_tender (including blank) → EXCLUDE.
8. Row has Open/Public method AND description but col J is blank AND all date columns (E–I) are blank → write `tender_match_review` row with `review_reason='ambiguous_stage'` (not a reject, not a silent default). Human resolves: assign stage, or skip. The candidate tender list for such review rows is empty; the row surfaces in the queue with an "incoming row" only.
   (this plugs Bug 3 for the Bartica class per user decision (1) in §11.)
9. Stage resolution:
   a. If col J is "Design"/"Advertised"/"Evaluation"/"Awaiting Award"/"Award" (case- and typo-tolerant: "Awaitng") → use that, stage_source='status_column'.
   b. Else col J is "Rollover" or "See Remarks" → set is_rollover / has_exception, then infer:
      - date_of_award present → Award
      - eval_mtb or eval_nptab present → Awaiting Award
      - date_closed → Evaluation
      - date_advertised → Advertised
      - nothing → Design, stage_source='inferred_from_dates'
   c. Else col J blank but dates exist → infer as in (b).
10. Parent/child collapse:
    - Row has non-numeric colA (line-item code) with subsequent child rows (colA empty, colB non-empty, not a divider) → children are tenders, parent supplies programme_activity.
    - Parent with no children → parent IS the tender, programme_activity = NULL.
11. Duplicate suppression: if same normalized description appears under programme-header-only scope AND later under a sub-programme of that programme → drop the earlier copy.
```

Stage normalization detail: the "Awaitng Policy Direction" typo in the
spreadsheet should be logged as a warning but not silently consumed — if it
ever maps to a stage rather than a flag, we want to catch it.

Identity resolution (for weekly delta):

```
For each candidate tender from the upload:
  Scope narrow = tenders where (agency, programme_code, sub_programme_code, programme_activity) match
  If scope is empty → NEW
  If exact normalized-description match in scope → UPDATE (confidence = 1.0)
  Else Levenshtein + token-sort-ratio on descriptions:
    score >= 0.92 → UPDATE (confidence = score, log `auto-matched` marker)
    0.80 <= score < 0.92 → REVIEW (write tender_match_review row)
    score < 0.80 → NEW
```

Never-delete-on-miss:

```
After all incoming rows are processed:
  For each tender where source='psip' AND last_seen_upload_id <> this.upload_id:
    SET missing_from_last_upload = true
  (Never DELETE.)
```

Award-stamping:

```
When writing a tender row:
  If stage = 'award' AND tender.awarded_at IS NULL:
    SET tender.awarded_at = upload.uploaded_at
    If this is also the tender's first ingest row (source=psip, first_seen_upload_id is being set NOW):
      SET first_appearance_already_awarded = true
  (If awarded_at already has a value, never change it.)
```

Change-log:

```
For every field diff detected by the matcher:
  INSERT INTO tender_field_change (tender_id, field_name, old_value, new_value, upload_id, changed_at)
Special case: stage transition into 'award' also emits a field change for
awarded_at going null → upload.uploaded_at, so the "what moved" view surfaces
the award event explicitly.
```

---

## 9. Proposed UI surfaces

Disposition of every surface, grounded in live-app screenshots (`audit-screenshots/procurement-rebuild/`).

| Surface | Disposition | Change detail |
|---|---|---|
| `/procurement` list view (screenshot 01) | **MODIFY** | (a) Add "X tenders awarded since {prev_upload_date}" banner above the stats strip. (b) Hide Award-stage rows from the default list (move to Awarded Archive). (c) Fix Activity column to actually render `programme_activity`. (d) Show rollover / exception / first-appearance-already-awarded / inferred badges on every row. |
| `/procurement` Kanban (screenshot 02) | **MODIFY** | Default 4 columns: Design, Advertised, Evaluation, Awaiting Award. Remove Award column from default. Add a "View Awarded Archive" button in the board header. Flag badges same as list view. |
| `/procurement` Analytics (screenshot 07) | **MODIFY** | Pipeline Shape stays (5 bars); Agency Breakdown stays (active / awarded split is useful); Procurement Method breakdown should only show Open Tender / Public Tender buckets after cleanup (others would disappear naturally once method filter is enforced). Add a `Awarded since last upload` stat tile. |
| `/procurement/uploads` (screenshot 03) | **KEEP** (minor) | Add an obvious "Preview" ≠ "Apply" distinction in the UI copy; today the difference is implicit. Every preview writes a `tender_match_review` row for medium-confidence matches — show an "N items flagged for review" count on the upload summary before Apply. |
| `/procurement/review` (screenshot 04) | **KEEP** | Works; empty-state copy is fine. Add the option to bulk-skip with a single click if the DG wants to batch-approve. |
| `/procurement/missing` (screenshot 05) | **KEEP** | Scope query to `source='psip'`. |
| `/procurement/changes` (screenshot 06) | **KEEP** (minor) | Group stage-into-Award transitions first, ahead of other field diffs. This is the "what moved" view the spec wants; label the top section "Awarded this week". |
| Detail-panel change log tab | **KEEP** | Add `awarded_at` timestamp (distinct from `date_of_award`) and `first_appearance_already_awarded` flag. |
| "Tender not found" flicker when re-opening detail dialog | **FIX** (minor) | Out of scope strictly but trivial to fix during Phase 3. |
| Manual "+ New Tender" form | **MODIFY** | Drop Quotation/Sole Source/Restrictive/Comm Participation from the method dropdown unless we explicitly decide to keep them (see §7.5 Option B). |

### New surfaces

1. **Awarded since last upload banner** — landing-page hero, one-line count
   and CTA "View awarded since {date}". Links to an Awarded list filtered by
   `awarded_at >= prev_upload.uploaded_at`.
2. **Awarded Archive** — `/procurement/archive` (or sub-tab), full searchable
   list of `stage='award'` tenders with filters on agency, contractor,
   `awarded_at` range, `first_appearance_already_awarded`. This is where
   awarded tenders live after moving off the default Kanban.
3. **Awarded-this-upload list** — a filtered slice reachable from the
   Changes page's top section and from the banner.

### Navigation delta

Add to the procurement-page header action row, in order:
`Awarded Archive · What Moved · Review · Missing · Upload PSIP · New Tender`.

The "Awarded Archive" button replaces no existing element; it takes a
reasonable slot between the kanban tabs and the workflow actions.

---

## 10. Migration plan

### 10.1 Cleanup of existing DB

Execute in a single transaction on production:

```sql
BEGIN;

-- Phantom summary rollup rows (the 6 MARAD phantoms)
DELETE FROM tender
 WHERE source = 'psip'
   AND agency = 'MARAD'
   AND description IN ('Award', 'Awaiting Award', 'Evaluation', 'Advertised', 'Design', 'Rollover')
   AND method IS NULL;

-- Divider row consumed as data
DELETE FROM tender
 WHERE source = 'psip'
   AND description = 'New'
   AND method IS NULL;

-- Method-excluded rows (24 + 18 + 3 + 2 = 47)
DELETE FROM tender
 WHERE source = 'psip'
   AND method IN ('sole_source', 'quotation', 'restrictive', 'comm_participation');

-- Blank-method PSIP rows (10 remaining after above; 2 were caught by method filter already)
DELETE FROM tender
 WHERE source = 'psip'
   AND method IS NULL;

-- Silent-default-Design rows with no stage signal (Bartica trio and GPL "Land Acquisition").
-- Per §11-1 these will surface in the review queue on the NEXT upload rather than be
-- silently ingested. Since we don't have a retroactive review-row for the already-applied
-- upload, the cleanest path is to delete now and let the next upload re-surface them as
-- ambiguous_stage review rows. If the sheet author meanwhile fills in col J they'll ingest
-- cleanly as normal tenders.
DELETE FROM tender
 WHERE source = 'psip'
   AND stage = 'design'
   AND stage_source = 'inferred_from_dates'
   AND date_advertised IS NULL
   AND date_closed IS NULL
   AND date_eval_sent_mtb_rtb IS NULL
   AND date_eval_sent_nptab IS NULL
   AND date_of_award IS NULL
   AND is_rollover = false
   AND has_exception = false;
-- Note: the AND is_rollover=false AND has_exception=false guards preserve R232 Dredging
-- and any other See-Remarks / Rollover rows whose inference fallback is legitimate.

-- Fix programme_activity NULL on parent-as-tender rows (32 rows)
UPDATE tender
   SET programme_activity = NULL
 WHERE source = 'psip'
   AND programme_activity = description;

-- Cascade: tender_field_change FK cascades on tender DELETE; confirm before commit
-- tender_match_review references upload, not tender; safe

COMMIT;
```

Verification queries to run post-cleanup:

```sql
SELECT count(*) FROM tender WHERE source='psip';  -- expect 79
SELECT count(*) FROM tender WHERE source='trello'; -- expect 8 (unchanged)
SELECT method, count(*) FROM tender GROUP BY method; -- expect open_tender only (+ null for Trello)
SELECT stage, count(*) FROM tender WHERE source='psip' GROUP BY stage; -- expect Design 27, Advertised 18, Evaluation 15, Award 19
```

### 10.2 Schema migration (`082_tender_award_tracking.sql`)

```sql
-- Add award-tracking columns
ALTER TABLE tender
  ADD COLUMN awarded_at                        TIMESTAMPTZ,
  ADD COLUMN first_appearance_already_awarded  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_tender_awarded_at ON tender (awarded_at DESC) WHERE awarded_at IS NOT NULL;
CREATE INDEX idx_tender_active      ON tender (agency, stage) WHERE stage <> 'award';

-- Best-effort backfill for existing awarded tenders:
-- We can't reconstruct the true transition date, but we can stamp created_at
-- and flag honestly as first-appearance-already-awarded.
UPDATE tender
   SET awarded_at = created_at,
       first_appearance_already_awarded = true
 WHERE stage = 'award'
   AND awarded_at IS NULL;
```

Post-backfill verification:

```sql
SELECT count(*) FROM tender WHERE stage='award' AND awarded_at IS NULL; -- expect 0
SELECT count(*) FROM tender WHERE first_appearance_already_awarded; -- expect = count(stage='award')
```

### 10.3 Migration ordering

1. Phase A — schema (082) — additive, safe on production.
2. Phase B — data cleanup — must run after ingest fixes are deployed, so
   re-uploads don't re-introduce the phantoms.
3. Phase C — ingest fixes deployed — see §11 phased implementation.
4. Phase D — UI swap (new Kanban default, archive view, banner).

No backwards-incompatible changes. Columns are additive; enum values stay;
code that doesn't know about `awarded_at` simply doesn't read it.

---

## 11. Decisions (user-approved) + remaining open questions

Four of the most consequential decisions were locked during planning:

1. **Col J blank + no dates + valid description + Open Tender → push to the
   review queue.** Not rejected, not silently defaulted. This requires
   extending `tender_match_review` to carry a second review type
   ("ambiguous_stage") in addition to the existing ambiguous-fuzzy-match
   type — see §8 rule 8 and §7.7 below.
2. **Keep the `tender_method` enum as-is; enforce filter at ingest.** Manual
   create form retains all 5 method values; ingest admits only
   `open_tender` / `public_tender` (the latter normalized to `open_tender`).
3. **Awarded Archive is a separate page at `/procurement/archive`.** Not a
   tab on the main page.
4. **Backfill existing Award-stage rows**: `awarded_at = created_at`,
   `first_appearance_already_awarded = true`.

Still pending user sign-off before Phase A:

- **R232 Dredging of Demerara River disposition.** With decision (1), this
  row has `has_exception=true` (col J = "See Remarks") and no dates. The
  flag-based inference rule says "Nothing → Design" for See-Remarks rows. Do
  you want See-Remarks-only rows treated the same as col-J-blank rows
  (routed to review) or stay with the inference fallback (stage=Design with
  `has_exception=true`, `stage_inferred_from_dates=true`)? My lean: keep the
  inference fallback for flag rows (they have a human-written signal), route
  to review only when col J is truly blank.
- **`date_of_award` vs `awarded_at` in detail-panel UI.** Show both (team-
  reported vs ingest-observed) or just `awarded_at` with `date_of_award` in
  `last_raw_row` JSON? My lean: show both, labeled distinctly.
- **MPUA agency pill.** Programme 341 produces zero tenders under the
  updated spec. Hide MPUA from agency filter until non-zero, or always
  show? My lean: always show for consistency.
- **Parent-as-tender programme_activity.** Confirm NULL (not self-echo) is
  right.
- **Deploy alias.** User memory records "Never deploy to
  dashboard.mpua.gov.gy" but production currently auto-aliases there.
  Orthogonal to this module, but flagging because the cleanup migration
  will ship via that deploy path. Detach alias before Phase A?

---

## 12. Phased implementation

Each phase is a reviewable PR, no bundling except where noted. No phase
starts without explicit user go.

### Phase A — Schema + cleanup (DB-only, reversible)
- `supabase/migrations/082_tender_award_tracking.sql` — add `awarded_at` and `first_appearance_already_awarded`, backfill existing Award-stage rows with `created_at` and `first_appearance_already_awarded=true` (per §11-4).
- `supabase/migrations/083_tender_match_review_reason.sql` — add `review_reason` column per §7.7.
- Data cleanup SQL script (§10.1) — staged via the same migration or run manually with a clear rollback plan (snapshot `tender` to `tender_cleanup_backup_{date}` first).
- **Verify**: row counts match §10.1 post-conditions; no reads or writes in application code yet depend on new columns.

### Phase B — Ingest fixes (no UI)
- Update `lib/psip/parser.ts` to:
  - Reject non-Open/Public methods.
  - Reject rows with no stage signal (col J blank, no dates) — the Bartica trio + GPL Land Acquisition class.
  - Strengthen summary-rollup detection: after `Summary:` divider, absorb until next programme/sub-programme header or blank-row gap.
  - Fix parent-as-tender `programme_activity` to NULL.
- Update `lib/psip/ingest.ts` to stamp `awarded_at` on first-observation-of-Award and set `first_appearance_already_awarded` when applicable.
- Update `lib/psip/matcher.ts` to emit `awarded_at` change events into `tender_field_change` on transitions into Award.
- **Verify**: CLI dry-run of the 2026-04-16 fixture shows 79 PSIP tenders (no phantoms), `tender_field_change` captures Award transitions.

### Phase C — Re-ingest smoke (staging or on-prod)
- Re-apply the current 2026-04-16 xlsx via the existing `/procurement/uploads` flow.
- Expected result post-cleanup+Phase-B: 0 new tenders, 0 updates, 0 missing,
  0 review items (file is a rerun of the last-applied upload).

### Phase D — UI rebuild (bundled: banner + default Kanban + Awarded Archive + review-queue extension)
- Add "Awarded since last upload" banner on `/procurement` list + kanban views.
- Default Kanban columns: 4 (drop Award).
- New page `app/procurement/archive/page.tsx` — Awarded list with filters (decision §11-3: separate page, not a tab).
- `/procurement/review` rendering splits into two sections by `review_reason`: "Ambiguous matches" and "Missing stage" (ambiguous_stage). Each has the appropriate action set.
- Fix list view Activity column render.
- Update detail panel to show `awarded_at` and `first_appearance_already_awarded`.
- Bundle because these ship together as a coherent DG-facing experience change.

### Phase E — Analytics polish + UI details
- Drop non-Open methods from the method breakdown (organic once cleanup + ingest fix).
- Add stats tile for "Awarded since last upload".
- Minor — manual-create form method dropdown narrowing per §7.5 decision.
- Fix "Tender not found" dialog flicker.

### Phase F — Defensive tests
- `tests/psip-parser.test.ts` against the committed fixture xlsx — asserts
  exact counts (79 total, 6 MARAD skipped, 47 method-excluded, 0 silent
  defaults) + flag coverage.
- `tests/psip-ingest-award.test.ts` — asserts `awarded_at` stamping semantics,
  non-overwrite on second upload.
- `tests/psip-summary-rollup.test.ts` — asserts summary-rollup block is
  correctly suppressed.

No Phase G cleanup is necessary — there are no deprecated routes left.

---

## 13. End-to-end verification strategy

Each phase verified end-to-end before promotion:

1. **Phase A verify**: SQL counts per §10.1 post-conditions; application still
   returns same tender list minus the 60 phantoms.
2. **Phase B verify**: `pnpm tsx scripts/psip-dry-run.ts "<2026 PSIP xlsx>"`
   emits 79 in-scope, 60 excluded-by-method/divider/rollup, 3 inferred-stage.
3. **Phase C verify**: Re-upload produces `{ new: 0, update: 0, missing: 0, review: 0 }`.
4. **Phase D verify**: Playwright — navigate `/procurement`, banner reads
   "0 tenders awarded since {prev_upload_date}" (idempotent re-upload),
   Kanban has 4 columns, /procurement/archive lists the 19 awarded tenders.
5. **Phase E verify**: Analytics Procurement Method shows 100 % Open Tender
   bar (cleanup eliminated the other categories); the manual-create form
   respects §7.5 decision.
6. **Phase F verify**: `pnpm test` green.

---

## Appendix — Evidence files

- `audit-screenshots/procurement-rebuild/01-list-view-initial.png`
- `audit-screenshots/procurement-rebuild/02-kanban-view.png`
- `audit-screenshots/procurement-rebuild/03-uploads-page.png`
- `audit-screenshots/procurement-rebuild/04-review-queue.png`
- `audit-screenshots/procurement-rebuild/05-missing-page.png`
- `audit-screenshots/procurement-rebuild/06-changes-page.png`
- `audit-screenshots/procurement-rebuild/07-analytics.png`
- `/tmp/psip-expected.json` — 79 expected tenders, 60-class exclusion ledger
- `/tmp/psip-expected-summary.json` — aggregate counts
- `/tmp/psip-expected.tsv` — human-reviewable sheet
- `.playwright-mcp/actual-tenders-parsed.json` — DB snapshot at audit time
- `.playwright-mcp/diff-report.json` — per-row diff

All raw data can be regenerated by `scripts/parse-psip-audit.mjs` (note:
this helper was written during the audit for analysis only; plan mode
required its creation to reproduce the expected-tender corpus — on exit-plan
approval it can be moved to `scripts/` formally or deleted depending on
whether the user wants it as a reusable diff tool).

## Handoff note

The audit is complete. No code is to be written in this plan-mode session.
User's open questions §11 should be answered before Phase A kicks off.
