import { describe, it, expect } from 'vitest';
import { boardReducer, createInitialState } from '@/hooks/useBoardReducer';

describe('boardReducer hide-completed coordination', () => {
  it('defaults hideDone false and toggles it (resetting pagination)', () => {
    const s0 = createInitialState();
    expect(s0.hideDone).toBe(false);
    const s1 = boardReducer(s0, { type: 'SET_HIDE_DONE', hide: true });
    expect(s1.hideDone).toBe(true);
    expect(s1.listPage).toBe(1);
  });

  it('turning Hide-completed ON strips done + superseded from statusFilter', () => {
    let s = createInitialState();
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'done' });
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'superseded' });
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'active' });
    s = boardReducer(s, { type: 'SET_HIDE_DONE', hide: true });
    expect(s.statusFilter).toEqual(['active']);
    expect(s.hideDone).toBe(true);
  });

  it('explicitly including done turns Hide-completed OFF (no contradiction)', () => {
    let s = boardReducer(createInitialState(), { type: 'SET_HIDE_DONE', hide: true });
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'done' });
    expect(s.hideDone).toBe(false);
    expect(s.statusFilter).toContain('done');
  });

  it('explicitly including superseded also turns Hide-completed OFF', () => {
    let s = boardReducer(createInitialState(), { type: 'SET_HIDE_DONE', hide: true });
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'superseded' });
    expect(s.hideDone).toBe(false);
    expect(s.statusFilter).toContain('superseded');
  });

  it('including a non-terminal status leaves Hide-completed untouched', () => {
    let s = boardReducer(createInitialState(), { type: 'SET_HIDE_DONE', hide: true });
    s = boardReducer(s, { type: 'TOGGLE_STATUS_FILTER', status: 'active' });
    expect(s.hideDone).toBe(true);
    expect(s.statusFilter).toEqual(['active']);
  });

  it('CLEAR_ALL_FILTERS resets hideDone', () => {
    let s = boardReducer(createInitialState(), { type: 'SET_HIDE_DONE', hide: true });
    s = boardReducer(s, { type: 'CLEAR_ALL_FILTERS' });
    expect(s.hideDone).toBe(false);
  });
});
