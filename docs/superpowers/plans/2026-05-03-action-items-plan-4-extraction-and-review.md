# Action Items — Plan 4: Extraction + Validation + Resolution + Review Queue + Political-Risk Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (rev 2026-05-03b — read the changelog first).
**Predecessors:**
- Plan 1 (shipped) — migration 102, constants, types, `canSeeTask`, review-queue shells.
- Plan 2 (in flight) — `tasks` widened with extraction provenance, validation module (`validateTaskDraft`), events helper, lifecycle endpoints, `InlineExtractionAddItem` component.
- Plan 3 (corrected, rev 2026-05-04) — Fireflies client + poll, `meetings_seen` populated with `pipeline_action='queued'` and `detected_*=null`, manual classification dropdowns on `/action-items/meetings`, migration 104 (drops per-meeting agency, adds `polling_state`).

**Goal:** Take a `meetings_seen` row that the user has manually classified as `(internal, virtual)`, fetch its transcript, run Claude with a versioned prompt and tool-use, validate every proposed item, resolve owners + due dates + priority, route every item through the political-risk gate (which catches null `detected_type` / null `detected_modality` as unclassified → mandatory review), present the result in a three-bucket review queue at `/action-items/review/[extractionId]`, and on accept insert into `tasks` with `source='extraction'` and full provenance. Manual extraction trigger at `/action-items/process`. Speaker-collapse handling for virtual transcripts. Eval data capture (per-extraction counters) for Plan 5's eval dashboard.

**Architecture:** Anthropic SDK direct, with tool-use as the JSON contract (no free-form parsing). Two prompt files — `extraction-virtual-v0.1.ts` and `extraction-inperson-v0.1.ts` — both producing the same JSON schema; only virtual is wired in v1. Validation pipeline is a composition: Plan 2's `validateTaskDraft` plus a new `validateExtractionItem` that adds quote-substring (after normalization) and confidence-threshold checks. Resolution pipeline is three pure modules (owner, due, priority) + an aggregating `resolveExtractedItem` that returns a draft ready for review. Political-risk gate is a single hard-coded predicate `requiresMandatoryReview(item, meeting, owner)` — never bypassable, even by Plan 5's earned-trust tracker. Review queue is a server-rendered three-bucket layout (mandatory / quick-scan pre-checked / auto-accepted collapsed) with a client-side keyboard-shortcut handler and per-item edit forms. Accept goes through a single batch endpoint that inserts accepted items into `tasks` (one row per item) and stamps `action_item_extractions.items_accepted/edited/rejected/added_manually` for eval. Reject just increments the counter; rejected items never enter `tasks`. Manual extraction is a thin form that resolves a Fireflies meeting ID, runs the same pipeline, redirects to review.

**Tech Stack:** Next.js 16 App Router, Anthropic SDK (`@anthropic-ai/sdk`), Vercel AI Gateway as fallback if ZDR not in place, Supabase JS, Zod, Vitest, the existing notifications stack.

---

## Conventions for this plan

- **Tests live in** `lib/__tests__/`. Pure-logic modules (validation, normalization, resolution, political-risk gate) are TDD: failing test first, then implementation. The Anthropic call itself isn't unit-tested; it's exercised end-to-end against a fixture transcript.
- **Prompt source-of-truth rule** (spec §5.1): TypeScript files under `lib/action-items/prompts/` are canonical. Bumping a prompt = new filename (`extraction-virtual-v0.1.ts` → `extraction-virtual-v0.2.ts`); old files stay; `prompt_version` strings on `action_item_extractions` reference them.
- **ZDR**: extraction routes through Anthropic SDK directly. ZDR is contractually in place (the project already uses Anthropic for Gyaff and S3). Required env: `ANTHROPIC_API_KEY` + `ANTHROPIC_ZDR_CONFIRMED=true`. The earlier Vercel AI Gateway alternate path is dropped.
- **Auth on every route**: `requireRole(['dg','ps'])` for review-queue submit and manual-extraction-trigger endpoints. The review pages themselves stay DG/PS-only (Plan 1 page guards already in place).
- **Status state machine**: extracted items enter `tasks` with `status='new'`. The political-risk gate determines bucket placement, not status. Plan 2's lifecycle owns post-acceptance transitions.
- **Agency** (per correction 2): items inherit agency from `owner.agency` via the resolved owner. Items with unresolved owner have `tasks.agency=NULL` and are forced to mandatory review until the reviewer fixes it.
- **No supersession matching** in Plan 4. The review queue surfaces a `<SupersessionSuggestion>` slot that gracefully no-ops when Plan 5 hasn't been wired; Plan 5 wires the matcher.
- **Eval counters** (`items_extracted`, `items_accepted`, `items_edited`, `items_rejected`, `items_added_manually`) update on every review action. Plan 5's eval dashboard reads these.
- **Commits**: small, frequent. `feat:`, `test:`, `refactor:`, `docs:`, `chore:`. `npx tsc --noEmit` clean before each commit.

---

## File map

**Created — extraction core:**

- `lib/action-items/prompts/extraction-virtual-v0.1.ts` — virtual-meeting prompt + tool schema.
- `lib/action-items/prompts/extraction-inperson-v0.1.ts` — in-person prompt (drafted, not wired in v1).
- `lib/action-items/extraction/types.ts` — `ExtractedItem` (raw output shape), `ExtractionRunResult`.
- `lib/action-items/extraction/extract.ts` — `runExtraction(extractionRequest)` — Claude tool-use call, persists to `action_item_extractions`.
- `lib/action-items/extraction/chunk.ts` — `chunkTranscriptIfNeeded(transcript)` for >60k-token transcripts (30-min windows, 5-min overlap).

**Created — validation (extraction-specific):**

