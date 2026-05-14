// v0.4 changelog (vs v0.3, 2026-05-05):
//   - v0.4 = v0.3 prompt content unchanged. Version bump only, to allow
//     re-extraction of meetings already processed at v0.3 after the
//     resolver and idempotency fixes shipped (commit 15facff).
//
// v0.3 changelog (vs v0.2, 2026-05-05):
//   - Prompt content unchanged. v0.2 was producing good output; the issue
//     was a downstream UX bug in the review submit path that silently
//     rejected mandatory items lacking an explicit decision. This version
//     exists only to clear the (meeting_id, prompt_version) UNIQUE so the
//     Joseph/GCAA call can be re-extracted and re-reviewed after the
//     submit-validation fix.
//
// v0.2 changelog (vs v0.1, 2026-05-04):
//   - source_quote rule rewritten. v0.1 produced ellipsis-concatenated
//     multi-turn fragments ("I don't have your email address. ... I can.
//     I'll send her mine.") which the at-submit quote-substring gate
//     correctly rejected as non-contiguous. v0.2 forbids ellipsis-joining
//     and asks for a single contiguous span — pick the most representative
//     single utterance even if less complete. The audit-log gate is now a
//     real fabrication check rather than a structural one.
//   - Approved-verb allow-list expanded in lib/action-items/constants.ts.
import { EXTRACTION_TOOL_SCHEMA } from './tool-schema';

export const PROMPT_VERSION = 'virtual-v0.4';

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
5. Source: source_timestamp from the transcript marker. source_quote MUST be a single contiguous span from the transcript — one speaker, one continuous utterance. NO ellipsis-concatenation across speaker turns. Do NOT splice fragments together with "...". If the directive plays out across multiple turns, pick the most representative single utterance even if it's less complete. Length ≤500 chars. Preserve the wording verbatim (filler words may be elided only if they appear inside that single contiguous span).
6. Confidence: 0.0–1.0 per field; calibrate honestly. confidence_reasons explains low scores in plain text.
7. No co-owners. Single owner only. If genuinely joint, pick one and note in confidence_reasons.
8. Include the DG's own commitments.
9. Skip cancelled items.
10. Never infer priority. Never link records.

Example (good):
  source_quote: "I'll send her my email address before end of day."
Example (bad — would be rejected):
  source_quote: "I don't have your email address. ... I can. I'll send her mine."

<meeting_metadata>
  <date>${meta.date}</date>
  <title>${meta.title ?? '(untitled)'}</title>
  <attendees>
${attendeeBlock}
  </attendees>
</meeting_metadata>`;
}

export const VIRTUAL_TOOL_SCHEMA = EXTRACTION_TOOL_SCHEMA;
