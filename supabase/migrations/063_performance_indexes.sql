-- 063_performance_indexes.sql
--
-- Composite indexes targeting the most common filtering patterns in:
--   - Daily Briefing (tasks by agency/status/due, upcoming week tasks)
--   - Task Board (overdue partial index)
--   - Notification panel (unread per user)
--   - Document Vault (agency + type filtering)
--   - Procurement views (stage + agency)
--   - Customer Applications (status + agency)

-- Briefing & Task Board: filter by agency → status → sort by due_date
CREATE INDEX IF NOT EXISTS idx_tasks_agency_status_due
  ON tasks (agency, status, due_date DESC NULLS LAST);

-- Overdue tasks partial index (status != 'done' AND due_date < today)
CREATE INDEX IF NOT EXISTS idx_tasks_due_status_partial
  ON tasks (due_date, status)
  WHERE status != 'done' AND due_date < CURRENT_DATE;

-- Notification panel: unread notifications per user, newest first
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Document Vault: filter by agency + document type
CREATE INDEX IF NOT EXISTS idx_documents_agency_type
  ON documents (agency, document_type);

-- Procurement: filter by current stage + agency
CREATE INDEX IF NOT EXISTS idx_procurement_stage_agency
  ON procurement_packages (current_stage, agency);

-- Customer Applications: filter by status + agency
CREATE INDEX IF NOT EXISTS idx_customer_app_status_agency
  ON customer_applications (status, agency);

-- Briefing "due this week" widget: open tasks due within 7 days per owner
CREATE INDEX IF NOT EXISTS idx_tasks_due_week
  ON tasks (due_date, owner_user_id)
  WHERE status != 'done'
    AND due_date >= CURRENT_DATE
    AND due_date <= CURRENT_DATE + INTERVAL '7 days';
