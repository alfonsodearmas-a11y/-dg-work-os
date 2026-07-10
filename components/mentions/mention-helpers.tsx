// Shared @-mention helpers — extracted from components/tasks/TaskComments.tsx
// so Tasks comments and Direct Outreach officer updates render/serialize
// mentions identically. Wire/storage format is @[uuid]; the composer shows
// @DisplayName and converts on submit (draftToRaw).

import type { ReactElement } from 'react';

export type MentionUserMap = Map<string, string>;

const MENTION_RENDER_REGEX = /@\[([0-9a-f-]{36})\]/g;

/** Parse @[userId] tokens and render with gold-highlighted names. */
export function renderMentionBody(body: string, userMap: MentionUserMap): ReactElement {
  const parts: (string | { userId: string; name: string })[] = [];
  const regex = new RegExp(MENTION_RENDER_REGEX.source, MENTION_RENDER_REGEX.flags);
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.substring(lastIndex, match.index));
    }
    const userId = match[1];
    parts.push({ userId, name: userMap.get(userId) || 'Unknown' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.substring(lastIndex));
  }

  return (
    <span>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="text-gold-500 font-medium">
            @{part.name}
          </span>
        )
      )}
    </span>
  );
}

/** Convert draft text (with @DisplayName) to raw text (with @[userId]). */
export function draftToRaw(text: string, mentions: Map<string, string>): string {
  let raw = text;
  // Sort mentions by name length desc to avoid partial replacements
  const sorted = Array.from(mentions.entries()).sort(([a], [b]) => b.length - a.length);
  for (const [displayName, userId] of sorted) {
    raw = raw.replaceAll(`@${displayName}`, `@[${userId}]`);
  }
  return raw;
}
