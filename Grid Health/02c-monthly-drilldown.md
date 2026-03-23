# Prompt 2c: Monthly Performance Drill-Down (PARALLEL — run after Prompt 1)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.
> Depends on: `lib/gpl/types.ts`, `lib/gpl/config.ts`, `lib/gpl/scoring.ts` from Prompt 1.

## Objective
Build the API route and UI component for monthly outage performance cards with expandable drill-down panels showing substation/cause breakdowns and month-over-month comparisons.

## Scope — only these files:
```
app/api/pulse/gpl/monthly/route.ts          → new
app/pulse/gpl/grid-health/components/MonthlyPerformance.tsx → new
```

## API Route: `GET /api/pulse/gpl/monthly`

Query `gpl_outage_cache`. Aggregate by month. Return:

```json
{
  "months": [
    {
      "month": "2026-01",
      "label": "January 2026",
      "outage_count": 37,
      "avg_duration_minutes": 12,
      "total_ens_mwh": 98.4,
      "total_customers_affected": 142800,
      "has_long_outage": false,
      "vs_previous": {
        "outage_count_delta_pct": -24,
        "avg_duration_delta_pct": -68,
        "ens_delta_pct": -31
      },
      "by_substation": [
        { "code": "COLUMBIA", "name": "Columbia Substation", "count": 9 },
        { "code": "G/GROVE", "name": "Grove Substation", "count": 7 }
      ],
      "by_cause": [
        { "subcategory": "Earth Fault", "count": 21, "pct": 57 },
        { "subcategory": "Overcurrent", "count": 9, "pct": 24 }
      ],
      "worst_feeders": [
        { "feeder_code": "B1F1", "substation_code": "COLUMBIA", "display": "COLUMBIA/B1F1", "count": 4, "customer_count": 8861 },
        { "feeder_code": "B1F2", "substation_code": "G/GROVE", "display": "G/GROVE/B1F2", "count": 3, "customer_count": 8789 }
      ]
    }
  ]
}
```

Query params:
- `from=2025-12` (default: 4 months ago)
- `to=2026-03` (default: current month)

## Component: `MonthlyPerformance.tsx`

A client component rendered as a tab panel. Self-contained, fetches own data.

**Export:** `export default function MonthlyPerformance({ onFeederSelect, onNavigateToday })`

Props:
- `onFeederSelect(feederId)` - opens feeder drawer (wired by Prompt 3)
- `onNavigateToday(dateRange)` - switches to Today tab filtered to a month (wired by Prompt 3)

### Month Card Grid
Display one card per month in a responsive grid (4 columns on desktop, 2 on mobile).

Each card:
- Month/year label (top left, 11px muted)
- Outage count (large 24px number, center)
- "outages" label below
- Avg restoration + ENS (bottom row, 11px)
- MoM delta with arrow (green down = improving, red up = worsening). First month shows no delta.
- Red dot indicator if `has_long_outage` (any outage > 120 min)
- Thin bottom bar: color intensity proportional to count vs others in range
- Clickable: toggles detail panel

Highlight the current (in-progress) month card with a different border or "(in progress)" label.

### Detail Panel (expands below card grid on click)

Two-column layout inside a glassmorphism card:

**Left column: By substation**
- Ranked list, each row: substation name + count + proportional horizontal bar
- Color: red for #1, amber for #2, neutral for rest
- Each row clickable (calls `onFeederSelect` filtered later by Prompt 3)

**Right column top: By cause**
- Ranked list with color-coded dots
- Earth Fault = #EF9F27, Overcurrent = #D85A30, Planned = #5DCAA5, Other = #888780
- Count + percentage

**Right column bottom: vs previous month**
- Comparison stats: outages, avg restoration, ENS, worst feeder
- Green/red coloring for improving/worsening

**Bottom: Offender feeder pills**
- Horizontal wrapping row of clickable pills
- Each: feeder name + trip count + customer count
- Red background for 3+ trips, amber for 2
- onClick: `onFeederSelect(feederId)`

**Footer:** "View all N outages for [Month] ->" link -> `onNavigateToday({ from, to })`

### State management
- Track which month card is expanded (only one at a time, or collapse on re-click)
- Animate expand/collapse with height transition

## Design
- Cards: dark navy (#0a1628), subtle border, 10px border-radius
- Detail panel: slightly different shade, gold-tinted top border
- Bars in substation ranking: use proportional width, max = 60px
- All text: Outfit font, standard sizes (11px labels, 13px body, 24px hero numbers)

## Do NOT:
- Build the page shell or tabs (Prompt 3)
- Build the feeder drawer (Prompt 2e)
- Build Today's grid (Prompt 2d)
- Modify sync/scoring logic (Prompt 1)
