-- ============================================================
-- Migration 046: Fix FK constraints for user deletion
-- All FK references to users(id) now have ON DELETE SET NULL
-- or ON DELETE CASCADE so deleting a user doesn't fail.
--
-- ALREADY APPLIED 2026-03-16
-- ============================================================

-- Nullable columns: change NO ACTION to SET NULL
ALTER TABLE admin_audit_log DROP CONSTRAINT admin_audit_log_actor_id_fkey;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE admin_audit_log DROP CONSTRAINT admin_audit_log_target_user_id_fkey;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ai_metric_snapshot DROP CONSTRAINT ai_metric_snapshot_user_id_fkey;
ALTER TABLE ai_metric_snapshot ADD CONSTRAINT ai_metric_snapshot_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customer_applications DROP CONSTRAINT customer_applications_updated_by_fkey;
ALTER TABLE customer_applications ADD CONSTRAINT customer_applications_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE projects DROP CONSTRAINT projects_assigned_to_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE subtasks DROP CONSTRAINT subtasks_created_by_fkey;
ALTER TABLE subtasks ADD CONSTRAINT subtasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_activity DROP CONSTRAINT task_activity_user_id_fkey;
ALTER TABLE task_activity ADD CONSTRAINT task_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_templates DROP CONSTRAINT task_templates_created_by_fkey;
ALTER TABLE task_templates ADD CONSTRAINT task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_templates DROP CONSTRAINT task_templates_recurrence_assignee_id_fkey;
ALTER TABLE task_templates ADD CONSTRAINT task_templates_recurrence_assignee_id_fkey FOREIGN KEY (recurrence_assignee_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tasks DROP CONSTRAINT tasks_assigned_by_user_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users DROP CONSTRAINT users_created_by_fkey;
ALTER TABLE users ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users DROP CONSTRAINT users_invited_by_fkey;
ALTER TABLE users ADD CONSTRAINT users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

-- NOT NULL columns: make nullable, then change FK to SET NULL
ALTER TABLE tasks ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE tasks DROP CONSTRAINT tasks_owner_user_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customer_applications ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE customer_applications DROP CONSTRAINT customer_applications_created_by_fkey;
ALTER TABLE customer_applications ADD CONSTRAINT customer_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customer_application_documents ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE customer_application_documents DROP CONSTRAINT customer_application_documents_uploaded_by_fkey;
ALTER TABLE customer_application_documents ADD CONSTRAINT customer_application_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customer_application_activity_log ALTER COLUMN performed_by DROP NOT NULL;
ALTER TABLE customer_application_activity_log DROP CONSTRAINT customer_application_activity_log_performed_by_fkey;
ALTER TABLE customer_application_activity_log ADD CONSTRAINT customer_application_activity_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customer_application_notes ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE customer_application_notes DROP CONSTRAINT customer_application_notes_created_by_fkey;
ALTER TABLE customer_application_notes ADD CONSTRAINT customer_application_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE task_comments DROP CONSTRAINT task_comments_user_id_fkey;
ALTER TABLE task_comments ADD CONSTRAINT task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_notes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE project_notes DROP CONSTRAINT project_notes_user_id_fkey;
ALTER TABLE project_notes ADD CONSTRAINT project_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Fix user_module_access.granted_by NOT NULL + ON DELETE SET NULL conflict
ALTER TABLE user_module_access ALTER COLUMN granted_by DROP NOT NULL;
