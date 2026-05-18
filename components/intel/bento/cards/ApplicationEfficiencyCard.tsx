import Link from 'next/link';
import { Gauge } from 'lucide-react';
import type {
  ApplicationPipelineStage,
  ApplicationThroughput,
} from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

interface ApplicationEfficiencyCardProps {
  throughput: ApplicationThroughput;
  pipeline: ApplicationPipelineStage[];
  href: string;
  methodologyHref?: string;
  className?: string;
  accent?: string;
}

// Funnel + throughput footer. Each pipeline stage renders as a horizontal
// bar, widths scaled to the largest stage so the visual narrows naturally
// as work moves through the pipeline. The terminal stage (Execution or the
// last bar in the list) flips to a green gradient to signal completion. A
// footer summarises agency-wide throughput so the funnel sits in the
// context of "how many are moving through, how big is the open backlog".
export function ApplicationEfficiencyCard({
  throughput,
  pipeline,
  href,
  methodologyHref,
  className,
  accent,
}: ApplicationEfficiencyCardProps) {
  const fallbackAccent = accent ?? '#E8B83A';
  const maxCount = pipeline.reduce((m, s) => Math.max(m, s.count), 0);
  const safeMax = maxCount === 0 ? 1 : maxCount;
  const avgLabel =
    throughput.avg_days_to_close != null
      ? `${throughput.avg_days_to_close.toFixed(1)} days avg`
      : '—';
  const terminalIdx = pipeline.length - 1;

  return (
    <BentoCard className={className} ariaLabel="Application efficiency">
      <CardHead
        icon={<Gauge size={14} />}
        title="Application Efficiency"
        right={
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gold-500/[0.14] text-gold-500 text-[10px] font-semibold tracking-wide">
            {avgLabel}
          </span>
        }
      />

      {pipeline.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No pipeline data.</p>
      ) : (
        <ul className="flex flex-col gap-2 flex-1 min-h-0">
          {pipeline.map((stage, i) => (
            <FunnelRow
              key={stage.stage}
              stage={stage}
              widthPct={(stage.count / safeMax) * 100}
              isTerminal={i === terminalIdx}
              accent={fallbackAccent}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11.5px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-navy-600">
            Throughput
          </span>
          <span
            className={`font-mono font-semibold ${
              throughput.backlog_change_30d < 0
                ? 'text-emerald-400'
                : throughput.backlog_change_30d > 0
                  ? 'text-amber-400'
                  : 'text-white'
            }`}
          >
            {throughput.closed_30d.toLocaleString()} closed · {throughput.submitted_30d.toLocaleString()} new (30d)
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-navy-600">
            Backlog
          </span>
          <span className="font-mono font-semibold text-white">
            {throughput.backlog_now.toLocaleString()}
            <span
              className={`ml-1 text-[11px] font-medium ${
                throughput.backlog_change_30d > 0
                  ? 'text-red-400'
                  : throughput.backlog_change_30d < 0
                    ? 'text-emerald-400'
                    : 'text-navy-600'
              }`}
            >
              {throughput.backlog_change_30d > 0
                ? `+${throughput.backlog_change_30d}`
                : throughput.backlog_change_30d}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={href}
          className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
        >
          View detail →
        </Link>
        {methodologyHref ? (
          <Link
            href={`${methodologyHref}#applications-throughput`}
            className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
          >
            How is this calculated?
          </Link>
        ) : null}
      </div>
    </BentoCard>
  );
}

function FunnelRow({
  stage,
  widthPct,
  isTerminal,
  accent,
}: {
  stage: ApplicationPipelineStage;
  widthPct: number;
  isTerminal: boolean;
  accent: string;
}) {
  const barBg = isTerminal
    ? 'linear-gradient(90deg, #5BD6A5, #83E5BD)'
    : `linear-gradient(90deg, ${accent}, ${accent}b3)`;
  return (
    <li className="grid grid-cols-[80px_1fr_auto] items-center gap-2.5">
      <span className="text-[12px] font-medium text-slate-300 truncate">
        {stage.stage}
      </span>
      <span
        className="h-6 rounded-md bg-white/[0.04] overflow-hidden relative"
        role="presentation"
      >
        <span
          className="absolute left-0 top-0 bottom-0 rounded-md"
          style={{ width: `${Math.max(4, widthPct)}%`, background: barBg }}
        />
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-white text-right min-w-[40px]">
        {stage.count.toLocaleString()}
      </span>
    </li>
  );
}
