import { supabaseAdmin } from '@/lib/db-admin';

const MENTION_REGEX = /@\[([0-9a-f-]{36})\]/g;

/**
 * Extract @[uuid] mentions from a comment body and return:
 * - mentionedUserIds: unique UUIDs found
 * - cleanBody: body with @[uuid] replaced by @Username, truncated to 140 chars
 */
export async function cleanMentionBody(
  body: string,
): Promise<{ mentionedUserIds: string[]; cleanBody: string }> {
  const mentionedUserIds: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = regex.exec(body)) !== null) {
    if (!mentionedUserIds.includes(match[1])) {
      mentionedUserIds.push(match[1]);
    }
  }

  let cleanBody = body;
  if (mentionedUserIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', mentionedUserIds);

    const nameMap: Record<string, string> = {};
    for (const u of users || []) {
      nameMap[u.id] = u.name || 'User';
    }

    cleanBody = body.replace(
      MENTION_REGEX,
      (_: string, uid: string) => `@${nameMap[uid] || 'User'}`,
    );
  }

  return { mentionedUserIds, cleanBody: cleanBody.substring(0, 140) };
}
