# Prompt 3: Page Shell, Navigation + Wiring (run LAST, after all parallel prompts)

> Reference: `00-SHARED-CONTEXT.md` for design system and constraints.
> Depends on: ALL previous prompts (1, 2a-2e) being complete.

## Objective
Wire everything together: the page shell with tab navigation, the compact dashboard card, sidebar entry, and all cross-component interactions (feeder drawer, tab switching, date range passing).

## Scope — only these files:
```
app/pulse/gpl/grid-health/page.tsx          → new (main page)
app/pulse/gpl/grid-health/layout.tsx        → new if needed
Sidebar/navigation component                → modify (add Grid Health link)
Main DG dashboard page                      → modify (add CompactGridCard)
```

## Page: `/pulse/gpl/grid-health`

### Page Header
- Title: "GPL Grid Health" (DM Serif Display, gold)
- Subtitle: "Feeder performance, outage patterns, and live grid status"
- Right side: "Sync Now" button with loading spinner + "Last synced X min ago" text
- Sync button calls `POST /api/pulse/gpl/sync` and refreshes all tab data on success

### Tab Navigation
Three tabs below the header:
- **Feeders** — imports and renders `FeederHealthTable` from Prompt 2b
- **Monthly** — imports and renders `MonthlyPerformance` from Prompt 2c
- **Today** — imports and renders `TodayGrid` from Prompt 2d

Tab pills styled to match DG Work OS design: active tab = gold background with dark text, inactive = transparent with muted text, 6px border-radius.

Use URL search params to control active tab (`?tab=feeders|monthly|today`) so direct links and browser back work.

### State Wiring

**Feeder drawer (from Prompt 2e):**
The page manages the drawer state:
```tsx
const [selectedFeederId, setSelectedFeederId] = useState<number | null>(null);
const drawerOpen = selectedFeederId !== null;
```

Pass `onFeederSelect={setSelectedFeederId}` to all three tab components:
- FeederHealthTable: row click -> opens drawer
- MonthlyPerformance: offender pill click -> opens drawer
- TodayGrid: grade badge click -> opens drawer

Render `<FeederDetailDrawer feederId={selectedFeederId} isOpen={drawerOpen} onClose={() => setSelectedFeederId(null)} />` at the page level.

**Monthly -> Today navigation:**
MonthlyPerformance's `onNavigateToday` prop:
```tsx
const handleNavigateToday = (dateRange: { from: string; to: string }) => {
  setActiveTab('today');
  setTodayDateRange(dateRange);
};
```
Pass `dateRange` to TodayGrid so it fetches the selected month instead of today.

**Monthly -> Feeders filter:**
When clicking a substation row in the monthly detail panel, switch to Feeders tab with that substation pre-selected:
```tsx
const handleSubstationFilter = (substationCode: string) => {
  setActiveTab('feeders');
  setFeederSubstationFilter(substationCode);
};
```

### Grid Overview Cards (above tabs)
A row of 5 metric cards (same as the feeder health mockup), fetched from `/api/pulse/gpl/score`:
- Active outages (red if > 0)
- Customers at risk
- 30-day outage count
- Avg restoration time
- Repeat offenders (feeders with 3+ outages in 30d)

These persist across all tabs.

### Auto-sync on load
On page mount:
1. Check cache staleness via a lightweight API call
2. If stale (> 15 min), trigger sync in background
3. Show a subtle "Syncing..." indicator during sync
4. Refresh all data after sync completes

## Sidebar Navigation

Find the existing sidebar component. Add a new entry:
- Label: "Grid Health"
- Icon: a lightning bolt or grid icon (match existing icon style)
- Position: under the Pulse section
- Route: `/pulse/gpl/grid-health`
- Active state: highlight when on the grid health page

## Compact Dashboard Card

On the main DG Work OS dashboard (the home/overview page), add the `CompactGridCard` from Prompt 2d:
- Position: in the agency overview section, near the GPL Pulse score
- Shows: red/green dot + active count + today count + mini timeline
- "View grid health ->" link navigates to `/pulse/gpl/grid-health?tab=today`

## Back Navigation
- The grid health page header should have a back link/breadcrumb: "Pulse > GPL Grid Health"
- Clicking "Pulse" navigates back to the Pulse dashboard

## Final Checks
After wiring, verify:
1. Clicking a feeder row in the table opens the drawer with correct data
2. Clicking a feeder pill in monthly opens the drawer
3. Clicking a grade badge in today's timeline opens the drawer
4. "View all outages for January" in monthly switches to Today tab with Jan date range
5. Clicking a substation in monthly switches to Feeders tab filtered
6. Sync button works and refreshes all visible data
7. Tab state persists in URL (back button works)
8. Compact card on main dashboard shows live data

## Design
- Page background: transparent (inherits from layout)
- Tab bar: 10px gap between pills, 6px border-radius
- Metric cards row: 10px gap, same style as other DG Work OS dashboard cards
- All transitions: 200ms ease for tab switches, drawer open/close
- Loading states: skeleton shimmer matching dark theme

## Do NOT:
- Modify the individual component internals (2a-2e handle those)
- Modify sync/scoring logic (Prompt 1)
- Add new API routes (all routes were created in previous prompts)
