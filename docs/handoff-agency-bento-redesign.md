# Handoff: Agency Bento Redesign

**Branch:** `agency-bento-redesign` (remote: `origin/agency-bento-redesign`)
**Status:** 3 commits ahead of `main`, not deployed, not in any open PR
**Author:** alfonsodearmas-a11y
**Authored:** 2026-05-15 (10 days unmerged as of 2026-05-18)
**Merge base with main:** `853b6e1` (before referrals + NPTAB work landed)

## TL;DR

Aesthetic + structural rework of the agency deep-dive page at `/intel/[agency]`. Three commits, ten files, scoped entirely to `components/intel/bento/*` and `lib/intel/get-agency-intel-data.ts`. No cross-cutting changes, no DB migrations, no API contract changes. A 3-way merge into current `main` is conflict-free (verified with `git merge-tree`).

What ships:

- New agency hero (display title, eyebrow, 3- or 4-cell dynamic meta strip, accent glow).
- Bento row 1 collapses from 4 cards to 3: `Tasks | Projects | Procurement` (Procurement absorbs Tenders-in-Eval).
- GPL Grid Reliability rebuilt with 3 big-stat headlines (SAIDI, SAIFI, customer-hours), 30-day daily outage timeline, top-feeders-by-customer-hours bar list.
- GPL Station Availability becomes a 6-column heatmap of mini-tiles.
- GPL Application Efficiency becomes a vertical pipeline funnel (Survey → Estimation → Designs → Approval → Metering → Execution).
- GWI gains a Pending Applications cell in the hero meta strip.
- Two cards deleted: `TendersInEvalCard.tsx`, `PendingApplicationsCard.tsx`.

## Commits

In chronological order:

### 1. `27959e8` — feat(intel/bento): redesign agency hero + collapse procurement and tenders into one card

- `components/intel/bento/AgencyHero.tsx` (+348 / -…): big gradient agency mark, eyebrow + display title, 4-cell meta strip with toned numbers + pills, accent strip on the Grid Reliability feature card, ambient agency-colored radial glow behind the bento. Meta strip is dynamic — 4 cells when an agency has an agency-specific signal (e.g. GPL grid availability, GWI pending apps), 3 when it doesn't.
- `components/intel/bento/cards/ProcurementCard.tsx` (+140 / -…): now takes `critical` + `evaluation` props (was just `items`), renders critical rows first with red "Critical" chip, in-evaluation rows below.
- `components/intel/bento/cards/TendersInEvalCard.tsx`: **deleted** (75 lines). Folded into ProcurementCard.
- `components/intel/bento/AgencyBento.tsx`: row 1 changes from `Tasks(3) | Projects(3) | Procurement(3) | Tenders(3)` → `Tasks(4) | Projects(4) | Procurement(4)`.
- `components/intel/common/BentoCard.tsx` (+19 / -…): accent strip support.
- `lib/intel/get-agency-intel-data.ts` (+64): GWI pending-applications query via `pending_applications_with_wait` view (50k range cap to skip the PostgREST 1k truncation).

### 2. `6cc349e` — feat(intel/bento): rebuild GPL deep cards to match the design mock

- `components/intel/bento/cards/GridReliabilityCard.tsx` (+296): three big-stat headlines (SAIDI / SAIFI / customer-hours, each with a colored ▲/▼ delta), 30-day daily outage timeline tinted by intensity, top-feeders-by-customer-hours bar list.
- `components/intel/bento/cards/StationAvailabilityCard.tsx` (+154 / -…): 6-column heatmap of square mini-tiles with 3-letter codes + percentage, color-toned by status.
- `components/intel/bento/cards/ApplicationEfficiencyCard.tsx` (+198 / -…): vertical funnel of pipeline stages with bars narrowing through the pipeline + green terminal bar, throughput/backlog footer.
- `lib/intel/get-agency-intel-data.ts` (+208): two new helpers and exported types.
  - `getOutageAggregates()` → `OutageAggregates` (daily series + top-5 feeders by customer-hours-lost, aggregated from `gpl_outage_cache`).
  - `getApplicationPipelineForGPL()` → `ApplicationPipelineStage[]` (buckets open applications by `pipeline_stage` in canonical progression order).
  - Both fan out alongside the existing GPL helpers in a single `Promise.all`.

