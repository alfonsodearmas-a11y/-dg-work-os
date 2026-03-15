'use client';

import { useState } from 'react';
import {
  PieChart, Pie, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  AlertTriangle, Factory, Upload, Activity,
} from 'lucide-react';
import type { GPLData } from '@/data/mockData';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { InsightCard, type InsightCardData } from '@/components/ui/InsightCard';
import { GPLExcelUpload } from '../GPLExcelUpload';
import type { GPLSummary, ConsolidatedAlert } from './gpl-types';
import { getStatusColor } from './gpl-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GPLOverviewTabProps {
  data: GPLData;
  summary: GPLSummary;
  consolidatedAlerts: ConsolidatedAlert[];
  criticalCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GPLOverviewTab({
  data,
  summary,
  consolidatedAlerts,
  criticalCount,
}: GPLOverviewTabProps) {
  const [showDbisUpload, setShowDbisUpload] = useState(false);

  // Capacity utilization data for donut chart
  const utilizationData = [
    { name: 'Available', value: summary.totalAvailable, fill: '#10b981' },
    { name: 'Degraded', value: summary.degraded.reduce((sum, s) => sum + (s.derated - s.available), 0), fill: '#f59e0b' },
    { name: 'Offline', value: summary.totalOffline, fill: '#ef4444' }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Active Alerts - Compact List */}
      <div className="bg-navy-900 rounded-xl border border-navy-800 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-navy-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={16} />
            <h3 className="text-slate-100 font-medium text-lg">Active Alerts</h3>
            {criticalCount > 0 && (
              <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {criticalCount}
              </span>
            )}
          </div>
          <span className="text-navy-600 text-xs">{consolidatedAlerts.length} total</span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {consolidatedAlerts.length === 0 ? (
            <div className="p-3 text-center text-navy-600 text-sm">No active alerts</div>
          ) : (
            consolidatedAlerts.slice(0, 6).map(alert => (
              <div
                key={alert.id}
                className="px-3 py-2 border-b border-navy-800/30 hover:bg-navy-800/30 flex items-center gap-2"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  alert.severity === 'critical' ? 'bg-red-500' :
                  alert.severity === 'high' ? 'bg-orange-500' :
                  alert.severity === 'medium' ? 'bg-blue-500' : 'bg-navy-600'
                }`} aria-label={`Severity: ${alert.severity}`} />
                <span className="text-slate-200 text-sm flex-1 truncate">{alert.title}</span>
                {alert.station && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-navy-800 text-slate-400 flex-shrink-0">{alert.station}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Upload DBIS Report */}
      {!showDbisUpload ? (
        <button
          onClick={() => setShowDbisUpload(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-navy-800 hover:border-gold-500/50 bg-navy-900/50 hover:bg-navy-900 text-slate-400 hover:text-gold-500 transition-all"
        >
          <Upload size={16} />
          <span className="text-sm font-medium">Upload DBIS Excel Report</span>
        </button>
      ) : (
        <GPLExcelUpload
          onCancel={() => setShowDbisUpload(false)}
        />
      )}

      {/* Fleet at a Glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Station Grid */}
        <div className="lg:col-span-2 space-y-3">
          {/* Summary line -- always visible */}
          <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
            <h3 className="text-slate-100 font-medium text-lg mb-2">Fleet at a Glance</h3>
            <p className="text-slate-400 text-[15px]">
              {summary.operational.length} operational, {summary.degraded.length} degraded, {summary.offline.length} offline
            </p>
          </div>
          {/* Collapsible station detail */}
          <CollapsibleSection
            title="Station Detail"
            icon={Factory}
            badge={{ text: `${summary.stations.length} stations`, variant: 'gold' }}
            defaultOpen={false}
          >
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {summary.stations.map(station => (
                <div
                  key={station.name}
                  className="bg-navy-950 rounded-lg p-3 border border-navy-800 hover:border-gold-500/50 transition-colors group relative"
                  title={`${station.name}: ${station.available}/${station.derated} MW (${station.units} units)`}
                >
                  <p className="text-slate-100 text-[11px] font-medium leading-tight break-words">{station.name}</p>
                  <p className="text-slate-400 text-xs">{station.available}/{station.derated}</p>
                  <div className="h-2 bg-navy-800 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(station.availability, 100)}%`,
                        backgroundColor: getStatusColor(station.status)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-navy-800">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-slate-400 text-sm">Operational</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500" /><span className="text-slate-400 text-sm">Degraded</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-500" /><span className="text-slate-400 text-sm">Critical</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /><span className="text-slate-400 text-sm">Offline</span></div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Utilization Donut */}
        <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4">
          <h3 className="text-slate-100 font-medium text-lg mb-2">Capacity Utilization</h3>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={utilizationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {utilizationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number) => `${value.toFixed(1)} MW`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-slate-100">{summary.availability}%</p>
                <p className="text-navy-600 text-sm">Fleet</p>
              </div>
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            {utilizationData.map(item => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: item.fill }} />
                  <span className="text-slate-400">{item.name}</span>
                </div>
                <span className="text-slate-100 font-medium">{item.value.toFixed(1)} MW</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Executive Briefing -- Data-Driven Insight Cards */}
      <AIBriefingSection data={data} summary={summary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Briefing sub-section (extracted from IIFE)
// ---------------------------------------------------------------------------

function AIBriefingSection({ data, summary }: { data: GPLData; summary: GPLSummary }) {
  // Resolve AI briefing data (may or may not exist)
  const rawBriefing = data.aiAnalysis?.executiveBriefing || data.aiAnalysis?.executive_briefing;
  const aiSections: Record<string, { summary?: string; detail?: string; severity?: string }> = {};

  // Map AI sections by normalized title for lookup
  if (rawBriefing && typeof rawBriefing === 'object' && rawBriefing.sections) {
    for (const s of rawBriefing.sections) {
      const key = (s.title || '').toLowerCase();
      if (key.includes('system') || key.includes('status')) aiSections['system'] = s;
      else if (key.includes('critical') || key.includes('issue')) aiSections['issues'] = s;
      else if (key.includes('positive') || key.includes('strong') || key.includes('performer')) aiSections['performers'] = s;
      else if (key.includes('action') || key.includes('required')) aiSections['actions'] = s;
    }
  }

  // Build headline -- full text, never truncated
  let headline: string | null = null;
  if (rawBriefing) {
    if (typeof rawBriefing === 'object' && rawBriefing.headline) {
      headline = rawBriefing.headline;
    } else if (typeof rawBriefing === 'string') {
      headline = rawBriefing.split('\n').filter((l: string) => l.trim()).slice(0, 3).join(' ');
    }
  }

  // Data-driven summaries for each card
  const critStations = [...summary.critical, ...summary.offline];
  const lostMw = critStations.reduce((sum, s) => sum + (s.derated - s.available), 0);
  const topPerformers = summary.operational
    .filter(s => s.availability >= 95)
    .sort((a, b) => b.available - a.available);
  const topBaseload = topPerformers.reduce((sum, s) => sum + s.available, 0);

  const critAlerts = data.aiAnalysis?.criticalAlerts || data.aiAnalysis?.critical_alerts || [];
  const recommendations = data.aiAnalysis?.recommendations || [];
  const urgentRecs = recommendations.filter((r: any) => r.urgency === 'Immediate' || r.urgency === 'Short-term');
  const actionCount = urgentRecs.length + critAlerts.length;

  // Build 4 insight cards
  const insightCards: InsightCardData[] = [
    {
      emoji: '\u26A1',
      title: 'System Status',
      severity: summary.availability >= 75 ? 'stable' : summary.availability >= 60 ? 'warning' : 'critical',
      summary: `${summary.totalAvailable} MW available of ${summary.totalDerated} MW installed (${summary.availability}%)`,
      detail: aiSections['system']?.detail || null,
    },
    {
      emoji: '\uD83D\uDEA8',
      title: 'Critical Issues',
      severity: critStations.length > 2 ? 'critical' : critStations.length > 0 ? 'warning' : 'positive',
      summary: critStations.length > 0
        ? `${summary.critical.length} station${summary.critical.length !== 1 ? 's' : ''} below 50%, ${summary.offline.length} offline, ${lostMw.toFixed(1)} MW lost`
        : 'No critical issues detected',
      detail: aiSections['issues']?.detail || null,
    },
    {
      emoji: '\u2705',
      title: 'Strong Performers',
      severity: 'positive',
      summary: topPerformers.length > 0
        ? `${topPerformers.slice(0, 4).map(s => s.name).join(', ')} at 95%+ capacity \u2014 ${topBaseload.toFixed(1)} MW stable baseload`
        : `${summary.operational.length} station${summary.operational.length !== 1 ? 's' : ''} operational`,
      detail: aiSections['performers']?.detail || null,
    },
    {
      emoji: '\uD83D\uDCCB',
      title: 'Action Required',
      severity: actionCount > 3 ? 'warning' : actionCount > 0 ? 'stable' : 'positive',
      summary: actionCount > 0
        ? `${actionCount} priority action${actionCount !== 1 ? 's' : ''} for DG attention`
        : 'No urgent actions required',
      detail: aiSections['actions']?.detail
        || (urgentRecs.length > 0
          ? urgentRecs.map((r: any) => `\u2022 ${r.recommendation}`).join('\n')
          : null),
    },
  ];

  return (
    <div className="space-y-3">
      {/* HEADLINE -- full text, never truncated */}
      {headline && (
        <div className="bg-gradient-to-r from-[#1a2744] to-[#2d3a52]/80 rounded-xl border border-gold-500/20 p-3 md:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-gold-500 font-semibold mb-1.5">AI Executive Briefing</p>
              <p className="text-base md:text-[20px] font-bold text-slate-100 leading-snug">{headline}</p>
            </div>
          </div>
        </div>
      )}

      {/* 4 INSIGHT CARDS -- 2x2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insightCards.map((card, i) => (
          <InsightCard key={i} card={card} />
        ))}
      </div>

      {/* CRITICAL ALERTS -- each as a mini-card with severity left border */}
      {critAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-[15px] font-semibold text-slate-100">Critical Alerts</span>
            <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">{critAlerts.length}</span>
          </div>
          {critAlerts.map((alert: any, i: number) => {
            const alertSev = (alert.severity || 'CRITICAL').toUpperCase();
            const borderColor = alertSev === 'CRITICAL' ? 'border-l-red-500' : alertSev === 'HIGH' ? 'border-l-orange-500' : 'border-l-amber-500';
            return (
              <div key={i} className={`bg-navy-900 rounded-lg border border-navy-800 border-l-4 ${borderColor} p-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-semibold text-slate-100">{alert.title}</span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded font-medium">
                    {alertSev}
                  </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{alert.description}</p>
                {alert.recommendation && (
                  <p className="text-blue-400 text-sm mt-1.5">{'\u2192'} {alert.recommendation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
