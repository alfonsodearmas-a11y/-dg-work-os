-- ============================================================================
-- 073: Delayed Projects Oversight — Schema changes + data reset + seed
-- Scopes the oversight module to delayed projects only.
-- ============================================================================

-- 1. Add resolution tracking columns
ALTER TABLE projects_oversight ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT false;
ALTER TABLE projects_oversight ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_po_is_resolved ON projects_oversight(is_resolved);

-- Change default status to DELAYED
ALTER TABLE projects_oversight ALTER COLUMN project_status SET DEFAULT 'DELAYED';

-- 2. Clear all existing data
DELETE FROM projects_oversight;

-- 3. Seed 37 delayed projects from ministry oversight dashboard (April 2026)
INSERT INTO projects_oversight (
  project_id, project_reference, executing_agency, sub_agency, project_name,
  region, tender_board_type, contract_value_total, contract_lots, contractors,
  project_end_date, project_status, completion_percent, has_images, last_synced_at
) VALUES
-- MARAD (4 projects)
(27617, 'MARADXX202601X27617', 'MOPUA', 'MARAD',
 'Construction of a Wooden New Build Passenger/Cargo Vessel',
 4, 'NPTAB', 43253396, '[{"contractor":"Wilfred April","value":43253396}]'::jsonb,
 ARRAY['Wilfred April'], '2025-05-10', 'DELAYED', 40, 14, NOW()),

(27476, 'MARADXX202601X27476', 'MOPUA', 'MARAD',
 'Docking and Rehabilitation of vessel lot 1- ML Thompson',
 4, 'NPTAB', 33203353, '[{"contractor":"Guyana Port Inc.","value":33203353}]'::jsonb,
 ARRAY['Guyana Port Inc.'], '2025-09-01', 'DELAYED', 98, 1, NOW()),

(27616, 'MARADXX202601X27616', 'MOPUA', 'MARAD',
 'Construction of Wooden New Build Passenger/Cargo Vessel',
 2, 'NPTAB', 43253396, '[{"contractor":"Lynden Owner","value":43253396}]'::jsonb,
 ARRAY['Lynden Owner'], '2025-05-10', 'DELAYED', 85, 18, NOW()),

(27615, 'MARADXX202601X27615', 'MOPUA', 'MARAD',
 'Construction of a Wooden New Built Passenger/Cargo Vessel',
 3, 'NPTAB', 43253396, '[{"contractor":"Charlton Fiedtkou","value":43253396}]'::jsonb,
 ARRAY['Charlton Fiedtkou'], '2025-05-10', 'DELAYED', 65, 16, NOW()),

-- HECI (4 projects)
(417, 'HECIXX202510X417', 'MOPUA', 'HECI',
 'Construction of an Administrative Building at the Kato Hydropower Site',
 8, 'NPTAB', 58401925, '[{"contractor":"Hinterland Electrification Co Inc.","value":58401925}]'::jsonb,
 ARRAY['Hinterland Electrification Co Inc.'], '2026-03-31', 'DELAYED', 60, 13, NOW()),

(28281, 'HECIXX202602X28281', 'MOPUA', 'HECI',
 'Supply and Delivery of Fiberglass Poles and Crossarms to the Hinterland Location',
 1, 'NPTAB', 161086467, '[{"contractor":"SPR Enterprises","value":161086467}]'::jsonb,
 ARRAY['SPR Enterprises'], '2026-02-28', 'DELAYED', 28, 0, NOW()),

(27169, 'GPLXXX202601X27169', 'MOPUA', 'HECI',
 'Hinterland Electrification - Supply & Installation and commissioning of Switchgear for Kwakwani Utilities Inc',
 10, 'NPTAB', 76000000, '[{"contractor":"2020 FMCG Inc","value":76000000}]'::jsonb,
 ARRAY['2020 FMCG Inc'], '2026-03-30', 'DELAYED', 60, 0, NOW()),

(27451, 'HECIXX202601X27451', 'MOPUA', 'HECI',
 'Procurement of Lithium-Ion Solar Batteries',
 2, 'NPTAB', 16804573, '[{"contractor":"2020 FMCG Inc","value":16804573}]'::jsonb,
 ARRAY['2020 FMCG Inc'], '2026-02-28', 'DELAYED', 0, 0, NOW()),