### 3. `d905851` — fix(intel/bento): split SAIDI/SAIFI units off the big numeric and drop the redundant pending-apps card

- `components/intel/bento/cards/GridReliabilityCard.tsx`: `BigStat` now takes `value` + short `unit` separately (value renders 40px tabular, unit renders 13px muted). Fixes the visual collision where `formatSaidi` output ("56.9 min/customer") overran the 1/3-column track.
- `components/intel/bento/cards/PendingApplicationsCard.tsx`: **deleted** (90 lines). Vestigial — the new Application Efficiency funnel covers the same ground.
- `components/intel/bento/AgencyBento.tsx`: row 4 settles into a 50/50 split — `ApplicationEfficiency(6) | StationAvailability(6)`.

## File-level changes (scoped to 10 files)

```
components/intel/bento/AgencyBento.tsx                       |  61 +/-      modified
components/intel/bento/AgencyHero.tsx                        | 348 +/-      heavy rewrite
components/intel/bento/cards/ApplicationEfficiencyCard.tsx   | 198 +/-      rewrite
components/intel/bento/cards/GridReliabilityCard.tsx         | 313 +/-      rewrite
components/intel/bento/cards/PendingApplicationsCard.tsx     |  90 -        DELETED
components/intel/bento/cards/ProcurementCard.tsx             | 140 +/-      heavy rewrite (new prop shape)
components/intel/bento/cards/StationAvailabilityCard.tsx     | 154 +/-      rewrite
components/intel/bento/cards/TendersInEvalCard.tsx           |  75 -        DELETED
components/intel/common/BentoCard.tsx                        |  19 +/-      additive (accent strip)
lib/intel/get-agency-intel-data.ts                           | 272 +/-      additive (new helpers + types)
```

Nothing outside this list is touched by the redesign. No API routes, no migrations, no auth, no sidebar.

## Layout diff

**Before (main):**

```
xl 12-col grid:
  Row 1:  Tasks (3)  |  Projects (3)  |  Procurement (3)  |  Tenders (3)
  Row 2:  GridReliability (8, 2 rows)  |  Outages (4, 2 rows)
  Row 3:  (cont)                        |  (cont)
  Row 4:  PendingApps (3)  |  AppEfficiency (3)  |  StationAvailability (6)
```

**After (redesign):**

```
xl 12-col grid:
  Row 1:  Tasks (4)  |  Projects (4)  |  Procurement (4)   ← critical + in-eval merged
  Row 2:  GridReliability (8, 2 rows)  |  Outages (4, 2 rows)
  Row 3:  (cont)                        |  (cont)
  Row 4:  AppEfficiency (6)  |  StationAvailability (6)
```

HAS variant is unchanged in shape — still replaces GPL row-2/3 with `AirstripOperationsCard`. Row 1 narrows to the three common cells.

## API / data layer additions

In `lib/intel/get-agency-intel-data.ts`:

