# Agency Intel Redesign — Implementation Summary

**Date:** 2026-05-07
**Branch:** `action-items-foundation`
**Scope:** Operational intel surface (`/intel`, `/intel/[agency]`) — backend data layer, frontend redesign, dead-code removal, and one notification-pipeline migration carried over from the original spec.

---

## 1. Outcome at a Glance

A 7-tile agency picker at `/intel` and a single shared deep-dive page at `/intel/[agency]` replace what was previously 6 hand-rolled per-agency pages, a SlidePanel-driven index, and a thicket of cross-imported components and hooks.

GPL gains two new live-data cards: **Grid Reliability** (SAIDI / SAIFI / customer-hours lost MTD vs prior month) and **Application Efficiency** (throughput, average time-to-decision, backlog trend).

The /intel index and /intel/gpl headers were redesigned with sharper editorial typography, gradient color spines, status indicators, and refined hover states — all within existing DG Work OS design tokens (navy/gold, Outfit / JetBrains Mono).

---

## 2. Architecture After Cleanup

```
app/intel/
├── page.tsx                        # 7-tile agency picker (client)
├── [agency]/page.tsx               # Server route — looks up meta, renders shared component
├── error.tsx                       # Segment error boundary (unchanged)
└── pending-applications/           # Untouched

components/intel/
├── AgencyIntelPage.tsx             # Single shared deep-dive (client) — every agency goes here
├── GenerateReportModal.tsx         # PDF report dialog (unchanged)
├── common/                         # Multi-consumer atoms (StatusBadge, Sparkline, …)
├── pending-applications/           # GPL-specific module (unchanged)
└── gpl/                            # Trimmed: only GPLModule + 5 deps remain
    ├── GPLModule.tsx
    ├── ExecutiveSummary.tsx
    ├── TrackBPipeline.tsx
    ├── EfficiencyStaff.tsx
    ├── DataQuality.tsx
    └── SCUpload.tsx

lib/intel/get-agency-intel-data.ts  # Single source of truth for the surface
lib/agencies.ts                     # Canonical agency registry + display metadata
app/api/intel/[agency]/route.ts     # Per-agency JSON
app/api/intel/[agency]/report/...   # PDF report endpoint
app/api/intel/summary/route.ts      # Batched 7-agency counts (NEW)
```

**Removed:** 29 files + 2 directories. See §6.

---

## 3. Backend — Data Layer

### 3.1 `lib/intel/get-agency-intel-data.ts` (single source of truth)

Both the page-API (`/api/intel/[agency]`) and the report-API (`/api/intel/[agency]/report`) call this function directly. No internal HTTP self-calls.

Returns:

```ts
interface AgencyIntelData {
  agency: string;
  generated_at: string;

  open_tasks: AgencyOpenTask[];
  delayed_projects: DelayedProjectWithComputed[];
  critical_procurement: CriticalTenderRow[];

  agency_head: { name, email, focal_point_name, focal_point_email };

  // GPL-only — undefined for the other six
  gpl?: {
    outstanding_applications: AgencyOutstandingApplications;
    station_health: StationHealthRow[];
    recent_outages: RecentOutageRow[];
    outage_count_mtd: number;
    grid_reliability: GridReliability;          // NEW
    application_throughput: ApplicationThroughput; // NEW
  };
}
```

All queries fan out via a single `Promise.all`. The GPL block runs five queries in parallel:
`getOutstandingApplications`, `getStationHealth`, `getRecentOutages`, `getGridReliability`, `getApplicationThroughput`.

### 3.2 NEW: Grid Reliability

Computes live from `gpl_outage_cache` × `gpl_feeder_cache`:

| Metric | Formula |
|---|---|
| `outage_count` | row count for the window |
| `customer_hours_lost` | `Σ(customers_affected × duration_minutes) / 60` |
| `saidi_minutes` | `customer_minutes / total_customers_served` |
| `saifi` | `Σ(customers_affected) / total_customers_served` |
| `delta` | `% change` for each metric, MTD vs prior calendar month |

