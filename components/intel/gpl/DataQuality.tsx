'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { GPLDataWarning, GPLChronicOutlierRow } from '@/lib/gpl/types';

interface QualitySnapshot {
  id: string;
  snapshot_date: string;
  data_quality_warnings: GPLDataWarning[];
  warning_count: number;
  track_a_outstanding: number;
  track_a_completed: number;
  track_b_design_outstanding: number;
  track_b_execution_outstanding: number;
  track_b_design_completed: number;
  track_b_execution_completed: number;
}

// Each warning type maps to a display row in the issue summary
interface IssueBucket {
  key: string;
  label: string;
  impact: string;
  action: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  warnings: GPLDataWarning[];
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(s: string) {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stageLabel(track: string, stage: string): string {
  if (track === 'A') return 'Simple Connections';
  if (stage === 'design') return 'Estimates';
  return 'Capital Works';
}

function totalRecords(snap: QualitySnapshot): number {
  return snap.track_a_outstanding + snap.track_a_completed
    + snap.track_b_design_outstanding + snap.track_b_execution_outstanding
    + snap.track_b_design_completed + snap.track_b_execution_completed;
}

function buildIssueBuckets(warnings: GPLDataWarning[]): IssueBucket[] {
  const groups = new Map<string, GPLDataWarning[]>();
  for (const w of warnings) {
    const existing = groups.get(w.type) || [];
    existing.push(w);
    groups.set(w.type, existing);
  }

  const buckets: IssueBucket[] = [];

  const sameDays = groups.get('same_day_completion') || [];
  const backdated = groups.get('backdated_entry') || [];
  const sameAndBack = [...sameDays, ...backdated];
  if (sameAndBack.length > 0) {
    buckets.push({
      key: 'same_day',
      label: 'Same-day / backdated completions',
      impact: 'Treated as 0-day completions, included in statistics',
      action: 'None needed',
      severity: 'info',
      count: sameAndBack.length,
      warnings: sameAndBack,
    });
  }

  const reversed = groups.get('reversed_date') || [];
  if (reversed.length > 0) {
    buckets.push({
      key: 'reversed_date',
      label: 'Date entry errors (completion before creation by 3+ days)',
      impact: 'Excluded from on-time rate and averages',
      action: 'Flag to GPL for correction',
      severity: 'error',
      count: reversed.length,
      warnings: reversed,
    });
  }

  const dupWithin = groups.get('duplicate_within_sheet') || [];
  if (dupWithin.length > 0) {
    buckets.push({
      key: 'dup_within',
      label: 'Duplicate records within sheets',
      impact: 'First occurrence kept, duplicates removed',
      action: 'Flag to GPL',
      severity: 'warning',
      count: dupWithin.length,
      warnings: dupWithin,
    });
  }

  const dupCross = groups.get('duplicate_cross_stage') || [];
  if (dupCross.length > 0) {
    buckets.push({
      key: 'dup_cross',
      label: 'Cross-stage duplicate accounts',
      impact: 'Same customer in multiple pipeline stages',
      action: 'May be legitimate, review if needed',
      severity: 'warning',
      count: dupCross.length,
      warnings: dupCross,
    });
  }

  // Catch-all for any other warning types
  const knownTypes = new Set(['same_day_completion', 'backdated_entry', 'reversed_date', 'duplicate_within_sheet', 'duplicate_cross_stage']);
  const other: GPLDataWarning[] = [];
  for (const [type, ws] of groups) {
    if (!knownTypes.has(type)) other.push(...ws);
  }
  if (other.length > 0) {
    buckets.push({
      key: 'other',
      label: 'Other issues',
      impact: 'See details',
      action: 'Review',
      severity: 'warning',
      count: other.length,
      warnings: other,
    });
  }

  return buckets;
}

function extractDetailLine(w: GPLDataWarning): string {
  const d = w.details || {};
  const acct = d.accountNumber as string || '';
  const sheet = d.sheetName as string || '';
  const parts: string[] = [];
  if (acct) parts.push(acct);
  if (sheet) parts.push(sheet);
  if (d.dateCreated && d.dateCompleted) parts.push(`${d.dateCreated} / ${d.dateCompleted}`);
  if (d.gap != null) parts.push(`${d.gap}d gap`);
  return parts.length > 0 ? parts.join(' — ') : w.message;
}

export function DataQuality() {
  const [snapshots, setSnapshots] = useState<QualitySnapshot[]>([]);
  const [outliers, setOutliers] = useState<GPLChronicOutlierRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [qualityRes, outlierRes] = await Promise.all([
        fetch('/api/gpl/sc-data-quality?limit=20'),
        fetch('/api/gpl/sc-outliers'),
      ]);
      if (qualityRes.ok) {
        const d = await qualityRes.json();
        setSnapshots(d.snapshots ?? []);
      }
      if (outlierRes.ok) {
        const d = await outlierRes.json();
        setOutliers(d.outliers ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const latest = snapshots[0];
  const warnings = latest?.data_quality_warnings ?? [];
  const issueBuckets = buildIssueBuckets(warnings);

  const total = latest ? totalRecords(latest) : 0;
  const errorCount = warnings.filter(w => w.severity === 'error').length;
  const included = total - errorCount;
  const qualityPct = total > 0 ? ((total - errorCount) / total) * 100 : 100;

  const qualityColor = qualityPct >= 95 ? 'text-emerald-400' : qualityPct >= 85 ? 'text-amber-400' : 'text-red-400';
  const barColor = qualityPct >= 95 ? 'bg-emerald-500' : qualityPct >= 85 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Section 1: Upload Summary Card */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Upload Summary</h3>
        {!latest ? (
          <p className="text-[#64748b] text-sm py-4">No uploads yet.</p>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Stats */}
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748b]">Latest Upload</span>
                <span className="text-white">{fmtDate(latest.snapshot_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Records Parsed</span>
                <span className="text-white">{total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Included in Statistics</span>
                <span className="text-white">{included.toLocaleString()}</span>
              </div>
              {errorCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Records Excluded</span>
                  <span className="text-red-400">{errorCount}</span>
                </div>
              )}
            </div>

            {/* Quality Ring */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2d3a52" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.5" fill="none"
                    stroke={qualityPct >= 95 ? '#059669' : qualityPct >= 85 ? '#d4af37' : '#dc2626'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${qualityPct * 0.9738} 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${qualityColor}`}>{qualityPct.toFixed(1)}%</span>
                </div>
              </div>
              <span className="text-[10px] text-[#64748b] uppercase tracking-wider">Data Quality</span>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Issue Summary */}
      {issueBuckets.length > 0 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Issue Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Issue</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs w-16">Count</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Impact</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden lg:table-cell">Action</th>
                </tr>
              </thead>
              <tbody>
                {issueBuckets.map(bucket => (
                  <IssueSummaryRow key={bucket.key} bucket={bucket} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Quality Trend */}
      {snapshots.length > 1 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Quality Trend</h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[...snapshots].reverse().map(s => {
                  const t = totalRecords(s);
                  const e = s.data_quality_warnings.filter(w => w.severity === 'error').length;
                  return {
                    date: fmtDateShort(s.snapshot_date),
                    quality: t > 0 ? parseFloat(((t - e) / t * 100).toFixed(1)) : 100,
                  };
                })}
                margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
              >
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
                  domain={[80, 100]} tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, 'Data Quality']}
                />
                <Line type="monotone" dataKey="quality" name="Quality" stroke="#059669" strokeWidth={2} dot={{ fill: '#059669', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section 4: Chronic Delays Watchlist */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Chronic Delays Watchlist
          <span className="text-[#64748b] font-normal ml-2">({outliers.length} unresolved)</span>
        </h3>
        {outliers.length === 0 ? (
          <p className="text-[#64748b] text-sm py-4">No chronic delays at this time.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d3a52]">
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Account</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Customer</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Location</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs">Category</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">First Seen</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Age</th>
                  <th className="text-right py-2 text-[#64748b] font-medium text-xs">Snapshots</th>
                  <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {outliers.map(o => (
                  <tr key={o.id} className="border-b border-[#2d3a52]/50">
                    <td className="py-2 text-[#94a3b8] font-mono text-xs">{o.account_number}</td>
                    <td className="py-2 text-white text-xs">{o.customer_name || '--'}</td>
                    <td className="py-2 text-[#94a3b8] text-xs hidden md:table-cell">{o.town_city || '--'}</td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        o.stage === 'design' ? 'bg-purple-500/20 text-purple-400'
                          : o.stage === 'execution' ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {stageLabel(o.track, o.stage)}
                      </span>
                    </td>
                    <td className="py-2 text-[#94a3b8] text-xs hidden md:table-cell">{fmtDateShort(o.first_seen_date)}</td>
                    <td className="py-2 text-right text-red-400 text-xs font-medium">{o.latest_days_elapsed}d</td>
                    <td className="py-2 text-right text-[#64748b] text-xs">{o.consecutive_snapshots}</td>
                    <td className="py-2 text-[#94a3b8] text-xs hidden lg:table-cell">
                      {o.date_created ? fmtDateShort(o.date_created.split('T')[0]) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Issue Summary Row with expandable details ────────────────────────────────

function IssueSummaryRow({ bucket }: { bucket: IssueBucket }) {
  const [expanded, setExpanded] = useState(false);

  const Icon = bucket.severity === 'error' ? AlertCircle
    : bucket.severity === 'warning' ? AlertTriangle
    : Info;
  const iconColor = bucket.severity === 'error' ? 'text-red-400'
    : bucket.severity === 'warning' ? 'text-amber-400'
    : 'text-blue-400';
  const countColor = bucket.severity === 'error' ? 'text-red-400'
    : bucket.severity === 'warning' ? 'text-amber-400'
    : 'text-[#94a3b8]';

  return (
    <>
      <tr className="border-b border-[#2d3a52]/50">
        <td className="py-2.5">
          <div className="flex items-center gap-2">
            <Icon className={`h-3.5 w-3.5 ${iconColor} shrink-0`} />
            <span className="text-white text-xs">{bucket.label}</span>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-[#64748b] hover:text-white transition-colors flex items-center gap-0.5"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>{expanded ? 'Hide' : 'Details'}</span>
            </button>
          </div>
        </td>
        <td className={`py-2.5 text-right font-medium text-xs ${countColor}`}>{bucket.count}</td>
        <td className="py-2.5 text-[#94a3b8] text-xs hidden md:table-cell">{bucket.impact}</td>
        <td className="py-2.5 text-[#94a3b8] text-xs hidden lg:table-cell">{bucket.action}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="py-0">
            <div className="bg-[#0f1d32] rounded-lg mx-2 mb-2 p-3">
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {bucket.warnings.map((w, i) => (
                  <div key={i} className="text-[11px] text-[#94a3b8] font-mono">
                    {extractDetailLine(w)}
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
