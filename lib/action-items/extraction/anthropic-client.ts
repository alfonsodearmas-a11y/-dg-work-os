// Data handling:
//   ANTHROPIC_ZDR_CONFIRMED is treated as a "user has acknowledged data
//   retention posture" tripwire, not a contractual ZDR claim. Org does not
//   have ZDR; transcripts route through Anthropic standard 30-day retention.
//   Decision logged 2026-05-04 by user.
//
// Required env at runtime:
//   - ANTHROPIC_API_KEY            (the secret)
//   - ANTHROPIC_ZDR_CONFIRMED=true (acknowledgment tripwire — fail loudly if
//                                   not set, so the route never quietly
//                                   processes transcripts without an
//                                   intentional posture decision)
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
