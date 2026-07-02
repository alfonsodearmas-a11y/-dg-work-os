// ── Hinterland Communities Types ─────────────────────────────────────────────
//
// Community-centric module. The community is the spine; Water (owned, phase 1),
// Electricity (owned, phase 2, empty) and Airstrips (READ from the airstrips
// module via communities.nearest_airstrip_id) hang off it.
//
// Mirrors lib/airstrip-types.ts: domain constants + union types + UI config maps
// (STATUS_CONFIG etc). Display colours live HERE, not in hinterland_option_types
// (that table only drives editable dropdown vocab).

// -- Domain constants — single source of truth --------------------------------

export const WATER_STATUSES = ['adequate', 'partial', 'no_system', 'unfunded', 'unknown'] as const;
export const WATER_SOURCE_STATUSES = ['active', 'inactive', 'pending_activation'] as const;
export const ELECTRICITY_STATUSES = ['adequate', 'partial', 'none', 'unknown'] as const;
export const GEOCODE_CONFIDENCES = ['high', 'medium', 'low'] as const;

export type WaterStatusValue = (typeof WATER_STATUSES)[number];
export type WaterSourceStatus = (typeof WATER_SOURCE_STATUSES)[number];
export type ElectricityStatusValue = (typeof ELECTRICITY_STATUSES)[number];
export type GeocodeConfidence = (typeof GEOCODE_CONFIDENCES)[number];

// A coordinate is treated as "approximate" (shown hollow, never as a precise
// point) when its geocode confidence is low.
export function isApproximate(confidence: string | null | undefined): boolean {
  return confidence === 'low';
}

// -- UI config maps -----------------------------------------------------------
// Semantic, matching the app (green = good). STATUS_CONFIG is the primary
// (water) status map, mirroring airstrip-types' STATUS_CONFIG.

export const STATUS_CONFIG: Record<WaterStatusValue, { label: string; color: string }> = {
  adequate:  { label: 'Adequate',         color: '#10b981' },
  partial:   { label: 'Partial / issues', color: '#d4af37' },
  unfunded:  { label: 'Unfunded',         color: '#f59e0b' },
  no_system: { label: 'No system',        color: '#dc2626' },
  unknown:   { label: 'Unknown',          color: '#64748b' },
};

export const WATER_SOURCE_STATUS_CONFIG: Record<WaterSourceStatus, { label: string; color: string }> = {
  active:             { label: 'Active',             color: '#10b981' },
  inactive:           { label: 'Inactive',           color: '#dc2626' },
  pending_activation: { label: 'Pending activation', color: '#d4af37' },
};

export const ELECTRICITY_STATUS_CONFIG: Record<ElectricityStatusValue, { label: string; color: string }> = {
  adequate: { label: 'Adequate', color: '#10b981' },
  partial:  { label: 'Partial',  color: '#d4af37' },
  none:     { label: 'None',     color: '#dc2626' },
  unknown:  { label: 'Unknown',  color: '#64748b' },
};

// Water source type display labels. Values match hinterland_option_types
// (water_source_type) plus `drilled_well` for the unspecified-diameter rows the
// register carries (no seeded option, shown by its label here).
export const WATER_SOURCE_TYPE_LABELS: Record<string, string> = {
  drilled_well_4: 'Drilled well 4"',
  drilled_well_6: 'Drilled well 6"',
  drilled_well_8: 'Drilled well 8"',
  drilled_well:   'Drilled well',
  hand_dug_well:  'Hand-dug well',
  gravity_spring: 'Gravity spring',
  creek_source:   'Creek source',
};

/** Human label for a water source type value (falls back to the raw value). */
export function waterSourceTypeLabel(value: string | null): string {
  if (!value) return '—';
  return WATER_SOURCE_TYPE_LABELS[value] ?? value;
}

// -- Entity interfaces (mirror the DB columns) --------------------------------

export interface Community {
  id: string;
  name: string;
  region: number;
  sub_district: string | null;
  community_type: string | null;
  population: number | null;
  population_source: string | null;
  latitude: number | null;   // NULL until geocoded (honest un-geocoded state)
  longitude: number | null;
  geocode_source: string | null;              // e.g. 'nominatim:with-region', 'manual'
  geocode_confidence: GeocodeConfidence | null;
  geocoded_at: string | null;
  nearest_airstrip_id: string | null;
  source_sheet: string | null;
  remarks: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface WaterStatus {
  id: string;
  community_id: string;
  status: WaterStatusValue;
  coverage_percent: number | null; // normalized 0..100 on import — do not rescale
  existing_infrastructure: string | null;
  proposed_solutions: string | null;
  remarks: string | null;
  action: string | null;
  schools_access: string | null;
  last_updated: string | null;
  source_sheet: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface WaterSource {
  id: string;
  community_id: string;
  source_name: string;
  source_type: string | null;
  source_status: WaterSourceStatus | string | null;
  production_m3hr: number | null;
  production_raw: string | null;
  pressure_psi: number | null;
  pressure_raw: string | null;
  comments: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface WaterStatusLogEntry {
  id: string;
  community_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  // Joined
  changed_by_name?: string | null;
}

export interface ElectricityStatus {
  id: string;
  community_id: string;
  status: ElectricityStatusValue;
  coverage_percent: number | null;
  system_type: string | null;
  provider: string | null;
  existing_infrastructure: string | null;
  proposed_solutions: string | null;
  remarks: string | null;
  last_updated: string | null;
  source_sheet: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// A read-only snapshot of the linked airstrip, sourced from the airstrips module
// (system of record). This module never copies or edits airstrip data.
export interface LinkedAirstrip {
  id: string;
  name: string;
  region: number;
  status: string;
  surface_condition: string | null;
  last_inspection_date: string | null;
  last_status_changed_at: string | null;
}

// One option for the "nearest airstrip" dropdown.
export interface AirstripOption {
  id: string;
  name: string;
  region: number;
  status: string;
}

// -- Dynamic option type (from hinterland_option_types) -----------------------

export interface HinterlandOption {
  id: string;
  category: string;
  label: string;
  value: string;
  sort_order: number | null;
  is_active: boolean;
}

// -- Composite / summary types ------------------------------------------------

// A community row for the index list — community fields plus its water summary.
export interface CommunityListRow extends Community {
  water_status: WaterStatusValue;
  coverage_percent: number | null;
  water_source_count: number;
  source_types: string[];
  has_airstrip: boolean;
}

export interface RegionSummary {
  region: number;
  total: number;
  by_status: Record<WaterStatusValue, number>;
  avg_coverage: number | null;
}

export interface CommunitySummary {
  total: number;
  by_status: Record<WaterStatusValue, number>;
  by_region: Record<number, number>;
  avg_coverage: number | null;
  with_airstrip: number;
  regions: RegionSummary[];
}

// Full detail payload returned by GET /api/hinterland/communities/[id].
export interface CommunityDetail {
  community: Community;
  water_status: WaterStatus | null;
  water_sources: WaterSource[];
  water_status_log: WaterStatusLogEntry[];
  electricity_status: ElectricityStatus | null;
  airstrip: LinkedAirstrip | null;
}
