# Hinterland Communities module — handover for Claude Code

Status: **data layer done and verified. UI, API, nav, and data import remain.**
Owner: superadmin (Alfonso). Project: Supabase `ozcdsnpieeetzzwjqvjo` (dg-command-center).
Last updated by the planning session on 2026-07-01.

---

## 1. What this module is

A **community-centric** module for the ~257 hinterland communities of Guyana. The organizing spine is the **community**, not the utility. Each community profile has three tabs:

- **Water** — owned by this module. Data comes from the GWI "Situation Analysis of Hinterland Regions" register. Phase 1, populated now.
- **Electricity** — owned by this module. Built empty and ready. Phase 2, no data yet.
- **Airstrips** — NOT owned by this module. The existing **Hinterland Airstrips** module (`/airstrips`, tables `airstrips` + friends) stays the system of record. This module stores only a nullable pointer (`communities.nearest_airstrip_id`) and READS live status from the airstrips tables. It never copies airstrip data.

Do not turn this into a utility-centric module. Two owned trackers (water, electricity) as sibling status tables, plus one consumed feed (airstrips) joined by an explicit, human-set reference.

---

## 2. Stack reality (important — the CLAUDE.md is out of date)

- **No Prisma.** The repo uses the **Supabase JS client** (`supabaseAdmin` from `@/lib/db`), raw numbered SQL migrations in `supabase/migrations/`, and hand-written TypeScript types in `lib/*-types.ts`. Do not add Prisma. Mirror the airstrips module.
- Next.js App Router + TypeScript, Tailwind v4, NextAuth v5 (Google Workspace).
- Roles are exactly **`superadmin`** and **`agency_manager`** (plus a `system` service account). `alfonso.dearmas@mpua.gov.gy` (superadmin) is an untouchable invariant — never change its role/access.
- Migrations are numbered `NNN_name.sql`. Last existing is `137`. This module added `138`–`141` (already applied). Next free number is **`142`**.
- Apply migrations via the Supabase MCP (`apply_migration`) and keep the `.sql` file in `supabase/migrations/` as the canonical record. Stop and confirm with Alfonso before any DROP/RENAME/ALTER COLUMN TYPE/data backfill of existing tables. Everything for this module is additive.

---

## 3. Data model — ALREADY CREATED AND VERIFIED

Migrations `138`–`141` are applied to the live database. Files are in `supabase/migrations/`. Do not recreate these tables. All have RLS enabled with a `FOR SELECT TO authenticated USING (true)` read policy; writes go through `supabaseAdmin` (service role, bypasses RLS), so there is no client write policy — same convention as the airstrip tables.

**`communities`** (spine): `id uuid pk`, `name text`, `region int (CHECK 1..10)`, `sub_district text`, `community_type text`, `population int`, `population_source text`, `latitude numeric`, `longitude numeric` (both NULL — no coords in source, geocode later), `nearest_airstrip_id uuid → airstrips(id) ON DELETE SET NULL`, `source_sheet text`, `remarks text`, + `created_at/by`, `updated_at/by`. Unique index on `(region, lower(name))`.

**`water_status`** (1:1 with community): `community_id uuid UNIQUE`, `status text` (`adequate|partial|no_system|unfunded|unknown`), `coverage_percent numeric (CHECK 0..100)`, `existing_infrastructure text`, `proposed_solutions text`, `remarks text`, `action text`, `schools_access text`, `last_updated date`, `source_sheet text`, audit cols.

**`water_sources`** (many per community): `community_id uuid`, `source_name text`, `source_type text`, `source_status text` (`active|inactive|pending_activation`), `production_m3hr numeric`, `production_raw text`, `pressure_psi numeric`, `pressure_raw text`, `comments text`, audit cols. Populated for Region 9 now; empty and ready for every other community.

**`water_status_log`** (history): `community_id`, `previous_status`, `new_status`, `reason`, `changed_by`, `changed_at`. Append a row on every status change (mirror `airstrip_status_log`).

**`electricity_status`, `electricity_sources`, `electricity_status_log`**: same shape as the water trio, built empty. Phase 2. `electricity_sources` uses `capacity_kw`/`capacity_raw` instead of production/pressure.

**`hinterland_option_types`**: `category, label, value, sort_order, is_active`, unique `(category, value)`. Seeded 28 rows across `water_status`, `water_source_type`, `water_source_status`, `electricity_status`, `electricity_system_type`, `electricity_source_type`. This drives editable dropdowns. Display **colours** do NOT live here — put them in `lib/hinterland-types.ts` like `STATUS_CONFIG` in `lib/airstrip-types.ts`.

---

## 4. The parsed register data — USE THIS, do not re-parse the spreadsheet

