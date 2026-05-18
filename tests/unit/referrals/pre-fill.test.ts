import { describe, it, expect } from 'vitest';
import { composeTenderPreFill, composeProjectPreFill, composeTaskPreFill } from '@/lib/referrals/pre-fill';

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

describe('composeTaskPreFill', () => {
  it('uppercases agency, embeds status and assignee, strips em-dashes', () => {
    const t = {
      id: 't-1',
      title: 'Sign procurement memo — Q2',
      description: null,
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-04-01',
      agency: 'gpl',
      created_at: '2026-03-15T00:00:00Z',
      assignee_name: 'Keisha Crighton',
    };
    const out = composeTaskPreFill(t, new Date('2026-05-17'));
    expect(out.agency).toBe('GPL');
    expect(out.title).toBe('Sign procurement memo, Q2');
    expect(out.background).not.toContain('—');
    expect(out.current_status).toContain('in progress');
    expect(out.current_status).toContain('Keisha Crighton');
    expect(out.days_overdue).toBeGreaterThan(0);
  });

  it('falls back to title when description missing; handles unassigned + no due_date', () => {
    const t = {
      id: 't-2',
      title: 'Review Cabinet brief',
      description: '',
      status: 'not_started',
      priority: null,
      due_date: null,
      agency: null,
      created_at: '2026-05-10T00:00:00Z',
      assignee_name: null,
    };
    const out = composeTaskPreFill(t, new Date('2026-05-17'));
    expect(out.background).toBe('Review Cabinet brief');
    expect(out.current_status).toContain('not started');
    expect(out.current_status).toContain('unassigned');
    expect(out.days_overdue).toBeNull();
    expect(out.agency).toBe('');
  });
});
