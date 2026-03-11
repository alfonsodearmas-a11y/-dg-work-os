-- Drop status_override column from projects table.
-- Project status is now sourced exclusively from oversight.gov.gy scrape data
-- via the project_status column. The app-side status_override is no longer used.

ALTER TABLE projects DROP COLUMN IF EXISTS status_override;
