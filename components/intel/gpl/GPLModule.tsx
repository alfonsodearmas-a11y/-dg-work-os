'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { ExecutiveSummary } from './ExecutiveSummary';
import { TrackBPipeline } from './TrackBPipeline';
import { EfficiencyStaff } from './EfficiencyStaff';
import { DataQuality } from './DataQuality';
import { SCUpload } from './SCUpload';

type Tab = 'summary' | 'pipeline' | 'efficiency' | 'quality' | 'upload';

const TABS: { id: Tab; label: string; fullLabel: string }[] = [
  { id: 'summary', label: 'Summary', fullLabel: 'Executive Summary' },
  { id: 'pipeline', label: 'Pipeline', fullLabel: 'Capital Works Pipeline' },
  { id: 'efficiency', label: 'Efficiency', fullLabel: 'Efficiency & Staff' },
  { id: 'quality', label: 'Quality', fullLabel: 'Data Quality' },
];

export function GPLModule() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1);
    setShowUpload(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with upload toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Service Connection Efficiency</h2>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showUpload ? 'bg-gold-500/20 text-gold-500' : 'text-navy-600 hover:text-white hover:bg-navy-800/50 border border-navy-800'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </button>
      </div>

      {/* Upload Panel */}
      {showUpload && <SCUpload onSuccess={handleUploadSuccess} />}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-gold-500/20 text-gold-500'
                : 'text-navy-600 hover:text-white hover:bg-navy-800/50'
            }`}
          >
            <span className="hidden md:inline">{tab.fullLabel}</span>
            <span className="md:hidden">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' && <ExecutiveSummary key={refreshKey} />}
      {activeTab === 'pipeline' && <TrackBPipeline key={refreshKey} />}
      {activeTab === 'efficiency' && <EfficiencyStaff key={refreshKey} />}
      {activeTab === 'quality' && <DataQuality key={refreshKey} />}
    </div>
  );
}
