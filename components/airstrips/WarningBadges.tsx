import { AlertTriangle } from 'lucide-react';
import type { AirstripCadence } from '@/lib/airstrips/warnings';

const ATTENTION_STYLE: Record<'overdue' | 'upcoming' | 'stale', { label: string; chip: string }> = {
  overdue:  { label: 'Overdue',            chip: 'bg-red-500/10 border-red-500/30 text-red-400' },
  upcoming: { label: 'Due soon',           chip: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
  stale:    { label: 'Verification stale', chip: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
};

function warningKey(type: string): 'overdue' | 'upcoming' | 'stale' {
  return type === 'upcoming' ? 'upcoming' : type === 'verification_stale' ? 'stale' : 'overdue';
}

// Inline maintenance-warning chips. `compact` shows just the label; the full form
// shows the message plus the responsible contractor/manager (or an unassigned flag).
export function WarningBadges({ cadence, compact = false }: { cadence?: AirstripCadence | null; compact?: boolean }) {
  if (!cadence || cadence.warnings.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cadence.warnings.map((w, i) => {
        const s = ATTENTION_STYLE[warningKey(w.type)];
        const names = [
          w.contractorName && `contractor: ${w.contractorName}`,
          w.managerName && `manager: ${w.managerName}`,
        ].filter(Boolean).join(', ');
        return (
          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${s.chip}`}>
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{compact ? s.label : w.message}</span>
            {!compact && names && <span className="opacity-80">— {names}</span>}
            {!compact && w.responsibilityIncomplete && <span className="text-red-300">— responsibility unassigned</span>}
          </span>
        );
      })}
    </div>
  );
}
