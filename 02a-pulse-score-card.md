# Prompt 2a: Pulse Score API + Card (PARALLEL — run after Prompt 1)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.
> Depends on: `lib/gpl/types.ts`, `lib/gpl/config.ts`, `lib/gpl/scoring.ts` from Prompt 1.

## Objective
Build the API route that serves the GPL Pulse score and update the existing Pulse dashboard card to show outage-derived health data.

## Scope — only these files:
```
app/api/pulse/gpl/score/route.ts     → new
app/pulse/ (or wherever Pulse cards live) → modify GPL card only
components/pulse/PulseScoreCard.tsx   → new (or modify existing)
```

## API Route: `GET /api/pulse/gpl/score`

Query the `gpl_outage_cache` and `gpl_feeder_cache` tables (from Prompt 1). Calculate using `scoring.ts` functions. Return:

```json
{
  "overall": 54,
  "frequency_score": 42,
  "restoration_score": 78,
  "impact_score": 38,
  "outage_count_30d": 33,
  "avg_restoration_min": 12,
  "total_ens_mwh": 98.4,
  "last_synced": "2026-03-23T18:45:00Z",
  "trend_7d": [58, 55, 52, 54, 51, 54, 54]
}
```

If cache is stale (> 15 min), trigger a sync before calculating. If sync fails, calculate from stale cache and include `"stale": true` in response.

## Pulse Card Update

Find the existing GPL card on the Pulse dashboard. Update it to show:

**Primary display:**
- Overall score (0-100), large number
- Color coded: green >= 70, amber 40-69, red < 40
- Label: "GPL Grid Health"

**Sub-scores:** Three mini horizontal bars (frequency, restoration, impact) each 0-100 with labels.

**Sparkline:** 7-day rolling score from `trend_7d` array. Small inline sparkline, no axes, just the line. Use the score color for the line.

**Footer:**
- "Last synced: X min ago"
- The entire card is clickable -> navigates to `/pulse/gpl/grid-health`

**Design:**
- Match existing Pulse card patterns exactly
- Dark navy glassmorphism card
- Gold accent for the score when healthy, red when critical
- Outfit font for numbers, standard for labels

## Do NOT touch:
- Any other Pulse cards or agency scores
- The sync logic (Prompt 1 handles that)
- The grid health page (Prompt 3 handles that)
- Any feeder/monthly/today components (other parallel prompts)
