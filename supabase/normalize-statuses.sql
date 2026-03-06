-- Normalize task status values to the canonical lowercase values
-- Run this in Supabase Dashboard > SQL Editor

UPDATE tasks SET status = 'new'     WHERE lower(status) IN ('todo', 'not_started', 'not started', 'pending');
UPDATE tasks SET status = 'active'  WHERE lower(status) IN ('in_progress', 'in progress', 'doing', 'started');
UPDATE tasks SET status = 'blocked' WHERE lower(status) IN ('on hold', 'on_hold', 'waiting');
UPDATE tasks SET status = 'done'    WHERE lower(status) IN ('complete', 'completed', 'finished');

-- Verify results
SELECT status, count(*) FROM tasks GROUP BY status ORDER BY status;
