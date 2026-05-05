import type { DriftFinding } from '@/lib/action-items/matcher/drift';
import Link from 'next/link';

export function DriftReportCard({ findings }: { findings: DriftFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="bg-navy-900 border border-gold-500/40 rounded-xl p-4">
      <h2 className="text-sm uppercase text-gold-500 mb-2">Drift report — possible supersessions</h2>
      <ul className="space-y-2 text-xs">
        {findings.map(f => (
          <li key={f.task_id} className="border-l-2 border-gold-500 pl-2">
            <Link href={`/tasks?focus=${f.task_id}`} className="underline">{f.task_title}</Link>
            <ul className="mt-1 space-y-0.5">
              {f.candidates.map(c => (
                <li key={c.task_id}>
                  may supersede{' '}
                  <Link href={`/tasks?focus=${c.task_id}`} className="underline">{c.title}</Link>
                  <span className="text-navy-600"> ({(c.score * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
