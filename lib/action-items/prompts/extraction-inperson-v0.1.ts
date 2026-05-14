import { EXTRACTION_TOOL_SCHEMA } from './tool-schema';
import type { MeetingMetadata } from './extraction-virtual-v0.1';

export const PROMPT_VERSION = 'inperson-v0.1';

export function buildInPersonSystemPrompt(meta: MeetingMetadata): string {
  const attendeeBlock = meta.attendees
    .map(a => `- ${a.name ?? '?'} (${a.email ?? 'no-email'})`)
    .join('\n');
  return `You extract canonical action items from meeting transcripts. Submit them via the submit_action_items tool — never as free text.

Speaker labels in this transcript are unreliable or generic ("Speaker 1"). Infer ownership from textual context: directive patterns ("Kesh, you'll handle this"), addressed-name patterns, acknowledgment patterns ("yes, I'll do that" within 3 turns of a directive), and the attendee list. Lower owner confidence appropriately. When the speaker is "Speaker N" and no name appears in the surrounding directive, set owner_name_raw to "unknown" and confidence_per_field.owner ≤ 0.5.

Rules:
1. Owner: as inferred from textual context; owner_name_raw is the spoken name (or "unknown"). Do not resolve.
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

export const INPERSON_TOOL_SCHEMA = EXTRACTION_TOOL_SCHEMA;