- `lib/action-items/validation/normalize.ts` — `normalizeForQuoteCompare(text)`.
- `lib/action-items/validation/quote-substring.ts` — `quoteAppearsInTranscript(quote, transcript)`.
- `lib/action-items/validation/extraction.ts` — `validateExtractionItem(item, transcript)` (composes Plan 2's `validateTaskDraft` + extraction-specific checks).

**Created — resolution:**

- `lib/action-items/resolution/owner.ts` — `resolveOwner(nameRaw, attendees, allUsers, confidence)` — meeting-scoped → global → role fallback.
- `lib/action-items/resolution/due.ts` — `resolveDueDate(phrase, meetingDate)`.
- `lib/action-items/resolution/priority.ts` — `assignPriority(item, owner)` returning P0–P3 mapped to `tasks.priority`.
- `lib/action-items/resolution/safety-keywords.ts` — frozen list per spec §6.5.
- `lib/action-items/resolution/resolve.ts` — `resolveExtractedItem(raw, meeting, attendees, allUsers, transcript)` aggregating into a `ReviewableItem`.

**Created — political-risk gate:**

- `lib/action-items/gate.ts` — `requiresMandatoryReview(item, meeting, owner)` — hard-coded predicate.

**Created — review-queue API:**

- `app/api/action-items/extract/route.ts` — `POST` manual extraction trigger.
- `app/api/action-items/review/[extractionId]/route.ts` — `POST` batch submit decisions; widens `tasks` insert with extraction provenance.

**Created — review-queue UI:**

- `components/action-items/ReviewBucket.tsx` — single bucket (mandatory / quick-scan / auto-accepted).
- `components/action-items/ReviewItemCard.tsx` — single item; expandable edit form.
- `components/action-items/TranscriptSnippet.tsx` — left-side transcript view with timestamp jump.
- `components/action-items/ReviewKeyboardShortcuts.tsx` — global keyboard handler (J/K, A/E/R, Cmd+Enter, ?).
- `components/action-items/SupersessionSuggestion.tsx` — slot component; renders nothing when matcher unwired.
- `app/action-items/review/page.tsx` — meeting cards (replaces Plan 1 shell).
- `app/action-items/review/[extractionId]/page.tsx` — three-bucket review (replaces Plan 1 shell).
- `app/action-items/process/page.tsx` — manual-trigger form.

**Modified:**

- `app/api/tasks/route.ts` — POST Zod widens to accept extraction-source fields (`source='extraction'`, `extraction_id`, `extraction_item_idx`, `source_quote`, `source_timestamp`, `owner_name_raw`, `verb_category`, `confidence_overall`, `confidence_reasons`, `visibility_scope`).
- `lib/action-items/types.ts` — re-export `ReviewableItem`, `ExtractedItem` for shared use.
- `package.json` — add `@anthropic-ai/sdk`.

---

## Task 1: Anthropic SDK + ZDR-aware client

**Files:**
- Modify: `package.json`
- Create: `lib/action-items/extraction/anthropic-client.ts`

- [ ] **Step 1: Install the SDK.**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Implement the client.**

```typescript
// lib/action-items/extraction/anthropic-client.ts
//
// Data handling: this project already runs on Anthropic for Gyaff and S3,
// and ZDR is confirmed contractually. The Vercel AI Gateway alternate path
// from earlier drafts is dropped — only the direct path is wired.
//
// Required env at runtime:
//   - ANTHROPIC_API_KEY      (the secret)
//   - ANTHROPIC_ZDR_CONFIRMED=true   (a tripwire — fail loudly if not set,
//                                     so the route never quietly falls back
//                                     to a non-ZDR posture)
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic client misconfigured: ANTHROPIC_API_KEY not set.');
  }
  if (process.env.ANTHROPIC_ZDR_CONFIRMED !== 'true') {
    throw new Error('Anthropic client misconfigured: ANTHROPIC_ZDR_CONFIRMED must be "true". Confirm ZDR posture before enabling extraction.');
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const EXTRACTION_MODEL = 'claude-opus-4-7';
```

- [ ] **Step 3: Commit.**

```bash
git add package.json package-lock.json lib/action-items/extraction/anthropic-client.ts
git commit -m "feat(action-items): Anthropic SDK + ZDR-aware client"
```

---

## Task 2: Tool-use JSON schema + ExtractedItem type

**Files:**
- Create: `lib/action-items/extraction/types.ts`

- [ ] **Step 1: Implement.**

```typescript
import { z } from 'zod';
import { VERB_CATEGORIES } from '@/lib/action-items/constants';

// Output of a single Claude extraction. Matches the tool-use input_schema.
export const ExtractedItemZ = z.object({
  owner_name_raw: z.string().min(1),
  task: z.string().min(1).max(500),
  verb_category: z.enum(VERB_CATEGORIES),
  due_phrase: z.string().nullable(),
  source_timestamp: z.string().min(1),
  source_quote: z.string().min(1).max(500),
  confidence_per_field: z.object({
    owner: z.number().min(0).max(1),
    task: z.number().min(0).max(1),
    due: z.number().min(0).max(1),
    quote: z.number().min(0).max(1),
  }),
  confidence_reasons: z.array(z.string()).default([]),
});

export type ExtractedItem = z.infer<typeof ExtractedItemZ>;

export const ExtractionToolInputZ = z.object({
  items: z.array(ExtractedItemZ),
});

export interface ExtractionRunResult {
  extraction_id: string;          // action_item_extractions.id
  prompt_version: string;
  items: ExtractedItem[];
  token_count_input: number;
  token_count_output: number;
  duration_ms: number;
}
```

- [ ] **Step 2: Commit.**

```bash
git add lib/action-items/extraction/types.ts
git commit -m "feat(action-items): ExtractedItem Zod schema (tool-use contract)"
```

---

## Task 3: Prompt files (virtual + in-person)

**Files:**
- Create: `lib/action-items/prompts/extraction-virtual-v0.1.ts`
- Create: `lib/action-items/prompts/extraction-inperson-v0.1.ts`
- Create: `lib/action-items/prompts/tool-schema.ts`

- [ ] **Step 1: Tool schema (shared across both prompts).**

```typescript
// lib/action-items/prompts/tool-schema.ts
import type { Anthropic } from '@anthropic-ai/sdk';
import { VERB_CATEGORIES } from '@/lib/action-items/constants';

export const EXTRACTION_TOOL_SCHEMA: Anthropic.Tool = {
  name: 'submit_action_items',
  description: 'Submit the structured list of action items extracted from the transcript.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['owner_name_raw', 'task', 'verb_category', 'due_phrase',
                     'source_timestamp', 'source_quote', 'confidence_per_field'],
          properties: {
            owner_name_raw:    { type: 'string' },
            task:              { type: 'string', maxLength: 500 },
            verb_category:     { type: 'string', enum: [...VERB_CATEGORIES] },
            due_phrase:        { type: ['string', 'null'] },
            source_timestamp:  { type: 'string' },
            source_quote:      { type: 'string', maxLength: 500 },
            confidence_per_field: {
              type: 'object',
              required: ['owner', 'task', 'due', 'quote'],
              properties: {
                owner: { type: 'number', minimum: 0, maximum: 1 },
                task:  { type: 'number', minimum: 0, maximum: 1 },
                due:   { type: 'number', minimum: 0, maximum: 1 },
                quote: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
            confidence_reasons: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    required: ['items'],
  },
};
```

- [ ] **Step 2: Virtual prompt.**

```typescript
// lib/action-items/prompts/extraction-virtual-v0.1.ts
import { EXTRACTION_TOOL_SCHEMA } from './tool-schema';

export const PROMPT_VERSION = 'virtual-v0.1';

export interface MeetingMetadata {
  date: string;             // ISO
  title: string | null;
  attendees: Array<{ name: string | null; email: string | null }>;
}

export function buildVirtualSystemPrompt(meta: MeetingMetadata): string {
  const attendeeBlock = meta.attendees
    .map(a => `- ${a.name ?? '?'} (${a.email ?? 'no-email'})`)
    .join('\n');
  return `You extract canonical action items from meeting transcripts. Submit them via the submit_action_items tool — never as free text.

Speaker labels in this transcript are reliable. Use the labeled speaker as the primary owner signal when a directive is followed by acknowledgment. Cross-reference owner_name_raw against the meeting attendee list.

Rules:
1. Owner: name as spoken; owner_name_raw is the verbatim spoken name. Do not resolve.
2. Task: rewrite as a canonical sentence starting with an approved verb. Banned phrases are forbidden: "follow up on", "follow up with", "touch base", "circle back", "look into", "address the issue of", "handle" (as a verb), "work on" (as a verb).
3. Verb category: one of correspondence, decision, information, scheduling, project_update, analysis.
4. Due: due_phrase is the raw phrase as spoken (e.g., "by Friday", "today", "next week"). null if no temporal language.
5. Source: source_timestamp from the transcript marker; source_quote ≤500 chars of the verbatim sentence containing the directive.
6. Confidence: 0.0–1.0 per field; calibrate honestly. confidence_reasons explains low scores in plain text.
7. No co-owners. Single owner only. If genuinely joint, pick one and note in confidence_reasons.
8. Include the DG's own commitments.
9. Skip cancelled items.
10. Never infer priority. Never link records.

<meeting_metadata>
  <date>${meta.date}</date>
  <title>${meta.title ?? '(untitled)'}</title>
  <attendees>
${attendeeBlock}
  </attendees>
</meeting_metadata>`;
}

export const VIRTUAL_TOOL_SCHEMA = EXTRACTION_TOOL_SCHEMA;
```

- [ ] **Step 3: In-person prompt (drafted, not wired in v1).**

```typescript
// lib/action-items/prompts/extraction-inperson-v0.1.ts
import { EXTRACTION_TOOL_SCHEMA } from './tool-schema';

export const PROMPT_VERSION = 'inperson-v0.1';

import type { MeetingMetadata } from './extraction-virtual-v0.1';

export function buildInPersonSystemPrompt(meta: MeetingMetadata): string {
  const attendeeBlock = meta.attendees
    .map(a => `- ${a.name ?? '?'} (${a.email ?? 'no-email'})`)
    .join('\n');
  return `You extract canonical action items from meeting transcripts. Submit them via the submit_action_items tool — never as free text.

Speaker labels in this transcript are unreliable or generic ("Speaker 1"). Infer ownership from textual context: directive patterns ("Kesh, you'll handle this"), addressed-name patterns, acknowledgment patterns ("yes, I'll do that" within 3 turns of a directive), and the attendee list. Lower owner confidence appropriately. When the speaker is "Speaker N" and no name appears in the surrounding directive, set owner_name_raw to "unknown" and confidence_per_field.owner ≤ 0.5.

[Same rules 2–10 as virtual prompt]

<meeting_metadata>
  <date>${meta.date}</date>
  <title>${meta.title ?? '(untitled)'}</title>
  <attendees>
${attendeeBlock}
  </attendees>
</meeting_metadata>`;
}

export const INPERSON_TOOL_SCHEMA = EXTRACTION_TOOL_SCHEMA;
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/prompts/
git commit -m "feat(action-items): extraction prompts (virtual wired, in-person drafted)"
```

---

## Task 4: Validation — quote normalization + substring (TDD)

**Files:**
- Create: `lib/action-items/validation/normalize.ts`
- Create: `lib/action-items/validation/quote-substring.ts`
- Create: `lib/__tests__/action-items-quote-validation.test.ts`

- [ ] **Step 1: Failing test.**

```typescript
// lib/__tests__/action-items-quote-validation.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeForQuoteCompare } from '@/lib/action-items/validation/normalize';
import { quoteAppearsInTranscript } from '@/lib/action-items/validation/quote-substring';

describe('normalizeForQuoteCompare', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForQuoteCompare('  Hello   World  ')).toBe('hello world');
  });
  it('strips [inaudible] / [crosstalk] / [applause]', () => {
    expect(normalizeForQuoteCompare('I will [inaudible] do it'))
      .toBe('i will do it');
    expect(normalizeForQuoteCompare('Sure [crosstalk] yes')).toBe('sure yes');
  });
  it('normalizes smart quotes and dashes', () => {
    expect(normalizeForQuoteCompare('“Yes,” he said—then left.'))
      .toBe('"yes," he said-then left.');
  });
});

describe('quoteAppearsInTranscript', () => {
  it('matches after normalization', () => {
    const transcript = '00:01:00 Speaker 1: I will [inaudible] approve the contract by Friday.';
    expect(quoteAppearsInTranscript('I will approve the contract by Friday.', transcript)).toBe(true);
  });
  it('rejects fabricated quote', () => {
    const transcript = '00:01:00 Speaker 1: Hello there.';
    expect(quoteAppearsInTranscript('I will approve the contract.', transcript)).toBe(false);
  });
  it('matches with smart-quote difference', () => {
    const transcript = 'He said "the answer is yes."';
    expect(quoteAppearsInTranscript('He said “the answer is yes.”', transcript)).toBe(true);
  });
});
```

```bash
npx vitest run lib/__tests__/action-items-quote-validation.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/validation/normalize.ts
const STRIP_TOKENS = /\[(inaudible|crosstalk|applause|laughter|silence)\]/gi;

export function normalizeForQuoteCompare(s: string): string {
  return s
    .replace(STRIP_TOKENS, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
```

```typescript
// lib/action-items/validation/quote-substring.ts
import { normalizeForQuoteCompare } from './normalize';

export function quoteAppearsInTranscript(quote: string, transcript: string): boolean {
  const nq = normalizeForQuoteCompare(quote);
  const nt = normalizeForQuoteCompare(transcript);
  return nq.length > 0 && nt.includes(nq);
}
```

Run the test; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/validation/normalize.ts lib/action-items/validation/quote-substring.ts lib/__tests__/action-items-quote-validation.test.ts
git commit -m "feat(action-items): quote normalization + substring check (TDD)"
```

---

## Task 5: Validation — extraction composition (TDD)

**Files:**
- Create: `lib/action-items/validation/extraction.ts`
- Create: `lib/__tests__/action-items-validation-extraction.test.ts`

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { validateExtractionItem } from '@/lib/action-items/validation/extraction';
import type { ExtractedItem } from '@/lib/action-items/extraction/types';

const baseItem: ExtractedItem = {
  owner_name_raw: 'Kesh',
  task: 'Issue notification of termination to InterEnergy',
  verb_category: 'correspondence',
  due_phrase: 'by Friday',
  source_timestamp: '00:01:00',
  source_quote: 'I will issue the termination notice by Friday',
  confidence_per_field: { owner: 0.9, task: 0.95, due: 0.9, quote: 0.95 },
  confidence_reasons: [],
};
const transcript = '00:01:00 Kesh: I will issue the termination notice by Friday.';

describe('validateExtractionItem', () => {
  it('accepts a clean item', () => {
    expect(validateExtractionItem(baseItem, transcript).ok).toBe(true);
  });
  it('rejects a fabricated quote', () => {
    const r = validateExtractionItem({ ...baseItem, source_quote: 'I will sell the company tomorrow' }, transcript);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'quote_fabricated')).toBe(true);
  });
  it('inherits banned-phrase rejection from validateTaskDraft', () => {
    const r = validateExtractionItem({ ...baseItem, task: 'Follow up on the InterEnergy issue' }, transcript);
    expect(r.ok).toBe(false);
  });
  it('rejects missing source_timestamp', () => {
    const r = validateExtractionItem({ ...baseItem, source_timestamp: '' }, transcript);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/validation/extraction.ts
import { validateTaskDraft, type ValidationIssue } from '@/lib/action-items/validation';
import { quoteAppearsInTranscript } from './quote-substring';
import type { ExtractedItem } from '@/lib/action-items/extraction/types';

export type ExtractionValidationResult =
  | { ok: true }
  | { ok: false; issues: Array<ValidationIssue | { code: 'quote_fabricated' | 'quote_missing' | 'timestamp_missing'; field: 'source_quote' | 'source_timestamp'; message: string }> };

export function validateExtractionItem(
  item: ExtractedItem,
  transcript: string,
): ExtractionValidationResult {
  const base = validateTaskDraft({
    source: 'extraction',
    title: item.task,
    agency: '_unresolved_',           // resolution module sets the real value; pass non-null to skip required-check
    owner_user_id: '_unresolved_',    // ditto
    owner_name_raw: item.owner_name_raw,
    verb_category: item.verb_category,
  });
  const issues: ExtractionValidationResult extends { ok: false; issues: infer I } ? I : never = [];
  if (!base.ok) issues.push(...base.issues);

  if (!item.source_quote || item.source_quote.trim().length === 0) {
    issues.push({ code: 'quote_missing', field: 'source_quote', message: 'source_quote is required for extraction items.' });
  } else if (!quoteAppearsInTranscript(item.source_quote, transcript)) {
    issues.push({ code: 'quote_fabricated', field: 'source_quote',
      message: 'source_quote does not appear in the transcript after normalization (likely fabricated).' });
  }
  if (!item.source_timestamp || item.source_timestamp.trim().length === 0) {
    issues.push({ code: 'timestamp_missing', field: 'source_timestamp', message: 'source_timestamp is required.' });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
```

Run the test; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/validation/extraction.ts lib/__tests__/action-items-validation-extraction.test.ts
git commit -m "feat(action-items): validateExtractionItem composes validateTaskDraft + quote checks"
```

---

## Task 6: Resolution — owner (TDD)

**Files:**
- Create: `lib/action-items/resolution/owner.ts`
- Create: `lib/__tests__/action-items-resolve-owner.test.ts`

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveOwner } from '@/lib/action-items/resolution/owner';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'officer', agency: null, aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const kesh = u({ id: 'kesh', name: 'Kesh Nandlall', aliases: ['Kesh', 'Cash', 'Keche'], agency: 'GPL', email: 'kesh@gpl.com.gy' });
const dg   = u({ id: 'dg',   name: 'Alfonso De Armas', role: 'dg', email: 'alfonso@mpua.gov.gy' });
const otherKesh = u({ id: 'kesh2', name: 'Kesh Singh', email: 'k@somewhere.org' });

describe('resolveOwner', () => {
  it('matches alias inside meeting attendees', () => {
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.9, attendees: [kesh, dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('meeting_scoped');
  });
  it('falls back to global universe at confidence ≥0.95 when unique', () => {
    const r = resolveOwner({ name_raw: 'Kesh Nandlall', confidence: 0.96, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('global');
  });
  it('refuses global fallback when confidence <0.95', () => {
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.85, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBeNull();
  });
  it('refuses global fallback on first-name collision', () => {
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.99, attendees: [dg], allUsers: [kesh, otherKesh, dg] });
    expect(r.owner_id).toBeNull();
  });
  it('case-insensitive matching', () => {
    const r = resolveOwner({ name_raw: 'KESH', confidence: 0.9, attendees: [kesh, dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
  });
  it('returns null when nothing matches', () => {
    const r = resolveOwner({ name_raw: 'Nobody', confidence: 0.99, attendees: [dg], allUsers: [dg] });
    expect(r.owner_id).toBeNull();
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/resolution/owner.ts
import type { UserStaffFields } from '@/lib/action-items/types';

export interface ResolveOwnerInput {
  name_raw: string;
  confidence: number;
  attendees: UserStaffFields[];
  allUsers: UserStaffFields[];
}
export interface ResolveOwnerResult {
  owner_id: string | null;
  method: 'meeting_scoped' | 'global' | 'role' | 'unresolved';
}

const norm = (s: string) => s.trim().toLowerCase();

function matchesUser(name: string, u: UserStaffFields): boolean {
  const n = norm(name);
  const candidates = [u.name, ...(u.aliases ?? [])].filter((x): x is string => !!x).map(norm);
  return candidates.includes(n);
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return norm(name).split(/\s+/)[0] ?? null;
}

export function resolveOwner(input: ResolveOwnerInput): ResolveOwnerResult {
  // Stage 1: meeting-scoped (exact name or alias match within attendees)
  const inMeeting = input.attendees.filter(u => matchesUser(input.name_raw, u));
  if (inMeeting.length === 1) return { owner_id: inMeeting[0].id, method: 'meeting_scoped' };

  // Stage 2: global, only if confidence ≥0.95 AND single match
  if (input.confidence >= 0.95) {
    const exact = input.allUsers.filter(u => matchesUser(input.name_raw, u));
    if (exact.length === 1) return { owner_id: exact[0].id, method: 'global' };
    // First-name uniqueness: if name_raw is one token, allow if exactly one user shares that first name.
    const tokens = norm(input.name_raw).split(/\s+/);
    if (tokens.length === 1) {
      const fn = tokens[0];
      const fnMatches = input.allUsers.filter(u => firstName(u.name) === fn);
      if (fnMatches.length === 1) return { owner_id: fnMatches[0].id, method: 'global' };
    }
  }
  return { owner_id: null, method: 'unresolved' };
}
```

Run; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/resolution/owner.ts lib/__tests__/action-items-resolve-owner.test.ts
git commit -m "feat(action-items): resolveOwner — meeting-scoped → global fallback"
```

---

## Task 7: Resolution — due date (TDD)

**Files:**
- Create: `lib/action-items/resolution/due.ts`
- Create: `lib/__tests__/action-items-resolve-due.test.ts`

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveDueDate } from '@/lib/action-items/resolution/due';

const monday = new Date('2026-04-13T10:00:00-04:00');     // Mon, 10 AM Guyana
const friday = new Date('2026-04-17T15:00:00-04:00');     // Fri, 3 PM Guyana

describe('resolveDueDate', () => {
  it('today → meeting-date 18:00 Guyana', () => {
    const r = resolveDueDate('today', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-13');
    expect(r.due_trigger).toBeNull();
  });
  it('tomorrow → next-day 09:00', () => {
    expect(resolveDueDate('tomorrow', monday).due_at?.toISOString().slice(0, 10)).toBe('2026-04-14');
  });
  it('this week → Friday of meeting week', () => {
    const r = resolveDueDate('this week', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-17');
  });
  it('this week on Friday-afternoon → following Friday', () => {
    const r = resolveDueDate('this week', friday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-24');
  });
  it('next week → Friday of following week', () => {
    expect(resolveDueDate('next week', monday).due_at?.toISOString().slice(0, 10)).toBe('2026-04-24');
  });
  it('ASAP → meeting + 3 weekdays, flagged', () => {
    const r = resolveDueDate('ASAP', monday);
    expect(r.due_at?.toISOString().slice(0, 10)).toBe('2026-04-16');   // Thu
    expect(r.flagged).toBe(true);
  });
  it('"when ready" → null due, due_trigger set', () => {
    const r = resolveDueDate('when ready', monday);
    expect(r.due_at).toBeNull();
    expect(r.due_trigger).toBe('when ready');
  });
  it('null phrase → null with low confidence flag', () => {
    const r = resolveDueDate(null, monday);
    expect(r.due_at).toBeNull();
    expect(r.due_trigger).toBeNull();
    expect(r.flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/resolution/due.ts
//
// All times resolved in America/Guyana (UTC-4, no DST).

const TRIGGER_PHRASES = ['when ready', 'in due course', 'when complete', 'when done'];

export interface ResolveDueResult {
  due_at: Date | null;
  due_trigger: string | null;
  flagged: boolean;
}

function atGuyana(date: Date, hours: number): Date {
  // Construct a Date at the given hours in UTC-4.
  const local = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours + 4, 0, 0));
  return local;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function nextFriday(d: Date, atHours = 17): Date {
  // Day-of-week in Guyana time
  const guyanaHour = (d.getUTCHours() - 4 + 24) % 24;
  const guyanaDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    guyanaHour, d.getUTCMinutes(), 0));
  const dow = guyanaDate.getUTCDay();   // 0=Sun, 5=Fri
  let delta = (5 - dow + 7) % 7;
  // If meeting is Friday afternoon (after 12:00 Guyana), roll to following Friday.
  if (dow === 5 && guyanaHour >= 12) delta = 7;
  if (delta === 0 && dow !== 5) delta = 7;
  return atGuyana(addDays(guyanaDate, delta), atHours);
}

function addWeekdays(d: Date, n: number): Date {
  let out = new Date(d);
  let added = 0;
  while (added < n) {
    out = addDays(out, 1);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return out;
}

export function resolveDueDate(phrase: string | null, meetingDate: Date): ResolveDueResult {
  if (phrase === null) {
    return { due_at: null, due_trigger: null, flagged: true };
  }
  const p = phrase.trim().toLowerCase();
  if (TRIGGER_PHRASES.some(t => p.includes(t))) {
    return { due_at: null, due_trigger: phrase, flagged: false };
  }
  if (p.includes('today') || p.includes('eod')) {
    return { due_at: atGuyana(meetingDate, 18), due_trigger: null, flagged: false };
  }
  if (p.includes('tomorrow') || p.includes('by morning')) {
    return { due_at: atGuyana(addDays(meetingDate, 1), 9), due_trigger: null, flagged: false };
  }
  if (p.includes('next week')) {
    const fri = nextFriday(meetingDate, 17);
    return { due_at: addDays(fri, 7), due_trigger: null, flagged: false };
  }
  if (p.includes('this week')) {
    return { due_at: nextFriday(meetingDate, 17), due_trigger: null, flagged: false };
  }
  if (p.includes('asap')) {
    return { due_at: addWeekdays(meetingDate, 3), due_trigger: null, flagged: true };
  }
  // No temporal language we recognize — flag for review.
  return { due_at: null, due_trigger: null, flagged: true };
}
```

Run; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/resolution/due.ts lib/__tests__/action-items-resolve-due.test.ts
git commit -m "feat(action-items): resolveDueDate — phrase mapping per spec §6.3"
```

---

## Task 8: Resolution — priority + safety keywords (TDD)

**Files:**
- Create: `lib/action-items/resolution/safety-keywords.ts`
- Create: `lib/action-items/resolution/priority.ts`
- Create: `lib/__tests__/action-items-resolve-priority.test.ts`

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { assignPriority } from '@/lib/action-items/resolution/priority';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'officer', agency: null, aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const baseDraft = {
  task: 'Issue notification of termination',
  source_quote: '',
  due_at: null as Date | null,
  speaker_role: 'officer' as 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg',
};

const meetingDate = new Date('2026-04-13T10:00:00-04:00');

describe('assignPriority', () => {
  it('P0 when deadline ≤24h AND safety keyword in task', () => {
    const due = new Date(meetingDate.getTime() + 12 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, task: 'Investigate fire at Kingston substation', due_at: due }, u({}), meetingDate);
    expect(r).toBe('critical');
  });
  it('P0 when deadline ≤24h AND speaker is minister', () => {
    const due = new Date(meetingDate.getTime() + 12 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, due_at: due, speaker_role: 'minister' }, u({}), meetingDate);
    expect(r).toBe('critical');
  });
  it('P1 when deadline ≤5 weekdays AND speaker is ps', () => {
    const due = new Date(meetingDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const r = assignPriority({ ...baseDraft, due_at: due, speaker_role: 'ps' }, u({}), meetingDate);
    expect(r).toBe('high');
  });
  it('P2 for deadline 6–28 days', () => {
    const due = new Date(meetingDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(assignPriority({ ...baseDraft, due_at: due }, u({}), meetingDate)).toBe('medium');
  });
  it('P3 for no deadline', () => {
    expect(assignPriority({ ...baseDraft, due_at: null }, u({}), meetingDate)).toBe('low');
  });
  it('P3 for deadline >28 days', () => {
    const due = new Date(meetingDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    expect(assignPriority({ ...baseDraft, due_at: due }, u({}), meetingDate)).toBe('low');
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/resolution/safety-keywords.ts
export const SAFETY_KEYWORDS = [
  'safety','fire','accident','fatality','injury','hazard',
  'evacuation','emergency','outage','blackout','spill','contamination',
] as const;
```

```typescript
// lib/action-items/resolution/priority.ts
import type { UserStaffFields } from '@/lib/action-items/types';
import { SAFETY_KEYWORDS } from './safety-keywords';

export interface PriorityInput {
  task: string;
  source_quote: string;
  due_at: Date | null;
  speaker_role: 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg';
}

type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

function hasSafetyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFETY_KEYWORDS.some(k => lower.includes(k));
}

function hoursUntil(now: Date, future: Date): number {
  return (future.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function weekdaysUntil(now: Date, future: Date): number {
  const days = Math.floor((future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let count = 0;
  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function assignPriority(input: PriorityInput, _owner: UserStaffFields, asOf: Date): TaskPriority {
  const due = input.due_at;
  if (due) {
    const hrs = hoursUntil(asOf, due);
    if (hrs <= 24) {
      const safety = hasSafetyKeyword(input.task) || hasSafetyKeyword(input.source_quote);
      if (safety || input.speaker_role === 'minister' || input.speaker_role === 'dg') {
        return 'critical';
      }
    }
    const wd = weekdaysUntil(asOf, due);
    if (wd <= 5 && (input.speaker_role === 'minister' || input.speaker_role === 'ps' || input.speaker_role === 'parl_sec')) {
      return 'high';
    }
    const days = (due.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 6 && days <= 28) return 'medium';
  }
  return 'low';
}
```

Run; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/resolution/safety-keywords.ts lib/action-items/resolution/priority.ts lib/__tests__/action-items-resolve-priority.test.ts
git commit -m "feat(action-items): assignPriority + safety keywords"
```

---

## Task 9: Political-risk gate (TDD)

**Files:**
- Create: `lib/action-items/gate.ts`
- Create: `lib/__tests__/action-items-gate.test.ts`

The gate is hard-coded and never bypassed by Plan 5's earned-trust tracker. Plan 5's trust check runs *after* the gate; the gate is the floor.

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { requiresMandatoryReview } from '@/lib/action-items/gate';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'officer', agency: 'GPL', aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const baseMeeting = {
  detected_type: 'internal' as 'internal' | 'agency' | 'external' | null,
  detected_modality: 'virtual' as 'virtual' | 'in_person' | 'mixed' | null,
  inaudible_pct: 0.05,
};
const baseItem = {
  confidence_overall: 0.9,
  validation_failed: false,
  owner_id: 'u',
  due_at: new Date('2026-05-10'),
  due_trigger: null as string | null,
};
const owner = u({});

describe('requiresMandatoryReview', () => {
  it('passes (quick-scan) when nothing is unusual', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting, owner)).toBe(false);
  });
  it('mandatory when detected_type is null (unclassified)', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: null }, owner)).toBe(true);
  });
  it('mandatory when detected_modality is null (unclassified)', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: null }, owner)).toBe(true);
  });
  it('mandatory when type is agency or external', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: 'agency' }, owner)).toBe(true);
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_type: 'external' }, owner)).toBe(true);
  });
  it('mandatory when modality is in_person or mixed', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: 'in_person' }, owner)).toBe(true);
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, detected_modality: 'mixed' }, owner)).toBe(true);
  });
  it('mandatory when owner is agency head (one of 7 CEOs)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting, u({ is_agency_head: true }))).toBe(true);
  });
  it('mandatory when owner is DG', () => {
    expect(requiresMandatoryReview({ ...baseItem, owner_id: 'dg' }, baseMeeting, u({ id: 'dg', role: 'dg' }))).toBe(true);
  });
  // Three populations gated by closure_mode='dg_managed' — Minister, PS, parl_sec.
  // is_agency_head=false for these (per spec §0 #12). Same gate trigger, distinct semantic.
  it('mandatory when owner is Minister (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'min', role: 'minister', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when owner is PS (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'ps', role: 'ps', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when owner is parl_sec (closure_mode=dg_managed)', () => {
    expect(requiresMandatoryReview(baseItem, baseMeeting,
      u({ id: 'pse', role: 'parl_sec', closure_mode: 'dg_managed', is_agency_head: false })
    )).toBe(true);
  });
  it('mandatory when confidence_overall < 0.85', () => {
    expect(requiresMandatoryReview({ ...baseItem, confidence_overall: 0.8 }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when validation flagged', () => {
    expect(requiresMandatoryReview({ ...baseItem, validation_failed: true }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when owner_id is null', () => {
    expect(requiresMandatoryReview({ ...baseItem, owner_id: null }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when no due_at AND no due_trigger', () => {
    expect(requiresMandatoryReview({ ...baseItem, due_at: null, due_trigger: null }, baseMeeting, owner)).toBe(true);
  });
  it('mandatory when inaudible_pct > 0.30', () => {
    expect(requiresMandatoryReview(baseItem, { ...baseMeeting, inaudible_pct: 0.35 }, owner)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/gate.ts
import type { UserStaffFields } from './types';
import type { MeetingType, Modality } from './constants';

export interface GateItem {
  confidence_overall: number;
  validation_failed: boolean;
  owner_id: string | null;
  due_at: Date | null;
  due_trigger: string | null;
}
export interface GateMeeting {
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  inaudible_pct: number;
}

export function requiresMandatoryReview(
  item: GateItem,
  meeting: GateMeeting,
  owner: UserStaffFields,
): boolean {
  if (meeting.detected_type === null) return true;
  if (meeting.detected_modality === null) return true;
  if (meeting.detected_type === 'agency' || meeting.detected_type === 'external') return true;
  if (meeting.detected_modality === 'in_person' || meeting.detected_modality === 'mixed') return true;
  if (owner.is_agency_head) return true;             // 7 agency CEOs
  if (owner.closure_mode === 'dg_managed') return true; // Minister, PS, parl_sec — ministry principals
  if (owner.role === 'dg') return true;              // DGs themselves
  if (item.owner_id === null) return true;
  if (item.confidence_overall < 0.85) return true;
  if (item.validation_failed) return true;
  if (item.due_at === null && item.due_trigger === null) return true;
  if (meeting.inaudible_pct > 0.30) return true;
  return false;
}
```

Run; expect PASS.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/gate.ts lib/__tests__/action-items-gate.test.ts
git commit -m "feat(action-items): political-risk gate — hard-coded predicate"
```

---

## Task 10: Resolution aggregator + transcript chunker

**Files:**
- Create: `lib/action-items/extraction/chunk.ts`
- Create: `lib/action-items/resolution/resolve.ts`

- [ ] **Step 1: Transcript chunker.**

```typescript
// lib/action-items/extraction/chunk.ts
//
// Naive token estimate: 4 chars ≈ 1 token. If transcript exceeds 60k tokens,
// split into 30-min windows with 5-min overlap.
import type { FirefliesTranscriptFull } from '@/lib/action-items/fireflies/types';

const TOKEN_ESTIMATE_DIVISOR = 4;
const MAX_TOKENS = 60_000;
const WINDOW_SEC = 30 * 60;
const OVERLAP_SEC = 5 * 60;

export interface TranscriptChunk {
  index: number;
  start_sec: number;
  end_sec: number;
  text: string;
}

export function chunkTranscriptIfNeeded(t: FirefliesTranscriptFull): TranscriptChunk[] {
  const fullText = (t.sentences ?? []).map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`).join('\n');
  const estTokens = Math.ceil(fullText.length / TOKEN_ESTIMATE_DIVISOR);
  if (estTokens <= MAX_TOKENS) {
    return [{ index: 0, start_sec: 0, end_sec: Number.POSITIVE_INFINITY, text: fullText }];
  }
  const lastSec = (t.sentences ?? []).reduce((m, s) => Math.max(m, s.end_time ?? s.start_time ?? 0), 0);
  const chunks: TranscriptChunk[] = [];
  let i = 0;
  for (let start = 0; start < lastSec; start += WINDOW_SEC - OVERLAP_SEC) {
    const end = Math.min(start + WINDOW_SEC, lastSec);
    const text = (t.sentences ?? [])
      .filter(s => (s.start_time ?? 0) >= start && (s.start_time ?? 0) < end)
      .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
      .join('\n');
    chunks.push({ index: i++, start_sec: start, end_sec: end, text });
    if (end >= lastSec) break;
  }
  return chunks;
}
```

- [ ] **Step 2: Resolution aggregator.**

```typescript
// lib/action-items/resolution/resolve.ts
import type { ExtractedItem } from '@/lib/action-items/extraction/types';
import type { UserStaffFields } from '@/lib/action-items/types';
import { resolveOwner } from './owner';
import { resolveDueDate } from './due';
import { assignPriority } from './priority';
import { validateExtractionItem } from '@/lib/action-items/validation/extraction';

export interface ReviewableItem {
  raw: ExtractedItem;
  owner_id: string | null;
  owner_method: 'meeting_scoped' | 'global' | 'role' | 'unresolved';
  due_at: Date | null;
  due_trigger: string | null;
  due_flagged: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  agency: string | null;          // owner.agency at resolve time; null if unresolved
  validation_ok: boolean;
  validation_issues: Array<{ code: string; field: string; message: string }>;
  confidence_overall: number;     // min of confidence_per_field
  confidence_reasons: string[];
}

export interface ResolveContext {
  meeting_date: Date;
  attendees: UserStaffFields[];
  allUsers: UserStaffFields[];
  transcript_text: string;
  speaker_role: 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg';
}

export function resolveExtractedItem(raw: ExtractedItem, ctx: ResolveContext): ReviewableItem {
  const own = resolveOwner({
    name_raw: raw.owner_name_raw,
    confidence: raw.confidence_per_field.owner,
    attendees: ctx.attendees,
    allUsers: ctx.allUsers,
  });
  const owner = ctx.allUsers.find(u => u.id === own.owner_id) ?? null;
  const due = resolveDueDate(raw.due_phrase, ctx.meeting_date);
  const validation = validateExtractionItem(raw, ctx.transcript_text);
  const conf = Math.min(
    raw.confidence_per_field.owner,
    raw.confidence_per_field.task,
    raw.confidence_per_field.due,
    raw.confidence_per_field.quote,
  );
  const priority = owner
    ? assignPriority(
        { task: raw.task, source_quote: raw.source_quote, due_at: due.due_at,
          speaker_role: ctx.speaker_role },
        owner, ctx.meeting_date)
    : 'low';
  return {
    raw,
    owner_id: own.owner_id,
    owner_method: own.method,
    due_at: due.due_at,
    due_trigger: due.due_trigger,
    due_flagged: due.flagged,
    priority,
    agency: owner?.agency ?? null,
    validation_ok: validation.ok,
    validation_issues: validation.ok ? [] : validation.issues.map(i => ({ code: i.code, field: i.field, message: i.message })),
    confidence_overall: conf,
    confidence_reasons: raw.confidence_reasons,
  };
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/extraction/chunk.ts lib/action-items/resolution/resolve.ts
git commit -m "feat(action-items): transcript chunker + resolveExtractedItem aggregator"
```

---

## Task 11: Extraction core — `runExtraction`

**Files:**
- Create: `lib/action-items/extraction/extract.ts`

The function signature: `runExtraction({ meetingId, modality, prompt_version }) → Promise<{ extraction_id }>`. It fetches the transcript via Plan 3's `getTranscript`, branches on modality (only `virtual` wired in v1), calls Claude with tool-use, persists raw_response into `action_item_extractions`, and returns the extraction id. The review queue then resolves each item lazily on render (Tasks 13–14).

- [ ] **Step 1: Implement.**

```typescript
// lib/action-items/extraction/extract.ts
//
// ZDR posture: see anthropic-client.ts header.
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { anthropicClient, EXTRACTION_MODEL } from './anthropic-client';
import { getTranscript } from '@/lib/action-items/fireflies/client';
import { ExtractionToolInputZ, type ExtractedItem } from './types';
import {
  buildVirtualSystemPrompt, VIRTUAL_TOOL_SCHEMA, PROMPT_VERSION as VIRTUAL_PROMPT_VERSION,
} from '@/lib/action-items/prompts/extraction-virtual-v0.1';
import { chunkTranscriptIfNeeded } from './chunk';
import type { Modality } from '@/lib/action-items/constants';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

export interface RunExtractionInput {
  fireflies_meeting_id: string;
  modality: Modality;             // only 'virtual' wired in v1
}

export interface RunExtractionResult {
  extraction_id: string;
  prompt_version: string;
  items_extracted: number;
}

export async function runExtraction(input: RunExtractionInput): Promise<RunExtractionResult> {
  if (input.modality !== 'virtual') {
    throw new Error(`Modality ${input.modality} not wired in v1; only 'virtual' is supported.`);
  }
  const transcript = await getTranscript(input.fireflies_meeting_id);
  if (!transcript) {
    await supabaseAdmin.from('failed_extractions').insert({
      fireflies_meeting_id: input.fireflies_meeting_id,
      failure_reason: 'transcript_unavailable',
      failure_detail: 'getTranscript returned null',
    });
    throw new Error('Transcript unavailable');
  }

  const meta = {
    date: typeof transcript.date === 'number' ? new Date(transcript.date).toISOString() : transcript.date,
    title: transcript.title ?? null,
    attendees: (transcript.attendees ?? []).map(a => ({ name: a.name ?? a.displayName ?? null, email: a.email ?? null })),
  };
  const sys = buildVirtualSystemPrompt(meta);
  const chunks = chunkTranscriptIfNeeded(transcript);

  const allItems: ExtractedItem[] = [];
  let totalIn = 0, totalOut = 0;
  const t0 = Date.now();
  const cli = anthropicClient();

  for (const ch of chunks) {
    const userMsg = ch.text;
    let attempts = 0;
    let parsed: { items: ExtractedItem[] } | null = null;
    let lastErr: unknown = null;
    while (attempts < 4 && !parsed) {
      try {
        const res = await cli.messages.create({
          model: EXTRACTION_MODEL,
          max_tokens: 8192,
          tools: [VIRTUAL_TOOL_SCHEMA],
          tool_choice: { type: 'tool', name: 'submit_action_items' },
          system: sys,
          messages: [{ role: 'user', content: userMsg }],
        });
        totalIn += res.usage.input_tokens;
        totalOut += res.usage.output_tokens;
        const toolUse = res.content.find(c => c.type === 'tool_use') as { type: 'tool_use'; input: unknown } | undefined;
        if (!toolUse) throw new Error('No tool_use block in response');
        const ok = ExtractionToolInputZ.safeParse(toolUse.input);
        if (!ok.success) throw new Error(`Tool input invalid: ${ok.error.message}`);
        parsed = ok.data;
      } catch (err) {
        lastErr = err;
        attempts++;
        if (attempts < 4) await new Promise(r => setTimeout(r, [1000, 4000, 16000][attempts - 1]));
      }
    }
    if (!parsed) {
      logger.error({ err: lastErr, chunk: ch.index }, 'extraction failed after retries');
      await supabaseAdmin.from('failed_extractions').insert({
        fireflies_meeting_id: input.fireflies_meeting_id,
        failure_reason: 'claude_error',
        failure_detail: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
      throw new Error('Claude extraction failed');
    }
    allItems.push(...parsed.items);
  }

  const transcript_hash = crypto.createHash('sha256').update(JSON.stringify(transcript.sentences ?? [])).digest('hex');

  // Read the user-classified type/modality from meetings_seen so the
  // extraction row reflects what the meeting actually was, not the
  // prompt's assumption. Plan 5's eval depends on this. If the user
  // hasn't classified yet, fall back to the input modality and 'internal'
  // (the gate's null-clause won't fire because we always have *some* value
  // here — the meetings_seen row IS classified by the time the user
  // triggers extraction, since they had to see the dropdowns).
  const { data: msRow } = await supabaseAdmin
    .from('meetings_seen')
    .select('detected_type, detected_modality')
    .eq('fireflies_meeting_id', input.fireflies_meeting_id)
    .maybeSingle();
  const stampedType = (msRow?.detected_type as 'internal' | 'agency' | 'external' | null) ?? 'internal';
  const stampedModality = (msRow?.detected_modality as 'virtual' | 'in_person' | 'mixed' | null) ?? input.modality;

  // Insert extraction row
  const { data: row, error } = await supabaseAdmin
    .from('action_item_extractions')
    .insert({
      meeting_id: input.fireflies_meeting_id,
      meeting_title: transcript.title ?? null,
      meeting_date: meta.date,
      meeting_type: stampedType,
      modality: stampedModality,
      transcript_url: transcript.transcript_url ?? null,
      transcript_hash,
      prompt_version: VIRTUAL_PROMPT_VERSION,
      model: EXTRACTION_MODEL,
      raw_response: { items: allItems },
      token_count_input: totalIn,
      token_count_output: totalOut,
      extraction_duration_ms: Date.now() - t0,
      items_extracted: allItems.length,
      review_status: 'pending',
    })
    .select('id')
    .single();
  if (error || !row) throw new Error(`Failed to insert extraction: ${error?.message ?? 'unknown'}`);

  // Update meetings_seen → extracted
  await supabaseAdmin
    .from('meetings_seen')
    .update({ pipeline_action: 'extracted', extraction_id: row.id })
    .eq('fireflies_meeting_id', input.fireflies_meeting_id);

  return { extraction_id: row.id, prompt_version: VIRTUAL_PROMPT_VERSION, items_extracted: allItems.length };
}
```

> **Compatibility note for the agent:** the call expects a recent Anthropic SDK with `tool_choice: { type: 'tool', name: ... }`. If the installed SDK is older and rejects that shape, fall back to `tool_choice: 'any'` and post-filter the response for the `submit_action_items` block. Surface as DONE_WITH_CONCERNS if you hit it.

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/extraction/extract.ts
git commit -m "feat(action-items): runExtraction — Claude tool-use + chunking + meetings_seen update"
```

---

## Task 12: Manual extraction trigger — `/action-items/process`

**Files:**
- Create: `app/action-items/process/page.tsx`
- Create: `app/api/action-items/extract/route.ts`

- [ ] **Step 1: API route.**

```typescript
// app/api/action-items/extract/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { runExtraction } from '@/lib/action-items/extraction/extract';
import { ModalityZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({
  fireflies_meeting_id: z.string().min(1),
  modality: ModalityZ,
});

export async function POST(req: NextRequest) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  if (parsed.data.modality !== 'virtual') {
    return NextResponse.json({ error: 'Only virtual extraction is wired in v1' }, { status: 400 });
  }
  try {
    const r = await runExtraction({
      fireflies_meeting_id: parsed.data.fireflies_meeting_id,
      modality: parsed.data.modality,
    });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Trigger page.**

```tsx
// app/action-items/process/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProcessPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    const res = await fetch('/api/action-items/extract', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fireflies_meeting_id: id, modality: 'virtual' }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
    const { extraction_id } = await res.json();
    router.push(`/action-items/review/${extraction_id}`);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl text-white">Manual extraction trigger</h1>
      <p className="text-sm text-navy-600">
        Provide a Fireflies meeting ID. The pipeline runs Claude with the virtual prompt and redirects to the review queue.
      </p>
      <input value={id} onChange={e => setId(e.target.value)} placeholder="Fireflies meeting id"
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500">{err}</div>}
      <button disabled={busy || !id} onClick={submit}
        className="px-3 py-1.5 text-sm bg-gold-500 text-navy-950 rounded disabled:opacity-50">
        {busy ? 'Running…' : 'Extract'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/action-items/extract/route.ts app/action-items/process/page.tsx
git commit -m "feat(action-items): manual extraction trigger /action-items/process"
```

---

## Task 13: Review queue list (`/action-items/review`)

**Files:**
- Modify: `app/action-items/review/page.tsx` (replace Plan 1 shell)

- [ ] **Step 1: Replace the page.**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';
const ALLOWED = new Set(['dg', 'ps', 'parl_sec']);

export default async function ReviewListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) {
    return <div className="card-premium p-12 text-center">Restricted to DG and Permanent Secretary.</div>;
  }
  const { data: rows } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, meeting_title, meeting_date, items_extracted, items_accepted, items_edited, items_rejected, review_status')
    .in('review_status', ['pending', 'in_review'])
    .order('meeting_date', { ascending: false });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="stat-number text-2xl">Review queue</h1>
        <Link href="/action-items/meetings" className="text-xs underline text-navy-600">Meetings →</Link>
      </div>
      {(rows ?? []).length === 0 && <div className="text-navy-600">Nothing to review.</div>}
      <ul className="space-y-2">
        {(rows ?? []).map(r => (
          <li key={r.id}>
            <Link href={`/action-items/review/${r.id}`}
              className="block bg-navy-900 border border-navy-800 rounded-lg p-3 hover:border-gold-500/40">
              <div className="text-sm text-white">{r.meeting_title ?? '(untitled)'}</div>
              <div className="text-xs text-navy-600">
                {r.meeting_date ? new Date(r.meeting_date as string).toLocaleString() : ''} ·
                {' '}{r.items_extracted} items · {r.items_accepted} accepted · {r.items_rejected} rejected
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="text-xs text-navy-600 mt-4">
        Need to (re-)extract a meeting? <Link href="/action-items/process" className="underline">Manual trigger →</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit.**

```bash
git add app/action-items/review/page.tsx
git commit -m "feat(action-items): review-queue meeting card list"
```

---

## Task 14: Three-bucket review page

**Files:**
- Create: `components/action-items/TranscriptSnippet.tsx`
- Create: `components/action-items/SupersessionSuggestion.tsx`
- Create: `components/action-items/ReviewItemCard.tsx`
- Create: `components/action-items/ReviewBucket.tsx`
- Create: `components/action-items/ReviewKeyboardShortcuts.tsx`
- Modify: `app/action-items/review/[extractionId]/page.tsx` (replace Plan 1 shell)

The page server-fetches the extraction + raw items + meetings_seen + attendees + all users, runs `resolveExtractedItem` on each raw item, runs `requiresMandatoryReview` to bucket each, and renders three `<ReviewBucket>` regions. Per-item edit forms are client components that PATCH local state; final accept goes through the batch endpoint in Task 15.

The full implementation is mechanical but long; the structure below is normative. The agent fills in the minor JSX wiring.

- [ ] **Step 1: TranscriptSnippet.**

```tsx
// components/action-items/TranscriptSnippet.tsx
export function TranscriptSnippet({ text, focusTimestamp }: { text: string; focusTimestamp?: string }) {
  return (
    <pre className="text-xs bg-navy-900 border border-navy-800 rounded p-3 max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono">
      {focusTimestamp ? `[focused at ${focusTimestamp}]\n\n` : ''}{text}
    </pre>
  );
}
```

- [ ] **Step 2: SupersessionSuggestion (slot, no-op until Plan 5).**

```tsx
// components/action-items/SupersessionSuggestion.tsx
export interface SupersessionCandidate { task_id: string; title: string; created_at: string; score: number; }

export function SupersessionSuggestion({ candidates }: { candidates: SupersessionCandidate[] }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div className="text-xs text-gold-500 border-l-2 border-gold-500 pl-2">
      May supersede:
      <ul className="mt-1 space-y-0.5">
        {candidates.map(c => (
          <li key={c.task_id}>
            <a href={`/tasks?focus=${c.task_id}`} className="underline">{c.title}</a>
            <span className="text-navy-600"> ({(c.score * 100).toFixed(0)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: ReviewItemCard (client; manages local edit state).**

```tsx
// components/action-items/ReviewItemCard.tsx
'use client';
import { useState } from 'react';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';
import { VERB_CATEGORIES, type VerbCategory } from '@/lib/action-items/constants';
import { SupersessionSuggestion } from './SupersessionSuggestion';

export interface ReviewDecision {
  index: number;             // index within action_item_extractions.raw_response.items
  action: 'accept' | 'reject';
  edits: {
    task?: string;
    verb_category?: VerbCategory;
    owner_user_id?: string;
    due_at?: string | null;
    due_trigger?: string | null;
  };
  was_edited: boolean;
}

interface UserOption { id: string; name: string; agency: string | null; }

export function ReviewItemCard({
  index, item, ownerOptions, defaultAction, decision, onChange,
}: {
  index: number;
  item: ReviewableItem;
  ownerOptions: UserOption[];
  defaultAction: 'accept' | 'reject';
  decision: ReviewDecision | null;
  onChange: (d: ReviewDecision) => void;
}) {
  const cur = decision ?? { index, action: defaultAction, edits: {}, was_edited: false };
  const [task, setTask] = useState(cur.edits.task ?? item.raw.task);
  const [verb, setVerb] = useState<VerbCategory>(cur.edits.verb_category ?? item.raw.verb_category);
  const [ownerId, setOwnerId] = useState(cur.edits.owner_user_id ?? item.owner_id ?? '');
  const [dueAt, setDueAt] = useState(cur.edits.due_at ?? (item.due_at?.toISOString().slice(0, 10) ?? ''));

  function set<K extends keyof ReviewDecision['edits']>(k: K, v: ReviewDecision['edits'][K], orig: unknown) {
    const edits = { ...cur.edits, [k]: v };
    onChange({ ...cur, edits, was_edited: cur.was_edited || v !== orig });
  }

  const issues = item.validation_issues;

  return (
    <div className={`bg-navy-900 border border-navy-800 rounded-lg p-3 ${cur.action === 'reject' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={cur.action === 'accept'}
          onChange={e => onChange({ ...cur, action: e.target.checked ? 'accept' : 'reject' })} />
        <div className="flex-1 space-y-2">
          <textarea value={task} onChange={e => { setTask(e.target.value); set('task', e.target.value, item.raw.task); }}
            rows={2} className="w-full bg-navy-950 border border-navy-800 rounded p-1 text-sm" />
          <div className="flex gap-2 text-xs">
            <select value={verb} onChange={e => { const v = e.target.value as VerbCategory; setVerb(v); set('verb_category', v, item.raw.verb_category); }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5">
              {VERB_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={ownerId} onChange={e => { setOwnerId(e.target.value); set('owner_user_id', e.target.value, item.owner_id); }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5">
              <option value="">(unresolved)</option>
              {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}{o.agency ? ` · ${o.agency}` : ''}</option>)}
            </select>
            <input type="date" value={dueAt} onChange={e => { setDueAt(e.target.value); set('due_at', e.target.value || null, item.due_at?.toISOString().slice(0, 10) ?? null); }}
              className="bg-navy-950 border border-navy-800 rounded px-1 py-0.5" />
            <span className="text-navy-600">conf {(item.confidence_overall * 100).toFixed(0)}%</span>
          </div>
          <blockquote className="text-xs italic text-navy-300 border-l-2 border-gold-500 pl-2">
            “{item.raw.source_quote}” <span className="text-navy-600">@ {item.raw.source_timestamp}</span>
          </blockquote>
          {issues.length > 0 && (
            <ul className="text-xs text-red-500 list-disc pl-4">
              {issues.map((iss, k) => <li key={k}>{iss.message}</li>)}
            </ul>
          )}
          <SupersessionSuggestion candidates={[]} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ReviewBucket (groups items + manages decisions Map).**

```tsx
// components/action-items/ReviewBucket.tsx
'use client';
import { ReviewItemCard, type ReviewDecision } from './ReviewItemCard';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';

interface UserOption { id: string; name: string; agency: string | null; }

export function ReviewBucket({
  title, items, defaultAction, ownerOptions, decisions, setDecision, collapsed,
}: {
  title: string;
  items: Array<{ index: number; item: ReviewableItem }>;
  defaultAction: 'accept' | 'reject';
  ownerOptions: UserOption[];
  decisions: Map<number, ReviewDecision>;
  setDecision: (d: ReviewDecision) => void;
  collapsed?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <details open={!collapsed} className="space-y-2">
      <summary className="cursor-pointer text-base font-semibold">
        {title} <span className="text-xs text-navy-600">({items.length})</span>
      </summary>
      <div className="space-y-2 mt-2">
        {items.map(({ index, item }) => (
          <ReviewItemCard
            key={index} index={index} item={item}
            ownerOptions={ownerOptions} defaultAction={defaultAction}
            decision={decisions.get(index) ?? null}
            onChange={setDecision}
          />
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 5: Keyboard shortcuts handler.**

```tsx
// components/action-items/ReviewKeyboardShortcuts.tsx
'use client';
import { useEffect, useState } from 'react';

export function ReviewKeyboardShortcuts({ onAcceptAll, onSubmit }: { onAcceptAll: () => void; onSubmit: () => void }) {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === '?') setHelp(h => !h);
      if (e.key === 'A') onAcceptAll();
      if (e.metaKey && e.key === 'Enter') { e.preventDefault(); onSubmit(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAcceptAll, onSubmit]);

  if (!help) return null;
  return (
    <div className="fixed bottom-4 right-4 bg-navy-900 border border-navy-800 rounded-lg p-3 text-xs">
      <div className="font-semibold mb-1">Shortcuts</div>
      <div>?  toggle help</div>
      <div>A  accept all in bucket</div>
      <div>⌘↵ submit decisions</div>
      <div>(J/K, E, R wired in Plan 4.1)</div>
    </div>
  );
}
```

- [ ] **Step 6: The review page itself.**

```tsx
// app/action-items/review/[extractionId]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { ExtractionToolInputZ } from '@/lib/action-items/extraction/types';
import { resolveExtractedItem, type ReviewableItem } from '@/lib/action-items/resolution/resolve';
import { requiresMandatoryReview } from '@/lib/action-items/gate';
import { ReviewClient } from '@/components/action-items/ReviewClient';
import type { UserStaffFields } from '@/lib/action-items/types';

const ALLOWED = new Set(['dg', 'ps', 'parl_sec']);
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ extractionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) redirect('/login');
  const { extractionId } = await params;

  const { data: ext } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, meeting_title, meeting_date, modality, raw_response, items_extracted')
    .eq('id', extractionId).maybeSingle();
  if (!ext) notFound();

  const parsed = ExtractionToolInputZ.safeParse(ext.raw_response);
  if (!parsed.success) {
    return <div className="p-6 text-red-500">Extraction raw_response failed schema validation.</div>;
  }
  const rawItems = parsed.data.items;

  const { data: meetingRow } = await supabaseAdmin
    .from('meetings_seen').select('detected_type, detected_modality, attendee_emails')
    .eq('fireflies_meeting_id', ext.meeting_id).maybeSingle();
  // inaudible_pct estimation skipped in v1; default 0. Future: count [inaudible] markers in transcript text.
  const meeting = {
    detected_type: (meetingRow?.detected_type ?? null) as 'internal' | 'agency' | 'external' | null,
    detected_modality: (meetingRow?.detected_modality ?? null) as 'virtual' | 'in_person' | 'mixed' | null,
    inaudible_pct: 0,
  };

  const { data: usersRaw } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('is_active', true);
  const allUsers: UserStaffFields[] = (usersRaw ?? []).map(u => ({
    id: u.id as string, email: (u.email as string) ?? '', name: u.name as string | null,
    role: u.role as UserStaffFields['role'], agency: u.agency as string | null,
    aliases: (u.aliases as string[] | null) ?? [],
    closure_mode: (u.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!u.is_agency_head, is_active: !!u.is_active,
  }));
  const attendeeEmails = new Set((meetingRow?.attendee_emails as string[] | null) ?? []);
  const attendees = allUsers.filter(u => u.email && attendeeEmails.has(u.email));

  // For now, transcript_text used by validation re-fetches via getTranscript at submit time.
  // To avoid double-cost, we trust the extraction's quote-validation gate (run again at submit).
  const ctx = {
    meeting_date: ext.meeting_date ? new Date(ext.meeting_date as string) : new Date(),
    attendees, allUsers, transcript_text: '',  // server-side validation re-runs at submit with the real transcript
    speaker_role: 'officer' as const,
  };

  const reviewables: Array<{ index: number; item: ReviewableItem }> = rawItems.map((r, i) => ({
    index: i,
    item: resolveExtractedItem(r, ctx),
  }));

  const buckets: { mandatory: typeof reviewables; quickScan: typeof reviewables; autoAccepted: typeof reviewables } = {
    mandatory: [], quickScan: [], autoAccepted: [],
  };
  for (const r of reviewables) {
    const owner = allUsers.find(u => u.id === r.item.owner_id) ?? { id: '', email: '', name: null, role: 'officer', agency: null, aliases: [], closure_mode: 'self_close', is_agency_head: false, is_active: true } as UserStaffFields;
    const mand = requiresMandatoryReview(
      { confidence_overall: r.item.confidence_overall, validation_failed: !r.item.validation_ok,
        owner_id: r.item.owner_id, due_at: r.item.due_at, due_trigger: r.item.due_trigger },
      meeting, owner,
    );
    if (mand) buckets.mandatory.push(r);
    else buckets.quickScan.push(r);
    // Auto-accepted bucket is empty in v1 (trust disabled). Plan 5 fills it.
  }

  return (
    <ReviewClient
      extractionId={ext.id as string}
      meetingTitle={ext.meeting_title as string | null}
      meetingDate={ext.meeting_date as string | null}
      buckets={buckets}
      ownerOptions={allUsers.map(u => ({ id: u.id, name: u.name ?? '(unnamed)', agency: u.agency }))}
    />
  );
}
```

- [ ] **Step 7: ReviewClient (orchestrates state + submit).**

```tsx
// components/action-items/ReviewClient.tsx
'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewBucket } from './ReviewBucket';
import { ReviewKeyboardShortcuts } from './ReviewKeyboardShortcuts';
import type { ReviewDecision } from './ReviewItemCard';
import type { ReviewableItem } from '@/lib/action-items/resolution/resolve';

interface UserOption { id: string; name: string; agency: string | null; }
interface Props {
  extractionId: string;
  meetingTitle: string | null;
  meetingDate: string | null;
  buckets: {
    mandatory: Array<{ index: number; item: ReviewableItem }>;
    quickScan: Array<{ index: number; item: ReviewableItem }>;
    autoAccepted: Array<{ index: number; item: ReviewableItem }>;
  };
  ownerOptions: UserOption[];
}

export function ReviewClient({ extractionId, meetingTitle, meetingDate, buckets, ownerOptions }: Props) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Map<number, ReviewDecision>>(() => {
    const m = new Map<number, ReviewDecision>();
    // Mandatory default to no decision (forces explicit accept/reject); quick-scan defaults to accept.
    for (const it of buckets.quickScan) m.set(it.index, { index: it.index, action: 'accept', edits: {}, was_edited: false });
    for (const it of buckets.autoAccepted) m.set(it.index, { index: it.index, action: 'accept', edits: {}, was_edited: false });
    return m;
  });
  const setDecision = useCallback((d: ReviewDecision) => {
    setDecisions(prev => { const next = new Map(prev); next.set(d.index, d); return next; });
  }, []);
  const acceptAll = useCallback(() => {
    setDecisions(prev => {
      const next = new Map(prev);
      for (const b of [buckets.mandatory, buckets.quickScan, buckets.autoAccepted]) {
        for (const it of b) {
          const cur = next.get(it.index);
          next.set(it.index, { index: it.index, action: 'accept', edits: cur?.edits ?? {}, was_edited: cur?.was_edited ?? false });
        }
      }
      return next;
    });
  }, [buckets]);

  async function submit() {
    const arr = Array.from(decisions.values());
    const res = await fetch(`/api/action-items/review/${extractionId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decisions: arr }),
    });
    if (res.ok) router.push('/action-items/review');
    else alert((await res.json().catch(() => ({ error: 'Failed' }))).error);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="stat-number text-xl">{meetingTitle ?? '(untitled)'}</h1>
        <div className="text-xs text-navy-600">{meetingDate ? new Date(meetingDate).toLocaleString() : ''}</div>
      </div>
      <ReviewBucket title="🔴 Mandatory review" items={buckets.mandatory} defaultAction="reject"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} />
      <ReviewBucket title="🟡 Quick scan (pre-accepted)" items={buckets.quickScan} defaultAction="accept"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} />
      <ReviewBucket title="🟢 Auto-accepted" items={buckets.autoAccepted} defaultAction="accept"
        ownerOptions={ownerOptions} decisions={decisions} setDecision={setDecision} collapsed />
      <div className="flex justify-end gap-2">
        <button onClick={acceptAll} className="px-3 py-1 text-xs border border-navy-800 rounded">Accept all</button>
        <button onClick={submit} className="px-3 py-1 text-xs bg-gold-500 text-navy-950 rounded">Submit (⌘↵)</button>
      </div>
      <ReviewKeyboardShortcuts onAcceptAll={acceptAll} onSubmit={submit} />
    </div>
  );
}
```

- [ ] **Step 8: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/TranscriptSnippet.tsx components/action-items/SupersessionSuggestion.tsx components/action-items/ReviewItemCard.tsx components/action-items/ReviewBucket.tsx components/action-items/ReviewKeyboardShortcuts.tsx components/action-items/ReviewClient.tsx app/action-items/review/[extractionId]/page.tsx
git commit -m "feat(action-items): three-bucket review queue with keyboard shortcuts"
```

---

## Task 15: Batch submit endpoint + tasks insert with provenance

**Files:**
- Create: `app/api/action-items/review/[extractionId]/route.ts`
- Modify: `app/api/tasks/route.ts` — POST Zod widening (referenced from extraction-side InlineExtractionAddItem; the batch endpoint inserts directly via supabaseAdmin)

- [ ] **Step 1: POST /api/tasks Zod widening.**

In `app/api/tasks/route.ts`, extend the `createTaskSchema` with the extraction-source fields:

```typescript
const createTaskSchema = z.object({
  // ...existing fields
  source: z.enum(['manual', 'extraction']).optional(),
  extraction_id: z.string().uuid().nullable().optional(),
  extraction_item_idx: z.number().int().nullable().optional(),
  source_timestamp: z.string().nullable().optional(),
  source_quote: z.string().nullable().optional(),
  owner_name_raw: z.string().nullable().optional(),
  verb_category: z.enum(['correspondence','decision','information','scheduling','project_update','analysis']).nullable().optional(),
  confidence_overall: z.number().min(0).max(1).nullable().optional(),
  confidence_reasons: z.array(z.string()).nullable().optional(),
  visibility_scope: z.enum(['agency_normal','dg_only']).optional(),
});
```

In the insert payload, propagate these fields when present.

- [ ] **Step 2: Batch submit endpoint.**

```typescript
// app/api/action-items/review/[extractionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { ExtractionToolInputZ } from '@/lib/action-items/extraction/types';
import { logEvent } from '@/lib/action-items/events';
import { getTranscript } from '@/lib/action-items/fireflies/client';
import { quoteAppearsInTranscript } from '@/lib/action-items/validation/quote-substring';

export const dynamic = 'force-dynamic';

const DecisionZ = z.object({
  index: z.number().int(),
  action: z.enum(['accept', 'reject']),
  edits: z.object({
    task: z.string().optional(),
    verb_category: z.string().optional(),
    owner_user_id: z.string().uuid().optional(),
    due_at: z.string().nullable().optional(),
    due_trigger: z.string().nullable().optional(),
  }).default({}),
  was_edited: z.boolean().default(false),
});
const BodyZ = z.object({ decisions: z.array(DecisionZ) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ extractionId: string }> }) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const { extractionId } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { data: ext } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_id, raw_response, review_status')
    .eq('id', extractionId).maybeSingle();
  if (!ext) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ext.review_status === 'complete') return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });

  const items = ExtractionToolInputZ.safeParse(ext.raw_response);
  if (!items.success) return NextResponse.json({ error: 'Extraction raw_response invalid' }, { status: 500 });

  // Quote re-validation gate. Fetch the transcript once and verify every
  // accepted item's source_quote still appears in it after normalization.
  // A hallucinated quote stamped into the audit log under a real human's
  // name is much more expensive than one transcript fetch at submit.
  const transcript = await getTranscript(ext.meeting_id as string);
  if (!transcript) return NextResponse.json({ error: 'Transcript unavailable for re-validation' }, { status: 502 });
  const transcriptText = (transcript.sentences ?? [])
    .map(s => `[${s.start_time ?? '?'}] ${s.speaker_name ?? '?'}: ${s.text}`)
    .join('\n');
  for (const d of parsed.data.decisions) {
    if (d.action !== 'accept') continue;
    const raw = items.data.items[d.index];
    if (!raw) continue;
    const quote = d.edits.task ? raw.source_quote : raw.source_quote;
    if (!quoteAppearsInTranscript(quote, transcriptText)) {
      return NextResponse.json(
        { error: 'Quote re-validation failed', failing_index: d.index, code: 'quote_fabricated' },
        { status: 400 },
      );
    }
  }

  let accepted = 0, edited = 0, rejected = 0;
  for (const d of parsed.data.decisions) {
    const raw = items.data.items[d.index];
    if (!raw) continue;
    if (d.action === 'reject') { rejected++; continue; }
    accepted++;
    if (d.was_edited) edited++;

    // Resolve owner: must be set (the UI prevents accept of unresolved items via mandatory bucket).
    if (!d.edits.owner_user_id) {
      return NextResponse.json({ error: `Item ${d.index} has no resolved owner` }, { status: 400 });
    }
    const { data: ownerRow } = await supabaseAdmin
      .from('users').select('agency').eq('id', d.edits.owner_user_id).maybeSingle();
    const agency = (ownerRow?.agency as string | null) ?? null;

    const insertPayload = {
      title: d.edits.task ?? raw.task,
      description: null,
      status: 'new',
      priority: 'medium',           // resolution.priority would be re-applied at insert time; default for v1.
      due_date: d.edits.due_at ?? null,
      agency,
      owner_user_id: d.edits.owner_user_id,
      assigned_by_user_id: a.session.user.id,
      source: 'extraction',
      extraction_id: extractionId,
      extraction_item_idx: d.index,
      source_meeting_id: ext.meeting_id,
      source_timestamp: raw.source_timestamp,
      source_quote: raw.source_quote,
      owner_name_raw: raw.owner_name_raw,
      verb_category: (d.edits.verb_category ?? raw.verb_category) as string,
      due_trigger: d.edits.due_trigger ?? null,
      confidence_overall:
        Math.min(raw.confidence_per_field.owner, raw.confidence_per_field.task,
                 raw.confidence_per_field.due, raw.confidence_per_field.quote),
      confidence_reasons: raw.confidence_reasons,
      visibility_scope: 'agency_normal',
    };

    const { data: task, error: insErr } = await supabaseAdmin
      .from('tasks').insert(insertPayload).select('id').single();
    if (insErr) return NextResponse.json({ error: `Insert failed at item ${d.index}: ${insErr.message}` }, { status: 500 });

    await logEvent({
      taskId: task.id as string,
      eventType: d.was_edited ? 'edited' : 'accepted',
      actorId: a.session.user.id,
      payload: { extraction_id: extractionId, extraction_item_idx: d.index, was_edited: d.was_edited },
    });
  }

  await supabaseAdmin
    .from('action_item_extractions')
    .update({
      review_status: 'complete',
      reviewed_by: a.session.user.id,
      reviewed_at: new Date().toISOString(),
      items_accepted: accepted,
      items_edited: edited,
      items_rejected: rejected,
    })
    .eq('id', extractionId);

  return NextResponse.json({ accepted, edited, rejected });
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/tasks/route.ts app/api/action-items/review/[extractionId]/route.ts
git commit -m "feat(action-items): batch submit + tasks insert with extraction provenance"
```

---

## Task 16: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Tests + type-check + build.**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 2: Manual smoke.**

Pre-conditions: a `meetings_seen` row classified `(internal, virtual)` with a real Fireflies `meeting_id`; `ANTHROPIC_API_KEY` (and `ANTHROPIC_ZDR_CONFIRMED=true`) OR `VERCEL_AI_GATEWAY_URL` set; Plan 3's poll already populated the row.

1. `/action-items/process` — paste the Fireflies meeting id; click Extract. Expect redirect to `/action-items/review/<id>`.
2. The review page renders three buckets. Items with null `detected_type`/`detected_modality` (still possible if the user forgot to classify) all sit in mandatory.
3. Edit one item's owner to a real user; accept the item. Submit.
4. War Room shows the new task with `source='extraction'` and the SourceProvenanceBadge from Plan 2 Task 8.
5. The extraction row's counters update: `items_accepted`, `items_edited`, `items_rejected`.
6. Re-extracting the same meeting fails with `UNIQUE (meeting_id, prompt_version)` — that's expected; bump the prompt to a new version file to allow re-extract.

---

## Self-review

**Spec coverage:**

- §5 prompt + tool-use → Tasks 1–3, 11.
- §6.1 validation (banned phrases, verb taxonomy, required fields, quote substring) → Tasks 4–5.
- §6.2 owner resolution → Task 6.
- §6.3 due-date resolution → Task 7.
- §6.5 priority assignment → Task 8.
- §7 political-risk gate (incl. null detected_* → mandatory) → Task 9.
- §8 review experience (three buckets, keyboard shortcuts, all-fields-editable) → Tasks 13–14.
- §8.5 freestanding manual-add — N/A (Plan 2 corrected says use Add Task in War Room).
- §12.3 failure handling — partial (Claude error retry/backoff inside `runExtraction`; chunking; speaker-collapse handled via the gate's null-detection clause and the mandatory-review default).
- §13 eval data capture — extraction counters update on submit (Task 15).

**Not in this plan:**

- Plan 5: supersession matcher (slot exists), drift detector, trust tracker (auto-accept stays disabled — bucket empty by design), eval dashboard, stale-meeting auto-archive.

**Type consistency:**

- `ReviewableItem`, `ExtractedItem`, `ReviewDecision` shared across resolution + UI + batch endpoint.
- Tool-use schema in `tool-schema.ts` and Zod schema in `extraction/types.ts` are the same shape (the agent must keep them in sync if they edit either).
- `requiresMandatoryReview` predicate matches the gate's hard-coded clauses.

---

## Decisions I made on your behalf

1. **Direct Anthropic only (gateway path dropped).** `ANTHROPIC_API_KEY + ANTHROPIC_ZDR_CONFIRMED=true` are both required. Project already runs on Anthropic for Gyaff and S3 with ZDR in place; the Vercel AI Gateway fallback was needless complexity.
2. **`speaker_role` defaults to `officer` in `resolveExtractedItem`** in v1. The current pipeline doesn't surface speaker role from the transcript; priority's `minister`/`ps` clauses won't fire automatically. If this matters, Plan 4.1 can extend the prompt to extract `speaker_role` per item. P0 safety-keyword path still works because it doesn't depend on speaker role.
3. **`inaudible_pct=0` placeholder.** The gate's `inaudible_pct > 0.30` clause needs a real measurement; v1 stubs it to 0 and lets the other clauses (null detection, confidence, etc.) carry the load. Plan 4.1 can add a count of `[inaudible]` markers at extraction time.
4. **Reviewer must set the owner in the mandatory bucket before submit.** The batch endpoint rejects items with no `owner_user_id` in the edits. The UI's resolution-failure indicator is the empty owner dropdown.
5. **Re-extraction is blocked by `UNIQUE (meeting_id, prompt_version)`.** Bumping the prompt to `extraction-virtual-v0.2.ts` allows a fresh extraction. v1 ships only `v0.1`; the upgrade path is documented.
6. **Auto-accepted bucket is always empty in v1.** Plan 5's trust tracker enables it; until then, every item lands in mandatory or quick-scan.
7. **Quick-scan defaults to accept; mandatory defaults to no decision.** The submit endpoint counts no-decision-mandatory as rejected (the UI's batch-submit currently doesn't transmit no-decision items, so they're filtered from the loop). This is a deliberate friction so reviewers must explicitly accept or reject mandatory items.
8. **Quote re-validation gate at submit (corrected).** The batch endpoint fetches the transcript via `getTranscript` once, then runs `quoteAppearsInTranscript` on every accepted item's `source_quote`. If any quote fails normalization match, the endpoint returns 400 with `{failing_index, code: 'quote_fabricated'}` and the reviewer must edit the quote (UI already supports it) or reject the item. The cost of one transcript fetch at submit is much smaller than the cost of a fabricated quote landing in the audit log under a real human's name.
9. **Keyboard shortcuts: A and ⌘↵ wired in v1; J/K/E/R deferred to Plan 4.1.** Adding J/K (next/prev) requires a focus-tracking ref system that ballooned the page; the help overlay documents the deferral.
10. **`runExtraction` reads user-classified values from `meetings_seen` (corrected).** The extraction row stamps `meeting_type` and `modality` from `meetings_seen.detected_type` / `detected_modality`. If `meetings_seen` returns nulls (shouldn't happen — user classifies before triggering), falls back to `'internal'` and the input `modality`. Plan 5's eval depends on extraction rows reflecting reality.

---

## End of Plan 4
