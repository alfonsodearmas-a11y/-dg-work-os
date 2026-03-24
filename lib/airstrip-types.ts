// ── Hinterland Airstrips Types ───────────────────────────────────────────────

// -- Domain constants — single source of truth --------------------------------

export const AIRSTRIP_STATUSES = ['operational', 'limited', 'closed', 'under_rehabilitation', 'unknown'] as const;
export const SURFACE_CONDITIONS = ['Good', 'Satisfactory', 'Poor'] as const;
export const FLIGHT_FREQUENCIES = ['Low', 'Moderate', 'High'] as const;
export const ACTIVITY_TYPES = [
  'weeding_cleaning', 'pothole_patching', 'runway_resurfacing',
  'drainage_clearing', 'lighting_papi', 'fencing_repairs',
  'vegetation_management', 'marking_signage', 'threshold_overrun', 'other',
] as const;
export const VERIFICATION_METHODS = [
  'physical_inspection', 'photo_verification', 'whatsapp_photo',
  'contractor_report', 'aerial_survey', 'unverified', 'other',
] as const;
export const PHOTO_TYPES = ['verification', 'inspection', 'aerial', 'damage', 'general'] as const;
export const VEGETATION_STATUSES = ['cleared', 'overgrown', 'partially_cleared'] as const;

// -- Union types from constants -----------------------------------------------

export type AirstripStatus = (typeof AIRSTRIP_STATUSES)[number];
export type SurfaceCondition = (typeof SURFACE_CONDITIONS)[number];
export type FlightFrequency = (typeof FLIGHT_FREQUENCIES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export type PhotoType = (typeof PHOTO_TYPES)[number];
export type VegetationStatus = (typeof VEGETATION_STATUSES)[number];

// -- UI config maps -----------------------------------------------------------

export const STATUS_CONFIG: Record<AirstripStatus, { label: string; color: string }> = {
  operational:          { label: 'Operational',          color: '#10b981' },
  limited:             { label: 'Limited Operations',   color: '#d4af37' },
  closed:              { label: 'Closed',               color: '#dc2626' },
  under_rehabilitation: { label: 'Under Rehabilitation', color: '#60a5fa' },
  unknown:             { label: 'Unknown',               color: '#64748b' },
};

export const CONDITION_CONFIG: Record<SurfaceCondition, { label: string; color: string }> = {
  Good:         { label: 'Good',         color: '#10b981' },
  Satisfactory: { label: 'Satisfactory', color: '#d4af37' },
  Poor:         { label: 'Poor',         color: '#dc2626' },
};

export const FREQUENCY_CONFIG: Record<FlightFrequency, { label: string; color: string }> = {
  Low:      { label: 'Low',      color: '#64748b' },
  Moderate: { label: 'Moderate', color: '#d4af37' },
  High:     { label: 'High',     color: '#10b981' },
};

export const ACTIVITY_CONFIG: Record<string, { label: string }> = {
  weeding_cleaning:      { label: 'Weeding & Cleaning' },
  pothole_patching:      { label: 'Pothole Patching' },
  runway_resurfacing:    { label: 'Runway Resurfacing' },
  drainage_clearing:     { label: 'Drainage Clearing' },
  lighting_papi:         { label: 'Lighting & PAPI Maintenance' },
  fencing_repairs:       { label: 'Fencing Repairs' },
  vegetation_management: { label: 'Vegetation Management' },
  marking_signage:       { label: 'Marking & Signage' },
  threshold_overrun:     { label: 'Threshold/Overrun Maintenance' },
  other:                 { label: 'Other' },
};

export const VERIFICATION_CONFIG: Record<string, { label: string; color: string }> = {
  physical_inspection:  { label: 'Physical Inspection',  color: '#10b981' },
  photo_verification:   { label: 'Photo Verification',   color: '#60a5fa' },
  whatsapp_photo:       { label: 'WhatsApp Photo',       color: '#60a5fa' },
  contractor_report:    { label: 'Contractor Report',    color: '#d4af37' },
  aerial_survey:        { label: 'Aerial Survey',        color: '#a78bfa' },
  unverified:           { label: 'Unverified',           color: '#dc2626' },
  other:                { label: 'Other',                color: '#64748b' },
};

export const VEGETATION_CONFIG: Record<VegetationStatus, { label: string; color: string }> = {
  cleared:           { label: 'Cleared',           color: '#10b981' },
  overgrown:         { label: 'Overgrown',         color: '#dc2626' },
  partially_cleared: { label: 'Partially Cleared', color: '#d4af37' },
};

// -- Entity interfaces --------------------------------------------------------

export interface Airstrip {
  id: string;
  name: string;
  region: number;
  engineered_structure: boolean;
  runway_length_m: number | null;
  runway_width_m: number | null;
  surface_type: string | null;
  surface_condition: SurfaceCondition | null;
  last_inspection_date: string | null;
  flight_frequency: FlightFrequency | null;
  airside_buildings: string | null;
  remarks: string | null;
  status: AirstripStatus;
  coordinates_lat: number | null;
  coordinates_lon: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AirstripMaintenanceLog {
  id: string;
  airstrip_id: string;
  activity_type: ActivityType;
  activity_description: string | null;
  performed_date: string;
  quarter: string | null;
  contractor_name: string | null;
  verification_method: VerificationMethod;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // Joined
  airstrip_name?: string;
  verified_by_name?: string;
}

export interface AirstripPhoto {
  id: string;
  airstrip_id: string;
  maintenance_log_id: string | null;
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  photo_type: PhotoType | null;
  taken_at: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  // Joined
  uploaded_by_name?: string;
}

export interface AirstripInspection {
  id: string;
  airstrip_id: string;
  inspection_date: string;
  inspector_name: string | null;
  surface_condition: SurfaceCondition | null;
  runway_condition_notes: string | null;
  vegetation_status: VegetationStatus | null;
  drainage_condition: string | null;
  buildings_condition: string | null;
  findings: string | null;
  recommendations: string | null;
  signal_available: boolean | null;
  created_at: string;
  created_by: string | null;
  // Joined
  airstrip_name?: string;
}

export interface AirstripStatusLog {
  id: string;
  airstrip_id: string;
  previous_status: AirstripStatus | null;
  new_status: AirstripStatus;
  changed_by: string | null;
  reason: string | null;
  changed_at: string;
  // Joined
  changed_by_name?: string;
  airstrip_name?: string;
}

// -- Dynamic option type (from airstrip_option_types table) -------------------

export interface AirstripOption {
  id: string;
  category: string;
  label: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export type AirstripOptionCategory =
  | 'activity_type'
  | 'surface_type'
  | 'verification_method'
  | 'condition'
  | 'status'
  | 'flight_frequency';

// -- Summary / analytics types ------------------------------------------------

export interface AirstripSummary {
  total: number;
  by_status: Record<AirstripStatus, number>;
  by_region: Record<number, number>;
  by_condition: Record<SurfaceCondition, number>;
  engineered_count: number;
  high_frequency_count: number;
}
