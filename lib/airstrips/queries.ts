// Server-side helpers that turn `airstrip_overview` rows + `airstrip_settings`
// into cadence-augmented airstrips. Shared by the list route, the detail route,
// and the PDF report so warning logic never drifts between surfaces.

import { supabaseAdmin } from '@/lib/db-admin';
import { guyanaToday } from '@/lib/airstrip-types';
import {
  computeAirstripWarnings,
  resolveIntervalDays,
  type AirstripCadence,
  type AirstripResponsibility,
} from './warnings';

export interface AirstripSettings {
  default_interval_days: number;
  upcoming_window_days: number;
  verification_stale_after_days: number;
}

const DEFAULT_SETTINGS: AirstripSettings = {
  default_interval_days: 60,
  upcoming_window_days: 14,
  verification_stale_after_days: 90,
};

export async function getAirstripSettings(): Promise<AirstripSettings> {
  const { data } = await supabaseAdmin
    .from('airstrip_settings')
    .select('default_interval_days, upcoming_window_days, verification_stale_after_days')
    .eq('id', 1)
    .single();
  return data ?? DEFAULT_SETTINGS;
}

// A row from the airstrip_overview view: all airstrips columns plus the derived
// cadence inputs and current responsibility names.
export interface AirstripOverviewRow {
  [key: string]: unknown;
  id: string;
  name: string;
  target_maintenance_interval_days: number | null;
  responsible_manager_id: string | null;
  last_maintenance_on: string | null;
  last_verified_on: string | null;
  responsible_contractor_id: string | null;
  responsible_contractor_name: string | null;
  responsible_manager_name: string | null;
}

export interface AugmentedAirstrip extends AirstripOverviewRow {
  intervalDays: number;
  responsibility: AirstripResponsibility;
  cadence: AirstripCadence;
}

/** Attach resolved interval, responsibility, and cadence/warnings to an overview row. */
export function augmentAirstrip(
  row: AirstripOverviewRow,
  settings: AirstripSettings,
  today: string = guyanaToday(),
): AugmentedAirstrip {
  const intervalDays = resolveIntervalDays(row.target_maintenance_interval_days, settings.default_interval_days);
  const cadence = computeAirstripWarnings({
    name: row.name,
    lastMaintenanceOn: row.last_maintenance_on,
    lastVerifiedOn: row.last_verified_on,
    intervalDays,
    upcomingWindowDays: settings.upcoming_window_days,
    verificationStaleAfterDays: settings.verification_stale_after_days,
    contractorName: row.responsible_contractor_name,
    managerName: row.responsible_manager_name,
    today,
  });
  return {
    ...row,
    intervalDays,
    responsibility: {
      contractorId: row.responsible_contractor_id,
      contractorName: row.responsible_contractor_name,
      managerId: row.responsible_manager_id,
      managerName: row.responsible_manager_name,
    },
    cadence,
  };
}
