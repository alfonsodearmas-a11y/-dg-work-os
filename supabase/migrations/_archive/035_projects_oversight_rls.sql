-- =====================================================
-- MIGRATION 034: RLS Policies for Project Oversight Tables
-- Adds row-level security to project_notes, project_summaries, saved_filters
-- Note: The application uses supabaseAdmin (service role) which bypasses RLS,
-- but these policies provide defense-in-depth for direct database access.
-- =====================================================

-- 1. Enable RLS on project oversight tables
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- 2. project_notes: All authenticated users can read; users can insert their own notes
CREATE POLICY project_notes_select ON project_notes
  FOR SELECT USING (true);

CREATE POLICY project_notes_insert ON project_notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 3. project_summaries: All authenticated users can read; service role manages writes
CREATE POLICY project_summaries_select ON project_summaries
  FOR SELECT USING (true);

-- 4. saved_filters: Users can only access their own filters
CREATE POLICY saved_filters_own ON saved_filters
  FOR ALL USING (user_id = auth.uid());