-- HAS (4 projects)
(27539, 'HASXXX202601X27539', 'MOPUA', 'HAS',
 'Rehabilitation of Kaikan Airstrip, Region 7',
 7, NULL, NULL, '[]'::jsonb,
 NULL, '2026-09-30', 'DELAYED', 1, 0, NOW()),

(27531, 'HASXXX202601X27531', 'MOPUA', 'HAS',
 'Rehabilitation of Kwakwani Airstrip, Region 10',
 10, 'NPTAB', 248938684, '[{"contractor":"Associated Construction Services","value":248938684}]'::jsonb,
 ARRAY['Associated Construction Services'], '2025-08-19', 'DELAYED', 96, 4, NOW()),

(27532, 'HASXXX202601X27532', 'MOPUA', 'HAS',
 'Rehabilitation of Matthew''s Ridge Airstrip, Region 1',
 1, 'NPTAB', 1321490700,
 '[{"contractor":"GV Construction Inc.","value":89290200},{"contractor":"GV Construction Inc.","value":985498500},{"contractor":"Gafsons Industries Limited","value":246702000}]'::jsonb,
 ARRAY['GV Construction Inc.', 'GV Construction Inc.', 'Gafsons Industries Limited'],
 '2026-01-31', 'DELAYED', 51, 22, NOW()),

(27515, 'HASXXX202601X27515', 'MOPUA', 'HAS',
 'Rehabilitation of Jawalla Airstrip',
 7, 'NPTAB', 235125965, '[{"contractor":"Sheriff Construction Inc.","value":235125965}]'::jsonb,
 ARRAY['Sheriff Construction Inc.'], '2025-04-11', 'DELAYED', 60, 7, NOW()),

-- GWI (14 projects)
(27530, 'GWIXXX202601X27530', 'MOPUA', 'GWI',
 'Design supply and commissioning of Fifteen In line filters for GWI - Lot 4',
 5, 'NPTAB', 228015843, '[{"contractor":"International Imports and Supplies","value":228015843}]'::jsonb,
 ARRAY['International Imports and Supplies'], '2024-09-29', 'DELAYED', 90, 5, NOW()),

(30068, 'GWIXXX202603X30068', 'MOPUA', 'GWI',
 'Construction of GWI Corporate Complex - Region 4',
 4, 'NPTAB', NULL, '[]'::jsonb,
 NULL, '2026-04-30', 'DELAYED', 75, 0, NOW()),

(27398, 'GWIXXX202601X27398', 'MOPUA', 'GWI',
 'Drilling of New Wells - Pouderoyen',
 3, 'NPTAB', 137187872, '[{"contractor":"Magnus Dredging & Marine Engineering Inc.","value":137187872}]'::jsonb,
 ARRAY['Magnus Dredging & Marine Engineering Inc.'], '2025-08-09', 'DELAYED', 90, 1, NOW()),

(27447, 'GWIXXX202601X27447', 'MOPUA', 'GWI',
 'Procurement of Electromechanical equipment for rehabilitation of production facilities: Lot 3 Submersible Cables',
 4, 'NPTAB', 12721200, '[{"contractor":"S. Jagmohan Construction and General Supplies Inc.","value":12721200}]'::jsonb,
 ARRAY['S. Jagmohan Construction and General Supplies Inc.'], '2026-02-28', 'DELAYED', 25, 0, NOW()),

(27442, 'GWIXXX202601X27442', 'MOPUA', 'GWI',
 'Lot 1 - Pipe, HDPE, DSIPS, SDR 11, DN, Bends, DIPS, OD/ID, Adaptor, HDPE Flange, DIPS Backup rings',
 4, 'NPTAB', 1095770000, '[{"contractor":"Dax Contracting Services","value":1095770000}]'::jsonb,
 ARRAY['Dax Contracting Services'], '2026-03-28', 'DELAYED', 85, 5, NOW()),

(27429, 'GWIXXX202601X27429', 'MOPUA', 'GWI',
 'Automatic Meter Infrastructure - Implementation of smart metering',
 4, 'NPTAB', 274940000, '[{"contractor":"Dax Contracting Services","value":274940000}]'::jsonb,
 ARRAY['Dax Contracting Services'], '2026-03-31', 'DELAYED', 25, 0, NOW()),

