// Deterministic fixtures for the airstrips E2E. Shapes match the API responses the
// UI consumes (the warning engine output is provided directly here — the UI renders it).

function warning(o: Record<string, unknown>) {
  return { type: 'overdue', severity: 'critical', nextDueOn: null, message: '', contractorName: null, managerName: null, responsibilityIncomplete: false, ...o };
}

const kato = {
  id: 'kato', name: 'Kato', region: 8, status: 'operational',
  surface_type: 'Laterite', surface_condition: 'Good', engineered_structure: false,
  runway_length_m: 900, runway_width_m: 18, flight_frequency: 'Moderate',
  airside_buildings: 'Shed', remarks: null, coordinates_lat: 4.66, coordinates_lon: -59.83,
  last_inspection_date: '2026-06-01', last_maintenance_on: '2026-04-01', last_verified_on: '2026-05-05',
  target_maintenance_interval_days: null, responsible_manager_id: 'm1', intervalDays: 60,
  responsibility: { contractorId: 'c1', contractorName: 'J. Williams', managerId: 'm1', managerName: 'Akeem' },
  cadence: {
    nextDueOn: '2026-05-31', daysOverdue: 25, attentionLevel: 'overdue',
    warnings: [warning({ nextDueOn: '2026-05-31', daysOverdue: 25, message: 'Kato is 25 days overdue', contractorName: 'J. Williams', managerName: 'Akeem' })],
  },
};

const imbaimadai = {
  id: 'imba', name: 'Imbaimadai', region: 7, status: 'operational',
  surface_type: 'Earth', surface_condition: 'Poor', engineered_structure: false,
  runway_length_m: 700, runway_width_m: 15, flight_frequency: 'Low',
  airside_buildings: null, remarks: null, coordinates_lat: 5.7, coordinates_lon: -60.2,
  last_inspection_date: null, last_maintenance_on: null, last_verified_on: null,
  target_maintenance_interval_days: null, responsible_manager_id: null, intervalDays: 60,
  responsibility: { contractorId: null, contractorName: null, managerId: null, managerName: null },
  cadence: {
    nextDueOn: null, daysOverdue: null, attentionLevel: 'overdue',
    warnings: [warning({ message: 'Imbaimadai has no maintenance on record', responsibilityIncomplete: true })],
  },
};

const ogle = {
  id: 'ogle', name: 'Ogle', region: 4, status: 'operational',
  surface_type: 'Asphalt', surface_condition: 'Good', engineered_structure: true,
  runway_length_m: 1200, runway_width_m: 23, flight_frequency: 'High',
  airside_buildings: 'Terminal', remarks: null, coordinates_lat: 6.8, coordinates_lon: -58.1,
  last_inspection_date: '2026-06-18', last_maintenance_on: '2026-06-15', last_verified_on: '2026-06-22',
  target_maintenance_interval_days: null, responsible_manager_id: 'm1', intervalDays: 60,
  responsibility: { contractorId: 'c1', contractorName: 'J. Williams', managerId: 'm1', managerName: 'Akeem' },
  cadence: { nextDueOn: '2026-08-14', daysOverdue: -50, attentionLevel: 'ok', warnings: [] },
};

export const listResponse = {
  airstrips: [kato, imbaimadai, ogle],
  summary: { total: 3, operational: 3, limited_or_rehab: 0, closed: 0, needs_attention: 2, overdue: 2, upcoming: 0, verification_stale: 0, pending_verification: 1 },
  filters: { regions: [4, 7, 8] },
};

export function katoDetail(responsibilityOverride?: { contractorName: string | null; managerName: string | null }) {
  const responsibility = responsibilityOverride
    ? { ...kato.responsibility, ...responsibilityOverride }
    : kato.responsibility;
  return {
    airstrip: { ...kato, responsibility },
    maintenance: [{
      id: 'log1', airstrip_id: 'kato', performed_date: '2026-04-01', activity_type: 'weeding_cleaning',
      activity_description: 'cleared', contractor_name: 'J. Williams', verification_method: 'photo_verification',
      verified: true, verified_at: '2026-05-05', quarter: 'Q2 2026', notes: null,
    }],
    photos: [{
      id: 'p1', airstrip_id: 'kato', maintenance_log_id: 'log1', storage_path: 'kato/general/1_x.png',
      file_name: 'x.png', photo_type: 'general', caption: 'after maintenance', taken_at: '2026-05-05', uploaded_at: '2026-05-05',
    }],
    inspections: [],
    statusLog: [],
    quickStats: { currentQuarter: 'Q2 2026', maintenanceThisQuarter: 1, verifiedThisQuarter: 1, unverifiedThisQuarter: 0 },
  };
}

export const contractors = [{ id: 'c2', name: 'A. Persaud', active: true }, { id: 'c1', name: 'J. Williams', active: true }];
export const managers = [{ id: 'm1', name: 'Akeem', email: 'akeems@mpua.gov.gy' }];
export const settings = { default_interval_days: 60, upcoming_window_days: 14, verification_stale_after_days: 90, updated_at: '2026-06-25' };
export const options = { status: [], condition: [], flight_frequency: [], surface_type: [], activity_type: [], verification_method: [] };
