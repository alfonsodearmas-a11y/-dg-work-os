import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { computeEvalMetrics } from '@/lib/action-items/eval/metrics';
import { evaluateTrust } from '@/lib/action-items/trust/tracker';
import { EvalCard } from '@/components/action-items/EvalCard';
import { MEETING_TYPES, MODALITIES } from '@/lib/action-items/constants';

export const dynamic = 'force-dynamic';

export default async function EvalPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'superadmin') redirect('/login');

  const tuples = MEETING_TYPES.flatMap(t =>
    MODALITIES.map(m => [t, m] as const),
  );

  const data = await Promise.all(tuples.map(async ([t, m]) => {
    const metrics = await computeEvalMetrics(t, m);
    const trust = await evaluateTrust(t, m);
    return { t, m, metrics, trust };
  }));

  const withData = data.filter(d => d.metrics.extracted > 0);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="stat-number text-2xl">Action Items — eval dashboard</h1>
      <p className="text-sm text-navy-600">
        Per-(type, modality) metrics over the last 20 reviewed meetings. Trust activation requires
        ≥8 meetings, ≥95% accepted-unedited, zero attribution errors, and a 30-day window —
        AND the env flag <code>EARNED_TRUST_ENABLED=true</code>.
      </p>
      {withData.length === 0 && <div className="text-navy-600">No reviewed meetings yet.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {withData.map(d => (
          <div key={`${d.t}-${d.m}`} className="space-y-2">
            <EvalCard title={`${d.t} · ${d.m}`} metrics={d.metrics} />
            <div className={`text-xs ${d.trust.activated ? 'text-gold-500' : 'text-navy-600'}`}>
              Trust: {d.trust.activated ? 'ACTIVE' : `inactive (${d.trust.reason})`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
