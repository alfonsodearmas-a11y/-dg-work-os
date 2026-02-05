'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AlertCard } from './common';

interface Alert {
  severity: 'critical' | 'warning';
  agency?: string;
  message: string;
  detail?: string;
  time?: string;
}

interface AlertSectionProps {
  alerts: Alert[];
  onAlertAction?: (alert: Alert) => void;
  onAlertDismiss?: (alert: Alert) => void;
}

export function AlertSection({ alerts, onAlertAction, onAlertDismiss }: AlertSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!alerts || alerts.length === 0) return null;

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-white font-semibold">Active Alerts</h3>
          <span className="flex items-center gap-2">
            {criticalAlerts.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                {criticalAlerts.length} critical
              </span>
            )}
            {warningAlerts.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                {warningAlerts.length} warning
              </span>
            )}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="text-[#94a3b8]" size={18} />
        ) : (
          <ChevronDown className="text-[#94a3b8]" size={18} />
        )}
      </button>

      {/* Alerts */}
      {isExpanded && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <AlertCard
              key={index}
              alert={alert}
              onAction={onAlertAction}
              onDismiss={onAlertDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
