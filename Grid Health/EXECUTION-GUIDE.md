# Execution Guide: GPL Grid Health Prompts

## Prompt Inventory

```
00-SHARED-CONTEXT.md       → Reference doc (don't run, just keep in project)
01-foundation-sync.md      → Phase 1: Sequential (run first)
02a-pulse-score-card.md    → Phase 2: Parallel agent
02b-feeder-health-table.md → Phase 2: Parallel agent
02c-monthly-drilldown.md   → Phase 2: Parallel agent
02d-today-grid.md          → Phase 2: Parallel agent
02e-feeder-detail-drawer.md → Phase 2: Parallel agent
03-page-shell-wiring.md    → Phase 3: Sequential (run last)
```

## Step 0 — Copy Prompts Into the Project

From the DG Work OS project root, create the directory and copy all prompt files:

```bash
# Create the prompts directory (do NOT put in root to avoid README conflict)
mkdir -p prompts/grid-health

# Copy all prompt files into the project
# Adjust the source path to wherever you downloaded them
cp ~/Downloads/grid-health-prompts/*.md prompts/grid-health/
```

Verify they're in place:
```bash
ls prompts/grid-health/
# Should show:
# 00-SHARED-CONTEXT.md
# 01-foundation-sync.md
# 02a-pulse-score-card.md
# 02b-feeder-health-table.md
# 02c-monthly-drilldown.md
# 02d-today-grid.md
# 02e-feeder-detail-drawer.md
# 03-page-shell-wiring.md
# EXECUTION-GUIDE.md
```

## Phase 1 — Foundation (sequential, ~1 session)

```bash
# From the project root, feed the shared context + prompt 1 to Claude Code:
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/01-foundation-sync.md | claude
```

Or paste the contents of `00-SHARED-CONTEXT.md` and `01-foundation-sync.md` into Claude Code.

This creates the shared types, config, scoring logic, cache tables (migration), and sync API route. Everything else depends on this.

**After Prompt 1 completes:**
1. Run the migration manually in Supabase Dashboard
2. Verify these files exist:
   - `lib/gpl/types.ts`
   - `lib/gpl/config.ts`
   - `lib/gpl/scoring.ts`
   - `lib/gpl/sync.ts`
   - `app/api/pulse/gpl/sync/route.ts`
3. Test the sync: `curl -X POST http://localhost:3000/api/pulse/gpl/sync`

## Phase 2 — Features (5 parallel agents)

Once Phase 1 is confirmed working, run all five simultaneously. Each prompt should be fed alongside the shared context:

```bash
# Terminal 1
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/02a-pulse-score-card.md | claude

# Terminal 2
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/02b-feeder-health-table.md | claude

# Terminal 3
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/02c-monthly-drilldown.md | claude

# Terminal 4
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/02d-today-grid.md | claude

# Terminal 5
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/02e-feeder-detail-drawer.md | claude
```

These are fully independent. Each creates its own API route and its own component. No shared files between them (they all import from `lib/gpl/` which Phase 1 created). The file scopes are explicitly listed in each prompt to avoid merge conflicts.

**After all 5 complete, verify:**
- 5 new API routes exist and return data
- 5 new components exist and export correctly
- No import errors when building (`npm run build`)

## Phase 3 — Wiring (sequential, ~1 session)

After all five parallel agents finish:

```bash
cat prompts/grid-health/00-SHARED-CONTEXT.md prompts/grid-health/03-page-shell-wiring.md | claude
```

This creates the page shell, wires the drawer, connects tab navigation, adds the sidebar entry, and places the compact card on the main dashboard.

**Integration test checklist:**
1. Navigate to `/pulse/gpl/grid-health` — page loads with three tabs
2. Feeders tab: click a feeder row -> drawer opens with correct data
3. Monthly tab: click a month card -> detail panel expands
4. Monthly tab: click an offender pill -> drawer opens
5. Monthly tab: click "View all outages" -> switches to Today tab with that month's range
6. Today tab: active outages pulse red, closed ones show green
7. Today tab: click a grade badge -> drawer opens
8. Sync button works and refreshes all data
9. Sidebar "Grid Health" link works
10. Compact card appears on main dashboard with live data

## Tips
- If the `cat | claude` pipe syntax doesn't work in your shell, just paste the contents of both files (shared context + specific prompt) into Claude Code
- Run the migration manually after Phase 1 before starting Phase 2
- If a parallel agent finishes early, you can start Phase 3 for that component's wiring while others finish, but it's cleaner to wait
- Each prompt is scoped to specific files to avoid merge conflicts between parallel agents
