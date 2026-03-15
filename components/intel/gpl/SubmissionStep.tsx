'use client';

import { CheckCircle, Upload, Zap } from 'lucide-react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { AnalysisStep } from './AnalysisStep';

interface SubmissionStepProps {
  savedData: any;
  aiAnalysis: any;
  loadingAnalysis: boolean;
  onUploadAnother: () => void;
  onRetryAnalysis: () => void;
}

export function SubmissionStep({
  savedData,
  aiAnalysis,
  loadingAnalysis,
  onUploadAnother,
  onRetryAnalysis,
}: SubmissionStepProps) {
  const latestData = savedData?.latestData;
  const displaySummary = latestData?.summary;
  const displayStations = latestData?.stations || [];
  const displayAnalysis = latestData?.analysis || aiAnalysis;

  // Compute derived metrics
  const fossilMw = parseFloat(displaySummary?.total_fossil_capacity_mw || 0);
  const eveningPeakMw = parseFloat(displaySummary?.evening_peak_on_bars_mw || 0);
  const reserveMw = parseFloat(displaySummary?.reserve_capacity_mw || 0);
  const dbisMw = parseFloat(displaySummary?.total_dbis_capacity_mw || 0);
  const reserveMarginPct = eveningPeakMw > 0 ? ((fossilMw - eveningPeakMw) / fossilMw) * 100 : 0;

  return (
    <>
      {/* Success Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-full">
            <CheckCircle className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h3 className="text-[22px] font-semibold text-white">Data Saved Successfully</h3>
            <p className="text-sm text-slate-400">Report Date: {savedData.reportDate || latestData?.upload?.reportDate || 'N/A'}</p>
          </div>
        </div>
        <button
          onClick={onUploadAnother}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Another
        </button>
      </div>

      {/* Key Metrics */}
      {displaySummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-amber-500/20 rounded-lg">
            <div className="text-slate-400 text-sm">Fossil Capacity</div>
            <div className="text-xl font-bold text-amber-400">
              {fossilMw.toFixed(1)} MW
            </div>
          </div>
          <div className="p-3 bg-blue-500/20 rounded-lg">
            <div className="text-slate-400 text-sm">Evening Peak</div>
            <div className="text-xl font-bold text-blue-400">
              {eveningPeakMw.toFixed(1)} MW
            </div>
          </div>
          <div className="p-3 bg-cyan-500/20 rounded-lg">
            <div className="text-slate-400 text-sm">Reserve Margin</div>
            <div className={`text-xl font-bold ${reserveMarginPct < 15 ? 'text-red-400' : 'text-cyan-400'}`}>
              {reserveMarginPct.toFixed(1)}%
            </div>
          </div>
          <div className="p-3 bg-green-500/20 rounded-lg">
            <div className="text-slate-400 text-sm">DBIS Capacity</div>
            <div className="text-xl font-bold text-green-400">
              {dbisMw.toFixed(1)} MW
            </div>
          </div>
        </div>
      )}

      {/* Station Status Grid — collapsible */}
      {displayStations.length > 0 && (
        <div className="mb-6">
          <CollapsibleSection
            title="Station Status"
            icon={Zap}
            badge={{ text: `${displayStations.length} stations`, variant: 'gold' }}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {displayStations.map((station: any) => {
                const stationUtil = parseFloat(station.total_derated_capacity_mw || 0) > 0
                  ? Math.min((parseFloat(station.total_available_mw || 0) / parseFloat(station.total_derated_capacity_mw)) * 100, 100)
                  : 0;
                return (
                  <div key={station.station} className="p-2 bg-navy-800/50 rounded flex items-center justify-between">
                    <div>
                      <span className="text-white text-xs block">{station.station}</span>
                      <span className="text-navy-600 text-xs">{station.units_online}/{station.total_units} online</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium text-sm ${stationUtil >= 80 ? 'text-green-400' : stationUtil >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {stationUtil.toFixed(0)}%
                      </span>
                      <span className="text-navy-600 text-xs block">{parseFloat(station.total_available_mw || 0).toFixed(1)} MW</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* AI Analysis Section */}
      <div className="space-y-3">
        <AnalysisStep
          aiAnalysis={displayAnalysis}
          loadingAnalysis={loadingAnalysis}
          onRetry={onRetryAnalysis}
        />
      </div>
    </>
  );
}
