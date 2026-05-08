// Re-exports the canonical agency accent map from lib/agencies. The
// briefing surface previously kept a duplicate hex table; that drift is
// resolved here. Update lib/agencies.ts AGENCY_ACCENT_HEX to retheme any
// agency.

export { AGENCY_ACCENT_HEX as AGENCY_HEX, agencyAccent as agencyColor } from '@/lib/agencies';