- New exported types: `OutageAggregates`, `PendingApplicationsMeta`, `ApplicationPipelineStage`.
- New queries (parallelized into the existing GPL `Promise.all`):
  - 30-day outage aggregation from `gpl_outage_cache` → daily series + top-5 feeders by customer-hours-lost.
  - Application pipeline bucketing by `pipeline_stage` in canonical order.
  - GWI pending-applications meta from `pending_applications_with_wait` view (uses `.range(0, 49999)` to skip PostgREST's 1k default cap — same pattern as `/intel/pending-applications`).

No new tables. No new env vars. No new migrations.

## Visual changes (for QA)

- Agency deep-dive hero: big gradient agency monogram on the left, eyebrow ("Agency") + display title, 3- or 4-cell meta strip below with hairline dividers. Ambient radial glow keyed to `agencyAccent(slug)` sits behind the grid.
- GPL meta strip cells: open tasks, delayed projects, in-evaluation tenders, grid availability.
- GWI meta strip cells: open tasks, delayed projects, in-evaluation tenders, pending applications.
- Agencies without an agency-specific signal (CJIA, GCAA, etc.) show a 3-cell strip.
- Procurement card: red "Critical" chip on critical tender rows, no chip on in-evaluation rows.
- Grid Reliability: big-stat row (value + small unit), 30-day timeline strip below tinted by daily customer-hours-lost intensity, top-5 feeders list at the bottom.
- Station Availability: 6×N grid of square tiles, each with 3-letter station code + availability percent, color-toned by status threshold.
- Application Efficiency: vertical funnel — Survey → Estimation → Designs → Approval → Metering → Execution. Bars narrow stage-by-stage; terminal bar (Execution) is green. Footer shows throughput and backlog delta.

## Shipping path

The branch is behind `main` by the post-`853b6e1` work (`feature/referrals-r2-and-nptab` merge, ministerial referrals, SlidePanel portal fix). Because the redesign commits only touch `components/intel/bento/*` and `lib/intel/get-agency-intel-data.ts`, the merge is textually clean.

**Recommended:** rebase, then PR.

```sh
git fetch origin
git checkout agency-bento-redesign
git rebase origin/main
# resolve any unexpected conflicts (none expected — verified via merge-tree)
git push --force-with-lease origin agency-bento-redesign
gh pr create --base main --head agency-bento-redesign --title "Agency Intel: bento redesign (hero + GPL deep cards)"
```

**Alternative:** direct merge PR without rebase. Same result, messier history.

## Risks / gotchas

1. **`ProcurementCard` prop shape changed.** Was `{ items, href, accent, className }`. Now `{ critical, evaluation, href, accent, className }`. Only consumer is `AgencyBento.tsx` (changed in same commit), but grep before merging in case any other surface picked it up:
   ```sh
   grep -rn "from .*bento/cards/ProcurementCard" components/ app/ lib/
   ```
2. **Two deleted files.** `TendersInEvalCard.tsx` and `PendingApplicationsCard.tsx`. Same grep applies — no other surfaces should import these. (Pre-merge check verified only `AgencyBento.tsx` imports them on main.)
3. **GWI pending-applications query** in the hero meta strip uses `.range(0, 49999)` against `pending_applications_with_wait`. This view exists and was used by `/intel/pending-applications` (commits `a53f368`, `6442f9b`). Verify the view still exists and the row count hasn't exceeded 50k.
4. **Outage timeline depends on `gpl_outage_cache`.** Confirm freshness — if the cache hasn't been updated in 30 days the timeline will be sparse. This isn't a regression (the existing `OutagesCard` already depends on it), but the new timeline visualization will make staleness more visible.
5. **HAS variant unchanged.** If the design mock implied HAS-specific bento changes, they aren't on this branch. HAS still renders `AirstripOperationsCard` as before.
6. **No tests added.** None of the three commits touch `tests/`. The data-layer additions (`getOutageAggregates`, `getApplicationPipelineForGPL`) are uncovered. Consider adding fixtures before merge if pipeline-stage canonicalization is brittle.

## Verification checklist (post-merge)

- [ ] `/intel/gpl` renders the new bento layout without console errors.
- [ ] `/intel/gwi`, `/intel/cjia`, `/intel/gcaa` render the new hero + 3-card row 1 (no GPL-specific rows).
- [ ] `/intel/has` still renders `AirstripOperationsCard` correctly.
- [ ] Procurement card shows critical tenders first with red chip, then in-evaluation rows.
- [ ] GPL Grid Reliability big-stats render with separate value + unit (no string overrun).
- [ ] Station Availability heatmap renders all stations with codes + percentages.
- [ ] Application Efficiency funnel renders all 6 stages, terminal bar green, throughput/backlog footer populated.
- [ ] GWI hero meta strip shows the Pending Applications cell with a non-zero count.
- [ ] No 500s in the network panel from `/intel/[agency]` server component fetches.
- [ ] Methodology link from Grid Reliability still routes to `/intel/gpl/methodology`.

## Source of truth

- Diff: `git log origin/main..origin/agency-bento-redesign`
- Cards: `components/intel/bento/cards/` on `agency-bento-redesign`
- Data helpers: `lib/intel/get-agency-intel-data.ts` on `agency-bento-redesign`
- Prior intel redesign (already shipped, for context): `docs/intel-redesign-2026-05-07.md`