Three queries in parallel: feeder-cache customer totals, MTD outage rows, prior-full-month outage rows. No new tables.

### 3.3 NEW: Application Throughput

Single sweep of `customer_applications` rows for `agency = 'GPL'`. Computes in JS:

- `closed_30d` — rows in `(approved | rejected)` with `updated_at` ≥ 30 days ago
- `submitted_30d` — rows with `submitted_at` ≥ 30 days ago
- `avg_days_to_close` — `Σ(updated_at − submitted_at) / closed_30d` (days)
- `backlog_now` — rows in `(pending | under_review)`
- `backlog_change_30d` — current backlog minus the reconstructed 30-days-ago backlog
- `approval_rate_pct` — `approved_30d / closed_30d × 100`

### 3.4 NEW: Batched summary endpoint

`GET /api/intel/summary` returns counts for all 7 agencies in two queries:

```ts
{ agencies: Array<{
    agency: IntelAgency;
    openTasksCount: number;
    openTasksOverdue: number;
    delayedProjectsCount: number;
}> }
```

`Cache-Control: private, s-maxage=60, stale-while-revalidate=120`. No N+1 — one query for `tasks` IN allowlist, one for `delayed_projects` IN allowlist, bucketed in JS by computed risk tier (HIGH/MEDIUM only).

### 3.5 `lib/agencies.ts` — registry

