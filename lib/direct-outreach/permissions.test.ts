import { describe, expect, test } from 'vitest';
import { USER_AGENCIES } from '@/lib/constants/agencies';
import { canAssignOutreachCase, canPostOutreachUpdate, isValidAssignmentTarget } from './permissions';
import { OUTREACH_AGENCIES, OUTREACH_MINISTRY } from './types';

describe('canAssignOutreachCase (locked decision Q2)', () => {
  test('superadmin may assign anywhere', () => {
    expect(canAssignOutreachCase('superadmin', null, 'GWI')).toBe(true);
    expect(canAssignOutreachCase('superadmin', null, 'PUA')).toBe(true);
  });

  test('agency_manager only within their EFFECTIVE agency (case-insensitive)', () => {
    expect(canAssignOutreachCase('agency_manager', 'GWI', 'GWI')).toBe(true);
    expect(canAssignOutreachCase('agency_manager', 'gwi', 'GWI')).toBe(true);
    expect(canAssignOutreachCase('agency_manager', 'GWI', 'GPL')).toBe(false);
    // Transferred GWI→GPL case: GPL's manager gains it, GWI's loses it.
    expect(canAssignOutreachCase('agency_manager', 'GPL', 'GPL')).toBe(true);
  });

  test('null agency, unknown roles, and system never assign', () => {
    expect(canAssignOutreachCase('agency_manager', null, 'GWI')).toBe(false);
    expect(canAssignOutreachCase('agency_manager', 'GWI', null)).toBe(false);
    expect(canAssignOutreachCase('system', 'GWI', 'GWI')).toBe(false);
    expect(canAssignOutreachCase(undefined, 'GWI', 'GWI')).toBe(false);
  });
});

describe('isValidAssignmentTarget (locked decision Q3)', () => {
  test('active superadmins are always assignable (incl. PUA cases)', () => {
    expect(isValidAssignmentTarget({ role: 'superadmin', agency: null, is_active: true }, 'PUA')).toBe(true);
    expect(isValidAssignmentTarget({ role: 'superadmin', agency: null, is_active: true }, 'GWI')).toBe(true);
  });

  test('agency managers only within the case agency', () => {
    expect(isValidAssignmentTarget({ role: 'agency_manager', agency: 'GWI', is_active: true }, 'GWI')).toBe(true);
    expect(isValidAssignmentTarget({ role: 'agency_manager', agency: 'GPL', is_active: true }, 'GWI')).toBe(false);
    // PUA is not a users.agency value — only superadmins qualify for PUA cases.
    expect(isValidAssignmentTarget({ role: 'agency_manager', agency: 'GWI', is_active: true }, 'PUA')).toBe(false);
  });

  test('inactive and system users are never assignable', () => {
    expect(isValidAssignmentTarget({ role: 'superadmin', agency: null, is_active: false }, 'GWI')).toBe(false);
    expect(isValidAssignmentTarget({ role: 'system', agency: null, is_active: true }, 'GWI')).toBe(false);
  });
});

describe('canPostOutreachUpdate (v3)', () => {
  const ME = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';

  test('the assigned officer may always post — identity-based, even when their agency drifted', () => {
    // Normal: assignee is a manager of the effective agency
    expect(canPostOutreachUpdate('agency_manager', ME, 'GPL', 'GPL', ME)).toBe(true);
    // Stranded: workbook re-upload moved the case to GPL but the GWI assignee
    // remains responsible until reassigned (route scoping still applies first).
    expect(canPostOutreachUpdate('agency_manager', ME, 'GWI', 'GPL', ME)).toBe(true);
  });

  test('the owning agency manager may post without being the assignee', () => {
    expect(canPostOutreachUpdate('agency_manager', ME, 'GPL', 'GPL', OTHER)).toBe(true);
    expect(canPostOutreachUpdate('agency_manager', ME, 'gpl', 'GPL', null)).toBe(true);
  });

  test('other-agency managers may not post', () => {
    expect(canPostOutreachUpdate('agency_manager', ME, 'GWI', 'GPL', OTHER)).toBe(false);
    expect(canPostOutreachUpdate('agency_manager', ME, 'GWI', 'GPL', null)).toBe(false);
  });

  test('superadmin may always post (incl. PUA cases, which have no managers)', () => {
    expect(canPostOutreachUpdate('superadmin', ME, null, 'PUA', null)).toBe(true);
    expect(canPostOutreachUpdate('superadmin', ME, null, 'GWI', OTHER)).toBe(true);
  });

  test('null effective agency: only superadmin or the assignee', () => {
    expect(canPostOutreachUpdate('agency_manager', ME, 'GWI', null, null)).toBe(false);
    expect(canPostOutreachUpdate('agency_manager', ME, 'GWI', null, ME)).toBe(true);
    expect(canPostOutreachUpdate('superadmin', ME, null, null, null)).toBe(true);
  });

  test('system and unknown roles never post unless assigned', () => {
    expect(canPostOutreachUpdate('system', ME, null, 'GWI', null)).toBe(false);
    expect(canPostOutreachUpdate(undefined, ME, 'GWI', 'GWI', null)).toBe(false);
  });
});

describe('OUTREACH_AGENCIES source integrity', () => {
  test('every entry except PUA is a valid users.agency value (runtime mirror of the satisfies guard)', () => {
    for (const agency of OUTREACH_AGENCIES) {
      if (agency === OUTREACH_MINISTRY) continue;
      expect(USER_AGENCIES).toContain(agency);
    }
  });

  test('GWI and GPL keep their leading positions (stable scorecard order)', () => {
    expect(OUTREACH_AGENCIES[0]).toBe('GWI');
    expect(OUTREACH_AGENCIES[1]).toBe('GPL');
    expect(OUTREACH_AGENCIES).toContain('MARAD');
    expect(OUTREACH_AGENCIES).toContain('HECI');
  });
});
