import { describe, it, expect } from 'vitest';
import { agencyPatchError } from '@/lib/admin/validate-user-patch';

describe('agencyPatchError', () => {
  const existing = { role: 'agency_manager', agency: 'GWI' };

  it('allows changing agency to a valid value', () => {
    expect(agencyPatchError(existing, { agency: 'GPL' })).toBeNull();
  });

  it('rejects clearing agency for an agency manager (agency-only patch)', () => {
    expect(agencyPatchError(existing, { agency: null })).toMatch(/required/i);
  });

  it('rejects role→agency_manager when neither patch nor row has agency', () => {
    expect(
      agencyPatchError({ role: 'superadmin', agency: null }, { role: 'agency_manager' }),
    ).toMatch(/required/i);
  });

  it('allows role→agency_manager when patch supplies agency', () => {
    expect(
      agencyPatchError({ role: 'superadmin', agency: null }, { role: 'agency_manager', agency: 'CJIA' }),
    ).toBeNull();
  });

  it('allows role→agency_manager when the row already has agency', () => {
    expect(agencyPatchError({ role: 'superadmin', agency: 'GPL' }, { role: 'agency_manager' })).toBeNull();
  });

  it('allows superadmin with null agency', () => {
    expect(agencyPatchError(existing, { role: 'superadmin', agency: null })).toBeNull();
  });

  it('allows patches that do not touch role or agency', () => {
    expect(agencyPatchError(existing, { name: 'X' })).toBeNull();
  });
});
