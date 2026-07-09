import { describe, expect, test } from 'vitest';
import { canAssignOutreachCase, isValidAssignmentTarget } from './permissions';

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
