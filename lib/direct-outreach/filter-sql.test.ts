import { describe, expect, test } from 'vitest';
import { buildListFilterSql } from './filter-sql';
import { UNASSIGNED_OFFICER } from './types';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('buildListFilterSql — scope', () => {
  test('no scope, no filters → empty WHERE', () => {
    expect(buildListFilterSql({})).toEqual({ where: '', params: [] });
  });

  test('scope is ALWAYS the first condition and $1', () => {
    const { where, params } = buildListFilterSql(
      { agencies: ['GWI'], statuses: ['Open'] },
      'GPL',
    );
    expect(where.startsWith('WHERE upper(v.effective_agency) = $1')).toBe(true);
    expect(params[0]).toBe('GPL');
  });

  test('scope + agencies filter is an intersection (both ANDed) — a manager cannot widen', () => {
    const { where, params } = buildListFilterSql({ agencies: ['gwi', 'PUA'] }, 'GPL');
    expect(where).toContain('upper(v.effective_agency) = $1');
    expect(where).toContain('upper(v.effective_agency) = ANY($2::text[])');
    expect(where.indexOf('$1')).toBeLessThan(where.indexOf('ANY($2'));
    expect(params).toEqual(['GPL', ['GWI', 'PUA']]); // values uppercased
  });
});

describe('buildListFilterSql — multi-selects', () => {
  test('each array filter compiles to = ANY($n::text[]) with an array param', () => {
    const { where, params } = buildListFilterSql({
      statuses: ['Open', 'Referred'],
      themes: ['Water-Supply'],
      outreaches: ['Anna Regina'],
      regions: ['Region 2'],
    });
    expect(where).toContain('v.status = ANY($1::text[])');
    expect(where).toContain('v.theme = ANY($2::text[])');
    expect(where).toContain('v.outreach_location = ANY($3::text[])');
    expect(where).toContain('v.region = ANY($4::text[])');
    expect(params).toEqual([['Open', 'Referred'], ['Water-Supply'], ['Anna Regina'], ['Region 2']]);
  });

  test('empty arrays add no condition', () => {
    expect(buildListFilterSql({ statuses: [], themes: [] })).toEqual({ where: '', params: [] });
  });
});

describe('buildListFilterSql — officers', () => {
  test('uuids only → uuid[] ANY', () => {
    const { where, params } = buildListFilterSql({ officers: [U1, U2] });
    expect(where).toBe(`WHERE doa.assignee_user_id = ANY($1::uuid[])`);
    expect(params).toEqual([[U1, U2]]);
  });

  test('unassigned sentinel only → IS NULL, no param', () => {
    const { where, params } = buildListFilterSql({ officers: [UNASSIGNED_OFFICER] });
    expect(where).toBe('WHERE doa.case_id IS NULL');
    expect(params).toEqual([]);
  });

  test('uuids + unassigned → OR-combined group', () => {
    const { where } = buildListFilterSql({ officers: [U1, UNASSIGNED_OFFICER] });
    expect(where).toBe('WHERE (doa.assignee_user_id = ANY($1::uuid[]) OR doa.case_id IS NULL)');
  });

  test('non-uuid officer values are dropped (no 500 from the ::uuid[] cast)', () => {
    const junkOnly = buildListFilterSql({ officers: ['abc', '123'] });
    expect(junkOnly).toEqual({ where: '', params: [] });

    const mixed = buildListFilterSql({ officers: ['abc', U1, UNASSIGNED_OFFICER] });
    expect(mixed.where).toBe('WHERE (doa.assignee_user_id = ANY($1::uuid[]) OR doa.case_id IS NULL)');
    expect(mixed.params).toEqual([[U1]]);
  });

  test('assignedToMe adds a scalar uuid condition', () => {
    const { where, params } = buildListFilterSql({ assignedToMe: U1 });
    expect(where).toBe('WHERE doa.assignee_user_id = $1::uuid');
    expect(params).toEqual([U1]);
  });
});

describe('buildListFilterSql — toggles + search combine', () => {
  test('all toggles AND together', () => {
    const { where, params } = buildListFilterSql({
      highPriority: true, stalled60: true, stalled90: true, hasTarget: true, overdue: true,
    });
    expect(where).toBe(
      `WHERE v.priority_flag = 'Elevated' AND v.days_idle > 60 AND v.days_idle > 90 AND v.committed_date IS NOT NULL AND v.committed_overdue`,
    );
    expect(params).toEqual([]);
  });

  test('everything at once: scope first, search last, params in order', () => {
    const { where, params } = buildListFilterSql(
      {
        agencies: ['GWI'], statuses: ['Open'], officers: [UNASSIGNED_OFFICER],
        overdue: true, search: 'pump',
      },
      'GWI',
    );
    expect(where.startsWith('WHERE upper(v.effective_agency) = $1 AND ')).toBe(true);
    expect(where).toContain('doa.case_id IS NULL');
    expect(where).toContain('v.committed_overdue');
    expect(where).toContain('ILIKE $4'); // $1 scope, $2 agencies, $3 statuses, $4 search
    expect(params).toEqual(['GWI', ['GWI'], ['Open'], '%pump%']);
  });

  test('search reuses ONE placeholder across all columns', () => {
    const { where, params } = buildListFilterSql({ search: 'well' });
    expect(params).toEqual(['%well%']);
    expect((where.match(/\$1/g) ?? []).length).toBe(6);
  });
});
