# Action Items module

The extraction pipeline that creates Tasks. **Action Items is not a new
module — Tasks/War Room (`/tasks`) is the canonical commitment layer.**
Items originate from Fireflies-extracted transcripts (later plans) or
from manual entry via the existing Add Task form in War Room.

## Spec

`docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md`
(rev 2026-05-03b — read the changelog at the top). The locked decisions
in §0 are non-negotiable.

## Structure (Plan 1 — foundation)

- `constants.ts` — frozen enums and lookup tables that mirror the CHECK
  constraints in migration 102 and the widened `tasks_status_check`.
- `types.ts` — `TaskWithExtensions` (the `tasks` row after migration 102)
  + row types for the four pipeline-side tables + `UserStaffFields`.
  Zod schemas for runtime validation at API boundaries.
- `visibility.ts` — `canSeeTask(user, task)` pure function. App-layer
  visibility enforcement. The `tasks` RLS policy from migration 022 is
  disabled by migration 102; this helper is the enforcement seam.

## Routes that remain under `/action-items`

- `/action-items/review` — meeting cards awaiting extraction review.
- `/action-items/review/[extractionId]` — three-bucket review.
- `/action-items/meetings` — `meetings_seen` list (Plan 3).
- `/action-items/process` — manual extraction trigger (Plan 4).
- `/action-items/eval` — eval dashboard (Plan 5).

War Room (`/tasks`) is the consumption surface for the items themselves.

## Prompt versioning rule (anticipating Plan 4)

Prompts live in `lib/action-items/prompts/extraction-<modality>-vN.M.ts`.
**Never edit a versioned prompt file in place.** Any change requires a
new filename and a new `prompt_version` string. Old extractions reference
the prompt they ran against; preserving the file is what makes
per-prompt-version eval possible.

## Attribution anchor

Every AI-generated task is attributed to the meeting itself, not to the
AI and not to the DG. Card text is computed at render time from
`tasks.source` + lookups; never stored. Locked decision §0.1.
