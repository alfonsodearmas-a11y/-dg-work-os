import type Anthropic from '@anthropic-ai/sdk';
import { VERB_CATEGORIES } from '@/lib/action-items/constants';

export const EXTRACTION_TOOL_SCHEMA: Anthropic.Tool = {
  name: 'submit_action_items',
  description: 'Submit the structured list of action items extracted from the transcript.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['owner_name_raw', 'task', 'verb_category', 'due_phrase',
                     'source_timestamp', 'source_quote', 'confidence_per_field'],
          properties: {
            owner_name_raw:    { type: 'string' },
            task:              { type: 'string', maxLength: 500 },
            verb_category:     { type: 'string', enum: [...VERB_CATEGORIES] },
            due_phrase:        { type: ['string', 'null'] },
            source_timestamp:  { type: 'string' },
            source_quote:      { type: 'string', maxLength: 500 },
            confidence_per_field: {
              type: 'object',
              required: ['owner', 'task', 'due', 'quote'],
              properties: {
                owner: { type: 'number', minimum: 0, maximum: 1 },
                task:  { type: 'number', minimum: 0, maximum: 1 },
                due:   { type: 'number', minimum: 0, maximum: 1 },
                quote: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
            confidence_reasons: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    required: ['items'],
  },
};
