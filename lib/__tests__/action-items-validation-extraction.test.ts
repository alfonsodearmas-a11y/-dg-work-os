import { describe, it, expect } from 'vitest';
import { validateExtractionItem } from '@/lib/action-items/validation/extraction';
import type { ExtractedItem } from '@/lib/action-items/extraction/types';

const baseItem: ExtractedItem = {
  owner_name_raw: 'Kesh',
  task: 'Issue notification of termination to InterEnergy',
  verb_category: 'correspondence',
  due_phrase: 'by Friday',
  source_timestamp: '00:01:00',
  source_quote: 'I will issue the termination notice by Friday',
  confidence_per_field: { owner: 0.9, task: 0.95, due: 0.9, quote: 0.95 },
  confidence_reasons: [],
};
const transcript = '00:01:00 Kesh: I will issue the termination notice by Friday.';

describe('validateExtractionItem', () => {
  it('accepts a clean item', () => {
    expect(validateExtractionItem(baseItem, transcript).ok).toBe(true);
  });
  it('rejects a fabricated quote', () => {
    const r = validateExtractionItem({ ...baseItem, source_quote: 'I will sell the company tomorrow' }, transcript);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'quote_fabricated')).toBe(true);
  });
  it('inherits banned-phrase rejection from validateTaskDraft', () => {
    const r = validateExtractionItem({ ...baseItem, task: 'Follow up on the InterEnergy issue' }, transcript);
    expect(r.ok).toBe(false);
  });
  it('rejects missing source_timestamp', () => {
    const r = validateExtractionItem({ ...baseItem, source_timestamp: '' }, transcript);
    expect(r.ok).toBe(false);
  });
});
