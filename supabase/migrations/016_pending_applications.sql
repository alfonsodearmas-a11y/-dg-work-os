-- Pending Applications: GPL (new electricity meters) and GWI (new water connections)
CREATE TABLE IF NOT EXISTS pending_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency TEXT NOT NULL CHECK (agency IN ('GPL', 'GWI')),
  customer_reference TEXT,
  first_name TEXT,
  last_name TEXT,
  telephone TEXT,
  region TEXT,
  district TEXT,
  village_ward TEXT,
  street TEXT,
  lot TEXT,
  event_code TEXT,
  event_description TEXT,
  application_date DATE NOT NULL,
  days_waiting INTEGER NOT NULL,
  raw_data JSONB,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  data_as_of DATE -- the report generation date
);

CREATE INDEX IF NOT EXISTS idx_pending_applications_agency ON pending_applications(agency);
CREATE INDEX IF NOT EXISTS idx_pending_applications_region ON pending_applications(region);
CREATE INDEX IF NOT EXISTS idx_pending_applications_days_waiting ON pending_applications(days_waiting DESC);
CREATE INDEX IF NOT EXISTS idx_pending_applications_application_date ON pending_applications(application_date);
-- No unique constraint — GPL has same customer across multiple pipeline stages (metering, design, execution)