`scripts/hinterland/water_register_parsed.json` is the canonical, reviewed extract of the register. Deriving status from the spreadsheet's cell fill colours is fragile and already done — import from this JSON.

Shape:

```
{
  "communities": [
    { "region": 9, "sub": "CENTRAL SUB-DISTRICT", "name": "Lethem", "pop": 6000,
      "status": "adequate", "coverage": 98,
      "infra": "...", "solutions": "...", "remarks": "...", "action": null, "schools": "..." }
  ],
  "sources": [
    { "community": "Lethem", "region": 9, "source_name": "New Culvert City",
      "source_type": "Drilled well 6\"", "source_status": "Active",
      "production": "26.4m3/h", "pressure": "23 PSI" }
  ]
}
```

Facts: 257 communities, 155 sources (all from Region 9 — the only sheet with source-level detail). `coverage` is already normalized to 0–100 (251 of 257 non-null). `status` is already derived from the register's colour legend and translated to this module's vocabulary (blue→`adequate`, yellow→`partial`, red→`no_system`, orange→`unfunded`, theme/none→`unknown`). Region distribution: R1=82, R2=19, R3=5, R4=2, R5=1, R6=3, R7=32, R8=30, R9=65, R10=18. The junk "Reg 2 alone" duplicate sheet is already excluded.

Import mapping:
- Each `communities[i]` → one `communities` row (`name`, `region`, `sub_district=sub`, `population=pop`, `source_sheet`) **and** one `water_status` row (`status`, `coverage_percent=coverage`, `existing_infrastructure=infra`, `proposed_solutions=solutions`, `remarks`, `action`, `schools_access=schools`).
- Each `sources[j]` → one `water_sources` row, matched to its community by name. Map `source_type` to the option `value` where possible (e.g. `Drilled well 6"` → `drilled_well_6`, `Hand-dug well` → `hand_dug_well`; fix the register typos `Driled well`/`drilled well` → `drilled_well`); keep the original string too if useful. Parse `production` → `production_m3hr` (regex `([0-9.]+)`), keep original in `production_raw`; parse `pressure` → `pressure_psi`, keep `pressure_raw` (many are just `"PSI"` with no number → NULL numeric, raw kept).
- Optionally seed one `water_status_log` row per community (`previous_status=null`, `new_status=status`, `reason='Initial import from GWI register'`) to baseline history.

Make the import **idempotent**: upsert communities on `(region, lower(name))`; upsert water_status on `community_id`; for water_sources, delete-then-insert per community or guard on `(community_id, source_name)`. Put it as either `142_hinterland_water_seed.sql` (generated from the JSON) or a `scripts/hinterland/import.ts` run with the service key. A generated SQL migration is preferred so it is reproducible and recorded.

Do NOT set `nearest_airstrip_id` during import. Airstrip links are set manually later (see §6).

---

## 5. Conventions to match (real file references)

- **DB access in routes:** `import { supabaseAdmin } from '@/lib/db'`, then `supabaseAdmin.from('communities').select('...')`. See `app/api/airstrips/route.ts` for the exact shape (filters, `.or()` with sanitized search, summary object).
- **Auth gate:** every route calls `const authResult = await requireModuleAccess('hinterland-communities'); if (authResult instanceof NextResponse) return authResult;` (from `@/lib/auth-helpers`). Add a helper `export const requireHinterlandAccess = () => requireModuleAccess('hinterland-communities');` next to `requireAirstripAccess`.
- **Module registration:** add the slug `'hinterland-communities'` to `lib/modules/role-modules.ts`. For phase 1 put it in `SUPERADMIN_MODULES` (superadmin-only). If a GWI manager should see it later, add it to `AGENCY_MODULES.GWI` instead/as well. `canAccessModule` and the sidebar both read this — do not invent a new mechanism.
- **Sidebar:** add one item to `mainNavItems` in `components/layout/Sidebar.tsx`:
  `{ href: '/hinterland-communities', label: 'Hinterland Communities', icon: Building2, moduleSlug: 'hinterland-communities', requireRole: ['superadmin'] }` (pick a lucide icon not already colliding — `Building2`, `Waves`, or `MapPinned`; `Droplets` is taken by GWI).
