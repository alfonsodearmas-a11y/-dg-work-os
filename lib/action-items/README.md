# Action Items module

The canonical commitment layer for MPUA staff. Items originate from
Fireflies-extracted transcripts (later plans) or from DG manual entry
(Plan 2). All items, regardless of source, share schema, lifecycle, and
visibility rules.

## Spec

`docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` is the
authoritative source. Read it before changing this module. The locked
decisions in §0 are not negotiable — they propagate into the schema, the
UI, and every API contract.

## Structure (Plan 1 — foundation)

- `constants.ts` — frozen enums and lookup tables that mirror the
  CHECK constraints in migration 102.
- `types.ts` — TypeScript row types and Zod schemas for the 5 new tables
  plus the `users` staff fields.
- `visibility.ts` — `canSeeItem(user, item)` pure function. App-layer
  visibility enforcement, consistent with how the Tasks and Projects
  modules in DGOS gate reads. No Supabase RLS for this domain.

## Prompt versioning rule (anticipating Plan 4)

Prompts live in `lib/action-items/prompts/extraction-<modality>-vN.M.ts`.
**Never edit a versioned prompt file in place.** Any change — wording,
addendum, banned-phrase update — requires a new filename and a new
`prompt_version` string. Old extractions reference the prompt they ran
against; preserving the file is what makes per-prompt-version eval
possible.

## Attribution anchor

Every AI-generated action item is attributed to the meeting itself,
not to the AI and not to the DG. Card text is computed at render time
from `source` + lookup; never stored. This is locked decision §0.1
in the spec.
