# Mission Control Upgrade Plan

> **Source of truth.** All execution decisions for this work must reference this file.
> Future sessions: if you're picking up implementation, read this end-to-end first, then
> follow the Execution Plan at the bottom.

## TL;DR — the two changes

1. **Greeting:** replace `Good morning, {firstName}` with a static `Hello, {firstName}`.
   Keep the date subtitle and the "X items need your attention" line untouched.
2. **Group attention items by type:** wrap each kind of signal in a collapsible card with
   a header (group name + count badge) and a chevron, using the existing
   `CollapsibleSection` primitive. Sort order *inside* each group is preserved.

## What's actually under the hood (one important note up front)

The user calls this the "Mission Control page". The literal landing route at `/`
(`app/page.tsx`) renders **`TodayView`** (`components/today/TodayView.tsx`), not the
orphaned `MissionControlView` that exists at `components/mission-control/MissionControlView.tsx`.
`MissionControlView` is **not imported anywhere** — confirmed via grep. All edits in this
plan target `TodayView` and the `lib/today/*` orchestrator that feeds it. The orphan
component is out of scope; flagging it so a future cleanup can delete it.

There is also **no existing time-of-day logic to remove.** `TodayView.tsx:37` already
hardcodes the literal string `"Good morning, "`. Change 1 is therefore a one-line string
edit, not a refactor.

---

## File-by-file changes

### 1. `components/today/TodayView.tsx` — primary edit

- **Greeting line (line 37).** Change `` `Good morning, ${firstName}` `` to
  `` `Hello, ${firstName}` ``. Fallback when `firstName` is null currently shows
  "Today" — leaving that alone (keeps the empty-name case sensible).
- **Replace flat `signals.map(...)` block (lines 64–70).** Group `signals` by
  `signal.kind` into the 5 themes listed below, then render one
  `CollapsibleSection` per non-empty group. Inside each section, render the
  existing `TodaySignalCard` rows — preserves deep-link `href`s, severity pills,
  and the existing per-card layout untouched.
- Move `groupSignals(signals)` and `KIND_ORDER` to a sibling module (see file 2)
  so they can be unit-tested without rendering React.
- Wire per-group open/closed state to `useLocalStorage` (see file 3) keyed
  `today.group.<kind>.open`. First-load default: only the top group (index 0,
  i.e. `tender_sla` after the new ordering) is open.
- Compute the **rollup-aware count** for each group's badge:
  `items.reduce((sum, s) => sum + (s.rollupCount ?? 1), 0)`. This applies to
  every group; for non-rollup kinds the sum is just `items.length`. See file 4
  for the type/field addition.

### 2. `components/today/grouping.ts` — **new file**

Pure module exporting `KIND_ORDER` and `groupSignals(signals: TodaySignal[]):
GroupedSignal[]`. No React, no DOM. Lets the test in §"Tests" import it
directly. `GroupedSignal` shape:
`{ key: TodaySignalKind; label: string; icon: LucideIcon; items: TodaySignal[]; rollupAwareCount: number }`.

Note: `stagnant_tender` and `agency_stagnant_rollup` both fold into the
`'stagnant_tender'` group key (chosen as the canonical key because it's the
non-rollup variant). `KIND_ORDER` lists 5 group keys, not 6.

### 3. `hooks/useLocalStorage.ts` — **new file** (no existing hook)

Verified absent: grep for `useLocalStorage` across `lib/`, `hooks/`,
`components/` returned zero hits. Add a minimal generic hook:
`useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void]`. SSR-safe
(reads in `useEffect`, falls back to `initial` on the server to avoid hydration
mismatch). Swallows JSON parse errors and quota errors silently — the page must
still render if storage is unavailable.

### 4. `lib/today/types.ts` — additive type change

Add `rollupCount?: number` to the `TodaySignal` interface. Optional, so all
existing producers compile unchanged. Documented as: "Number of underlying
records this signal represents. Set on rollup kinds (`agency_stagnant_rollup`,
`incomplete_psip_data`); omitted otherwise (treat as 1)."

### 5. `lib/today/signals.ts` — populate `rollupCount` on rollup builders

- `fetchStagnantTenderSignals`: in the `for (const a of rolledUpAgencies)` loop
  (~line 368), set `rollupCount: count` on the emitted signal.