- **Cards / bento:** use `BentoCard` from `components/intel/common/BentoCard.tsx` (`card-premium`, optional `accent` hex strip, optional `href`). Match the Agency Intel overview (`app/intel/page.tsx`) and the airstrips list (`app/airstrips/page.tsx`) for layout, status badges, empty states.
- **Status badges:** the airstrips pattern is `style={{ backgroundColor: color+'20', color, border: '1px solid '+color+'40' }}` driven by a `STATUS_CONFIG` map. Replicate in `lib/hinterland-types.ts`. Water status colours (semantic, matching the app — green=good): `adequate #10b981`, `partial #d4af37`, `unfunded #f59e0b`, `no_system #dc2626`, `unknown #64748b`.
- **Fonts/tokens:** already global. Use Tailwind `font-sans` (Outfit) by default and `font-mono` / `tabular-nums` (JetBrains Mono) for numerics. Colours via the `navy-*` / `gold-*` tokens and the CSS custom properties in `app/globals.css`. **No new palette. No emdashes in interface copy.**
- **Types:** create `lib/hinterland-types.ts` (Community, WaterStatus, WaterSource, statuses, configs) mirroring `lib/airstrip-types.ts`. Optionally `lib/hinterland/queries.ts` for shared fetch/augment logic mirroring `lib/airstrips/queries.ts`.

---

## 6. Remaining work

**A. Types + query helpers**
`lib/hinterland-types.ts` (interfaces, status vocab, `STATUS_CONFIG` colours, option categories) and optionally `lib/hinterland/queries.ts`.

**B. API routes** under `app/api/hinterland/` (all gated by `requireHinterlandAccess()`):
- `GET /api/hinterland/communities` — list + summary (counts by status, by region, avg coverage), filters: region, water status, source type, free-text name search; sort.
- `GET /api/hinterland/communities/[id]` — one community with its `water_status`, `water_sources`, `water_status_log`, `electricity_status` (may be null), and the joined airstrip (`nearest_airstrip_id` → `airstrips` row + latest `airstrip_status_log`).
- `PATCH /api/hinterland/communities/[id]` — edit fields incl. setting `nearest_airstrip_id`. On water status change, insert a `water_status_log` row.
- `GET /api/hinterland/airstrips/options` — list of airstrips (id, name, region, status) to populate the "nearest airstrip" dropdown, sourced from the airstrips tables.

**C. Pages / components** under `app/hinterland-communities/`:
- `page.tsx` (index): KPI bento (total, adequate/partial/no_system/unfunded counts, avg coverage), a **region-aggregation panel** standing in for the map (no coords yet — count + stacked status bar per region; add a `// TODO: point map after geocoding` note), a filterable/sortable table (name, region, sub-district, population, water status badge, coverage bar, airstrip indicator), free-text search. Row → profile.
- `[id]/page.tsx` (profile): header (name, region, sub-district, population, status badge), tabs **Water / Electricity / Airstrips**.
  - Water: full record + `water_sources` table (real for Region 9; "ready for entry" empty state elsewhere) + status history from `water_status_log`.
  - Electricity: empty ready state, same skeleton, "phase 2" note.
  - Airstrips: if `nearest_airstrip_id` set → card reading live status from the airstrips module (label it "Nearest / serving airstrip", note it is read-only from the system of record); else → "no airstrip linked" empty state with a dropdown (from the options route) to set it. Manual, human-reviewed; blank by default so "no airstrip" is honest, not a failed match.
- Register the module (role-modules.ts + Sidebar) per §5.

**D. Data import** per §4 (migration `142` generated from the JSON, or a scripts importer). Show a load summary (rows inserted per table).

**E. Verify → simplify → commit → deploy.** Typecheck/lint/build. Take a screenshot of the index and a Region 9 profile (Lethem has 8 sources) and a no-airstrip community. Then a simplify pass (remove dead code, dedupe). Commit with a clear message. Deploy on Vercel. Do not commit or deploy until the build is green and Alfonso has seen it.

---

## 7. Reference: the approved visual

A working mockup with the real data was approved. The index is a KPI bento + region-aggregation panel + filterable table; the profile is the three-tab layout described above. Match the real Agency Intel look (navy base, semantic status colours, `card-premium` bento), exact Outfit/JetBrains fonts and `globals.css` tokens. The mockup approximated colours/fonts; the real build uses the actual tokens.

## 8. Gotchas

- Region 9 is the only sheet with source-level rows; every other community legitimately has zero `water_sources` until GWI fills them in. Empty is correct, not a bug.
- Coverage in the source was on mixed scales; the JSON is already normalized to 0–100. Do not re-multiply.
- `production`/`pressure` strings are messy ("2.5m/h", "5.678m3/h", bare "PSI"). Parse leniently, keep the raw.
- Airstrip names are not a clean 1:1 with community names (~half don't match; some airstrips are non-residential like Kaieteur/Ogle). This is exactly why the link is manual, not fuzzy. Never auto-match on name.
- Supabase advisory: 75 pre-existing tables have RLS disabled (not this module's — the new tables all have RLS on). Leave it unless asked.
