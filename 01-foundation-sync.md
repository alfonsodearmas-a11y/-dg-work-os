# Prompt 1: Foundation + Data Layer (run FIRST, before all others)

> Reference: `00-SHARED-CONTEXT.md` for API shapes, design system, and constraints.

## Objective
Set up the data layer that all other features depend on: cache tables, shared types, config, sync logic, and the sync API route.

## Step 1: Explore the codebase
Before writing any code:
- Read the full project structure
- Find and read the Pulse module: how agency scores are stored, displayed, and updated
- Find and read the existing API route patterns (how routes are structured, how they query Supabase)
- Find the shared UI components and design tokens
- Find how the sidebar navigation works (for adding "Grid Health" later)
- Identify the Supabase client setup and query patterns used across the app

## Step 2: Create shared types (`lib/gpl/types.ts`)
Define TypeScript types for:
- `GplOutage` (matching the API response shape from shared context)
- `GplFeeder` (id, code, name, substation_code, area_served, customer_count)
- `GplSubstation` (id, code, name)
- `FeederHealth` (feeder info + grade, score, outages_30d, avg_duration, trend, last_outage)
- `PulseScore` (overall, frequency_score, restoration_score, impact_score)
- `MonthSummary` (month, counts, averages, by_substation, by_cause, worst_feeders, vs_previous)
- `TodayOutage` (outage record enriched with feeder_health context)

## Step 3: Create config (`lib/gpl/config.ts`)
Configurable thresholds:
```typescript
export const GPL_CONFIG = {
  source: {
    baseUrl: 'https://dashboard-two-rust-51.vercel.app',
    endpoints: { outages: '/api/outages?limit=500', substations: '/api/master/substations', feeders: '/api/master/feeders', causeCodes: '/api/master/cause-codes' }
  },
  sync: { staleAfterMinutes: 15 },
  pulse: {
    weights: { frequency: 0.35, restoration: 0.35, impact: 0.30 },
    targets: { maxOutagesPerDay: 1, maxAvgRestorationMin: 15, maxCmiPer1000: 500 }
  },
  feederGrades: {
    A: { min: 80, color: '#97C459' },
    B: { min: 65, color: '#5DCAA5' },
    C: { min: 50, color: '#EF9F27' },
    D: { min: 35, color: '#FAC775' },
    F: { min: 0, color: '#F09595' }
  },
  frequencyScoring: { 0: 100, 1: 85, 2: 70, 3: 50, 4: 30 },  // outages -> score
  restorationScoring: { 10: 100, 20: 80, 30: 60, 60: 40 }     // avg min -> score
};
```

## Step 4: Create scoring logic (`lib/gpl/scoring.ts`)
Pure functions (no DB calls, no side effects) for:
- `calculatePulseScore(outages, feeders, days)` -> PulseScore
- `calculateFeederHealth(feederId, outages, feederMaster)` -> FeederHealth
- `calculateFeederGrade(score)` -> 'A' | 'B' | 'C' | 'D' | 'F'
- `calculateTrend(currentPeriodOutages, previousPeriodOutages)` -> 'improving' | 'worsening' | 'stable'
- `aggregateMonthly(outages, feeders)` -> MonthSummary[]

Pulse score formulas (from config weights/targets):
- Frequency: `max(0, 100 - ((avgPerDay - target) / target) * 50)`
- Restoration: `max(0, 100 - ((avgMin - target) / target) * 50)`
- Impact: customer-minutes per 1000 customers, scored similarly

Feeder health score: frequency (40%) + restoration speed (30%) + customer exposure (30%).

## Step 5: Create migration file
Output SQL as a migration file. **DO NOT RUN.**

```sql
-- Migration: GPL outage data cache for DG Work OS
-- File: supabase/migrations/YYYYMMDD_gpl_outage_cache.sql
-- DO NOT RUN AUTOMATICALLY. Alfonso runs manually via Supabase Dashboard.

CREATE TABLE IF NOT EXISTS gpl_outage_cache (
  id SERIAL PRIMARY KEY,
  outage_id INTEGER NOT NULL,
  feeder_id INTEGER,
  date DATE NOT NULL,
  time_out TIME, time_in TIME,
  duration_minutes INTEGER,
  customers_affected INTEGER,
  mw_lost DECIMAL(6,2),
  ens_mwh DECIMAL(8,3),
  cause_subcategory TEXT,
  cause_detail TEXT,
  status TEXT,
  feeder_code TEXT,
  substation_code TEXT,
  areas_affected TEXT,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(outage_id)
);

CREATE TABLE IF NOT EXISTS gpl_feeder_cache (
  id SERIAL PRIMARY KEY,
  feeder_id INTEGER NOT NULL,
  code TEXT, name TEXT,
  substation_code TEXT,
  area_served TEXT,
  customer_count INTEGER,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(feeder_id)
);

CREATE INDEX idx_gpl_outage_date ON gpl_outage_cache(date);
CREATE INDEX idx_gpl_outage_feeder ON gpl_outage_cache(feeder_code);
CREATE INDEX idx_gpl_outage_sub ON gpl_outage_cache(substation_code);

-- Extend pulse_scores if needed (check existing schema first)
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS frequency_score DECIMAL(5,2);
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS restoration_score DECIMAL(5,2);
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS impact_score DECIMAL(5,2);
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS outage_count_30d INTEGER;
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS avg_restoration_min DECIMAL(5,1);
ALTER TABLE pulse_scores ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
```

## Step 6: Create sync logic (`lib/gpl/sync.ts`)
Functions to:
- `fetchFromGplDashboard()` - fetch all 4 endpoints, return raw data
- `upsertOutageCache(outages)` - upsert into gpl_outage_cache
- `upsertFeederCache(feeders)` - upsert into gpl_feeder_cache
- `getLastSyncTime()` - check synced_at
- `isCacheStale()` - compare last sync to config threshold

## Step 7: Create sync API route (`app/api/pulse/gpl/sync/route.ts`)
`POST /api/pulse/gpl/sync`:
1. Fetch from GPL dashboard API
2. Upsert cache tables
3. Recalculate Pulse score and write to pulse_scores
4. Return: `{ synced: true, outages_synced: N, feeders_synced: N, new_records: N, pulse_score: { overall, frequency, restoration, impact } }`

Handle errors gracefully: if GPL dashboard is unreachable, return cached data age + error message, don't throw.

## Deliverables
After this prompt completes, the following must exist and work:
- `lib/gpl/types.ts`, `config.ts`, `scoring.ts`, `sync.ts`
- `app/api/pulse/gpl/sync/route.ts`
- Migration file (not executed)
- Cache tables populated after first sync call
- Pulse score calculated and stored

**All parallel prompts (2a-2e) depend on this being complete.**
