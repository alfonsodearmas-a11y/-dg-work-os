-- 064_drop_orphaned_tables.sql
--
-- These tables were created in migrations 001-012 and have been replaced by
-- newer designs (NextAuth sessions, Supabase tasks, Google Calendar direct
-- integration, etc.). Zero code references confirmed by grep across app/,
-- lib/, and components/ — except where noted below.

DROP TABLE IF EXISTS notion_tasks CASCADE;
DROP TABLE IF EXISTS notion_meetings CASCADE;

-- SKIPPED: calendar_events is actively used in app/api/sync/calendar/route.ts
-- (.from('calendar_events').upsert(...)). Do NOT drop until that route is
-- migrated to a different storage strategy.
-- DROP TABLE IF EXISTS calendar_events CASCADE;

DROP TABLE IF EXISTS project_snapshots CASCADE;
DROP TABLE IF EXISTS meeting_minutes CASCADE;
DROP TABLE IF EXISTS meeting_action_items CASCADE;
DROP TABLE IF EXISTS meeting_recordings CASCADE;
DROP TABLE IF EXISTS draft_action_items CASCADE;
