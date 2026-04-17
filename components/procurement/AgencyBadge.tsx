'use client';

import { AGENCY_NAMES, AGENCY_HEX_COLORS } from '@/lib/constants/agencies';

interface AgencyBadgeProps {
  agency: string;
}

const DEFAULT_COLOR = '#94a3b8';

// Short display labels for agencies whose code is verbose (e.g. underscored).
const SHORT_LABEL: Record<string, string> = {
  HINTERLAND_AIRSTRIPS: 'Airstrips',
};

export function AgencyBadge({ agency }: AgencyBadgeProps) {
  const code = agency.toUpperCase();
  const color = AGENCY_HEX_COLORS[code] || DEFAULT_COLOR;
  const label = SHORT_LABEL[code] || code;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium"
      style={{
        backgroundColor: `${color}33`,
        color: color,
      }}
      title={AGENCY_NAMES[code] || code}
    >
      {label}
    </span>
  );
}
