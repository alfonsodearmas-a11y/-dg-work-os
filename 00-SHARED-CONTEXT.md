# SHARED CONTEXT: GPL Grid Health for DG Work OS

All prompts in this series reference this shared context. Do not duplicate this into each prompt, just ensure the codebase has been explored per Prompt 1 before running any parallel agents.

## Source System: GPL System Control Dashboard

Base URL: `https://dashboard-two-rust-51.vercel.app`

### API Endpoints
```
GET /api/outages?limit=500          → all outage records
GET /api/master/substations         → 14 substations
GET /api/master/feeders             → 45 feeders with customer_count, area_served
GET /api/master/cause-codes         → fault taxonomy
```

### Outage Record Shape
```json
{
  "id": 77, "feeder_id": 8, "date": "2026-03-23",
  "time_out": "15:05:00", "time_in": "15:08:00",
  "duration_minutes": 3, "customers_affected": 1205,
  "mw_lost": 2.5, "ens_mwh": 0.125,
  "cause_detail": "burnt RCO on Bel Air Rd",
  "status": "closed",
  "areas_affected": "Lamaha Gardens & Section K C/Ville",
  "feeder_code": "B4F3", "substation_code": "SOPHIA",
  "cause_category": "EM_Distribution_Line",
  "cause_subcategory": "Earth Fault",
  "root_cause": "WhatsApp import"
}
```

### Substations (14)
```
SOPHIA, GOE, DP3, DP4, N/GT, G/HOPE, G/GROVE, COLUMBIA,
ONVERWAGT, SKELDON, V/HOOP, E/BERG, #53, C/FIELD
```

### Cause Code Categories
EM_Distribution_Line (Earth Fault variants, Overcurrent variants, Differential Current, External Mechanism, Other), EM_Transmission_Line, Auxiliary, Bus_Bar, Generation, Generation_Shortfall, PM_Distribution_Line, PM_Transmission_Line

## DG Work OS Design System
- Background: #0d1b2e / #0a1628
- Gold accent: #d4af37 / #c9a84c
- Cyan/teal for active states
- Red for critical, amber for warning, green for healthy
- Body font: Outfit | Heading font: DM Serif Display
- Cards: glassmorphism (backdrop-blur, semi-transparent borders)

## Standard Constraints (apply to ALL prompts)
- SQL migrations as files only, never run automatically, never run `supabase db push`
- Use the /simplify skill
- Mandatory codebase exploration before writing any code
- Match DG Work OS design system exactly
- No direct Supabase cross-database queries; use HTTP fetch to GPL dashboard API, cache locally
- All calculations server-side, not client-side
- Grade/score thresholds in a config object, not hardcoded in business logic

## File Conventions (agreed across all prompts)
```
lib/gpl/
  config.ts           → thresholds, weights, grade boundaries
  types.ts            → shared TypeScript types
  sync.ts             → fetch + upsert logic
  scoring.ts          → health score + grade calculations
  
app/api/pulse/gpl/
  sync/route.ts       → POST /api/pulse/gpl/sync
  score/route.ts      → GET /api/pulse/gpl/score
  feeders/route.ts    → GET /api/pulse/gpl/feeders
  monthly/route.ts    → GET /api/pulse/gpl/monthly
  today/route.ts      → GET /api/pulse/gpl/today

app/pulse/gpl/grid-health/
  page.tsx            → main page shell with tabs
  components/
    FeederHealthTable.tsx
    FeederDetailDrawer.tsx
    MonthlyPerformance.tsx
    TodayGrid.tsx
    PulseScoreCard.tsx
    CompactGridCard.tsx
```
