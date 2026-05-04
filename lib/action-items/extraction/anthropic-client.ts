// Data handling: this project already runs on Anthropic for Gyaff and S3,
// and ZDR is confirmed contractually. The Vercel AI Gateway alternate path
// from earlier drafts is dropped — only the direct path is wired.
//
// Required env at runtime:
//   - ANTHROPIC_API_KEY            (the secret)
//   - ANTHROPIC_ZDR_CONFIRMED=true (a tripwire — fail loudly if not set,
//                                   so the route never quietly falls back
//                                   to a non-ZDR posture)
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic client misconfigured: ANTHROPIC_API_KEY not set.');
  }
  if (process.env.ANTHROPIC_ZDR_CONFIRMED !== 'true') {
    throw new Error(
      'Anthropic client misconfigured: ANTHROPIC_ZDR_CONFIRMED must be "true". ' +
      'Confirm ZDR posture before enabling extraction.',
    );
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const EXTRACTION_MODEL = 'claude-opus-4-7';