(27420, 'GWIXXX202601X27420', 'MOPUA', 'GWI',
 'Supply and Installation of 100mm & 150mm Network Mains along Middle Street, Pouderoyen',
 3, 'NPTAB', 44039250, '[{"contractor":"DCS Construction Services and General Supplies","value":44039250}]'::jsonb,
 ARRAY['DCS Construction Services and General Supplies'], '2026-01-27', 'DELAYED', 80, 20, NOW()),

(27399, 'GWIXXX202601X27399', 'MOPUA', 'GWI',
 'Drilling of New Wells - Yakasari',
 6, 'NPTAB', 1002251, '[{"contractor":"Water & Oil Well Services CO. Ltd.","value":1002251}]'::jsonb,
 ARRAY['Water & Oil Well Services CO. Ltd.'], '2026-05-12', 'DELAYED', 0, 2, NOW()),

(27386, 'GWIXXX202601X27386', 'MOPUA', 'GWI',
 'Metering Programme: Procurement of Water Meters',
 4, 'NPTAB', 213500000, '[{"contractor":"Dax Contracting Services","value":213500000}]'::jsonb,
 ARRAY['Dax Contracting Services'], '2026-04-30', 'DELAYED', 25, 0, NOW()),

(27427, 'GWIXXX202601X27427', 'MOPUA', 'GWI',
 'Drilling of New Well - Shelter Belt',
 4, NULL, 102546554, '[{"contractor":"SIGMA ENGINEERS limited","value":102546554}]'::jsonb,
 ARRAY['SIGMA ENGINEERS limited'], NULL, 'DELAYED', 0, 0, NOW()),

(27400, 'GWIXXX202601X27400', 'MOPUA', 'GWI',
 'Drilling of New Wells - Johanna',
 6, NULL, 1002251, '[{"contractor":"Water & Oil Well Services CO. Ltd.","value":1002251}]'::jsonb,
 ARRAY['Water & Oil Well Services CO. Ltd.'], NULL, 'DELAYED', 0, 4, NOW()),

(27593, 'GWIXXX202601X27593', 'MOPUA', 'GWI',
 'Supply and installation of in line filters in Regions 2, 4 and 5',
 5, 'NPTAB', 296608602, '[{"contractor":"Compass Industrial Services","value":296608602}]'::jsonb,
 ARRAY['Compass Industrial Services'], '2025-12-01', 'DELAYED', 90, 8, NOW()),

(27359, 'GWIXXX202601X27359', 'MOPUA', 'GWI',
 'Hinterland Water Supply - Red Creek Kamana',
 8, 'NPTAB', 44600000, '[{"contractor":"Alvin Chowramootoo Construction Services","value":44600000}]'::jsonb,
 ARRAY['Alvin Chowramootoo Construction Services'], '2026-04-30', 'DELAYED', 10, 0, NOW()),

(27534, 'GWIXXX202601X27534', 'MOPUA', 'GWI',
 'Design, supply and commissioning of fifteen in line filters Lot 2 (Crabwood Creek, #69, Johanna and Mibicuri Region 6)',
 6, 'NPTAB', 266564347, '[{"contractor":"International Imports and Supplies","value":266564347}]'::jsonb,
 ARRAY['International Imports and Supplies'], '2024-06-06', 'DELAYED', 90, 1, NOW()),

-- GPL (8 projects)
(27459, 'GPLXXX202601X27459', 'MOPUA', 'GPL',
 'Inter Energy - Project Management Consultancy & Owner''s Engineering Services',
 4, 'NPTAB', 3497812000, '[{"contractor":"Inter Energy Holdings UK Limited","value":3497812000}]'::jsonb,
 ARRAY['Inter Energy Holdings UK Limited'], '2027-10-08', 'DELAYED', 25, 0, NOW()),

(27458, 'GPLXXX202601X27458', 'MOPUA', 'GPL',
 'Engineering, Procurement and Construction (EPC) Services for the Construction of a Building for the Guyana National Control Centre (GNCC)',
 4, 'NPTAB', 1869621513, '[{"contractor":"PowerChina International Group Limited","value":1869621513}]'::jsonb,
 ARRAY['PowerChina International Group Limited'], '2026-03-26', 'DELAYED', 95, 14, NOW()),

