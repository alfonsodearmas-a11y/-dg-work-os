import { describe, it, expect } from 'vitest';
import { findUndecidedIndices } from '@/lib/action-items/extraction/decisions';

describe('findUndecidedIndices', () => {
  it('returns empty when every index is decided', () => {
    expect(findUndecidedIndices(3, [{ index: 0 }, { index: 1 }, { index: 2 }])).toEqual([]);
  });
  it('returns indices that have no decision', () => {
    expect(findUndecidedIndices(4, [{ index: 0 }, { index: 2 }])).toEqual([1, 3]);
  });
  it('returns all indices when decisions array is empty', () => {
    expect(findUndecidedIndices(3, [])).toEqual([0, 1, 2]);
  });
  it('ignores duplicate decisions', () => {
    expect(findUndecidedIndices(2, [{ index: 0 }, { index: 0 }, { index: 1 }])).toEqual([]);
  });
  it('returns empty when itemCount is zero', () => {
    expect(findUndecidedIndices(0, [])).toEqual([]);
  });
});
