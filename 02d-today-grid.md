# Prompt 2d: Today's Grid Timeline (PARALLEL — run after Prompt 1)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.
> Depends on: `lib/gpl/types.ts`, `lib/gpl/config.ts`, `lib/gpl/scoring.ts` from Prompt 1.

## Objective
Build the API route and UI component for the live outage timeline: today's events in reverse chronological order with click-to-expand drill-downs showing fault detail and feeder health context.

## Scope — only these files:
```
app/api/pulse/gpl/today/route.ts            → new
app/pulse/gpl/grid-health/components/TodayGrid.tsx → new
```

## API Route: `GET /api/pulse/gpl/today`

Query `gpl_outage_cache` for the specified date range. Enrich each outage with feeder health context (grade, 30d count, trend) by running `scoring.ts` per feeder.

```json
{
  "date": "2026-03-23",
  "summary": {
    "active": 2,
    "restored": 9,
    "total": 11,
    "total_customers_affected": 48230,
    "total_duration_minutes": 87
  },
  "outages": [
    {
      "id": 220,
      "feeder_code": "B1F2",
      "substation_code": "ONVERWAGT",
      "feeder_name": "ONVERWAGT B1F2",
      "substation_name": "Onverwagt Substation",
      "date": "2026-03-23",
      "time_out": "11:50:00",
      "time_in": null,
      "duration_minutes": null,
      "customers_affected": 3865,
      "mw_lost": null,
      "ens_mwh": null,
      "cause_subcategory": "Overcurrent",
      "cause_detail": "A-phase 10.93Amps, B-phase 21.25Amps, C-phase 6.938Amps",
      "areas_affected": "Onverwagt area",
      "status": "open",
      "feeder_health": {
        "grade": "D",
        "score": 42,
        "outages_30d": 3,
        "avg_duration_30d": 12,
        "trend": "worsening"
      }
    }
  ]
}
```

Query params:
- `date=2026-03-23` (defaults to today)
- `range=week` (optional: "today", "yesterday", "week", or custom via `from` and `to` ISO dates)

Sort: active outages first (by time_out desc), then closed outages by time_out desc.

## Component: `TodayGrid.tsx`

A client component rendered as a tab panel. Self-contained, fetches own data.

**Export:** `export default function TodayGrid({ onFeederSelect, dateRange? })`

Props:
- `onFeederSelect(feederId)` - opens feeder drawer (wired by Prompt 3)
- `dateRange?` - optional override (used when Monthly drill-down navigates here)

### Header Bar
- Title: "Today's grid" + formatted date
- Three summary pills:
  - "Active now" (red background if > 0, count)
  - "Restored" (green-tinted, count of closed today)
  - "Total today" (neutral, sum)
- Date nav: "Yesterday | Today | This week" toggle buttons. Clicking changes the date range and re-fetches.

### View Tabs (within the component, not the page-level tabs)
- Timeline (default)
- By substation
- List

### Timeline View

Vertical layout with left time gutter (60px). Each outage is a card.

**Active outages (status = 'open'):**
- Red-tinted card: `background: rgba(226,75,74,0.1); border: 1px solid rgba(226,75,74,0.25)`
- Pulsing red dot (CSS animation: opacity oscillation, 1.5s)
- Feeder name in bold, slightly pink/red tint
- Running duration: calculate client-side from time_out to now, update every 30 seconds
- "active" badge (red)
- Always sorted to top

**Closed outages (status = 'closed'):**
- Green-tinted card: `background: rgba(93,202,165,0.08); border: 1px solid rgba(93,202,165,0.15)`
- Static green dot
- Duration shown: "X min" or "Xh Ym" if > 60 min
- "closed" badge (green)

**Collapsed card (default):**
- Single row: dot + feeder name + substation name (muted) | duration + status badge + chevron

**Expanded card (on click):**
Toggle expand/collapse. When expanded, show below the collapsed row:

Row 1 - Stats grid (4 cols): Time Out, Time In (or "ongoing"), Customers Affected, ENS (MWh)

Row 2 - Cause: `cause_subcategory` with color (Earth Fault = amber, Overcurrent = coral, Planned = teal) + amperage from `cause_detail` if present

Row 3 - Area: `areas_affected` + additional `cause_detail` context

Row 4 - Feeder intelligence:
- "This feeder: Nth outage in 30 days"
- Grade badge (clickable -> `onFeederSelect(feederId)`)
- If D or F, text in red/amber to flag pattern
- Trend arrow

### By Substation View
Group outages by substation_code. Each substation is a collapsible accordion section:
- Header: substation name + total count + active count badge
- Inside: same timeline cards, just filtered

### List View
Compact table:
| Time | Feeder | Duration | Customers | Cause | Status |
Clicking a row expands the drill-down inline (same as timeline).

### Auto-refresh
- `setInterval` every 30 seconds:
  - Update running duration counters client-side
  - Re-fetch from API every 2nd interval (every 60 seconds)
  - If an outage transitions open -> closed, briefly flash the card green

### Compact variant for main dashboard
Also export: `export function CompactGridCard()`
- Shows: red/green status dot + "X active | Y today" 
- Mini list of last 3-4 events (just feeder + time + status dot, one line each)
- "View grid health ->" link
- This will be placed on the main DG dashboard by Prompt 3

## Design
- Timeline left gutter: 60px, time in 11px muted text, right-aligned
- Cards: 10px border-radius, 10px 14px padding
- Expanded detail: slightly darker background, no top border (seamless expansion)
- Pulsing dot: `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }` on a 6px red circle
- All within DG Work OS dark theme

## Do NOT:
- Build the page shell or tabs (Prompt 3)
- Build the feeder drawer (Prompt 2e)
- Build the monthly view (Prompt 2c)
- Modify sync/scoring (Prompt 1)
