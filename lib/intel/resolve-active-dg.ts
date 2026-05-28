import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

// Resolves the active DG. Used by prepareReport to label the report
// recipient, and by the scheduled-reports cron handler when a schedule's
// creator has been deactivated (institutional reports must not silently
// die when the person who set them up moves on).

export type ResolvedDG = { userId: string | null; name: string };

const FALLBACK_NAME = 'Director General';

export async function resolveActiveDG(): Promise<ResolvedDG> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .eq('role', 'dg')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error }, 'resolveActiveDG: lookup failed');
    return { userId: null, name: FALLBACK_NAME };
  }
  if (!data) return { userId: null, name: FALLBACK_NAME };
  return {
    userId: data.id as string,
    name: ((data.name as string | null) ?? '').trim() || FALLBACK_NAME,
  };
}
