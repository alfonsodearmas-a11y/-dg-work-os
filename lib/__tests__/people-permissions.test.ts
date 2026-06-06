import { describe, it, expect } from 'vitest';
import { roleHasPermission } from '@/lib/people-permissions';

describe('roleHasPermission', () => {
  it('superadmin has everything', () => {
    expect(roleHasPermission('superadmin', 'user.manage_roles')).toBe(true);
    expect(roleHasPermission('superadmin', 'audit.read')).toBe(true);
    expect(roleHasPermission('superadmin', 'settings.edit')).toBe(true);
  });

  it('agency_manager has its fixed set', () => {
    for (const p of [
      'agency.manage', 'agency.read',
      'dashboard.create', 'dashboard.edit', 'dashboard.export', 'dashboard.read', 'dashboard.share',
      'report.create', 'report.edit', 'report.export', 'report.read', 'report.share',
      'task.create', 'task.delete', 'task.edit', 'task.read', 'task.share',
      'user.invite', 'user.read',
    ]) {
      expect(roleHasPermission('agency_manager', p), p).toBe(true);
    }
  });

  it('agency_manager lacks admin-only permissions', () => {
    expect(roleHasPermission('agency_manager', 'audit.read')).toBe(false);
    expect(roleHasPermission('agency_manager', 'user.manage_roles')).toBe(false);
    expect(roleHasPermission('agency_manager', 'user.delete')).toBe(false);
    expect(roleHasPermission('agency_manager', 'settings.edit')).toBe(false);
  });

  it('unknown roles have nothing', () => {
    expect(roleHasPermission('system', 'task.read')).toBe(false);
    expect(roleHasPermission('officer', 'task.read')).toBe(false);
  });
});
