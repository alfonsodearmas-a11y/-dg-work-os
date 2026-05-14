import { describe, it, expect } from 'vitest';
import { validateTaskDraft, type TaskDraft } from '@/lib/action-items/validation';

const baseManual: TaskDraft = {
  source: 'manual',
  title: 'Issue notification of termination to InterEnergy',
  agency: 'GPL',
  owner_user_id: 'u-kesh',
  owner_name_raw: null,
  verb_category: null,
};

const baseExtraction: TaskDraft = {
  source: 'extraction',
  title: 'Issue notification of termination to InterEnergy',
  agency: 'GPL',
  owner_user_id: 'u-kesh',
  owner_name_raw: 'Kesh',
  verb_category: 'correspondence',
};

describe('validateTaskDraft', () => {
  it('accepts a clean manual task', () => {
    expect(validateTaskDraft(baseManual)).toEqual({ ok: true });
  });

  it('accepts a clean extraction task', () => {
    expect(validateTaskDraft(baseExtraction)).toEqual({ ok: true });
  });

  it('rejects empty title for both sources', () => {
    const m = validateTaskDraft({ ...baseManual, title: '' });
    const e = validateTaskDraft({ ...baseExtraction, title: '' });
    expect(m.ok).toBe(false);
    expect(e.ok).toBe(false);
  });

  it('rejects missing owner_user_id', () => {
    const r = validateTaskDraft({ ...baseManual, owner_user_id: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'owner_user_id')).toBe(true);
  });

  it('rejects missing agency', () => {
    const r = validateTaskDraft({ ...baseManual, agency: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'agency')).toBe(true);
  });

  it('rejects banned substring "follow up on" (case-insensitive)', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Follow up on the InterEnergy issue' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'banned_phrase')).toBe(true);
  });

  it('rejects banned token "handle" as whole word', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Handle the Berbice site' });
    expect(r.ok).toBe(false);
  });

  it('does NOT reject "handle" as a substring inside another sentence', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Investigate handle valves at Kingston substation' });
    expect(r.ok).toBe(true);
  });

  it('rejects banned token "work on"', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Work on the procurement schedule' });
    expect(r.ok).toBe(false);
  });

  it('skips verb-taxonomy check when verb_category is null (manual default)', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Approve the InterEnergy contract' });
    expect(r.ok).toBe(true);
  });

  it('rejects verb-taxonomy mismatch when verb_category is set', () => {
    const r = validateTaskDraft({
      ...baseExtraction,
      verb_category: 'correspondence',
      title: 'Approve the InterEnergy contract',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'verb_taxonomy')).toBe(true);
  });

  it('accepts verb-taxonomy match when verb_category is set', () => {
    const r = validateTaskDraft({
      ...baseExtraction,
      verb_category: 'decision',
      title: 'Approve the InterEnergy contract',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects title longer than 500 chars', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Issue ' + 'x'.repeat(600) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'title_too_long')).toBe(true);
  });

  it('extraction with missing owner_name_raw is rejected', () => {
    const r = validateTaskDraft({ ...baseExtraction, owner_name_raw: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'owner_name_raw')).toBe(true);
  });

  it('manual with missing owner_name_raw is accepted (extraction-only field)', () => {
    expect(validateTaskDraft(baseManual)).toEqual({ ok: true });
  });

  it('returns multiple issues at once', () => {
    const r = validateTaskDraft({
      ...baseManual,
      owner_user_id: null,
      agency: null,
      title: 'Follow up on stuff',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });
});
