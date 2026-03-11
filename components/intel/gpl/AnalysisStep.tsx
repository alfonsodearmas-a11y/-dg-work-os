'use client';

import { useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, Brain, ChevronDown, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

interface AnalysisStepProps {
  aiAnalysis: any;
  loadingAnalysis: boolean;
  onRetry: () => void;
}

function UploadBriefingCard({ section, sevConfig }: { section: { title: string; severity: string; summary: string; detail: string }; sevConfig: { bg: string; text: string; border: string; label: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-navy-900 rounded-xl border ${sevConfig.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-lg font-semibold text-white">{section.title}</span>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${sevConfig.bg} ${sevConfig.text}`}>
              {sevConfig.label}
            </span>
            <ChevronDown className={`w-4 h-4 text-navy-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
        <p className="text-base text-[#c8d0dc] leading-snug">{section.summary}</p>
      </button>
      <div className={`collapse-grid ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4 pt-0">
            <div className="bg-navy-950 rounded-lg p-4 border border-navy-800">
              <p className="text-base text-slate-400 leading-relaxed">{section.detail}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const sevConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Critical' },
  warning:  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warning' },
  stable:   { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Stable' },
  positive: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Good' },
};

export function AnalysisStep({ aiAnalysis, loadingAnalysis, onRetry }: AnalysisStepProps) {
  if (loadingAnalysis) {
    return (
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Generating AI analysis...</span>
      </div>
    );
  }

  if (
    aiAnalysis?.executiveBriefing &&
    !(typeof aiAnalysis.executiveBriefing === 'string' && aiAnalysis.executiveBriefing.includes('failed')) &&
    !(typeof aiAnalysis.executiveBriefing === 'object' && aiAnalysis.executiveBriefing.headline?.includes('failed'))
  ) {
    // Parse: structured object (new) vs plain string (legacy)
    const rawBriefing = aiAnalysis.executiveBriefing;
    const briefing: { headline: string; sections: { title: string; severity: string; summary: string; detail: string }[] } =
      typeof rawBriefing === 'object' && rawBriefing.headline
        ? rawBriefing
        : typeof rawBriefing === 'string'
          ? {
              headline: rawBriefing.split('\n')[0]?.slice(0, 250) || 'Analysis completed.',
              sections: [{ title: 'Full Analysis', severity: 'stable', summary: rawBriefing.split('\n')[1]?.slice(0, 120) || '', detail: rawBriefing }],
            }
          : { headline: 'Analysis completed.', sections: [] };

    return (
      <div className="space-y-3">
        {/* HEADLINE */}
        <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52]/80 rounded-xl border border-gold-500/20 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold mb-1.5">AI Executive Briefing</p>
              <p className="text-[22px] font-bold text-slate-100 leading-snug">{briefing.headline}</p>
            </div>
          </div>
        </div>

        {/* INSIGHT CARDS — all collapsed */}
        {briefing.sections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {briefing.sections.map((section, i) => {
              const sev = sevConfig[section.severity] || sevConfig.stable;
              return (
                <UploadBriefingCard key={i} section={section} sevConfig={sev} />
              );
            })}
          </div>
        )}

        {/* CRITICAL ALERTS — collapsed */}
        {aiAnalysis.criticalAlerts && aiAnalysis.criticalAlerts.length > 0 && (
          <CollapsibleSection
            title={`Critical Alerts (${aiAnalysis.criticalAlerts.length})`}
            icon={AlertTriangle}
            badge={{ text: `${aiAnalysis.criticalAlerts.length}`, variant: 'danger' }}
            defaultOpen={false}
          >
            <div className="space-y-2">
              {aiAnalysis.criticalAlerts.map((alert: any, i: number) => (
                <div key={i} className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <span className="text-sm font-semibold text-red-300">{alert.title}</span>
                  <p className="text-slate-400 text-sm mt-1">{alert.description}</p>
                  {alert.recommendation && (
                    <p className="text-blue-400 text-sm mt-1.5">&rarr; {alert.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* RECOMMENDATIONS — collapsed */}
        {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
          <CollapsibleSection
            title={`Recommendations (${aiAnalysis.recommendations.length})`}
            icon={TrendingUp}
            badge={{ text: `${aiAnalysis.recommendations.length}`, variant: 'info' }}
            defaultOpen={false}
          >
            <ul className="space-y-2 text-sm text-slate-400">
              {aiAnalysis.recommendations.map((rec: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span>{rec.recommendation}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>
    );
  }

  if (aiAnalysis?.error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            {aiAnalysis.error || 'AI analysis failed. Click Retry to try again.'}
          </div>
          <button
            onClick={onRetry}
            disabled={loadingAnalysis}
            className="px-3 py-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loadingAnalysis ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Default: waiting for analysis
  return (
    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
      <div className="flex items-center gap-3">
        <Brain className="w-8 h-8 text-purple-400" />
        <div>
          <div className="text-sm font-medium text-purple-300">AI Executive Briefing</div>
          <div className="text-xs text-slate-400">Analysis will appear here once processing completes.</div>
        </div>
      </div>
    </div>
  );
}
