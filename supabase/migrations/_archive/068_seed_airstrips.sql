-- ============================================================
-- Migration 068: Seed Hinterland Airstrips
-- Inserts all 51 airstrips from the HAS Excel tracker.
-- Uses ON CONFLICT (name) DO UPDATE for idempotency.
-- ============================================================

INSERT INTO airstrips (
  name, region, engineered_structure,
  runway_length_m, runway_width_m, surface_type, surface_condition,
  last_inspection_date, flight_frequency, airside_buildings, remarks, status
) VALUES
  -- ── Region 1 ──────────────────────────────────────────────────────────────
  (
    'Mabaruma', 1, true,
    518.30, 21.30, 'Bituminous Surface Treatment', 'Satisfactory',
    '2025-04-30', 'High',
    'One airside building housing Terminal, Aerodrome Rescue & Firefighting (ARFF) and Communications',
    'New Mabaruma terminal building to be constructed under GCAA-CJIA-HAS arrangement',
    'operational'
  ),
  (
    'Matthew''s Ridge', 1, true,
    1220.00, 15.24, 'Bituminous Surface Treatment', 'Poor',
    '2025-06-09', 'Moderate',
    'One steel-framed open building that houses ARFF and Communications',
    'Runway surface deteriorated; rehabilitation needed',
    'operational'
  ),
  (
    'Port Kaituma', 1, true,
    728.00, 12.20, 'Bituminous Surface Treatment', 'Good',
    '2025-04-30', 'High',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Baramita', 1, true,
    823.20, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2026-01-12', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Bemichi', 1, true,
    701.20, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2025-04-30', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),

  -- ── Region 2 ──────────────────────────────────────────────────────────────
  (
    'Anna Regina', 2, true,
    610.00, 15.24, 'Concrete', 'Satisfactory',
    '2026-01-15', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),

  -- ── Region 3 ──────────────────────────────────────────────────────────────
  (
    'Wakenaam', 3, true,
    610.00, 15.24, 'Stabilized Loam', 'Satisfactory',
    NULL, 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),

  -- ── Region 7 ──────────────────────────────────────────────────────────────
  (
    'Bartica', 7, true,
    762.20, 15.24, 'Bituminous Surface Treatment', 'Satisfactory',
    '2025-06-28', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kurupung-Bottom', 7, true,
    432.90, 12.20, 'Laterite', 'Satisfactory',
    '2025-03-07', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kamarang', 7, true,
    1006.00, 15.24, 'Bituminous Surface Treatment', 'Satisfactory',
    '2025-10-31', 'High',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Imbaimadai', 7, true,
    1067.00, 15.24, 'Bituminous Surface Treatment', 'Satisfactory',
    '2025-05-29', 'High',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Phillipai', 7, true,
    610.00, 12.20, 'Bituminous Surface Treatment', 'Good',
    '2024-06-08', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Paruima', 7, false,
    610.00, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2025-11-26', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Chi-Chi East', 7, false,
    549.00, 15.24, 'Sand Gravel', 'Satisfactory',
    NULL, 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Chi-Chi West', 7, true,
    763.00, 15.24, 'Bituminous Surface Treatment', 'Satisfactory',
    '2025-03-07', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Eteringbang', 7, true,
    610.00, 15.24, 'Concrete', 'Good',
    '2025-03-07', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Ekereku (Bottom)', 7, true,
    610.00, 12.20, 'Concrete', 'Good',
    '2025-06-02', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kaikan', 7, true,
    610.00, 15.24, 'Bituminous Surface Treatment', 'Poor',
    '2024-10-23', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    'Surface condition poor; maintenance priority',
    'operational'
  ),
  (
    'Aricheng', 7, true,
    579.30, 12.20, 'Laterite', 'Satisfactory',
    '2025-03-07', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),

  -- ── Region 8 ──────────────────────────────────────────────────────────────
  (
    'Mahdia', 8, true,
    1067.00, 15.24, 'Bituminous Surface Treatment', 'Satisfactory',
    '2026-01-29', 'High',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kaieteur', 8, true,
    610.00, 23.00, 'Concrete', 'Good',
    '2025-08-08', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Chenapou', 8, true,
    610.00, 15.24, 'Laterite', 'Satisfactory',
    '2025-11-27', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Maikwak', 8, false,
    610.00, 15.24, 'Laterite', 'Satisfactory',
    '2024-12-19', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Iwokrama/Fair View', 8, true,
    1220.00, 18.30, 'Laterite- Sealed with polymer emulsion', 'Good',
    '2025-10-11', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kamana', 8, true,
    670.70, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2024-12-19', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Kurukabaru', 8, false,
    1006.00, 15.24, 'Sandy Clay', 'Satisfactory',
    '2026-01-29', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Kato', 8, true,
    1067.00, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2026-01-29', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Monkey Mountain', 8, true,
    762.20, 12.20, 'Laterite', 'Satisfactory',
    '2024-10-11', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Paramakatoi', 8, true,
    762.20, 15.24, 'Concrete', 'Good',
    '2026-01-04', 'Moderate',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Karisparu', 8, false,
    720.00, 15.24, 'Concrete', 'Good',
    '2025-06-04', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Itabac', 8, false,
    518.30, 12.20, 'Sandy Clay', 'Satisfactory',
    '2024-10-11', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Kopinang', 8, true,
    549.00, 12.20, 'Laterite', 'Satisfactory',
    '2024-12-19', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Orinduik', 8, true,
    747.00, 12.20, 'Bitumen Seal', 'Poor',
    '2024-10-11', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    'Runway surface poor; bitumen seal deteriorated',
    'operational'
  ),
  (
    'Konawaruk', 8, false,
    762.20, 15.24, 'Laterite', 'Satisfactory',
    NULL, 'Low',
    NULL,
    NULL,
    'operational'
  ),

  -- ── Region 9 ──────────────────────────────────────────────────────────────
  (
    'Lethem', 9, true,
    1220.00, 30.50, 'Asphaltic Concrete', 'Good',
    '2025-10-15', 'High',
    'Main terminal building with separate ARFF and Communications facilities',
    NULL,
    'operational'
  ),
  (
    'Karanambo', 9, true,
    1220.00, 23.00, 'Laterite', 'Satisfactory',
    '2025-10-12', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Maruranau', 9, false,
    701.20, 15.24, 'Sandy Clay', 'Satisfactory',
    '2025-10-13', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Aishalton', 9, true,
    762.20, 15.24, 'Concrete', 'Good',
    '2025-10-13', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Lumidpau', 9, false,
    762.20, 15.24, 'Sandy Clay', 'Good',
    '2025-10-14', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Annai', 9, true,
    1067.00, 15.24, 'Bituminous Surface Treatment', 'Good',
    '2025-10-16', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Karasabai', 9, false,
    914.60, 15.24, 'Sandy Clay', 'Satisfactory',
    '2025-10-12', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Gunn''s', 9, false,
    549.00, 15.24, 'Laterite', 'Poor',
    NULL, 'Low',
    NULL,
    'Surface condition poor; needs rehabilitation',
    'operational'
  ),
  (
    'Apoteri', 9, false,
    610.00, 15.24, 'Laterite', 'Satisfactory',
    '2025-05-09', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Shea', 9, false,
    549.00, 9.15, 'Sandy Clay', 'Satisfactory',
    '2025-10-13', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Sand Creek', 9, false,
    731.70, 15.24, 'Laterite', 'Satisfactory',
    '2025-10-14', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Surama', 9, true,
    1311.00, 18.30, 'Stabilized Laterite', 'Good',
    '2025-10-11', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Awarewaunau', 9, false,
    610.00, 15.24, 'Sand Clay', 'Satisfactory',
    '2025-10-13', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Mountain Point', 9, false,
    914.60, 15.24, 'Laterite', 'Satisfactory',
    '2025-10-14', 'Low',
    NULL,
    NULL,
    'operational'
  ),
  (
    'Wichabai', 9, false,
    610.00, 15.24, 'Sand Clay', 'Satisfactory',
    '2025-10-14', 'Low',
    NULL,
    NULL,
    'operational'
  ),

  -- ── Region 10 ─────────────────────────────────────────────────────────────
  (
    'Kwakwani', 10, false,
    762.20, 15.24, 'Asphaltic Concrete', 'Good',
    '2025-12-18', 'Low',
    'One airside building housing Terminal, ARFF and Communications',
    NULL,
    'operational'
  ),
  (
    'Linden', 10, true,
    1372.00, 45.70, 'Bituminous Surface Treatment', 'Good',
    '2025-12-18', 'Low',
    'Main terminal building with separate ARFF and Communications facilities',
    NULL,
    'operational'
  )

ON CONFLICT (name) DO UPDATE SET
  region               = EXCLUDED.region,
  engineered_structure = EXCLUDED.engineered_structure,
  runway_length_m      = EXCLUDED.runway_length_m,
  runway_width_m       = EXCLUDED.runway_width_m,
  surface_type         = EXCLUDED.surface_type,
  surface_condition    = EXCLUDED.surface_condition,
  last_inspection_date = EXCLUDED.last_inspection_date,
  flight_frequency     = EXCLUDED.flight_frequency,
  airside_buildings    = EXCLUDED.airside_buildings,
  remarks              = EXCLUDED.remarks,
  status               = EXCLUDED.status,
  updated_at           = now();
