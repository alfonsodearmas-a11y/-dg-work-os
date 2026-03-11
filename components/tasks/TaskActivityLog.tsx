'use client';

import { Clock } from 'lucide-react';
import { TaskActivity } from '@/lib/task-types';
import { formatDistanceToNow, parseISO } from 'date-fns';

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'created this task',
  moved_to_new: 'moved this to New',
  moved_to_active: 'moved this to Active',
  moved_to_blocked: 'moved this to Blocked',
  moved_to_done: 'moved this to Done',
  due_date_changed: 'changed the due date',
  assigned_to: 'reassigned this task',
};

interface TaskActivityLogProps {
  activities: TaskActivity[];
}

export function TaskActivityLog({ activities }: TaskActivityLogProps) {
  return (
    <div className="p-4">
      <h3 className="text-xs font-semibold text-navy-600 uppercase tracking-wider mb-3">Activity</h3>
      <div className="space-y-3">
        {activities.map((a) => (
          <div key={a.id} className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-navy-800 flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="h-3 w-3 text-navy-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-200">
                <span className="font-medium">{a.user_name || 'System'}</span>{' '}
                <span className="text-slate-400">{ACTIVITY_LABELS[a.action] || a.action}</span>
              </p>
              <p className="text-xs text-navy-600 mt-0.5">
                {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <p className="text-xs text-navy-600 italic">No activity yet</p>
        )}
      </div>
    </div>
  );
}