Added `has` to `INTEL_AGENCY_META` so `/intel/has` resolves through the dynamic route. New `iconName` `'PlaneLanding'` added to the union (registered in `AgencyIntelPage`'s `ICON_BY_NAME` registry).

```ts
has: {
  display: 'HAS',
  subtitle: 'Hinterland Airstrips Service',
  iconName: 'PlaneLanding',
  iconGradient: 'from-orange-500 to-amber-600',
}
```

---

## 4. Frontend — Design Pass

### 4.1 `/intel` — 7-tile picker (`app/intel/page.tsx`)

Editorial header:
- Eyebrow `MINISTRY · INTEL` (gold, tracked, small caps)
- 3xl semibold display name + tagline
- 3-up summary row: **Needs attention** / **Overdue tasks** / **Delayed projects** (computed across all 7 agencies, color-toned)
- Gradient hairline divider

Tile grid (3 cols desktop / 2 tablet / 1 mobile):
- Color **spine** along the left edge — `bg-gradient-to-b ${meta.iconGradient}` — opacity ramps up on hover
- 12×12 gradient icon block with `ring-1 ring-white/10 + shadow-lg`
- Status **dot** next to the agency code (green/amber/red) classified by:
  - `critical` — overdue tasks > 0 OR delayed projects ≥ 5
  - `warn` — delayed projects > 0 OR open tasks ≥ 8
  - `calm` — otherwise
- `ArrowUpRight` micro-affordance translates `(0.5, -0.5)` on hover
- Metrics rail under a hairline (navy-950 wash) — bigger numerals (1.6rem), tracked uppercase labels, contextual hint chips ("4 overdue", "high exposure")
- Card hover: `translateY(-0.5px)` + gold border + `shadow-[0_8px_32px_-8px_rgba(212,175,55,0.18)]`

### 4.2 `/intel/[agency]` — deep-dive header (`components/intel/AgencyIntelPage.tsx`)

- Pill-style "Intel" back chip with arrow + label
- 12×12 gradient icon block (same pattern as picker tiles)
- Eyebrow `AGENCY DEEP DIVE` (gold, tracked)
- 3xl semibold display name + subtitle
- Gradient hairline divider below the header

Card stack uses the existing `CollapsibleSection` primitive (no new visual primitives) with `subtitle` props on the new GPL sections for editorial clarity.

### 4.3 NEW: GPL-only cards

**Grid Reliability** — 4-tile `DeltaTile` grid:
- `Outages`, `Customer-hours lost`, `SAIDI (min)`, `SAIFI`
- Each tile: MTD value (xl tabular numerals), inline `%` delta with up/down arrow, prior-month value as sub-text
- All four metrics are `invert: true` (lower is better) — green = improvement, red = regression
- Footer: "Across N customers served · MTD vs prior calendar month"

**Application Efficiency** — 4-tile `KpiTile` grid:
- `Closed (30d)` with `submitted` sub-text
- `Avg time to close` — colored amber > 30d, red > 60d
- `Backlog change` — red when growing, green when shrinking
- `Approval rate`

Both bodies use a shared `KpiTile`/`DeltaTile` primitive with `text-emerald-400` / `text-red-400` / `text-amber-400` from existing tokens.

---

## 5. The 7-Tile Picker Replaces

The previous `/intel` index used:
- `useAgencyData` hook (mocked + live agency state)
- `StatusBar`, `AlertSection`, `PendingConnectionsCard`
- 4 × `AgencyCard` tiles in a 2-col grid (only GPL/CJIA/GWI/GCAA)
- `SlidePanel` opening dynamic-imported `GPLDetail` / `CJIADetail` / `GWIDetail` / `GCAADetail`
- A "Full Agency Reports" deep-link strip at the bottom

All of that is gone. The new index is a single self-contained client component plus the batched summary endpoint.

---

## 6. Deletions

29 files + 2 directories removed (Step 6 of the strip pass):

**Top-level intel components**
- `components/intel/AgencyCard.tsx`
- `components/intel/StatusBar.tsx`
- `components/intel/AlertSection.tsx`
- `components/intel/PendingConnectionsCard.tsx`
- `components/intel/GPLDetail.tsx`
- `components/intel/CJIADetail.tsx`
- `components/intel/GWIDetail.tsx`
- `components/intel/GCAADetail.tsx`
- `components/intel/GPLExcelUpload.tsx`
- `components/intel/GWIDocUpload.tsx`
- `components/intel/CJIAPassengerChart.tsx`
- `components/intel/DailyExcelUpload.tsx`
- `components/intel/GPLForecastDashboard.tsx`
- `components/intel/GPLKpiUpload.tsx`
- `components/intel/GPLMonthlyKpi.tsx`

**GPL subdir cleanup** (kept: `GPLModule` + its 5 deps used by `app/intel/pending-applications`)
- `components/intel/gpl/AnalysisStep.tsx`
- `components/intel/gpl/PreviewStep.tsx`
- `components/intel/gpl/SubmissionStep.tsx`
- `components/intel/gpl/UploadStep.tsx`
- `components/intel/gpl/GPLSummaryCard.tsx`
- `components/intel/gpl/GPLOverviewTab.tsx`
- `components/intel/gpl/GPLStationsTab.tsx`
- `components/intel/gpl/GPLKpiTab.tsx`
- `components/intel/gpl/GPLForecastTab.tsx`
- `components/intel/gpl/gpl-types.ts`

**Whole subdirectories**
- `components/intel/cjia/` (3 files)
- `components/intel/gwi/` (5 files)

**Hooks**
- `hooks/useAgencyData.ts`
- `hooks/useAgencyHealth.ts`
- `hooks/useGPLData.ts`
- `hooks/useGWIData.ts`

**Doc-comment cleanups (no code change)**
- `lib/agencies.ts` — removed reference to deleted `useAgencyData`
- `lib/gpl/derated.ts` — removed references to deleted `AlertSection` / `useAgencyHealth`

**Verified safe** (false-positive grep matches that were *not* deleted):
- `components/mission-control/MissionControlView.tsx` — uses *local* `LiveAgencyCard` / `BuildingAgencyCard`, not the deleted `AgencyCard`.
- `lib/ai/context-compressor.ts` — has *local* `buildGPLDetail` / `buildCJIADetail` etc. functions, not imports of the deleted React components.
- `components/intel/common/` — used by `PulseScoreCard` outside `/intel`, kept.
- `components/layout/SlidePanel.tsx` — multi-consumer, kept.

---

## 7. Files Added

```
app/api/intel/summary/route.ts                # Batched picker counts
docs/intel-redesign-2026-05-07.md             # This document
audit-screenshots/intel-index-strip/          # Verification screenshots
```

(Plus three migrations applied earlier in the spec — `108_task_watchers.sql`, `109_agency_intel_reports.sql`, `110_agency_head_notification_log.sql` — and the bundle of report-export and watcher pipeline files from the original Composed-Robin pass.)

---

## 8. Files Modified

- `app/intel/page.tsx` — rewritten as the 7-tile picker
- `app/intel/[agency]/page.tsx` — already a thin server route, untouched in this pass
- `components/intel/AgencyIntelPage.tsx` — added Grid Reliability + Application Efficiency cards, polished header, added `KpiTile` / `DeltaTile` primitives
- `lib/intel/get-agency-intel-data.ts` — added `grid_reliability` + `application_throughput` blocks and types
- `lib/agencies.ts` — added HAS entry, added `'PlaneLanding'` to icon union, removed stale doc comment
- `lib/gpl/derated.ts` — pruned stale doc references

---

## 9. Verification

### TypeScript
`npx tsc --noEmit` — clean (only pre-existing `RequestInit`/`AbortSignal` errors in three test files unrelated to this work).

### Playwright
- `/intel` renders all 7 tiles with live counts (e.g. GPL 11 open · 4 overdue · 5 delayed; HAS 2 open · 3 delayed). 0 console errors.
- `/intel/gpl` renders 8 collapsible sections (Open Tasks · Delayed Projects · Critical Procurement · **Grid Reliability** · Pending Service Applications · **Application Efficiency** · Station Availability · Outages). 0 console errors.
- Grid Reliability card shows `67 outages MTD · ↑489% vs prior · 112.26 customer-hours lost · 33.8 SAIDI min · 1.78 SAIFI` — live data, not mocks.
- `/intel/has` renders cleanly via the dynamic route (was previously 404).
- `/` and `/tasks` smoke-tested — 0 console errors.

### Screenshots (in `audit-screenshots/intel-index-strip/`)
- `03-intel-index-final.png` — first-pass picker
- `05-intel-index-redesign.png` — final aesthetic pass with editorial header + spined tiles + status dots
- `06-gpl-collapsed.png` — GPL deep-dive header, all sections collapsed
- `07-gpl-grid-reliability-and-efficiency.png` — Grid Reliability and Application Efficiency cards expanded

---

## 10. Performance Notes

- **No N+1.** Every page-load fan-outs all queries via `Promise.all`. The picker batched endpoint replaces what would have been 7 round-trips with 2.
- **CDN cache.** Both per-agency and summary routes set `s-maxage=60, stale-while-revalidate=120`.
- **Single source of truth.** Page-API and report-API call `getAgencyIntelData()` directly — no internal HTTP self-calls, no double auth, no double cookie hop.
- **PostgREST count + rows in one request.** `getRecentOutages` uses `count: 'exact'` without `head: true`, getting the limited 50-row list and the unconstrained MTD total in a single trip.

---

## 11. Risks & Followups

- `agency_psip_focal_point.agency_head_email` is sparsely populated. Empty rows are gracefully handled (status `'skipped_blank'` written to `agency_head_notification_log`); populating is an operational task, not a code change.
- The session-store/PWA service worker can cache the old client bundle in dev — production deploys bust the SW automatically; in dev, `serviceWorker.unregister()` + `caches.delete()` is the workaround.
- `Record<string, unknown>` casts in `getOpenTasksForAgency` (Supabase typegen would clean this up — out of scope here).
- The `application_throughput` reconstruction of "30-days-ago backlog" approximates from `submitted_at` + `updated_at` rather than from the activity log. If higher fidelity is needed later, swap in a `customer_application_activity_log`-driven query.
