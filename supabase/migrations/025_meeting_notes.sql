-- Add freeform notes field to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT;
