'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { GPLDataWarning, GPLChronicOutlierRow } from '@/lib/gpl/types';

interface QualitySnapshot {
  id: string;
  snapshot_date: string;
  data_quality_warnings: GPLDataWarning[];
  warning_count: number;
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stageLabel(track: string, stage: string): string {
  if (track === 'A') return 'Simple Connections';
  if (stage === 'design') return 'Estimates';
  return 'Capital Works';
}

// Map internal warning types to plain-language labels
function warningLabel(type: string): string {
  switch (type) {
    case 'reversed_date': return 'Date entry issue';
    case 'formula_error': return 'Calculation error';
    case 'backdated_entry': return 'Backdated completion';
    case 'same_day_completion': return 'Same-day completion';
    case 'duplicate_within_sheet': return 'Duplicate record';
    case 'duplicate_cross_stage': return 'Cross-stage duplicate';
    case 'missing_field': return 'Missing data';
    case 'reclassification': return 'Sheet classification';
    case 'summary_mismatch': return 'Count mismatch';
    default: return type.replace(/_/g, ' ');
  }
}

// Plain-language description for each severity
function warningDescription(warning: GPLDataWarning): string {
  if (warning.type === 'reversed_date') {
    return 'Completion date is before the creation date — likely a data entry error. This record was excluded from statistics.';
  }
  if (warning.type === 'backdated_entry') {
    return 'Work was completed before the service order was entered in GPL\'s system. Treated as a same-day completion.';
  }
  if (warning.type === 'same_day_completion') {
    return 'Application created and completed on the same day due to timestamp ordering. Treated as a same-day completion.';
  }
  return warning.message;
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

  // Group warnings by type for the summary line
  const errorCount = warnings.filter(w => w.severity === 'error').length;
  const infoCount = warnings.filter(w => w.type === 'same_day_completion' || w.type === 'backdated_entry').length;

  return (
    <div className="space-y-6">
      {/* Section 1: Latest Upload Notes */}
      <div className="card-premium p-4 md:p-6">
        <h3 className="text-sm font-semibold text-white mb-2">
          Latest Upload Notes
          {latest && <span className="text-[#64748b] font-normal ml-2">({fmtDate(latest.snapshot_date)})</span>}
        </h3>
        {/* Summary line */}
        {(infoCount > 0 || errorCount > 0) && (
          <p className="text-xs text-[#64748b] mb-4">
            {infoCount > 0 && `${infoCount} same-day/backdated completions detected`}
            {infoCount > 0 && errorCount > 0 && ' | '}
            {errorCount > 0 && `${errorCount} records with date entry issues excluded from statistics`}
          </p>
        )}
        {warnings.length === 0 ? (
          <p className="text-[#64748b] text-sm py-4">No notes for the latest upload.</p>
        ) : (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <WarningItem key={i} warning={w} />
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Warning Trend */}
      {snapshots.length > 1 && (
        <div className="card-premium p-4 md:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Issues per Upload</h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[...snapshots].reverse().map(s => ({
                  date: fmtDate(s.snapshot_date),
                  issues: s.warning_count,
                }))}
                margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
              >
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid #2d3a52', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="issues" name="Issues" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section 3: Chronic Delays Watchlist */}
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
                    <td className="py-2 text-[#94a3b8] text-xs hidden md:table-cell">{fmtDate(o.first_seen_date)}</td>
                    <td className="py-2 text-right text-red-400 text-xs font-medium">{o.latest_days_elapsed}d</td>
                    <td className="py-2 text-right text-[#64748b] text-xs">{o.consecutive_snapshots}</td>
                    <td className="py-2 text-[#94a3b8] text-xs hidden lg:table-cell">
                      {o.date_created ? fmtDate(o.date_created.split('T')[0]) : '--'}
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

// ── Sub-components ──────────────────────────────────────────────────────────

function WarningItem({ warning }: { warning: GPLDataWarning }) {
  const Icon = warning.severity === 'error' ? AlertCircle
    : warning.severity === 'warning' ? AlertTriangle
    : Info;

  const color = warning.severity === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/30'
    : warning.severity === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    : 'text-blue-400 bg-blue-500/10 border-blue-500/30';

  const iconColor = warning.severity === 'error' ? 'text-red-400'
    : warning.severity === 'warning' ? 'text-amber-400'
    : 'text-blue-400';

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${color}`}>
      <Icon className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-white">{warningLabel(warning.type)}</span>
          <span className={`text-[10px] font-medium uppercase ${iconColor}`}>{warning.severity}</span>
        </div>
        <p className="text-xs text-[#94a3b8]">{warningDescription(warning)}</p>
      </div>
    </div>
  );
}
