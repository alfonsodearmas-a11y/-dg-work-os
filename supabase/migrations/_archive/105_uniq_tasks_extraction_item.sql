CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_extraction_item
  ON tasks(extraction_id, extraction_item_idx)
  WHERE extraction_id IS NOT NULL;

COMMENT ON INDEX uniq_tasks_extraction_item IS
  'Enforces idempotent submit: each (extraction, item_index) pair can only land in tasks once. Prevents duplicate-task creation when the review submit endpoint is retried after partial failures.';
