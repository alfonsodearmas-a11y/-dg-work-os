import Link from 'next/link';
import { Gauge } from 'lucide-react';
import type { StationHealthRow } from '@/lib/intel/get-agency-intel-data';
import { BentoCard, CardHead } from '@/components/intel/common';

const STATE_TONE: Record<StationHealthRow['status'], { bg: string; border: string; text: string }> = {
  healthy: {
    bg: 'rgba(91,214,165,0.10)',
    border: 'rgba(91,214,165,0.20)',
    text: '#5BD6A5',
  },
  degraded: {
    bg: 'rgba(255,156,92,0.10)',
    border: 'rgba(255,156,92,0.22)',
    text: '#FF9C5C',
  },
  critical: {
    bg: 'rgba(255,107,107,0.10)',
    border: 'rgba(255,107,107,0.22)',
    text: '#FF6B6B',
  },
  unknown: {
    bg: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.08)',
    text: '#7C8AA3',
  },
};

interface StationAvailabilityCardProps {
  stations: StationHealthRow[];
  href: string;
  methodologyHref?: string;
  className?: string;
}

// Heatmap of station availability — one square per station with a 3-letter
// code and a percentage. The grid wraps in 6-column rows so 12 stations land
// in a 2-row block (matching the mock); larger fleets keep the same width
// and grow downward.
export function StationAvailabilityCard({
  stations,
  href,
  methodologyHref,
  className,
}: StationAvailabilityCardProps) {
  const healthy = stations.filter((s) => s.status === 'healthy').length;
  const degraded = stations.filter((s) => s.status === 'degraded').length;
  const critical = stations.filter((s) => s.status === 'critical').length;

  // Sort: healthy (highest pct first) → degraded → critical → unknown. Keeps
  // green stations clustered top-left so the eye lands on red corners.
  const rank: Record<StationHealthRow['status'], number> = {
    healthy: 0,
    degraded: 1,
    critical: 2,
    unknown: 3,
  };
  const sorted = [...stations].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (b.pct_of_derated ?? 0) - (a.pct_of_derated ?? 0);
  });

  return (
    <BentoCard className={className} ariaLabel="Station availability">
      <CardHead
        icon={<Gauge size={14} />}
        title="Station Availability"
        right={
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-400/[0.14] text-emerald-400 text-[10px] font-semibold tracking-wide">
            {healthy} of {stations.length} healthy
          </span>
        }
      />

      {stations.length === 0 ? (
        <p className="text-xs text-navy-600 italic">No station data.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 flex-1 min-h-0">
          {sorted.map((st) => (
            <StationTile key={st.station} station={st} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 text-[11px] text-navy-600">
          <LegendDot color="#5BD6A5" label={`Healthy${healthy ? ` · ${healthy}` : ''}`} />
          <LegendDot color="#FF9C5C" label={`Maint.${degraded ? ` · ${degraded}` : ''}`} />
          <LegendDot color="#FF6B6B" label={`Critical${critical ? ` · ${critical}` : ''}`} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={href}
            className="text-[11px] text-navy-600 hover:text-gold-500 transition-colors"
          >
            DBIS →
          </Link>
          {methodologyHref ? (
            <Link
              href={`${methodologyHref}#station-availability`}
              className="text-[11px] text-navy-600 hover:text-gold-500 underline-offset-2 hover:underline transition-colors"
            >
              How?
            </Link>
          ) : null}
        </div>
      </div>
    </BentoCard>
  );
}

function StationTile({ station }: { station: StationHealthRow }) {
  const tone = STATE_TONE[station.status];
  const code = shortCode(station.station);
  const pct = station.pct_of_derated != null ? `${Math.round(station.pct_of_derated)}%` : '—';
  return (
    <div
      className="aspect-square rounded-[10px] flex flex-col items-center justify-center border"
      style={{
        background: tone.bg,
        borderColor: tone.border,
        color: tone.text,
      }}
      title={`${station.station} · ${pct}`}
    >
      <span className="font-mono text-[11px] font-semibold tracking-[0.04em] truncate max-w-full px-1">
        {code}
      </span>
      <span className="text-[10px] font-medium opacity-85 tabular-nums">{pct}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// Strip non-alphanumerics and take the leading three characters as the tile
// code. Station IDs in `gpl_daily_stations` are short tokens like SOPHIA,
// N/GT, #53 — this collapses them to SOP, NGT, 53.
function shortCode(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, '');
  return cleaned.slice(0, 3).toUpperCase();
}
