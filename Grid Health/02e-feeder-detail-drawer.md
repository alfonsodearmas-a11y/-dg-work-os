# Prompt 2e: Feeder Detail Drawer (PARALLEL — run after Prompt 1)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.
> Depends on: `lib/gpl/types.ts`, `lib/gpl/config.ts`, `lib/gpl/scoring.ts` from Prompt 1.

## Objective
Build the slide-out drawer component that shows detailed history and analytics for a single feeder. This drawer is triggered from the feeder health table, monthly offender pills, and today's timeline grade badges.

## Scope — only these files:
```
app/api/pulse/gpl/feeders/[id]/route.ts     → new
app/pulse/gpl/grid-health/components/FeederDetailDrawer.tsx → new
```

## API Route: `GET /api/pulse/gpl/feeders/:id`

Accepts a feeder_id. Returns full detail for one feeder:

```json
{
  "feeder": {
    "id": 56,
    "code": "B1F1",
    "name": "COLUMBIA B1F1",
    "substation_code": "COLUMBIA",
    "substation_name": "Columbia Substation",
    "area_served": "Columbia to Seafield",
    "customer_count": 8861
  },
  "health": {
    "grade": "F",
    "score": 22,
    "outages_30d": 7,
    "avg_duration_min": 8,
    "total_downtime_min": 56,
    "trend": "worsening"
  },
  "stats": {
    "mtbf_days": 4.3,
    "mttr_min": 8,
    "customer_minutes_30d": 496880,
    "longest_outage": { "duration_minutes": 66, "date": "2026-01-11" },
    "total_outages_all_time": 26
  },
  "outage_history": [
    {
      "id": 220,
      "date": "2026-03-23",
      "time_out": "09:30:00",
      "time_in": "09:38:00",
      "duration_minutes": 8,
      "cause_subcategory": "Earth Fault",
      "cause_detail": "Earth Fault 15.25Amps",
      "status": "closed"
    }
  ],
  "cause_breakdown": [
    { "subcategory": "Earth Fault", "count": 18, "pct": 69 },
    { "subcategory": "Overcurrent", "count": 5, "pct": 19 },
    { "subcategory": "Planned/Emergency Outage", "count": 3, "pct": 12 }
  ],
  "monthly_trend": [
    { "month": "2025-12", "count": 5 },
    { "month": "2026-01", "count": 9 },
    { "month": "2026-02", "count": 5 },
    { "month": "2026-03", "count": 7 }
  ]
}
```

Query `outage_history` returns all outages for this feeder (last 90 days), sorted desc.

## Component: `FeederDetailDrawer.tsx`

A right-side slide-out drawer (or panel) component.

**Export:** `export default function FeederDetailDrawer({ feederId, isOpen, onClose })`

**Behavior:**
- Slides in from the right when `isOpen` transitions true
- 400px wide on desktop, full-width on mobile
- Dark overlay on the rest of the page (click overlay to close)
- Fetches data from `/api/pulse/gpl/feeders/{feederId}` on open
- Loading skeleton while fetching

### Drawer Layout

**Header (sticky top):**
- Feeder name: "COLUMBIA/B1F1" (bold, 16px)
- Substation name below (12px muted)
- Grade badge (colored pill, right side)
- Close X button (top right)

**Section 1: Quick Stats**
2x2 grid of metric cards:

| MTBF | MTTR |
|------|------|
| X.X days | X min |

| Customer-minutes (30d) | Longest outage |
|------------------------|----------------|
| XXX,XXX | XX min (date) |

Plus: "Total all-time: N outages" as a footer line.

**Section 2: Outage Timeline**
Vertical timeline of `outage_history` entries (last 90 days). Each entry:
- Left: date (compact: "Mar 23")
- Center: time range ("09:30 - 09:38")
- Right: duration + cause badge
- Status dot: green for closed, red for open

Scrollable if many entries. Max height ~300px with overflow-y.

**Section 3: Cause Breakdown**
Small donut chart (use a simple CSS conic-gradient or inline SVG arc, not a full charting library):
- Earth Fault segment: #EF9F27
- Overcurrent segment: #D85A30
- Planned: #5DCAA5
- Other: #888780
- Legend below with counts and percentages

If only one cause type, skip the donut and just show a text summary.

**Section 4: Monthly Trend**
Small bar chart showing outage count per month from `monthly_trend`:
- Use inline SVG bars (no external chart library needed for 4-6 bars)
- X axis: month labels ("Dec", "Jan", "Feb", "Mar")
- Y axis: implied by bar height
- Current month bar: gold accent color, others: muted teal
- Label count above each bar

**Section 5: Area Info**
- "Area served: {area_served}"
- "Customers: {customer_count}" formatted with commas
- "Substation: {substation_name}"

### Animations
- Drawer slides in: `transform: translateX(100%) -> translateX(0)` with 200ms ease-out
- Overlay fades in: opacity 0 -> 0.5 with 150ms
- Content appears after drawer is open (slight delay, no layout shift)

## Design
- Drawer background: #0d1b2e with subtle left border (#d4af37 at 0.2 opacity)
- Sections separated by 1px dividers (rgba(255,255,255,0.06))
- Metric cards: #0a1628 background, 8px border-radius
- Timeline: thin left line connecting the dots, similar to Today's Grid but more compact
- All text: Outfit font, standard dark theme colors

## Do NOT:
- Build the page shell or tabs (Prompt 3)
- Build the feeder table (Prompt 2b)
- Build monthly or today views (Prompts 2c, 2d)
- Add any chart.js or heavy external dependencies (keep it lightweight with CSS/SVG)
