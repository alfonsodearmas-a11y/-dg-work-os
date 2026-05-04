import { z } from 'zod';
import { VERB_CATEGORIES } from '@/lib/action-items/constants';

// Output of a single Claude extraction. Matches the tool-use input_schema.
export const ExtractedItemZ = z.object({
  owner_name_raw: z.string().min(1),
  task: z.string().min(1).max(500),
  verb_category: z.enum(VERB_CATEGORIES),
  due_phrase: z.string().nullable(),
  source_timestamp: z.string().min(1),
  source_quote: z.string().min(1).max(500),
  confidence_per_field: z.object({
    owner: z.number().min(0).max(1),
    task: z.number().min(0).max(1),
    due: z.number().min(0).max(1),
    quote: z.number().min(0).max(1),
  }),
  confidence_reasons: z.array(z.string()).default([]),
});

export type ExtractedItem = z.infer<typeof ExtractedItemZ>;

export const ExtractionToolInputZ = z.object({
  items: z.array(ExtractedItemZ),
});

export interface ExtractionRunResult {
  extraction_id: string;
  prompt_version: string;
  items: ExtractedItem[];
  token_count_input: number;
  token_count_output: number;
  duration_ms: number;
}
