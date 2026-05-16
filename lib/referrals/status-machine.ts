import type { ReferralStatus } from './types';

export type TransitionTrigger =
  | 'submit'
  | 'mark_delivered'
  | 'log_direction'
  | 'minister_acknowledge'
  | 'close'
  | 'manual';

export function deriveNextStatus(
  current: ReferralStatus,
  trigger: TransitionTrigger,
  manualTarget?: ReferralStatus,
): ReferralStatus {
  switch (trigger) {
    case 'submit':
      if (current !== 'drafted') throw new Error(`Cannot submit referral in state: ${current}`);
      return 'submitted';
    case 'mark_delivered':
      return current === 'drafted' ? 'submitted' : current;
    case 'minister_acknowledge':
      return current === 'submitted' ? 'with_minister' : current;
    case 'log_direction':
      if (current === 'drafted') throw new Error('Cannot log direction on a draft');
      if (current === 'closed') return current;
      return 'direction_given';
    case 'close':
      if (current === 'drafted') throw new Error('Cannot close a draft (delete it instead)');
      return 'closed';
    case 'manual':
      if (!manualTarget) throw new Error('Manual override requires a target status');
      return manualTarget;
  }
}
