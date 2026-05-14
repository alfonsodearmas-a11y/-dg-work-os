'use client';

import { AlertCircle, AlertTriangle, Brain, Loader2, RefreshCw } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

interface AnalysisStepProps {
  aiAnalysis: any;
  loadingAnalysis: boolean;
  onRetry: () => void;
}

/**
 * Post-upload analysis surface for the GPL DBIS daily flow.
 *
 * Renders one of four states:
 *   - loadingAnalysis: spinner
 *   - aiAnalysis.error: error panel + retry
 *   - criticalAlerts present: anomaly / data-quality alerts list
 *   - default (no analysis yet, or completed without anomalies): waiting panel
 *
 * The executiveBriefing prose surface (headline card + insight card grid) was
 * removed as part of the editorial-template restoration; only natural-language
 * anomaly descriptions on individual alerts survive.
 */
export function AnalysisStep({ aiAnalysis, loadingAnalysis, onRetry }: AnalysisStepProps) {
  if (loadingAnalysis) {
    return (
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Generating AI analysis...</span>
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

  const alerts: Array<{ title: string; description: string; severity: string }> =
    aiAnalysis?.criticalAlerts ?? [];

  if (alerts.length > 0) {
    return (
      <CollapsibleSection
        title={`Alerts (${alerts.length})`}
        icon={AlertTriangle}
        badge={{ text: `${alerts.length}`, variant: 'danger' }}
        defaultOpen={false}
      >
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const sev = (alert.severity || 'INFO').toUpperCase();
            const alertStyle =
              sev === 'CRITICAL'
                ? 'bg-red-500/15 border-red-500/30 text-red-300'
                : sev === 'WARNING'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-300';
            return (
              <div key={i} className={`p-3 border rounded-lg ${alertStyle}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{alert.title}</span>
                  <span
                    className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
                      sev === 'CRITICAL'
                        ? 'bg-red-500/15 text-red-400'
                        : sev === 'WARNING'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-blue-500/15 text-blue-400'
                    }`}
                  >
                    {sev}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-1">{alert.description}</p>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    );
  }

  // Default: waiting for analysis (or analysis complete with no anomalies).
  return (
    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
      <div className="flex items-center gap-3">
        <Brain className="w-8 h-8 text-purple-400" />
        <div>
          <div className="text-sm font-medium text-purple-300">Anomaly analysis</div>
          <div className="text-xs text-slate-400">
            Analysis will appear here once processing completes.
          </div>
        </div>
      </div>
    </div>
  );
}
