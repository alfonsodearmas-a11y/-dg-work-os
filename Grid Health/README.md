# Execution Guide: GPL Grid Health Prompts

## Prompt Inventory

```
00-SHARED-CONTEXT.md     → Reference doc (don't run, just keep in project)
01-foundation-sync.md    → Phase 1: Sequential (run first)
02a-pulse-score-card.md  → Phase 2: Parallel agent
02b-feeder-health-table.md → Phase 2: Parallel agent
02c-monthly-drilldown.md → Phase 2: Parallel agent
02d-today-grid.md        → Phase 2: Parallel agent
02e-feeder-detail-drawer.md → Phase 2: Parallel agent
03-page-shell-wiring.md  → Phase 3: Sequential (run last)
```

## Execution Order

### Phase 1 — Foundation (sequential, ~1 session)
```
Run: 01-foundation-sync.md
```
This creates the shared types, config, scoring logic, cache tables (migration), and sync API route. Everything else depends on this.

**Checkpoint:** After Prompt 1, verify:
- `lib/gpl/types.ts` exists with all types
- `lib/gpl/config.ts` exists with thresholds
- `lib/gpl/scoring.ts` exports the scoring functions
- `lib/gpl/sync.ts` exports the sync functions
- `app/api/pulse/gpl/sync/route.ts` exists
- Migration file exists (run it manually via Supabase Dashboard)
- Hit POST /api/pulse/gpl/sync and confirm it works

### Phase 2 — Features (parallel, 5 agents)
```
Run simultaneously:
  02a-pulse-score-card.md
  02b-feeder-health-table.md
  02c-monthly-drilldown.md
  02d-today-grid.md
  02e-feeder-detail-drawer.md
```

These are fully independent. Each creates its own API route and its own component. No shared files between them (they all import from `lib/gpl/` which was created in Phase 1).

**In Claude Code:** You can run these as parallel sub-agents or run them in 5 separate terminal sessions. The key constraint: none of them should modify files created by another parallel prompt. The file scopes are explicitly listed in each prompt.

**Checkpoint:** After all 5 complete, verify:
- 5 new API routes exist and return data
- 5 new components exist and export correctly
- No import errors when building

### Phase 3 — Wiring (sequential, ~1 session)
```
Run: 03-page-shell-wiring.md
```
This creates the page shell, wires the drawer, connects tab navigation, adds the sidebar entry, and places the compact card on the main dashboard.

**Checkpoint:** Full integration test:
1. Navigate to /pulse/gpl/grid-health
2. All three tabs render with data
3. Click a feeder row -> drawer opens
4. Click a monthly offender pill -> drawer opens
5. Click "View all outages" in monthly -> switches to Today tab
6. Sync button works
7. Sidebar link works
8. Compact card appears on main dashboard

## Tips
- Copy `00-SHARED-CONTEXT.md` into the project root so all prompts can reference it
- Run the migration manually after Phase 1 before starting Phase 2
- If a parallel agent finishes early, you can start Phase 3 for that component's wiring while others finish, but it's cleaner to wait
- Each prompt is scoped to specific files to avoid merge conflicts between parallel agents
