# Prompt 2b: Feeder Health Table (PARALLEL — run after Prompt 1)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.
> Depends on: `lib/gpl/types.ts`, `lib/gpl/config.ts`, `lib/gpl/scoring.ts` from Prompt 1.

## Objective
Build the API route and UI component for the feeder health table: a sortable, filterable table grading every feeder A-F with 30-day performance data.

## Scope — only these files:
```
app/api/pulse/gpl/feeders/route.ts          → new
app/pulse/gpl/grid-health/components/FeederHealthTable.tsx → new
```

## API Route: `GET /api/pulse/gpl/feeders`

Query `gpl_outage_cache` + `gpl_feeder_cache`. For each feeder, calculate health using `scoring.ts`. Return:

```json
{
  "feeders": [
    {
      "feeder_id": 56,
      "feeder_code": "B1F1",
      "feeder_name": "COLUMBIA B1F1",
      "substation_code": "COLUMBIA",
      "substation_name": "Columbia Substation",
      "area_served": "Columbia to Seafield",
      "customer_count": 8861,
      "health": {
        "grade": "F",
        "score": 22,
        "outages_30d": 7,
        "avg_duration_min": 8,
        "total_downtime_min": 56,
        "top_cause": "Earth Fault",
        "trend": "worsening",
        "last_outage_date": "2026-03-23",
        "last_outage_time": "09:30:00"
      }
    }
  ],
  "summary": {
    "total_feeders": 45,
    "feeders_with_outages": 28,
    "grade_distribution": { "A": 12, "B": 8, "C": 6, "D": 4, "F": 3 }
  }
}
```

Query params:
- `substation=COLUMBIA` (optional filter)
- `grade=D,F` (optional, comma-separated)
- `sort=grade_asc` (default: worst first)

## Component: `FeederHealthTable.tsx`

A client component that renders as a tab panel (the parent page shell from Prompt 3 will import it).

**Export:** `export default function FeederHealthTable()` — self-contained, fetches its own data from `/api/pulse/gpl/feeders`.

**Filters (above table):**
- Substation dropdown (populated from data, "All" default)
- Grade filter: pills for A/B/C/D/F, multi-toggle (default: show all, but D/F highlighted)
- Sort buttons: "Worst first" (default), "Best first", "Most outages", "Most customers"

**Table columns:**

| Column | Width | Content |
|--------|-------|---------|
| Grade | 60px | Colored badge: F=red pill, D=amber, C=amber-light, B=teal, A=green |
| Feeder | 140px | `{substation_code}/{feeder_code}`, bold, white text |
| Area served | flex | area_served text, muted color, truncate with ellipsis |
| Customers | 80px | Right-aligned, comma-formatted number |
| Outages (30d) | 80px | Right-aligned, red if 3+, amber if 2, neutral if 0-1 |
| Avg duration | 80px | Right-aligned, "X min" |
| Total downtime | 90px | "Xh Ym" format |
| Top cause | 120px | Truncated with ellipsis |
| Trend | 60px | Arrow: red up = worsening, green down = improving, dash = stable |

**Row behavior:**
- Hover: subtle gold tint on background
- Click: calls `onFeederSelect(feederId)` prop (the drawer will be wired by Prompt 3)
- Cursor pointer on all rows

**Empty state:** "No feeders match the selected filters"

**Design:** Match DG Work OS dark theme. Table inside a glassmorphism card with very subtle border. No zebra striping, use 1px border-bottom on rows. Header row text should be 11px uppercase muted color.

## Do NOT:
- Build the feeder detail drawer (that's Prompt 2e)
- Build the page shell or tabs (that's Prompt 3)
- Modify any sync or scoring logic (Prompt 1)
- Build the monthly or today views (Prompts 2c, 2d)
