'use client';

import { Zap, Sun, Brain, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';

interface PreviewStepProps {
  preview: any;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PreviewStep({ preview, submitting, onSubmit, onCancel }: PreviewStepProps) {
  const schedule = preview?.schedule;
  const summary = schedule?.summary;
  const stats = schedule?.stats
    ? { ...schedule.stats, totalOutages: (preview?.outages || []).length }
    : null;
  const stations = schedule?.stations || [];
  const warnings = preview?.warnings || [];

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-300 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Parsing Warnings</span>
          </div>
          <ul className="text-xs text-yellow-200 space-y-1">
            {warnings.map((w: any, i: number) => (
              <li key={i}>&#8226; {typeof w === 'string' ? w : w.message || String(w.type)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Report Date & Meta */}
      <div className="p-4 bg-navy-800/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400">Report Date</span>
          <span className="text-white font-semibold">{preview.reportDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-navy-600">Date Column: {preview.schedule?.dateColumn || 'auto'}</span>
          <span className="text-navy-600">
            {stats?.totalStations} stations, {stats?.totalUnits} units
          </span>
        </div>
      </div>

      {/* Unit Status Overview */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-green-500/20 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-400">{stats?.unitsOnline || 0}</div>
          <div className="text-xs text-slate-400">Online</div>
        </div>
        <div className="p-3 bg-red-500/20 rounded-lg text-center">
          <div className="text-2xl font-bold text-red-400">{stats?.unitsOffline || 0}</div>
          <div className="text-xs text-slate-400">Offline</div>
        </div>
        <div className="p-3 bg-navy-800/50 rounded-lg text-center">
          <div className="text-2xl font-bold text-slate-400">{stats?.unitsNoData || 0}</div>
          <div className="text-xs text-slate-400">No Data</div>
        </div>
        <div className="p-3 bg-purple-500/20 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-400">{stats?.totalOutages || 0}</div>
          <div className="text-xs text-slate-400">Outages</div>
        </div>
      </div>

      {/* Station Summary — collapsible */}
      <CollapsibleSection
        title="Station Status"
        icon={Zap}
        badge={{ text: `${stations.length} stations`, variant: 'gold' }}
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {stations?.map((station: any) => (
            <div key={station.station} className="p-2 bg-navy-900 rounded flex items-center justify-between">
              <div>
                <span className="text-white text-xs block">{station.station}</span>
                <span className="text-navy-600 text-xs">{station.unitsOnline}/{station.totalUnits} online</span>
              </div>
              <div className="text-right">
                <span className={`font-medium text-sm ${station.stationUtilizationPct >= 80 ? 'text-green-400' : station.stationUtilizationPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {station.stationUtilizationPct?.toFixed(0) || 0}%
                </span>
                <span className="text-navy-600 text-xs block">{station.totalAvailableMw?.toFixed(1)} MW</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-amber-500/20 rounded-lg">
          <div className="text-slate-400 text-sm">Fossil Capacity</div>
          <div className="text-xl font-bold text-amber-400">
            {summary?.totalFossilFuelCapacityMw?.toFixed(1) || '\u2014'} MW
          </div>
        </div>
        <div className="p-3 bg-blue-500/20 rounded-lg">
          <div className="text-slate-400 text-sm">Expected Peak</div>
          <div className="text-xl font-bold text-blue-400">
            {summary?.expectedPeakDemandMw?.toFixed(1) || '\u2014'} MW
          </div>
        </div>
        <div className="p-3 bg-cyan-500/20 rounded-lg">
          <div className="text-slate-400 text-sm">Reserve</div>
          <div className="text-xl font-bold text-cyan-400">
            {summary?.reserveCapacityMw?.toFixed(1) || '\u2014'} MW
          </div>
        </div>
        <div className="p-3 bg-navy-800/50 rounded-lg">
          <div className="text-slate-400 text-sm">DBIS Capacity</div>
          <div className="text-xl font-bold text-white">
            {summary?.totalDbisCapacityMw?.toFixed(1) || '\u2014'} MW
          </div>
        </div>
      </div>

      {/* Peak Demand */}
      {(summary?.eveningPeakOnBarsMw || summary?.dayPeakOnBarsMw) && (
        <div className="p-4 bg-navy-800/50 rounded-lg">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Peak Demand</h4>
          <div className="grid grid-cols-2 gap-4">
            {summary?.eveningPeakOnBarsMw && (
              <div>
                <div className="text-xs text-navy-600">Evening Peak</div>
                <div className="text-lg font-semibold text-white">
                  {summary.eveningPeakOnBarsMw?.toFixed(1)} MW
                  {summary.eveningPeakSuppressedMw && (
                    <span className="text-sm text-slate-400 ml-1">
                      ({summary.eveningPeakSuppressedMw?.toFixed(1)} suppressed)
                    </span>
                  )}
                </div>
              </div>
            )}
            {summary?.dayPeakOnBarsMw && (
              <div>
                <div className="text-xs text-navy-600">Day Peak</div>
                <div className="text-lg font-semibold text-white">
                  {summary.dayPeakOnBarsMw?.toFixed(1)} MW
                  {summary.dayPeakSuppressedMw && (
                    <span className="text-sm text-slate-400 ml-1">
                      ({summary.dayPeakSuppressedMw?.toFixed(1)} suppressed)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Solar Data — collapsible */}
      <CollapsibleSection
        title="Renewable Capacity"
        icon={Sun}
        defaultOpen={false}
      >
        <div className="grid grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-slate-400">Hampshire</div>
            <div className="text-lg font-semibold text-green-400">{summary?.solarHampshireMwp || 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Prospect</div>
            <div className="text-lg font-semibold text-green-400">{summary?.solarProspectMwp || 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Trafalgar</div>
            <div className="text-lg font-semibold text-green-400">{summary?.solarTrafalgarMwp || 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Renewable</div>
            <div className="text-lg font-semibold text-green-400">{summary?.totalRenewableMwp || 0}</div>
          </div>
        </div>
      </CollapsibleSection>

      {/* AI Analysis Notice */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg flex items-center gap-3">
        <Brain className="w-8 h-8 text-purple-400" />
        <div>
          <div className="text-sm font-medium text-purple-300">AI Analysis</div>
          <div className="text-xs text-slate-400">
            Upon confirmation, an AI-powered executive briefing will be generated automatically.
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-navy-800 hover:bg-navy-700 text-white font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-navy-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Confirm &amp; Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
