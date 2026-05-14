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

/**
 * Single hex accent per intel agency, derived from each iconGradient's "from"
 * color (Tailwind palette mapping). The bento deep-dive surface and the home
 * briefing surface both read from here. Reconciliation with the older
 * lib/constants/agencies.ts and components/tasks/* local consts is a separate
 * cleanup, out of scope for this PR.
 *
 * Known collision: HECI and GPL both derive amber-500 from their gradients.
 * Visual collision is real but currently low-impact (HECI rarely surfaces
 * alongside GPL in the same view). Re-theme HECI in a follow-up if needed.
 *
 * MARAD override: strict "from" rule yields cyan-500, which collides exactly
 * with GWI. Picking the "to" end (blue-600) keeps the choice grounded in
 * MARAD's own gradient and creates separation from GWI without inventing a
 * new hue. Documented as the only intentional deviation.
 */
export const AGENCY_ACCENT_HEX: Record<Uppercase<IntelAgency>, string> = {
  GPL: '#f59e0b',   // amber-500 (from of from-amber-500 to-orange-600)
  GWI: '#06b6d4',   // cyan-500  (from of from-cyan-500 to-teal-600)
  CJIA: '#0ea5e9',  // sky-500   (from of from-sky-500 to-blue-600)
  GCAA: '#8b5cf6',  // violet-500 (from of from-violet-500 to-purple-600)
  HECI: '#f59e0b',  // amber-500 (from of from-amber-500 to-yellow-600) — collides with GPL
  MARAD: '#2563eb', // blue-600  (to-end override, derived from from-cyan-500 to-blue-600)
  HAS: '#f97316',   // orange-500 (from of from-orange-500 to-amber-600)
};

export function agencyAccent(agency: string | null | undefined): string {
  if (!agency) return '#64748b';
  const key = agency.toUpperCase() as keyof typeof AGENCY_ACCENT_HEX;
  return AGENCY_ACCENT_HEX[key] ?? '#64748b';
}

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
