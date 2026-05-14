import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { computeMetricsFromCounters } from '@/lib/action-items/eval/metrics';

describe('computeMetricsFromCounters', () => {
  const sample = {
    extracted: 100, accepted: 95, edited: 10, rejected: 5,
    accepted_owner_kept: 90,
    hi_conf_rejected_or_owner_edited: 2,
    hi_conf_total: 80,
  };

  it('recall = accepted / extracted', () => {
    expect(computeMetricsFromCounters(sample).recall).toBeCloseTo(0.95);
  });
  it('precision = (accepted - edited) / accepted', () => {
    expect(computeMetricsFromCounters(sample).precision).toBeCloseTo(85 / 95);
  });
  it('owner_accuracy = accepted_owner_kept / accepted', () => {
    expect(computeMetricsFromCounters(sample).owner_accuracy).toBeCloseTo(90 / 95);
  });
  it('overconfidence_rate = hi_conf_rejected_or_owner_edited / hi_conf_total', () => {
    expect(computeMetricsFromCounters(sample).overconfidence_rate).toBeCloseTo(2 / 80);
  });
  it('passes thresholds when 95/90/90/3% met', () => {
    const m = computeMetricsFromCounters({
      extracted: 100, accepted: 95, edited: 5, rejected: 5,
      accepted_owner_kept: 90,
      hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80,
    });
    expect(m.passes_thresholds).toBe(true);
  });
  it('fails thresholds when recall under 95%', () => {
    const m = computeMetricsFromCounters({
      extracted: 100, accepted: 80, edited: 0, rejected: 20,
      accepted_owner_kept: 80,
      hi_conf_rejected_or_owner_edited: 0, hi_conf_total: 50,
    });
    expect(m.passes_thresholds).toBe(false);
  });
  it('handles zero-extracted gracefully (no NaN)', () => {
    const m = computeMetricsFromCounters({
      extracted: 0, accepted: 0, edited: 0, rejected: 0,
      accepted_owner_kept: 0, hi_conf_rejected_or_owner_edited: 0, hi_conf_total: 0,
    });
    expect(m.recall).toBe(0);
    expect(m.precision).toBe(0);
    expect(m.owner_accuracy).toBe(0);
    expect(m.overconfidence_rate).toBe(0);
  });
});