- `fetchIncompletePsipDataSignals`: in the `for (const [a, agencyRows] of byAgency)`
  loop (~line 460), set `rollupCount: count` on the emitted signal.
- Individual `stagnant_tender` and all other kinds: leave `rollupCount` unset.
  The grouping consumer uses `?? 1`.

### 6. `components/ui/CollapsibleSection.tsx` — **reuse, no edit**

Already supports `title`, `subtitle`, optional `badge` (with a `variant`),
optional `icon` (Lucide), `defaultOpen`, and accepts arbitrary `children`. Animates
via the existing `.collapse-grid` CSS in `app/globals.css:763`. Matches the dark
navy aesthetic (`border-navy-800`, `bg-navy-900/50`). **Don't build a new
primitive.** This one already exists, is dark-themed, and is used in 6+ places
across the intel pages.

The only nit: it doesn't render a count badge in a kind-themed color. We get
close enough using `Badge variant="default"` for the count and an `icon` whose
color we can tint via Lucide's `color` prop. Acceptable; matches the rest of the
app.

### 7. `app/page.tsx` — no change

Just renders `<TodayView ... />`. No work here.

### 8. `lib/today/signals.ts` (sort/fetch behavior) — no change

Sort order, fetch logic, severity, and the 50-item global cap stay exactly as-is.
The only edit is the additive `rollupCount` field assignment described in §5
above. `KIND_RANK` (severity tiebreak inside `getTodaySignals`) is unrelated to
the new visual group order and should not be touched.

### 9. Tests — one new test in `lib/today/__tests__/grouping.test.ts`

Per change #4: a single test file with three assertions max, importing
`groupSignals` and `KIND_ORDER` from `components/today/grouping.ts`. Asserts:

1. `groupSignals` returns groups in `KIND_ORDER` (filtering out empty groups
   does not reorder the remainder).
2. A signal with `kind: 'stagnant_tender'` and a signal with
   `kind: 'agency_stagnant_rollup'` land in the **same** returned group
   (key === `'stagnant_tender'`).
3. `rollupAwareCount` for that combined group equals
   `Σ (signal.rollupCount ?? 1)` — uses `rollupCount` for the rollup item, 1
   for the individual item.

File location: `lib/today/__tests__/grouping.test.ts` (sits next to existing
`severity.test.ts` / `signals.test.ts`, follows the same test runner config).

---

## Group categories — the exact set, derived from the data

`TodaySignalKind` (from `lib/today/types.ts`) has 6 values, but two of them
(`stagnant_tender` and `agency_stagnant_rollup`) already share a pill label
("STAGNANT") and color (`--kind-stagnant`) in `TodaySignalCard.tsx`. Folding them
into one visual group matches what the user already sees on each card and is the
right cut. **Five groups, in this order:**

| # | Group title              | Kinds folded in                                  | Pill color (from globals.css) | Lucide icon |
|---|--------------------------|--------------------------------------------------|-------------------------------|-------------|
| 1 | **Tender SLA Breaches**  | `tender_sla`                                     | `--kind-tender` (`#d4af37`)   | `Clock`     |
| 2 | **Delayed Projects**     | `delayed_project`                                | `--kind-project` (`#4a82f5`)  | `AlertTriangle` |
| 3 | **Stagnant Tenders**     | `stagnant_tender`, `agency_stagnant_rollup`      | `--kind-stagnant` (`#a25ddc`) | `Pause`     |
| 4 | **Incomplete PSIP Data** | `incomplete_psip_data`                           | `--kind-missing` (`#e8835a`)  | `FileWarning` |
| 5 | **Meeting Actions**      | `meeting_action`                                 | `--kind-action` (`#00cec9`)   | `CheckSquare` |

**Order rationale (updated per user direction):** Tender SLA breaches lead
because they carry legal exposure (procurement statutes), then delayed
projects, then the slower-burn signals.

`KIND_ORDER` constant in `components/today/grouping.ts`:
```ts
export const KIND_ORDER = [
  'tender_sla',
  'delayed_project',
  'stagnant_tender',      // also bucket for agency_stagnant_rollup
  'incomplete_psip_data',
  'meeting_action',
] as const;
```

