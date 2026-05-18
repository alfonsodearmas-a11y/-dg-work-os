import { fmtGuyanaDateTime, truncate } from '@/lib/format';
import type { ReferralAuditEntry } from '@/lib/referrals/types';

interface Props {
  entries: ReferralAuditEntry[];
  userLookup: Record<string, string>;
}

export function ReferralAuditList({ entries, userLookup }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-navy-500">No audit entries yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="text-sm flex flex-col gap-0.5 border-l-2 border-navy-800 pl-3 py-1">
          <span className="text-navy-500 font-mono text-xs">{fmtGuyanaDateTime(e.timestamp)}</span>
          <span className="text-white">
            <span className="font-semibold">{e.field_changed}</span>
            {' '}by{' '}
            <span className="text-navy-300">{userLookup[e.changed_by] ?? 'unknown'}</span>
          </span>
          {(e.old_value || e.new_value) && (
            <span className="text-xs text-navy-400 break-words">
              {e.old_value && <span className="text-red-400/80">{truncate(e.old_value, 200)}</span>}
              {e.old_value && e.new_value && <span className="mx-2 text-navy-600">→</span>}
              {e.new_value && <span className="text-emerald-400/80">{truncate(e.new_value, 200)}</span>}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
