// Single source of truth for GPL service connection track classification.
// Used by: parser, upload route, diff engine.

import type { StageHistoryEntry } from './service-connection-types';

/**
 * Classify track from the "Type of Service Order" column value.
 * Returns track + pipeline stage.
 */
export function classifyByServiceType(
  typeOfService: string
): { track: 'A' | 'B' | 'Design'; stage: string } {
  const t = typeOfService.toLowerCase().trim();
  if (t.startsWith('installation')) return { track: 'A', stage: 'Metering' };
  if (t.includes('execution') || t.includes('capital works'))
    return { track: 'B', stage: 'Execution' };
  if (t.includes('quotation') || t.includes('capital contribution'))
    return { track: 'Design', stage: 'Designs' };
  // Unrecognized — caller should log a warning
  return { track: 'A', stage: 'Metering' };
}

/**
 * Classify track from a sheet name when "Type of Service Order" column
 * is absent. Fallback heuristic.
 */
export function classifySheetByName(
  sheetName: string
): { track: 'A' | 'B' | 'Design'; stage: string } {
  const n = sheetName.toLowerCase();
  if (n.includes('estimat')) return { track: 'Design', stage: 'Designs' };
  if (n.includes('cap') || n.includes('26')) return { track: 'B', stage: 'Execution' };
  return { track: 'A', stage: 'Metering' };
}

/**
 * Full track classification using all available signals.
 * Priority: service order type text > pipeline stage > stage history.
 */
export function classifyTrack(
  pipelineStage: string | null | undefined,
  serviceOrderType: string | null | undefined,
  stageHistory: StageHistoryEntry[]
): 'A' | 'B' | 'Design' | 'unknown' {
  const soType = (serviceOrderType || '').trim();

  // Primary: "Type of Service Order" column value
  if (soType) {
    return classifyByServiceType(soType).track;
  }

  // Fallback: pipeline stage name
  const stage = (pipelineStage || '').toLowerCase();
  if (stage.includes('design') || stage.includes('estimat')) return 'Design';
  if (stage.includes('execution')) return 'B';

  // Stage history: prior Design/Execution → Track B
  const hasCapitalHistory = stageHistory.some(h => {
    const s = (h.stage || '').toLowerCase();
    return s.includes('design') || s.includes('execution');
  });
  if (hasCapitalHistory) return 'B';

  // Metering with no capital history → Track A
  if (stage.includes('meter')) return 'A';

  return 'unknown';
}

/**
 * Check whether a service order type value is recognised.
 * Returns false for values that would fall through to the default.
 */
export function isRecognisedServiceType(typeOfService: string): boolean {
  const t = typeOfService.toLowerCase().trim();
  return (
    t.startsWith('installation') ||
    t.includes('execution') ||
    t.includes('capital works') ||
    t.includes('quotation') ||
    t.includes('capital contribution')
  );
}