Counts per group are **not knowable at write-time** — they depend on the live
signal payload (which itself is bounded by the per-source `FETCH_LIMIT = 50`
plus a global slice of 50 in `getTodaySignals`). The count badge reads
`rollupAwareCount` (sum of `signal.rollupCount ?? 1` across the group's items),
**not** `items.length`. For groups with no rollup-kind signals, the two are
equal; for "Stagnant Tenders" and "Incomplete PSIP Data" they can differ.

Empty groups are not rendered (no card at all — see "Edge cases" below).

---

## Expand/collapse behavior — localStorage-backed (per user direction)

**Rule:** each group's open/closed state is persisted in localStorage under a
per-group key, `today.group.<kind>.open`, where `<kind>` is the canonical
group key (one of the five entries in `KIND_ORDER`).

**First-load default** (when no localStorage value is present): only the group
at `KIND_ORDER[0]` — i.e. **Tender SLA Breaches** — is open. All other groups
are collapsed.

**On subsequent loads:** each group reads its own key and falls back to the
first-load default if absent. State persists across page reloads, but is
per-browser, not per-user-account (acceptable for v1).

**Implementation note:** the `useLocalStorage` hook (file 3) returns
`[value, setValue]` and is SSR-safe — it returns the `initial` value on the
server pass and reads localStorage in `useEffect` to avoid hydration
mismatch. Each `CollapsibleSection` instance receives `defaultOpen` from the
hook's current value, and the user's click handler persists via
`setValue`. (We control open state by passing a `key` prop to remount
`CollapsibleSection` when the persisted value changes, OR — cleaner — we
extend `CollapsibleSection` to accept a controlled `open`/`onOpenChange`.
**Decision: use the remount approach** to avoid editing the shared primitive.
If that proves janky, fall back to extending the primitive in a tiny patch.)

---

## Risks & things that might break

1. **Within-group sort order.** The flat list is sorted by
   `severity → ageDays → kind`. After grouping, ordering across groups is no
   longer continuous (a critical Meeting Action will render below a medium
   Delayed Project simply because Projects comes first). **This is acceptable**
   — the user explicitly asked to group by type, and group order is itself a
   priority hint (Delayed Projects > Tenders > Meetings reflects ministerial
   importance). But worth flagging so it's not surprising.
2. **Header counts.** `counts.total` in the payload header ("X items need your
   attention") is a sum across all kinds. Still correct after grouping. No
   change needed there.
3. **Deep links / URL params.** Each `TodaySignalCard` uses `signal.href`
   directly. Grouping wraps them but doesn't change the link target. Unaffected.
4. **Partial-data banner.** The "Could not load X" banner above the list is
   independent of grouping and stays where it is.
5. **Notification badges (sidebar / pulse).** Unrelated; this page does not
   feed those counters. Sidebar attention pip reads from a different source.
6. **`MissionControlView.tsx` orphan.** Not edited here. Harmless but stale —
   recommend deleting in a separate cleanup PR.
7. **E2E selectors.** No tests reference the page's DOM (verified). If
   Playwright scripts under `audit-screenshots/` re-run, screenshots will diff
   visually — expected.
8. **iOS Safari `<details>` quirk.** N/A — `CollapsibleSection` uses a
   `useState` + CSS grid animation, not the native `<details>` element.

---

## Things you might be wrong about — pushback

You asked me to push back if grouping by type is the wrong axis. **I think
type is correct, but let me give you the case I considered against it so
you can re-decide:**

- **Group by severity (Critical / High / Medium).** Pro: matches how a triaging
  exec actually reads the page — "show me critical first, I'll deal with the
  rest later." Con: severity is already the *primary sort key* of the flat
  list, and the existing severity pill on each card already conveys it
  visually. Grouping by severity would be redundant with sort, and it would
  hide the "what kind of issue" cut you actually want to see at a glance.
- **Group by agency.** Pro: ministry users see 7 agencies; an agency-first cut
  matches how PS-level oversight actually thinks. Con: only useful for
  ministry roles. Agency-scoped users (`agency_admin`, `officer`) would see a
  single group, which defeats the purpose. And `meeting_action` rows have
  `agency: null` (meetings table is ministry-wide), so they'd land in a
  catch-all bucket.
- **Hybrid: type at top level, severity-sorted inside.** This is what the plan
  already does — within each group, the existing severity-first sort still
  applies. So you get both axes for free.

**Verdict:** stay with type. But if after using it you find you're scanning
for "what's critical right now" more than "what tenders are stuck," I'd
revisit and add a tab or toggle for severity view.

**Resolved (per user change #3):** the rollup-aware count is now the badge
value. `signal.rollupCount` is added as an optional field on `TodaySignal`
(field name verified in `lib/today/types.ts`/`signals.ts` — was *not* present;
added in this plan). Both rollup builders (`agency_stagnant_rollup` and
`incomplete_psip_data`) populate it; everything else leaves it undefined and
the consumer treats undefined as 1.

---

## Execution Plan

Ordered checklist. Per **MISSION_CONTROL_UPGRADE_PLAN.md** §"File-by-file changes"
and §"Group categories", do the following. Re-read this document before starting
if picked up in a future session.

- [ ] **Step 1 — Greeting.** Per MISSION_CONTROL_UPGRADE_PLAN.md §1, edit
      `components/today/TodayView.tsx:37`: change the literal string
      `"Good morning, "` to `"Hello, "`. Leave the `firstName ? ... : 'Today'`
      ternary intact.
- [ ] **Step 2 — Add `rollupCount` to type + producers.** Per
      MISSION_CONTROL_UPGRADE_PLAN.md §4 and §5: add optional
      `rollupCount?: number` to `TodaySignal` in `lib/today/types.ts`. Then in
      `lib/today/signals.ts`, set `rollupCount: count` on the rollup signal
      emitted by `fetchStagnantTenderSignals` (~line 372–386) and on the
      rollup signal emitted by `fetchIncompletePsipDataSignals` (~line 468–481).
- [ ] **Step 3 — Add `useLocalStorage` hook.** Per
      MISSION_CONTROL_UPGRADE_PLAN.md §3, create `hooks/useLocalStorage.ts` —
      generic, SSR-safe, swallows JSON/quota errors.
- [ ] **Step 4 — Add `components/today/grouping.ts`.** Per
      MISSION_CONTROL_UPGRADE_PLAN.md §2: export `KIND_ORDER` (the 5-entry
      tuple in the new order) and `groupSignals(signals)` returning
      `{ key, label, icon, items, rollupAwareCount }[]` filtered to non-empty
      groups, in `KIND_ORDER` sequence. Folds `agency_stagnant_rollup` into
      the `'stagnant_tender'` bucket.
- [ ] **Step 5 — Add the test.** Per MISSION_CONTROL_UPGRADE_PLAN.md §9, create
      `lib/today/__tests__/grouping.test.ts` with the three assertions
      specified there. Run it locally to confirm green.
- [ ] **Step 6 — Wire grouped render in `TodayView.tsx`.** Per
      MISSION_CONTROL_UPGRADE_PLAN.md §1: swap the `signals.map(...)` block
      for `groups.map(...)`. Each group renders a `CollapsibleSection` with
      `title=label`, `icon`, `badge={{ text: String(rollupAwareCount) }}`,
      and `defaultOpen` driven by `useLocalStorage('today.group.${key}.open',
      i === 0)` — only `KIND_ORDER[0]` (Tender SLA Breaches) defaults open.
      Use the remount-on-key-change pattern documented in
      §"Expand/collapse behavior". Empty-state branch (when
      `signals.length === 0`) is unchanged.
- [ ] **Step 7 — Manual smoke test (REPORT BACK BEFORE STEP 8).** Start the
      dev server, sign in as ministry role and as an agency role, confirm:
      (a) header reads `Hello, Alfonso`,
      (b) groups appear in the order Tender SLA Breaches → Delayed Projects
          → Stagnant Tenders → Incomplete PSIP → Meeting Actions,
      (c) on first load, only the top group (Tender SLA Breaches) is open;
          collapsing/expanding any group and reloading preserves state per
          group,
      (d) the "Stagnant Tenders" badge sums underlying tender counts when a
          rollup is present (verify by counting visible cards vs. badge
          number — they should differ when a rollup is in play; the badge
          should be larger),
      (e) clicking a card still deep-links correctly,
      (f) the partial-data error banner still renders when a source fails.
      Per CLAUDE.md, this is a UI change so a browser pass is required.
      **Stop here and report findings before proceeding.**
- [ ] **Step 8 — Lint + typecheck.** Run the project's lint and typecheck
      commands before declaring done.
- [ ] **Step 9 — (optional, not blocking) Flag orphan.** Note in the PR
      description that `components/mission-control/MissionControlView.tsx`
      is unused and a candidate for deletion in a follow-up.
