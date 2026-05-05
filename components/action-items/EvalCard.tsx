import type { EvalMetrics } from '@/lib/action-items/eval/metrics';

const FORMATS: Array<{ key: keyof EvalMetrics; label: string; threshold: number; comparator: '>=' | '<=' }> = [
  { key: 'recall',              label: 'Recall',              threshold: 0.95, comparator: '>=' },
  { key: 'precision',           label: 'Precision',           threshold: 0.90, comparator: '>=' },
  { key: 'owner_accuracy',      label: 'Owner accuracy',      threshold: 0.90, comparator: '>=' },
  { key: 'overconfidence_rate', label: 'Overconfidence rate', threshold: 0.03, comparator: '<=' },
];

export function EvalCard({ title, metrics }: { title: string; metrics: EvalMetrics }) {
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <h3 className="text-sm uppercase text-navy-600 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {FORMATS.map(f => {
          const v = metrics[f.key] as number;
          const ok = f.comparator === '>=' ? v >= f.threshold : v <= f.threshold;
          return (
            <div key={String(f.key)} className="text-center">
              <div className={`text-lg font-semibold ${ok ? 'text-white' : 'text-red-500'}`}>
                {(v * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] uppercase text-navy-600">
                {f.label} (target {f.comparator} {f.threshold * 100}%)
              </div>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 text-xs ${metrics.passes_thresholds ? 'text-gold-500' : 'text-navy-600'}`}>
        {metrics.passes_thresholds ? 'all thresholds met — eligible for trust activation' : 'thresholds not met'}
      </div>
      <div className="mt-1 text-[10px] text-navy-600">
        n_extracted={metrics.extracted} n_accepted={metrics.accepted} n_edited={metrics.edited} n_rejected={metrics.rejected}
      </div>
    </div>
  );
}
