-- ============================================================
-- Tender Reference Seed (Procurement Reformulation — Phase 0)
--
-- Seeds programme and sub_programme with the exact set derived
-- from the 2026 PSIP Monitoring Form. Agency attribution per
-- docs/procurement-reformulation-plan.md §4.4.
-- Excludes sub-programmes 2606600 (Lethem) and 2606700 (HECI)
-- from PSIP ingest — both are tracked via Trello.
-- ============================================================

-- ----------------------------------------------------------
-- Programmes (3-digit codes)
-- ----------------------------------------------------------
INSERT INTO programme (code, name) VALUES
  ('341', 'Policy Development & Administration'),
  ('342', 'Electricity Service'),
  ('343', 'Water Services'),
  ('344', 'Aviation'),
  ('345', 'Maritime Administration')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name;

-- ----------------------------------------------------------
-- Sub-programmes (7-digit codes)
-- ----------------------------------------------------------
INSERT INTO sub_programme (code, name, programme_code, agency, is_excluded) VALUES
  -- 341 Policy Development & Administration → MPUA
  ('2513800', 'Furniture and Equipment',              '341', 'MPUA',                 false),

  -- 342 Electricity Service
  ('2606600', 'Lethem Power Company',                 '342', 'HECI',                 true),  -- excluded; Trello source
  ('2606700', 'Hinterland Electrification',           '342', 'HECI',                 true),  -- excluded; Trello source
  ('2611300', 'Electricity Expansion Programme',      '342', 'GPL',                  false),

  -- 343 Water Services → GWI
  ('2802100', 'Hinterland Water Supply',              '343', 'GWI',                  false),
  ('2802200', 'Coastal Water Supply',                 '343', 'GWI',                  false),
  ('2802600', 'Urban Sewerage and Water',             '343', 'GWI',                  false),

  -- 344 Aviation
  ('1601100', 'Hinterland/Coastal Airstrips',         '344', 'HINTERLAND_AIRSTRIPS', false),
  ('1601500', 'CJIA Corporation',                     '344', 'CJIA',                 false),
  ('1602000', 'Civil Aviation Authority',             '344', 'GCAA',                 false),

  -- 345 Maritime Administration → MARAD
  ('1403900', 'Dredging',                             '345', 'MARAD',                false),
  ('2607000', 'Navigational Aids',                    '345', 'MARAD',                false)
ON CONFLICT (code) DO UPDATE
  SET name           = EXCLUDED.name,
      programme_code = EXCLUDED.programme_code,
      agency         = EXCLUDED.agency,
      is_excluded    = EXCLUDED.is_excluded;
