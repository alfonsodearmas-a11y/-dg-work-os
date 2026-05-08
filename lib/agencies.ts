/**
 * Canonical agency registry used by the /intel surface.
 *
 * Earlier code spread the same allowlist + display metadata across the intel
 * page-API, the report-API, the data fetcher, and six per-agency page files.
 * They all need to agree, so the list lives here.
 */

export const INTEL_AGENCIES = [
  'gpl',
  'cjia',
  'gwi',
  'gcaa',
  'heci',
  'marad',
  'has',
] as const;

export type IntelAgency = (typeof INTEL_AGENCIES)[number];

const INTEL_AGENCY_SET: Set<string> = new Set(INTEL_AGENCIES);

export function isIntelAgency(value: string): value is IntelAgency {
  return INTEL_AGENCY_SET.has(value.toLowerCase());
}

/** Returns the canonical UPPER-CASE agency code used by tender / users / tasks
 *  storage (per migration 106 `agency_canonical_uppercase`). */
export function canonicalizeAgency(value: string): string {
  return value.toUpperCase();
}

/**
 * Per-agency presentation metadata for the deep-dive page header. Lucide
 * icons are referenced by name — `AgencyIntelPage` resolves the name to a
 * component — so this module stays serializable across server/client.
 */
export type AgencyIntelMeta = {
  display: string;
  subtitle: string;
  iconName: 'Zap' | 'Droplets' | 'Plane' | 'PlaneLanding' | 'Shield' | 'Lightbulb' | 'Anchor';
  iconGradient: string;
};

export const INTEL_AGENCY_META: Partial<Record<IntelAgency, AgencyIntelMeta>> = {
  gpl: {
    display: 'GPL',
    subtitle: 'Guyana Power & Light',
    iconName: 'Zap',
    iconGradient: 'from-amber-500 to-orange-600',
  },
  gwi: {
    display: 'GWI',
    subtitle: 'Guyana Water Inc.',
    iconName: 'Droplets',
    iconGradient: 'from-cyan-500 to-teal-600',
  },
  cjia: {
    display: 'CJIA',
    subtitle: 'CJIA Airport — Operations',
    iconName: 'Plane',
    iconGradient: 'from-sky-500 to-blue-600',
  },
  gcaa: {
    display: 'GCAA',
    subtitle: 'Civil Aviation Authority',
    iconName: 'Shield',
    iconGradient: 'from-violet-500 to-purple-600',
  },
  heci: {
    display: 'HECI',
    subtitle: 'Hinterland Electrification Company Inc.',
    iconName: 'Lightbulb',
    iconGradient: 'from-amber-500 to-yellow-600',
  },
  marad: {
    display: 'MARAD',
    subtitle: 'Maritime Administration Department',
    iconName: 'Anchor',
    iconGradient: 'from-cyan-500 to-blue-600',
  },
  has: {
    display: 'HAS',
    subtitle: 'Hinterland Airstrips Service',
    iconName: 'PlaneLanding',
    iconGradient: 'from-orange-500 to-amber-600',
  },
};
