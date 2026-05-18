import { describe, it, expect } from 'vitest';
import { composeTenderPreFill, composeProjectPreFill } from '@/lib/referrals/pre-fill';

describe('composeTenderPreFill', () => {
  it('strips em-dashes from generated text', () => {
    const t = {
      id: 't1',
      agency: 'GPL',
      description: 'Sub 13.8 kV — relocation',
      stage: 'evaluation',
      date_advertised: '2026-01-01',
      date_closed: null,
      contractor: null,
    };
    const out = composeTenderPreFill(t, new Date('2026-05-16'));
    expect(out.title).toBe('Sub 13.8 kV, relocation');
    expect(out.background).not.toContain('—');
    expect(out.current_status).not.toContain('—');
    expect(out.agency).toBe('GPL');
  });

  it('computes days_overdue from date_advertised', () => {
    const t = {
      id: 't1',
      agency: 'GPL',
      description: 'X',
      stage: 'evaluation',
      date_advertised: '2026-01-01',
      date_closed: null,
      contractor: null,
    };
    const out = composeTenderPreFill(t, new Date('2026-05-16T00:00:00Z'));
    expect(out.days_overdue).toBeGreaterThan(0);
  });

  it('mentions contractor when present', () => {
    const t = {
      id: 't1',
      agency: 'GPL',
      description: 'X',
      stage: 'award',
      date_advertised: null,
      date_closed: null,
      contractor: 'ABC Ltd',
    };
    const out = composeTenderPreFill(t, new Date('2026-05-16'));
    expect(out.background).toContain('ABC Ltd');
  });
});

describe('composeProjectPreFill', () => {
  it('uppercases sub_agency', () => {
    const p = {
      project_id: 'GPL2026-01',
      sub_agency: 'gpl',
      project_name: 'New substation',
      contract_value: 250_000_000,
      contractor: 'Contractor X',
      project_end_date: '2026-02-01',
      completion_pct: 60,
    };
    const out = composeProjectPreFill(p, new Date('2026-05-16'));
    expect(out.agency).toBe('GPL');
    expect(out.contract_value).toBe(250_000_000);
    expect(out.background).toContain('Contractor X');
    expect(out.current_status).toContain('60%');
    expect(out.days_overdue).toBeGreaterThan(0);
  });

  it('handles missing completion gracefully', () => {
    const p = {
      project_id: 'GPL2026-02',
      sub_agency: 'GPL',
      project_name: null,
      contract_value: null,
      contractor: null,
      project_end_date: null,
      completion_pct: null,
    };
    const out = composeProjectPreFill(p, new Date('2026-05-16'));
    expect(out.title).toBe('GPL2026-02');
    expect(out.contract_value).toBeNull();
    expect(out.days_overdue).toBeNull();
    expect(out.current_status).toContain('Completion not reported');
  });
});
