-- Add revised_start_date column to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS revised_start_date DATE;
