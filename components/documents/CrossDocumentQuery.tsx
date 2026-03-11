'use client';

import { useState } from 'react';
import { Send, Loader2, Sparkles, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

interface Source {
  id: string;
  title: string;
  agency: string | null;
}

export function CrossDocumentQuery() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleQuery = async () => {
    if (!question.trim() || loading) return;

    setLoading(true);
    setAnswer(null);
    setSources([]);
    setError(null);

    try {
      const res = await fetch('/api/documents/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error('Query failed');

      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch {
      setError('Failed to process your query. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-5 w-5 text-gold-500" />
        <h2 className="text-lg font-semibold text-white">Query All Documents</h2>
      </div>
      <p className="text-navy-600 text-sm">
        Ask questions across all uploaded documents. AI will search relevant files and synthesize an answer.
      </p>

      {/* Input */}
      <div className="flex space-x-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="e.g., What are GPL's capacity constraints? or Summarize all budget allocations..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            disabled={loading}
            aria-label="Query across all documents"
            className="w-full px-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white placeholder-navy-600 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleQuery}
          disabled={loading || !question.trim()}
          className="btn-gold px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send query"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Loader2 className="h-5 w-5 text-blue-400 animate-spin flex-shrink-0" />
          <p className="text-sm text-blue-400">Searching documents and generating response...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="p-5 rounded-xl bg-gold-500/10 border border-gold-500/20 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gold-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-gold-500" />
            </div>
            <div className="flex-1 min-w-0 prose-invert prose-sm max-w-none
              [&_h1]:text-white [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-2
              [&_h2]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
              [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
              [&_p]:text-slate-400 [&_p]:leading-relaxed [&_p]:my-1.5
              [&_ul]:text-slate-400 [&_ul]:my-1.5 [&_ul]:ml-4 [&_ul]:list-disc
              [&_ol]:text-slate-400 [&_ol]:my-1.5 [&_ol]:ml-4 [&_ol]:list-decimal
              [&_li]:my-0.5
              [&_strong]:text-white [&_strong]:font-semibold
              [&_code]:text-gold-500 [&_code]:bg-navy-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
              [&_table]:w-full [&_table]:my-2 [&_table]:text-sm
              [&_th]:text-left [&_th]:text-slate-400 [&_th]:font-medium [&_th]:pb-2 [&_th]:border-b [&_th]:border-navy-800
              [&_td]:text-slate-400 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-navy-800/50
              [&_blockquote]:border-l-2 [&_blockquote]:border-gold-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-navy-600
            ">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <div className="pt-3 border-t border-gold-500/20">
              <p className="text-xs text-navy-600 mb-2 font-medium">Sources:</p>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <Link
                    key={source.id}
                    href={`/documents/${source.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500/30 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    <FileText className="h-3 w-3 text-gold-500" />
                    {source.title}
                    {source.agency && (
                      <span className="text-gold-500/60">({source.agency})</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
