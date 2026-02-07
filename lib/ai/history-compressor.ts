import Anthropic from '@anthropic-ai/sdk';

// ── History Compression ─────────────────────────────────────────────────────
// When conversation exceeds 10 messages, summarize the first N-2 using Haiku
// and keep the last 2 messages verbatim. This reduces input token count
// significantly for long conversations.

const COMPRESS_THRESHOLD = 10;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function compressHistory(
  messages: ChatMessage[],
  apiKey: string,
): Promise<ChatMessage[]> {
  if (messages.length <= COMPRESS_THRESHOLD) {
    return messages;
  }

  // Keep last 2 messages verbatim
  const toSummarize = messages.slice(0, -2);
  const toKeep = messages.slice(-2);

  // Build conversation text for summarization
  const conversationText = toSummarize
    .map(m => `${m.role === 'user' ? 'DG' : 'AI'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize this conversation between the DG and AI in 2-3 sentences. Focus on what topics were discussed and key conclusions reached:\n\n${conversationText}`,
      }],
    });

    const summaryText = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Previous conversation topics discussed.';

    return [
      { role: 'user', content: `[Previous conversation summary: ${summaryText}]` },
      { role: 'assistant', content: 'Understood. I have the context from our previous discussion.' },
      ...toKeep,
    ];
  } catch (err) {
    console.error('[ai/history] Compression failed, using truncation:', err);
    // Fallback: just keep last 6 messages
    return messages.slice(-6);
  }
}
