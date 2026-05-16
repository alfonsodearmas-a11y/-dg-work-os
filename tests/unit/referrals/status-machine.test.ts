import { describe, it, expect } from 'vitest';
import { deriveNextStatus } from '@/lib/referrals/status-machine';

describe('deriveNextStatus', () => {
  it('submit moves drafted -> submitted', () => {
    expect(deriveNextStatus('drafted', 'submit')).toBe('submitted');
  });

  it('mark_delivered promotes drafted -> submitted but leaves others alone', () => {
    expect(deriveNextStatus('drafted', 'mark_delivered')).toBe('submitted');
    expect(deriveNextStatus('submitted', 'mark_delivered')).toBe('submitted');
    expect(deriveNextStatus('with_minister', 'mark_delivered')).toBe('with_minister');
    expect(deriveNextStatus('closed', 'mark_delivered')).toBe('closed');
  });

  it('minister_acknowledge moves submitted -> with_minister, others unchanged', () => {
    expect(deriveNextStatus('submitted', 'minister_acknowledge')).toBe('with_minister');
    expect(deriveNextStatus('direction_given', 'minister_acknowledge')).toBe('direction_given');
    expect(deriveNextStatus('with_minister', 'minister_acknowledge')).toBe('with_minister');
  });

  it('log_direction moves to direction_given from submitted or with_minister', () => {
    expect(deriveNextStatus('submitted', 'log_direction')).toBe('direction_given');
    expect(deriveNextStatus('with_minister', 'log_direction')).toBe('direction_given');
  });

  it('log_direction is a no-op when already closed', () => {
    expect(deriveNextStatus('closed', 'log_direction')).toBe('closed');
  });

  it('log_direction throws when in drafted state', () => {
    expect(() => deriveNextStatus('drafted', 'log_direction')).toThrowError(
      /Cannot log direction on a draft/,
    );
  });

  it('close moves to closed from any non-drafted state', () => {
    expect(deriveNextStatus('submitted', 'close')).toBe('closed');
    expect(deriveNextStatus('with_minister', 'close')).toBe('closed');
    expect(deriveNextStatus('direction_given', 'close')).toBe('closed');
  });

  it('manual override returns explicit target', () => {
    expect(deriveNextStatus('submitted', 'manual', 'closed')).toBe('closed');
    expect(deriveNextStatus('drafted', 'manual', 'with_minister')).toBe('with_minister');
  });

  it('manual override requires a target', () => {
    expect(() => deriveNextStatus('submitted', 'manual')).toThrowError(
      /Manual override requires a target status/,
    );
  });

  it('throws when submitting from non-drafted state', () => {
    expect(() => deriveNextStatus('submitted', 'submit')).toThrowError(/Cannot submit/);
  });

  it('throws when closing a draft', () => {
    expect(() => deriveNextStatus('drafted', 'close')).toThrowError(/Cannot close a draft/);
  });
});
