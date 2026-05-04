import type { UserStaffFields } from '@/lib/action-items/types';
import { SAFETY_KEYWORDS } from './safety-keywords';

export interface PriorityInput {
  task: string;
  source_quote: string;
  due_at: Date | null;
  speaker_role: 'officer' | 'minister' | 'ps' | 'parl_sec' | 'dg';
}

type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

function hasSafetyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFETY_KEYWORDS.some(k => lower.includes(k));
}

function hoursUntil(now: Date, future: Date): number {
  return (future.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function weekdaysUntil(now: Date, future: Date): number {
  const days = Math.floor((future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let count = 0;
  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function assignPriority(input: PriorityInput, _owner: UserStaffFields, asOf: Date): TaskPriority {
  const due = input.due_at;
  if (due) {
    const hrs = hoursUntil(asOf, due);
    if (hrs <= 24) {
      const safety = hasSafetyKeyword(input.task) || hasSafetyKeyword(input.source_quote);
      if (safety || input.speaker_role === 'minister' || input.speaker_role === 'dg') {
        return 'critical';
      }
    }
    const wd = weekdaysUntil(asOf, due);
    if (wd <= 5 && (input.speaker_role === 'minister' || input.speaker_role === 'ps' || input.speaker_role === 'parl_sec')) {
      return 'high';
    }
    const days = (due.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
    if (days >= 6 && days <= 28) return 'medium';
  }
  return 'low';
}
