/** Agency code → full display name mapping */
export const AGENCY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  HECI: 'Hinterland Electrification Company Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  MARAD: 'Maritime Administration Department',
  GCAA: 'Guyana Civil Aviation Authority',
  MOPUA: 'Ministry of Public Works',
  HAS: 'Harbour & Aviation Services',
};

/** Short agency names for compact displays */
export const AGENCY_NAMES_SHORT: Record<string, string> = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  HECI: 'Hinterland Electrification',
  CJIA: 'CJIA Airport',
  MARAD: 'Maritime Administration',
  GCAA: 'Civil Aviation Authority',
  MOPUA: 'Ministry of Public Works',
  HAS: 'Harbour & Aviation',
};

/** Project status → badge variant mapping (for projects pages and oversight) */
export const PROJECT_STATUS_VARIANTS: Record<string, { variant: 'success' | 'danger' | 'info' | 'default' | 'warning'; label: string }> = {
  Commenced: { variant: 'info', label: 'Commenced' },
  Delayed: { variant: 'danger', label: 'Delayed' },
  Awarded: { variant: 'warning', label: 'Awarded' },
  Designed: { variant: 'default', label: 'Designed' },
  Completed: { variant: 'success', label: 'Completed' },
  Rollover: { variant: 'warning', label: 'Rollover' },
  Cancelled: { variant: 'danger', label: 'Cancelled' },
  Unknown: { variant: 'default', label: 'Unknown' },
};

/** Project status → bg/text classes (for detail page badges) */
export const PROJECT_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Commenced: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  Delayed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Awarded: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  Designed: { bg: 'bg-navy-600/20', text: 'text-slate-400' },
  Completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  Rollover: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  Cancelled: { bg: 'bg-red-500/20', text: 'text-red-300' },
  Unknown: { bg: 'bg-navy-600/20', text: 'text-slate-400' },
};

/** Project health indicator dot classes */
export const HEALTH_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
};

/** Project health indicator with labels (for detail pages) */
export const HEALTH_DOT_LABELED: Record<string, { color: string; label: string }> = {
  green: { color: 'bg-emerald-400', label: 'On Track' },
  amber: { color: 'bg-amber-400', label: 'Minor Issues' },
  red: { color: 'bg-red-400', label: 'Critical' },
};
