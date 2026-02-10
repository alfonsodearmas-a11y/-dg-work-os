'use client';

import {
  Plus, ArrowRight, MessageSquare, Clock, AlertTriangle,
  CheckCircle, XCircle, UserPlus, Calendar, Globe
} from 'lucide-react';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  created: { icon: Plus, color: 'text-blue-400', label: 'Created' },
  status_changed: { icon: ArrowRight, color: 'text-yellow-400', label: 'Status changed' },
  priority_changed: { icon: AlertTriangle, color: 'text-orange-400', label: 'Priority changed' },
  reassigned: { icon: UserPlus, color: 'text-purple-400', label: 'Reassigned' },
  commented: { icon: MessageSquare, color: 'text-cyan-400', label: 'Commented' },
  due_date_changed: { icon: Calendar, color: 'text-indigo-400', label: 'Due date changed' },
  extension_requested: { icon: Clock, color: 'text-yellow-400', label: 'Extension requested' },
  extension_approved: { icon: CheckCircle, color: 'text-green-400', label: 'Extension approved' },
  extension_rejected: { icon: XCircle, color: 'text-red-400', label: 'Extension rejected' },
  evidence_added: { icon: Plus, color: 'text-green-400', label: 'Evidence added' },
  notion_synced: { icon: Globe, color: 'text-[#d4af37]', label: 'Synced to Notion' },
};

interface Activity {
  id: string;
  action: string;
  user_name?: string;
  from_value?: string;
  to_value?: string;
  comment?: string;
  created_at: string;
}

export function TaskTimeline({ activities }: { activities: Activity[] }) {
  return (
    <div className="space-y-0">
      {activities.map((activity, idx) => {
        const config = ACTION_CONFIG[activity.action] || ACTION_CONFIG.created;
        const Icon = config.icon;
        const isLast = idx === activities.length - 1;

        return (
          <div key={activity.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full bg-[#1a2744] border border-[#2d3a52] flex items-center justify-center shrink-0 ${config.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px h-full bg-[#2d3a52] min-h-[24px]" />}
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <p className="text-sm text-white">
                <span className="font-medium">{activity.user_name || 'System'}</span>
                {' '}
                <span className="text-[#64748b]">{config.label.toLowerCase()}</span>
                {activity.from_value && activity.to_value && (
                  <span className="text-[#64748b]">
                    {' '}from <span className="text-white">{activity.from_value}</span> to <span className="text-white">{activity.to_value}</span>
                  </span>
                )}
              </p>
              {activity.comment && (
                <p className="text-xs text-[#64748b] mt-1 line-clamp-2">{activity.comment}</p>
              )}
              <p className="text-[10px] text-[#64748b] mt-0.5">
                {new Date(activity.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
