'use client';

import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface SummaryData {
  id: string;
  project_id: string;
  summary: {
    status_snapshot: string;
    timeline_assessment: string;
    budget_position: string;
    key_risks: string[];
    recommended_actions: string[];
  };
  generated_at: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ProjectAISummaryProps {
  projectId: string;
}

export function ProjectAISummary({ projectId }: ProjectAISummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/summary`)
      .then(r => r.json())
      .then(d => { if (d?.summary) setSummary(d); })
      .catch(() => {})
      .finally(() => setInitialLoad(false));
  }, [projectId]);

  async function generate(force = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const d = await res.json();
      if (d?.summary) setSummary(d);
    } catch {}
    setLoading(false);
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-500" />
          <h4 className="text-white font-semibold text-sm">AI Summary</h4>
        </div>
        <button
          onClick={() => generate(!!summary)}
          disabled={loading}
          className="text-gold-500 text-xs hover:text-[#e5c04b] flex items-center gap-1"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {summary ? 'Regenerate' : 'Generate'}
        </button>
      </div>
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-4 bg-navy-800 rounded w-full" />)}
        </div>
      ) : summary?.summary ? (
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-navy-600 text-xs uppercase tracking-wider">Status Snapshot</span>
            <p className="text-slate-400 mt-0.5">{summary.summary.status_snapshot}</p>
          </div>
          <div>
            <span className="text-navy-600 text-xs uppercase tracking-wider">Timeline</span>
            <p className="text-slate-400 mt-0.5">{summary.summary.timeline_assessment}</p>
          </div>
          <div>
            <span className="text-navy-600 text-xs uppercase tracking-wider">Budget Position</span>
            <p className="text-slate-400 mt-0.5">{summary.summary.budget_position}</p>
          </div>
          {summary.summary.key_risks?.length > 0 && (
            <div>
              <span className="text-navy-600 text-xs uppercase tracking-wider">Key Risks</span>
              <ul className="mt-1 space-y-1">
                {summary.summary.key_risks.map((r, i) => (
                  <li key={i} className="text-red-400/80 text-xs flex items-start gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.summary.recommended_actions?.length > 0 && (
            <div>
              <span className="text-navy-600 text-xs uppercase tracking-wider">Recommended Actions</span>
              <ul className="mt-1 space-y-1">
                {summary.summary.recommended_actions.map((a, i) => (
                  <li key={i} className="text-emerald-400/80 text-xs flex items-start gap-1.5">
                    <CheckCircle className="h-3 w-3 shrink-0 mt-0.5" />{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-navy-700 text-[10px] mt-2">
            Generated {summary.generated_at ? timeAgo(summary.generated_at) : ''}
          </p>
        </div>
      ) : (
        <p className="text-navy-600 text-sm">Click &quot;Generate&quot; to create an AI summary.</p>
      )}
    </div>
  );
}
