'use client';

import { Clock, AlertTriangle, User } from 'lucide-react';

const AGENCY_COLORS: Record<string, string> = {
  gpl: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  cjia: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  gwi: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  gcaa: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  marad: 'bg-green-500/20 text-green-400 border-green-500/30',
  heci: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ppdi: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  has: 'bg-red-500/20 text-red-400 border-red-500/30',
  ministry: 'bg-[#d4af37]/20 text-[#d4af37] border-[#d4af37]/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  assigned: { label: 'Assigned', color: 'bg-blue-500/20 text-blue-400' },
  acknowledged: { label: 'Acknowledged', color: 'bg-indigo-500/20 text-indigo-400' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500/20 text-yellow-400' },
  submitted: { label: 'Submitted', color: 'bg-purple-500/20 text-purple-400' },
  verified: { label: 'Verified', color: 'bg-green-500/20 text-green-400' },
  rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-400' },
  overdue: { label: 'Overdue', color: 'bg-red-600/20 text-red-400' },
};

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    agency: string;
    assignee_name?: string;
    due_date?: string | null;
  };
  onClick?: () => void;
  compact?: boolean;
}

export function TaskManagementCard({ task, onClick, compact }: TaskCardProps) {
  const isOverdue = task.status === 'overdue' || (task.due_date && new Date(task.due_date) < new Date() && !['verified'].includes(task.status));
  const daysUntilDue = task.due_date ? Math.ceil((new Date(task.due_date).getTime() - Date.now()) / 86400000) : null;
  const agencyColor = AGENCY_COLORS[task.agency] || AGENCY_COLORS.ministry;
  const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.assigned;

  return (
    <div
      onClick={onClick}
      className={`card-premium p-3 cursor-pointer hover:ring-1 hover:ring-[#d4af37]/30 transition-all ${isOverdue ? 'ring-1 ring-red-500/40' : ''}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`} />
        <h4 className="text-sm font-medium text-white leading-tight line-clamp-2 flex-1">{task.title}</h4>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${agencyColor}`}>
          {task.agency.toUpperCase()}
        </span>
        {!compact && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-[11px] text-[#64748b]">
        {task.assignee_name && (
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3" />
            {task.assignee_name.split(' ')[0]}
          </span>
        )}
        {task.due_date && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : daysUntilDue !== null && daysUntilDue <= 2 ? 'text-yellow-400' : ''}`}>
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  );
}

export { AGENCY_COLORS, PRIORITY_COLORS, STATUS_LABELS };
