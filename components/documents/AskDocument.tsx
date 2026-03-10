'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Send, Loader2, MessageCircle, Sparkles, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Query {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

interface AskDocumentProps {
  documentId: string;
  previousQueries: Query[];
}

export function AskDocument({ documentId, previousQueries }: AskDocumentProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [queries, setQueries] = useState<Query[]>(previousQueries);
  const [latestAnswer, setLatestAnswer] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;

    setLoading(true);
    setLatestAnswer(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });

      if (!res.ok) throw new Error('Failed to get answer');

      const { answer } = await res.json();
      setLatestAnswer(answer);

      // Add to queries list
      const newQuery: Query = {
        id: Date.now().toString(),
        question,
        answer,
        created_at: new Date().toISOString()
      };
      setQueries([newQuery, ...queries]);
      setQuestion('');
    } catch {
      setLatestAnswer('Sorry, there was an error processing your question.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="flex space-x-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Ask a question about this document..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            disabled={loading}
            aria-label="Ask a question about this document"
            className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white placeholder-[#64748b] focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors disabled:opacity-50"
          />
          <Sparkles className="absolute right-4 top-3.5 h-5 w-5 text-[#d4af37]/50" />
        </div>
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="btn-gold px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Latest Answer */}
      {latestAnswer && (
        <div className="p-4 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/20">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-[#d4af37]" />
            </div>
            <div className="flex-1 min-w-0 prose-invert prose-sm max-w-none
              [&_h1]:text-white [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-2
              [&_h2]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
              [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
              [&_p]:text-[#94a3b8] [&_p]:leading-relaxed [&_p]:my-1.5
              [&_ul]:text-[#94a3b8] [&_ul]:my-1.5 [&_ul]:ml-4 [&_ul]:list-disc
              [&_ol]:text-[#94a3b8] [&_ol]:my-1.5 [&_ol]:ml-4 [&_ol]:list-decimal
              [&_li]:my-0.5
              [&_strong]:text-white [&_strong]:font-semibold
              [&_code]:text-[#d4af37] [&_code]:bg-[#1a2744] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
              [&_table]:w-full [&_table]:my-2 [&_table]:text-sm
              [&_th]:text-left [&_th]:text-[#94a3b8] [&_th]:font-medium [&_th]:pb-2 [&_th]:border-b [&_th]:border-[#2d3a52]
              [&_td]:text-[#94a3b8] [&_td]:py-1.5 [&_td]:border-b [&_td]:border-[#2d3a52]/50
              [&_blockquote]:border-l-2 [&_blockquote]:border-[#d4af37] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#64748b]
            ">
              <ReactMarkdown>{latestAnswer}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Previous Q&A */}
      {queries.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm font-medium text-[#64748b] mb-4 flex items-center hover:text-[#94a3b8] transition-colors"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Previous Questions ({queries.length})
            <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
          {showHistory && (
            <div className="space-y-4">
              {queries.map((query) => (
                <div key={query.id} className="border-l-2 border-[#2d3a52] pl-4 space-y-2">
                  <p className="text-white font-medium text-sm">Q: {query.question}</p>
                  <div className="text-sm prose-invert prose-sm max-w-none
                    [&_p]:text-[#94a3b8] [&_p]:leading-relaxed [&_p]:my-1
                    [&_ul]:text-[#94a3b8] [&_ul]:ml-4 [&_ul]:list-disc
                    [&_ol]:text-[#94a3b8] [&_ol]:ml-4 [&_ol]:list-decimal
                    [&_strong]:text-white
                    [&_code]:text-[#d4af37] [&_code]:bg-[#1a2744] [&_code]:px-1 [&_code]:rounded [&_code]:text-xs
                  ">
                    <ReactMarkdown>{query.answer}</ReactMarkdown>
                  </div>
                  <p className="text-xs text-[#64748b]">
                    {format(new Date(query.created_at), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
