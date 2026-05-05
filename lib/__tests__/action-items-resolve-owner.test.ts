import { describe, it, expect } from 'vitest';
import { resolveOwner } from '@/lib/action-items/resolution/owner';
import type { UserStaffFields } from '@/lib/action-items/types';

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: '', name: null, role: 'officer', agency: null, aliases: [],
  closure_mode: 'self_close', is_agency_head: false, is_active: true, ...over,
});

const kesh = u({ id: 'kesh', name: 'Kesh Nandlall', aliases: ['Kesh', 'Cash', 'Keche'], agency: 'gpl', email: 'kesh@gpl.com.gy' });
const dg   = u({ id: 'dg',   name: 'Alfonso De Armas', role: 'dg', email: 'alfonso@mpua.gov.gy' });
const otherKesh = u({ id: 'kesh2', name: 'Kesh Singh', email: 'k@somewhere.org' });

describe('resolveOwner', () => {
  it('matches alias inside meeting attendees', () => {
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.9, attendees: [kesh, dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('meeting_scoped');
  });
  it('falls back to global universe at confidence ≥0.95 when unique', () => {
    const r = resolveOwner({ name_raw: 'Kesh Nandlall', confidence: 0.96, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('global');
  });
  it('refuses global fallback when confidence <0.95', () => {
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.85, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBeNull();
  });
  it('returns null when two users share the exact same alias', () => {
    // Strict policy: when multiple users carry the same alias as a name or
    // alias entry, the resolver refuses rather than guess.
    const otherKeshWithAlias = u({ id: 'kesh2', name: 'Kesh Singh', aliases: ['Kesh'], email: 'k@somewhere.org' });
    const r = resolveOwner({ name_raw: 'Kesh', confidence: 0.99, attendees: [dg], allUsers: [kesh, otherKeshWithAlias, dg] });
    expect(r.owner_id).toBeNull();
  });
  it('case-insensitive matching', () => {
    const r = resolveOwner({ name_raw: 'KESH', confidence: 0.9, attendees: [kesh, dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
  });
  it('returns null when nothing matches', () => {
    const r = resolveOwner({ name_raw: 'Nobody', confidence: 0.99, attendees: [dg], allUsers: [dg] });
    expect(r.owner_id).toBeNull();
  });
  it('exact name match wins (case-insensitive)', () => {
    const r = resolveOwner({ name_raw: 'kesh nandlall', confidence: 0.97, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('global');
  });
  it('alias match wins', () => {
    const r = resolveOwner({ name_raw: 'Cash', confidence: 0.96, attendees: [dg], allUsers: [kesh, dg] });
    expect(r.owner_id).toBe('kesh');
    expect(r.method).toBe('global');
  });
  it('Kezia Joseph (not in users) returns null and does NOT silently match Keisha Crighton', () => {
    const keisha = u({ id: 'keisha', name: 'Keisha Crighton', email: 'keisha@mpua.gov.gy' });
    const r = resolveOwner({
      name_raw: 'Kezia Joseph', confidence: 0.99,
      attendees: [keisha, dg], allUsers: [keisha, dg],
    });
    expect(r.owner_id).toBeNull();
    expect(r.method).toBe('unresolved');
  });
  it('first-name-only raw no longer falls back to a unique first-name match', () => {
    // Prior behavior: name_raw='Kezia' with sole user 'Kezia X' returned that user.
    // Strict policy: only an exact name or alias match counts.
    const keziaX = u({ id: 'kx', name: 'Kezia X', email: 'kx@mpua.gov.gy' });
    const r = resolveOwner({
      name_raw: 'Kezia', confidence: 0.99,
      attendees: [dg], allUsers: [keziaX, dg],
    });
    expect(r.owner_id).toBeNull();
  });
});
