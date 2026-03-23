'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface SubstationBreakdown {
  code: string;
  name: string;
  count: number;
}

interface CauseBreakdown {
  subcategory: string;
  count: number;
  pct: number;
}

interface WorstFeeder {
  feeder_code: string;
  substation_code: string;
  display: string;
  count: number;
  customer_count: number;
}

interface MonthData {
  month: string;
  label: string;
  outage_count: number;
  avg_duration_minutes: number;
  total_ens_mwh: number;
  total_customers_affected: number;
  has_long_outage: boolean;
  is_current: boolean;
  vs_previous: {
    outage_count_delta_pct: number;
    avg_duration_delta_pct: number;
    ens_delta_pct: number;
  } | null;
  by_substation: SubstationBreakdown[];
  by_cause: CauseBreakdown[];
  worst_feeders: WorstFeeder[];
}

interface MonthlyPerformanceProps {
  onFeederSelect?: (feederId: string) => void;
  onNavigateToday?: (dateRange: { from: string; to: string }) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CAUSE_COLORS: Record<string, string> = {
  'Earth Fault': '#EF9F27',
  Overcurrent: '#D85A30',
  Planned: '#5DCAA5',
  'Generation Shortfall': '#7B68EE',
  'External Mechanism': '#5B8DEF',
};
const DEFAULT_CAUSE_COLOR = '#888780';

// ── Helpers ─────────────────────────────────────────────────────────────────

function DeltaArrow({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: '#64748b', fontSize: 11 }}>--</span>;
  // Negative = fewer outages = improving (green), positive = worsening (red)
  const improving = value < 0;
  const color = improving ? '#059669' : '#dc2626';
  const arrow = improving ? '\u2193' : '\u2191';
  return (
    <span style={{ color, fontSize: 11, fontWeight: 600 }}>
      {arrow} {Math.abs(value)}%
    </span>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MonthlyPerformance({
  onFeederSelect,
  onNavigateToday,
}: MonthlyPerformanceProps) {
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/pulse/gpl/monthly');
        if (!res.ok) throw new Error('Failed to load monthly data');
        const data = await res.json();
        setMonths(data.months ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const maxOutageCount = useMemo(
    () => Math.max(...months.map((m) => m.outage_count), 1),
    [months],
  );

  function toggleMonth(month: string) {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }

  // Scroll detail panel into view after expand
  useEffect(() => {
    if (expandedMonth && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expandedMonth]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid #2d3a52',
            borderTopColor: '#d4af37',
            borderRadius: '50%',
            margin: '0 auto 12px',
            animation: 'spin 1s linear infinite',
          }}
        />
        Loading monthly performance...
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          background: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: 10,
          color: '#f87171',
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        No outage data available for the selected period.
      </div>
    );
  }

  const expandedData = useMemo(
    () => months.find((m) => m.month === expandedMonth),
    [months, expandedMonth],
  );

  return (
    <div>
      {/* ── Month Card Grid ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {months.map((m) => {
          const isExpanded = expandedMonth === m.month;
          const barIntensity = m.outage_count / maxOutageCount;
          const barColor =
            barIntensity > 0.7
              ? '#dc2626'
              : barIntensity > 0.4
                ? '#d4af37'
                : '#059669';

          return (
            <button
              key={m.month}
              onClick={() => toggleMonth(m.month)}
              style={{
                position: 'relative',
                background: isExpanded
                  ? 'linear-gradient(135deg, #1a2744 0%, #1f3055 100%)'
                  : '#0d1b2e',
                border: m.is_current
                  ? '1px solid rgba(212, 175, 55, 0.5)'
                  : isExpanded
                    ? '1px solid rgba(212, 175, 55, 0.3)'
                    : '1px solid #2d3a52',
                borderRadius: 10,
                padding: '14px 14px 8px',
                cursor: 'pointer',
                textAlign: 'center',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                width: '100%',
              }}
            >
              {m.has_long_outage && (
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#dc2626',
                    boxShadow: '0 0 6px rgba(220, 38, 38, 0.5)',
                  }}
                />
              )}

              <span
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  fontFamily: 'Outfit, sans-serif',
                  letterSpacing: '0.02em',
                }}
              >
                {m.label}
                {m.is_current && (
                  <span style={{ color: '#d4af37', marginLeft: 4, fontSize: 9 }}>
                    (in progress)
                  </span>
                )}
              </span>

              <span
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#f1f5f9',
                  fontFamily: 'Outfit, sans-serif',
                  lineHeight: 1.1,
                }}
              >
                {m.outage_count}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: '#64748b',
                  fontFamily: 'Outfit, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                outages
              </span>

              <div style={{ marginTop: 2, minHeight: 16 }}>
                {m.vs_previous ? (
                  <DeltaArrow value={m.vs_previous.outage_count_delta_pct} />
                ) : (
                  <span style={{ fontSize: 11, color: '#64748b' }}>--</span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  marginTop: 4,
                  paddingTop: 6,
                  borderTop: '1px solid rgba(45, 58, 82, 0.5)',
                }}
              >
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>
                  {m.avg_duration_minutes}m avg
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Outfit, sans-serif' }}>
                  {m.total_ens_mwh.toFixed(1)} MWh
                </span>
              </div>

              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: barColor,
                  opacity: 0.3 + barIntensity * 0.7,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Detail Panel ────────────────────────────────────────────────── */}
      <div
        ref={detailRef}
        style={{
          maxHeight: expandedData ? 600 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.35s ease-in-out',
        }}
      >
        {expandedData && (
          <div
            style={{
              marginTop: 16,
              background: 'linear-gradient(135deg, #0f2035 0%, #14253d 100%)',
              border: '1px solid #2d3a52',
              borderTop: '2px solid rgba(212, 175, 55, 0.4)',
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 24,
              }}
            >
              <div>
                <h4
                  style={{
                    margin: '0 0 10px',
                    fontSize: 11,
                    color: '#64748b',
                    fontFamily: 'Outfit, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  By Substation
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {expandedData.by_substation.slice(0, 8).map((sub, idx) => {
                    const maxCount = expandedData.by_substation[0]?.count ?? 1;
                    const barWidth = Math.round((sub.count / maxCount) * 60);
                    const barColor =
                      idx === 0 ? '#dc2626' : idx === 1 ? '#d4af37' : '#5DCAA5';

                    return (
                      <button
                        key={sub.code}
                        onClick={() => onFeederSelect?.(sub.code)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '3px 0',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: '#e2e8f0',
                            fontFamily: 'Outfit, sans-serif',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sub.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: '#94a3b8',
                            fontFamily: 'JetBrains Mono, monospace',
                            minWidth: 20,
                            textAlign: 'right',
                          }}
                        >
                          {sub.count}
                        </span>
                        <div
                          style={{
                            width: 60,
                            height: 6,
                            background: '#1a2744',
                            borderRadius: 3,
                            overflow: 'hidden',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: barWidth,
                              height: '100%',
                              background: barColor,
                              borderRadius: 3,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h4
                    style={{
                      margin: '0 0 10px',
                      fontSize: 11,
                      color: '#64748b',
                      fontFamily: 'Outfit, sans-serif',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    By Cause
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {expandedData.by_cause.slice(0, 5).map((c) => (
                      <div
                        key={c.subcategory}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12,
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background:
                              CAUSE_COLORS[c.subcategory] ?? DEFAULT_CAUSE_COLOR,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            color: '#e2e8f0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.subcategory}
                        </span>
                        <span
                          style={{
                            color: '#94a3b8',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {c.count}
                        </span>
                        <span style={{ color: '#64748b', fontSize: 11, minWidth: 30 }}>
                          {c.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {expandedData.vs_previous && (
                  <div>
                    <h4
                      style={{
                        margin: '0 0 10px',
                        fontSize: 11,
                        color: '#64748b',
                        fontFamily: 'Outfit, sans-serif',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      vs Previous Month
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <ComparisonRow
                        label="Outages"
                        delta={expandedData.vs_previous.outage_count_delta_pct}
                      />
                      <ComparisonRow
                        label="Avg Restoration"
                        delta={expandedData.vs_previous.avg_duration_delta_pct}
                      />
                      <ComparisonRow
                        label="Energy Not Supplied"
                        delta={expandedData.vs_previous.ens_delta_pct}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {expandedData.worst_feeders.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    color: '#64748b',
                    fontFamily: 'Outfit, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Repeat Offenders
                </h4>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                >
                  {expandedData.worst_feeders.map((f) => {
                    const bg =
                      f.count >= 3
                        ? 'rgba(220, 38, 38, 0.2)'
                        : f.count >= 2
                          ? 'rgba(212, 175, 55, 0.15)'
                          : 'rgba(45, 58, 82, 0.5)';
                    const border =
                      f.count >= 3
                        ? 'rgba(220, 38, 38, 0.4)'
                        : f.count >= 2
                          ? 'rgba(212, 175, 55, 0.3)'
                          : '#2d3a52';

                    return (
                      <button
                        key={f.feeder_code}
                        onClick={() => onFeederSelect?.(f.feeder_code)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px',
                          background: bg,
                          border: `1px solid ${border}`,
                          borderRadius: 16,
                          cursor: 'pointer',
                          fontSize: 11,
                          fontFamily: 'Outfit, sans-serif',
                          color: '#e2e8f0',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{f.display}</span>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            color: '#94a3b8',
                          }}
                        >
                          {f.count}x
                        </span>
                        <span style={{ color: '#64748b', fontSize: 10 }}>
                          {formatNumber(f.customer_count)} cust
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid rgba(45, 58, 82, 0.5)',
                textAlign: 'right',
              }}
            >
              <button
                onClick={() => {
                  const [y, m] = expandedData.month.split('-').map(Number);
                  const lastDay = new Date(y, m, 0).getDate();
                  onNavigateToday?.({
                    from: `${expandedData.month}-01`,
                    to: `${expandedData.month}-${String(lastDay).padStart(2, '0')}`,
                  });
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#d4af37',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 500,
                  padding: 0,
                }}
              >
                View all {expandedData.outage_count} outages for {expandedData.label}{' '}
                &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ComparisonRow({ label, delta }: { label: string; delta: number }) {
  const improving = delta < 0;
  const color = delta === 0 ? '#64748b' : improving ? '#059669' : '#dc2626';
  const arrow = delta === 0 ? '' : improving ? '\u2193' : '\u2191';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>
        {arrow} {Math.abs(delta)}%
      </span>
    </div>
  );
}
