import { describe, it, expect } from 'vitest';
import { modulesForUser, canAccessModule, canEditModule, ALL_MODULES } from '@/lib/modules/role-modules';

describe('modulesForUser', () => {
  it('superadmin gets every module', () => {
    expect(modulesForUser('superadmin', null)).toEqual([...ALL_MODULES]);
  });

  it('agency_manager gets common modules incl. Mission Control + own deep dive only', () => {
    const m = modulesForUser('agency_manager', 'GWI');
    expect(m).toContain('briefing');
    expect(m).toContain('applications');
    expect(m).toContain('procurement');
    expect(m).toContain('gwi-deep-dive');
    expect(m).not.toContain('gpl-deep-dive');
    expect(m).not.toContain('people');
    expect(m).not.toContain('settings');
    expect(m).not.toContain('action-items');
    expect(m).not.toContain('nptab-reports');
    expect(m).not.toContain('minister-attention');
  });

  it('grid-health is GPL-only; airstrips is HAS-only', () => {
    expect(canAccessModule('agency_manager', 'GPL', 'grid-health')).toBe(true);
    expect(canAccessModule('agency_manager', 'GWI', 'grid-health')).toBe(false);
    expect(canAccessModule('agency_manager', 'HAS', 'airstrips')).toBe(true);
    expect(canAccessModule('agency_manager', 'MARAD', 'airstrips')).toBe(false);
  });

  it('every agency maps to its own deep dive', () => {
    const pairs: Array<[string, string]> = [
      ['GPL', 'gpl-deep-dive'],
      ['GWI', 'gwi-deep-dive'],
      ['CJIA', 'cjia-deep-dive'],
      ['GCAA', 'gcaa-deep-dive'],
      ['HECI', 'heci-deep-dive'],
      ['MARAD', 'marad-deep-dive'],
    ];
    for (const [agency, slug] of pairs) {
      expect(canAccessModule('agency_manager', agency, slug)).toBe(true);
    }
  });

  it('tolerates lowercase/legacy agency casing', () => {
    expect(canAccessModule('agency_manager', 'gwi', 'gwi-deep-dive')).toBe(true);
  });

  it('agency_manager with unknown/missing agency still gets common modules', () => {
    expect(modulesForUser('agency_manager', null)).toContain('briefing');
    expect(modulesForUser('agency_manager', null)).not.toContain('gpl-deep-dive');
  });

  it('system/unknown roles get nothing', () => {
    expect(modulesForUser('system', null)).toEqual([]);
    expect(modulesForUser(null, 'GPL')).toEqual([]);
    expect(modulesForUser(undefined, undefined)).toEqual([]);
  });

  it('edit follows access', () => {
    expect(canEditModule('agency_manager', 'HAS', 'airstrips')).toBe(true);
    expect(canEditModule('agency_manager', 'GWI', 'airstrips')).toBe(false);
    expect(canEditModule('superadmin', null, 'airstrips')).toBe(true);
  });

  it('ALL_MODULES has no duplicates', () => {
    expect(new Set(ALL_MODULES).size).toBe(ALL_MODULES.length);
  });
});
