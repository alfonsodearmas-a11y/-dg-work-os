'use client';

import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, parseISO } from 'date-fns';

export interface AuditEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string;
}

const AUDIT_LABELS: Record<string, string> = {
  created: 'created this account',
  updated: 'updated user fields',
  suspended: 'suspended this user',
  reactivated: 'reactivated this user',
  archived: 'archived this user',
  restored: 'restored this user',
  force_signout: 'forced sign-out',
  resend_invite: 'resent the invite email',
  deleted_permanently: 'permanently deleted this user',
};

function formatRelative(d: string | null): string {
  if (!d) return 'Never';
  try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return d; }
}

interface UserActivitySectionProps {
  audit: AuditEntry[];
  loadingAudit: boolean;
}

export function UserActivitySection({ audit, loadingAudit }: UserActivitySectionProps) {
  if (loadingAudit) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  if (audit.length === 0) {
    return (
      <p className="text-xs text-navy-600 py-4 text-center">No activity recorded</p>
    );
  }

  return (
    <div className="space-y-0">
      {audit.map(entry => (
        <div key={entry.id} className="flex gap-3 py-2.5 border-b border-navy-800/50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3d4a62] mt-2 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">
              <span className="text-white font-medium">{entry.actor_name}</span>{' '}
              {AUDIT_LABELS[entry.action] || entry.action}
            </p>
            {entry.metadata && Object.keys(entry.metadata).length > 0 && entry.action === 'updated' && (
              <div className="mt-1 text-xs text-navy-600">
                {Object.entries(entry.metadata).map(([key, val]) => {
                  const change = val as { from: unknown; to: unknown };
                  return (
                    <p key={key}>
                      {key}: {String(change.from || 'none')} → {String(change.to || 'none')}
                    </p>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-navy-700 mt-0.5">{formatRelative(entry.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
