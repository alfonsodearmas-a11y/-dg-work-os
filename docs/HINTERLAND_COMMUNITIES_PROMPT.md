# One-go prompt for Claude Code

Paste everything below into Claude Code, running from the repo root.

---

Build the **Hinterland Communities** module in this repo, end to end, in one pass. Read `docs/HINTERLAND_COMMUNITIES_HANDOVER.md` first and treat it as the source of truth — it has the schema, conventions, exact file references, and gotchas. Do not re-derive anything it already settled.

Context you must respect:
- This repo does **not** use Prisma. Use the Supabase JS client (`supabaseAdmin` from `@/lib/db`), raw SQL migrations, and hand-written types in `lib/`. Mirror the existing **airstrips** module (`app/airstrips`, `app/api/airstrips`, `lib/airstrip-types.ts`, `lib/airstrips/queries.ts`, `components/airstrips`, `components/intel/common/BentoCard.tsx`).
- Roles are `superadmin` and `agency_manager`. `alfonso.dearmas@mpua.gov.gy` (superadmin) is an untouchable invariant — do not alter its access.
- The data layer is **already built and applied**: migrations `138`–`141` created `communities`, `water_status`, `water_sources`, `water_status_log`, `electricity_status`, `electricity_sources`, `electricity_status_log`, `hinterland_option_types` (RLS on, options seeded). Do not recreate them. Next free migration number is `142`.
- Design: match the Agency Intel bento look — navy base, `card-premium`/`BentoCard`, semantic status colours (green=adequate, gold=partial, orange=unfunded, red=no_system, grey=unknown), Outfit + JetBrains Mono via existing tokens. Muted palette, no new colour scheme, no emdashes in interface copy.

Do this:

1. **Types** — `lib/hinterland-types.ts`: `Community`, `WaterStatus`, `WaterSource`, `ElectricityStatus`, status vocabularies, and a `STATUS_CONFIG` colour map (water: adequate `#10b981`, partial `#d4af37`, unfunded `#f59e0b`, no_system `#dc2626`, unknown `#64748b`) mirroring `lib/airstrip-types.ts`. Optionally `lib/hinterland/queries.ts` for shared fetch/augment.

2. **Auth helper** — add `export const requireHinterlandAccess = () => requireModuleAccess('hinterland-communities');` in `lib/auth-helpers.ts`. Register the slug `'hinterland-communities'` in `SUPERADMIN_MODULES` in `lib/modules/role-modules.ts`.

3. **API** under `app/api/hinterland/` (all gated by `requireHinterlandAccess()`):
   - `GET communities` (list + summary: counts by status, by region, avg coverage; filters region/status/source_type + name search; sort).
   - `GET communities/[id]` (community + water_status + water_sources + water_status_log + electricity_status + joined airstrip via `nearest_airstrip_id` with its latest `airstrip_status_log`).
   - `PATCH communities/[id]` (edit fields incl. `nearest_airstrip_id`; on water status change insert a `water_status_log` row).
   - `GET airstrips/options` (airstrip id/name/region/status for the dropdown).

4. **UI** under `app/hinterland-communities/`:
   - `page.tsx` index: KPI bento, a region-aggregation panel standing in for the map (no coordinates exist yet — count + stacked status bar per region, with a `// TODO: point map after geocoding`), a filterable/sortable table with free-text search, rows linking to the profile.
   - `[id]/page.tsx` profile: header + tabs **Water / Electricity / Airstrips**. Water = full record + sources table (real for Region 9, "ready for entry" empty state elsewhere) + status history. Electricity = empty ready state, phase 2. Airstrips = live status from the airstrips module if linked (labelled "Nearest / serving airstrip", read-only from system of record) else a "no airstrip linked" empty state with a dropdown to set `nearest_airstrip_id`.
   - Add the sidebar entry in `components/layout/Sidebar.tsx` (`mainNavItems`), `href '/hinterland-communities'`, a non-colliding lucide icon, `moduleSlug 'hinterland-communities'`, `requireRole ['superadmin']`.

5. **Data import** — generate `supabase/migrations/142_hinterland_water_seed.sql` (or `scripts/hinterland/import.ts`) from `scripts/hinterland/water_register_parsed.json`. Idempotent: upsert `communities` on `(region, lower(name))`, upsert `water_status` on `community_id`, insert `water_sources` for Region 9 (map `source_type` to option values, fix the `Driled/drilled well` typos, parse `production`→`production_m3hr` + keep `production_raw`, parse `pressure`→`pressure_psi` + keep `pressure_raw`), and seed one baseline `water_status_log` row per community. Apply it via the Supabase MCP and keep the file. `coverage` in the JSON is already normalized to 0–100 — do not rescale. Do NOT set `nearest_airstrip_id`. Print a per-table insert summary.

6. **Verify → simplify → commit → deploy.** Run typecheck, lint, and build; fix failures. Screenshot the index, a Region 9 profile (Lethem, 8 sources), and a community with no airstrip. Do a simplify pass (remove dead code, dedupe, tighten). Then commit with a clear message and deploy on Vercel. Stop before commit/deploy if the build is not green.

Guardrails: additive migrations only; stop and ask before any DROP/RENAME/ALTER COLUMN TYPE or any change to existing tables. Never fuzzy-match airstrips to communities — the link is manual. Region 9 being the only source of `water_sources` rows is expected, not a bug.
