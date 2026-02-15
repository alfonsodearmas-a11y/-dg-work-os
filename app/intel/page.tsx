'use client';

import { useState } from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import Link from 'next/link';
import { useAgencyData } from '@/hooks/useAgencyData';
import { AgencyCard } from '@/components/intel/AgencyCard';
import { StatusBar } from '@/components/intel/StatusBar';
import { AlertSection } from '@/components/intel/AlertSection';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { LoadingSkeleton } from '@/components/intel/common';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const PanelLoader = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
  </div>
);

const GPLDetail = dynamic(() => import('@/components/intel/GPLDetail').then(m => ({ default: m.GPLDetail })), { loading: PanelLoader });
const CJIADetail = dynamic(() => import('@/components/intel/CJIADetail').then(m => ({ default: m.CJIADetail })), { loading: PanelLoader });
const GWIDetail = dynamic(() => import('@/components/intel/GWIDetail').then(m => ({ default: m.GWIDetail })), { loading: PanelLoader });
const GCAADetail = dynamic(() => import('@/components/intel/GCAADetail').then(m => ({ default: m.GCAADetail })), { loading: PanelLoader });

export default function IntelPage() {
  const { agencies, alerts, rawData, lastUpdated, isLoading, refresh } = useAgencyData();
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);

  const selectedAgencyObj = agencies.find(a => a.id === selectedAgency);

  const renderDetailPanel = () => {
    if (!selectedAgency || !rawData) return null;

    switch (selectedAgency) {
      case 'gpl':
        return <GPLDetail data={rawData.gpl} />;
      case 'cjia':
        return <CJIADetail data={rawData.cjia} />;
      case 'gwi':
        return <GWIDetail />;
      case 'gcaa':
        return <GCAADetail data={rawData.gcaa} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center shrink-0">
            <Radio className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Agency Intel</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">
              Updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors disabled:opacity-50 shrink-0 touch-active"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="text-sm hidden md:inline">Refresh</span>
        </button>
      </div>

      {isLoading && agencies.length === 0 ? (
        <div className="space-y-4">
          <LoadingSkeleton type="statusBar" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LoadingSkeleton type="card" count={4} />
          </div>
        </div>
      ) : (
        <>
          {/* System Status Bar */}
          <StatusBar agencies={agencies} />

          {/* Active Alerts */}
          <AlertSection
            alerts={alerts}
            onAlertAction={(alert) => {
              if (alert.agency) setSelectedAgency(alert.agency);
            }}
          />

          {/* Agency Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agencies.map(agency => (
              <AgencyCard
                key={agency.id}
                agency={agency}
                onClick={() => setSelectedAgency(agency.id)}
                compact
              />
            ))}
          </div>

          {/* Deep Dive Links */}
          <div className="card-premium p-4">
            <p className="text-[#64748b] text-sm mb-3">Full Agency Reports</p>
            <div className="flex flex-wrap gap-2">
              {agencies.map(agency => (
                <Link
                  key={agency.id}
                  href={`/intel/${agency.id}`}
                  className="px-4 py-2 rounded-xl bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white text-sm transition-colors"
                >
                  {agency.title} Deep Dive
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Slide Panel for Agency Detail */}
      <SlidePanel
        isOpen={!!selectedAgency}
        onClose={() => setSelectedAgency(null)}
        title={selectedAgencyObj?.title || ''}
        subtitle={selectedAgencyObj?.subtitle}
        icon={selectedAgencyObj?.icon}
        accentColor={selectedAgencyObj?.accentColor}
      >
        <ErrorBoundary fallbackTitle={`Failed to load ${selectedAgencyObj?.title || 'agency'} data`}>
          {renderDetailPanel()}
        </ErrorBoundary>
      </SlidePanel>
    </div>
  );
}
