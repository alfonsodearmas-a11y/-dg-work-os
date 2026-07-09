import { describe, expect, test } from 'vitest';
import { classifyTheme, extractTargetDate, isSubstantive, priorityFlag } from './compute';

describe('priorityFlag', () => {
  test('zero, null, and undefined are Normal', () => {
    expect(priorityFlag(0)).toBe('Normal');
    expect(priorityFlag(null)).toBe('Normal');
    expect(priorityFlag(undefined)).toBe('Normal');
  });

  test('any non-zero priority is Elevated', () => {
    expect(priorityFlag(1)).toBe('Elevated');
    expect(priorityFlag(3)).toBe('Elevated');
  });
});

describe('isSubstantive', () => {
  test('system stubs are not substantive', () => {
    expect(isSubstantive('Case Created')).toBe(false);
    expect(isSubstantive('case created via tablet')).toBe(false);
    expect(isSubstantive('Category Updated')).toBe(false);
    expect(isSubstantive('.')).toBe(false);
    expect(isSubstantive('  ')).toBe(false);
    expect(isSubstantive('')).toBe(false);
    expect(isSubstantive(null)).toBe(false);
    expect(isSubstantive(undefined)).toBe(false);
  });

  test('real comments are substantive', () => {
    expect(isSubstantive('Crew scheduled to visit the site on Monday')).toBe(true);
    expect(isSubstantive('Referred to GWI operations')).toBe(true);
  });
});

describe('classifyTheme', () => {
  test('billing keywords win regardless of agency', () => {
    expect(classifyTheme('Disputed bill and arrears on the account', null, 'GPL')).toBe('Billing-Subsidy');
    expect(classifyTheme('Requesting a subsidy for pensioner', null, 'GWI')).toBe('Billing-Subsidy');
  });

  test('telecoms and aviation/transport tiers', () => {
    expect(classifyTheme('No GTT landline service for weeks', null, 'PUA')).toBe('Telecoms');
    expect(classifyTheme('Airstrip needs rehabilitation', null, 'PUA')).toBe('Aviation-Transport');
    expect(classifyTheme('The access road to the village is impassable', null, 'PUA')).toBe('Aviation-Transport');
  });

  test('meters disambiguate by agency', () => {
    expect(classifyTheme('Requesting a meter installation', null, 'GWI')).toBe('Water-Infrastructure/Quality');
    expect(classifyTheme('Requesting a meter installation', null, 'GPL')).toBe('Electricity-Infrastructure');
  });

  test('water infrastructure vs supply', () => {
    expect(classifyTheme('Burst main flooding the street', null, 'GWI')).toBe('Water-Infrastructure/Quality');
    expect(classifyTheme('Discoloured water from the tap', null, 'GWI')).toBe('Water-Infrastructure/Quality');
    expect(classifyTheme('No water for three days', null, 'GWI')).toBe('Water-Supply');
    expect(classifyTheme('Low pressure in the mornings', null, 'GWI')).toBe('Water-Supply');
  });

  test('electricity infrastructure vs supply', () => {
    expect(classifyTheme('Leaning utility pole near the school', null, 'GPL')).toBe('Electricity-Infrastructure');
    expect(classifyTheme('Street light out on the main road', null, 'GPL')).toBe('Electricity-Infrastructure');
    expect(classifyTheme('Constant blackouts in the area', null, 'GPL')).toBe('Electricity-Supply');
  });

  test('agency fallback when no keywords match', () => {
    expect(classifyTheme('Follow up requested', null, 'GWI')).toBe('Water-Supply');
    expect(classifyTheme('Follow up requested', null, 'GPL')).toBe('Electricity-Supply');
    expect(classifyTheme('Follow up requested', null, 'PUA')).toBe('Other');
    expect(classifyTheme(null, null, null)).toBe('Other');
  });
});

describe('extractTargetDate', () => {
  test('Month D, YYYY → exact day', () => {
    expect(extractTargetDate('Work will be completed by June 15, 2026')).toEqual({
      date: '2026-06-15',
      type: 'day',
      matched: 'June 15, 2026',
    });
    expect(extractTargetDate('completion set for march 3rd 2027')?.date).toBe('2027-03-03');
  });

  test('rejects impossible day-of-month rather than guessing', () => {
    expect(extractTargetDate('due February 30, 2026')).toBeNull();
  });

  test('Month/Month YYYY → end of second month', () => {
    expect(extractTargetDate('scheduled for June/July 2026')).toEqual({
      date: '2026-07-31',
      type: 'month-range',
      matched: 'June/July 2026',
    });
  });

  test('Q# YYYY and worded quarters → quarter end', () => {
    expect(extractTargetDate('targeted for Q3 2026')?.date).toBe('2026-09-30');
    expect(extractTargetDate('planned in the first quarter of 2027')).toMatchObject({
      date: '2027-03-31',
      type: 'quarter',
    });
  });

  test('Month YYYY → end of month (leap year aware)', () => {
    expect(extractTargetDate('to be resolved by September 2026')).toMatchObject({
      date: '2026-09-30',
      type: 'month',
    });
    expect(extractTargetDate('expected February 2028')?.date).toBe('2028-02-29');
  });

  test('end YYYY → Dec 31', () => {
    expect(extractTargetDate('project completes end of 2026')).toMatchObject({
      date: '2026-12-31',
      type: 'year-end',
    });
    expect(extractTargetDate('by end 2027')?.date).toBe('2027-12-31');
  });

  test('no date → null', () => {
    expect(extractTargetDate('Crew visited, awaiting materials')).toBeNull();
    expect(extractTargetDate('')).toBeNull();
    expect(extractTargetDate(null)).toBeNull();
    // Years outside 20xx are ignored
    expect(extractTargetDate('reference 1999 in old file')).toBeNull();
  });

  test('most specific pattern wins', () => {
    // Contains both a full date and a bare month-year; the day pattern wins.
    expect(extractTargetDate('phase 1 by January 10, 2027 and phase 2 in March 2027')).toMatchObject({
      date: '2027-01-10',
      type: 'day',
    });
  });
});
