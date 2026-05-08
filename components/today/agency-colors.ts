// Agency hex map used across the home briefing surface. Mirrors the canonical
// mapping from components/tasks/TaskCard.tsx and components/mission-control/
// MissionControlView.tsx. Reconciliation with lib/constants/agencies.ts is a
// separate follow-up.

export const AGENCY_HEX: Record<string, string> = {
  GPL: '#4a82f5',
  GWI: '#00c875',
  GCAA: '#a25ddc',
  CJIA: '#fb9d3b',
  HECI: '#579bfc',
  MARAD: '#00cec9',
  HINTERLAND_AIRSTRIPS: '#a78bfa',
  MPUA: '#d4af37',
};

export function agencyColor(agency: string | null | undefined): string {
  if (!agency) return '#64748b';
  return AGENCY_HEX[agency.toUpperCase()] ?? '#64748b';
}
