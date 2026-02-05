'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Send, Loader2, MessageCircle, Sparkles } from 'lucide-react';

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
    } catch (error) {
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
            className="w-full px-4 py-3 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white placeholder-[#64748b] focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors disabled:opacity-50"
          />
          <Sparkles className="absolute right-4 top-3.5 h-5 w-5 text-[#d4af37]/50" />
        </div>
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="btn-gold px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-[#d4af37]" />
            </div>
            <p className="text-[#94a3b8] leading-relaxed">{latestAnswer}</p>
          </div>
        </div>
      )}

      {/* Previous Q&A */}
      {queries.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-[#64748b] mb-4 flex items-center">
            <MessageCircle className="h-4 w-4 mr-2" />
            Previous Questions
          </h3>
          <div className="space-y-4">
            {queries.map((query) => (
              <div key={query.id} className="border-l-2 border-[#2d3a52] pl-4 space-y-2">
                <p className="text-white font-medium">Q: {query.question}</p>
                <p className="text-[#94a3b8]">A: {query.answer}</p>
                <p className="text-xs text-[#64748b]">
                  {format(new Date(query.created_at), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