(27461, 'GPLXXX202601X27461', 'MOPUA', 'GPL',
 'Engineering, Procurement and Construction for Infrastructure Development Projects Phase 2 - Lot 2: Construction of Substations, Transmission Lines, And Reactive Power Reinforcements Within Region No. 5 Of the Demerara Berbice Interconnected System',
 5, 'NPTAB', 33694921811, '[{"contractor":"Kalpataru Projects International Limited","value":33694921811}]'::jsonb,
 ARRAY['Kalpataru Projects International Limited'], '2026-06-10', 'DELAYED', 32, 1, NOW()),

(27457, 'GPLXXX202601X27457', 'MOPUA', 'GPL',
 'Engineering, Procurement and Construction for Infrastructure Development Projects Phase 2 - Lot 1 & 3: Construction of Substations, Transmission Lines, And Reactive Power Reinforcements Within Region No. 4 & 6 Of the Demerara Berbice Interconnected System',
 4, 'NPTAB', 57188020580, '[{"contractor":"PowerChina International Group Limited","value":57188020580}]'::jsonb,
 ARRAY['PowerChina International Group Limited'], '2026-06-10', 'DELAYED', 24, 26, NOW()),

(27699, 'GPLXXX202601X27699', 'MOPUA', 'GPL',
 'Supply of 2.2 Megawatts (MW) Cummins Engine',
 7, 'NPTAB', 112015200, '[{"contractor":"IMS Construction & Logistics Services","value":112015200}]'::jsonb,
 ARRAY['IMS Construction & Logistics Services'], NULL, 'DELAYED', 100, 0, NOW()),

(27700, 'GPLXXX202601X27700', 'MOPUA', 'GPL',
 'Supply and Delivery of UPS',
 4, 'NPTAB', 41579839, '[{"contractor":"Akamai Inc","value":41579839}]'::jsonb,
 ARRAY['Akamai Inc'], NULL, 'DELAYED', 100, 0, NOW()),

(27696, 'GPLXXX202601X27696', 'MOPUA', 'GPL',
 'Supply of Transmission & Distribution Materials (Conductors)',
 4, 'NPTAB', 606365198, '[{"contractor":"FIX-IT Depot","value":606365198}]'::jsonb,
 ARRAY['FIX-IT Depot'], NULL, 'DELAYED', 0, 0, NOW()),

(27715, 'GPLXXX202601X27715', 'MOPUA', 'GPL',
 'Supply and Delivery of 4000 Tons of 1" Stones',
 4, 'NPTAB', 40660000, '[{"contractor":"BK International Inc","value":40660000}]'::jsonb,
 ARRAY['BK International Inc'], '2026-02-27', 'DELAYED', 100, 3, NOW()),

-- CJIA (3 projects)
(27587, 'CJIAXX202601X27587', 'MOPUA', 'CJIA',
 'Supply & Installation of In-Line Baggage Handling System',
 4, 'NPTAB', 512300000, '[{"contractor":"Total Solutions Inc.","value":512300000}]'::jsonb,
 ARRAY['Total Solutions Inc.'], '2024-01-20', 'DELAYED', 80, 5, NOW()),

(27535, 'CJIAXX202601X27535', 'MOPUA', 'CJIA',
 'Construction of New Administrative Building at the Cheddi Jagan International Airport',
 4, 'NPTAB', 890440820, '[{"contractor":"Avinash Contracting & Scrap Metal Inc","value":890440820}]'::jsonb,
 ARRAY['Avinash Contracting & Scrap Metal Inc'], '2024-04-23', 'DELAYED', 86, 81, NOW()),

(27471, 'CJIAXX202601X27471', 'MOPUA', 'CJIA',
 'Construction & Rehabilitation Works of VIP Section, New and Existing Commercial Buildings',
 4, 'NPTAB', 1259265155, '[{"contractor":"PD Contracting","value":1259265155}]'::jsonb,
 ARRAY['PD Contracting'], '2023-02-28', 'DELAYED', 95, 57, NOW());
