-- 128_role_simplification.sql
-- PHASE 3 of the role simplification (docs/role-simplification-plan.md Part D).
--
-- ⚠️ FLAGGED: data backfill + constraint swap + RLS rewrite. Per migration
-- policy this requires EXPLICIT go-ahead before running against PROD (branch
-- rehearsal runs first). Must deploy the shim-removed app build immediately
-- after the prod apply (the Phase 2 build tolerates both value sets on READ;
-- only role WRITES fail during the window — see plan).
--
-- The app has run the two-level model since Phase 2 (read-normalization), so
-- this flip makes storage match what the code already assumes:
--   dg | minister | ps | parl_sec  →  superadmin
--   agency_admin | officer         →  agency_manager
--   system                         →  system (unchanged, session-incapable)
--
-- ROLLBACK: _role_migration_backup (created below) preserves the per-user
-- legacy roles; restoring = swap the CHECK back + UPDATE from the backup +
-- redeploy the Phase 2 build (normalization shims).

-- ════════════════════════════════════════════════════════════════════════
-- 1. SNAPSHOT — rollback insurance (preserves the dg/minister/ps/parl_sec
--    distinctions the collapse erases). Never dropped by this migration.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public._role_migration_backup AS
  SELECT id, role, formal_title, now() AS captured_at FROM public.users;

-- ════════════════════════════════════════════════════════════════════════
-- 2. TITLE BACKFILL — no-op safety net (all human users already titled).
-- ════════════════════════════════════════════════════════════════════════
UPDATE public.users SET formal_title = CASE role
    WHEN 'dg' THEN 'Director General'
    WHEN 'minister' THEN 'Minister'
    WHEN 'ps' THEN 'Permanent Secretary'
    WHEN 'parl_sec' THEN 'Parliamentary Secretary'
    WHEN 'agency_admin' THEN 'Agency Manager'
    WHEN 'officer' THEN 'Analyst'
  END
WHERE formal_title IS NULL AND role <> 'system';

-- ════════════════════════════════════════════════════════════════════════
-- 3. CONSTRAINT SWAP + VALUE REWRITE (the chokepoint)
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users DROP CONSTRAINT users_role_check;

UPDATE public.users SET role = CASE
    WHEN role IN ('dg', 'minister', 'ps', 'parl_sec') THEN 'superadmin'
    WHEN role IN ('agency_admin', 'officer') THEN 'agency_manager'
    ELSE role
  END
WHERE role <> 'system';

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['superadmin'::text, 'agency_manager'::text, 'system'::text]));

-- Agency managers must carry an agency (superadmins/system have none/null-ok).
ALTER TABLE public.users ADD CONSTRAINT users_agency_manager_agency_check
  CHECK (role <> 'agency_manager' OR agency IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════
-- 4. modules.default_roles REWRITE (per plan C5; empty arrays stay empty)
--    Any array touching the old agency roles → both levels; else senior-only
--    (incl. nptab {dg,ps} and minister-attention {minister} per D1).
-- ════════════════════════════════════════════════════════════════════════
UPDATE public.modules
SET default_roles = CASE
    WHEN default_roles && ARRAY['agency_admin', 'officer']::text[]
      THEN ARRAY['superadmin', 'agency_manager']::text[]
    ELSE ARRAY['superadmin']::text[]
  END
WHERE cardinality(default_roles) > 0;

-- ════════════════════════════════════════════════════════════════════════
-- 5. roles TABLE RESEED + role_permissions REMAP
--    dg row becomes superadmin (keeps its permission set); agency_admin row
--    becomes agency_manager; officer's permissions merge in; minister/ps/
--    parl_sec/officer rows retire (FK CASCADE clears their role_permissions).
-- ════════════════════════════════════════════════════════════════════════
UPDATE public.roles
SET name = 'superadmin',
    display_name = 'Super Admin',
    description = 'Sees and does everything across all agencies. Title (DG, Minister, PS…) is display-only.',
    hierarchy_level = 7
WHERE name = 'dg';

UPDATE public.roles
SET name = 'agency_manager',
    display_name = 'Agency Manager',
    description = 'Sees and does everything for their own agency only.',
    hierarchy_level = 3
WHERE name = 'agency_admin';

-- Union the retiring senior roles' permissions into superadmin (no-op if identical).
INSERT INTO public.role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), (SELECT id FROM public.roles WHERE name = 'superadmin'), rp.permission_id
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE r.name IN ('minister', 'ps', 'parl_sec')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Union officer's permissions into agency_manager (D2).
INSERT INTO public.role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), (SELECT id FROM public.roles WHERE name = 'agency_manager'), rp.permission_id
FROM public.role_permissions rp
JOIN public.roles r ON r.id = rp.role_id
WHERE r.name = 'officer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

DELETE FROM public.roles WHERE name IN ('minister', 'ps', 'parl_sec', 'officer');

-- ════════════════════════════════════════════════════════════════════════
-- 6. RLS REWRITE
-- 6a. is_dg_or_above(): the helper ~30 policies call. Body → two-level.
--     (Function NAME kept — renaming would force recreating every caller.)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_dg_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'superadmin'
  );
$function$;

-- ════════════════════════════════════════════════════════════════════════
-- 6b. Literal role-array policies on auth.uid() — rewrite to two-level.
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY "agency_health_snapshots_agency_read" ON public.agency_health_snapshots;
CREATE POLICY "agency_health_snapshots_agency_read" ON public.agency_health_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = 'agency_manager'
    AND upper(users.agency) = upper(agency_health_snapshots.agency_slug)));

DROP POLICY "agency_health_snapshots_ministry_read" ON public.agency_health_snapshots;
CREATE POLICY "agency_health_snapshots_ministry_read" ON public.agency_health_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "agency_scheduled_reports_select" ON public.agency_scheduled_reports;
CREATE POLICY "agency_scheduled_reports_select" ON public.agency_scheduled_reports
  FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid() OR is_dg_or_above()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND u.role = 'agency_manager'
      AND upper(u.agency) = upper(agency_scheduled_reports.agency)));

DROP POLICY "documents_agency_read" ON public.documents;
CREATE POLICY "documents_agency_read" ON public.documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = 'agency_manager'
    AND (upper(users.agency) = upper((documents.agency)::text) OR documents.agency IS NULL)));

DROP POLICY "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = ANY (ARRAY['superadmin'::text, 'agency_manager'::text])));

DROP POLICY "documents_ministry_read" ON public.documents;
CREATE POLICY "documents_ministry_read" ON public.documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "kpi_alerts_agency_read" ON public.kpi_alerts;
CREATE POLICY "kpi_alerts_agency_read" ON public.kpi_alerts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = 'agency_manager'
    AND upper(users.agency) = upper(kpi_alerts.agency_slug)));

DROP POLICY "kpi_alerts_ministry_read" ON public.kpi_alerts;
CREATE POLICY "kpi_alerts_ministry_read" ON public.kpi_alerts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "projects_agency_read" ON public.projects;
CREATE POLICY "projects_agency_read" ON public.projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = 'agency_manager'
    AND upper(users.agency) = upper(projects.sub_agency)));

DROP POLICY "projects_ministry_read" ON public.projects;
CREATE POLICY "projects_ministry_read" ON public.projects
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "projects_ministry_update" ON public.projects;
CREATE POLICY "projects_ministry_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

-- ════════════════════════════════════════════════════════════════════════
-- 6c. DEAD NextAuth-era policies (auth.jwt()->>'userId' / request.jwt.claims
--     role) — that claim does not exist in Supabase JWTs, so these policies
--     currently always deny. Rewritten onto auth.uid() with two-level roles,
--     preserving each policy's original semantics. Names containing old role
--     tokens are renamed (dg → superadmin, agency_admin → agency_manager).
-- ════════════════════════════════════════════════════════════════════════
-- Airstrips family
DROP POLICY "ai_agency_admin_insert" ON public.airstrip_inspections;
CREATE POLICY "ai_agency_manager_insert" ON public.airstrip_inspections
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "ai_ministry_all" ON public.airstrip_inspections;
CREATE POLICY "ai_ministry_all" ON public.airstrip_inspections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "aml_agency_admin_insert" ON public.airstrip_maintenance_log;
CREATE POLICY "aml_agency_manager_insert" ON public.airstrip_maintenance_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "aml_agency_admin_update" ON public.airstrip_maintenance_log;
CREATE POLICY "aml_agency_manager_update" ON public.airstrip_maintenance_log
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "aml_ministry_all" ON public.airstrip_maintenance_log;
CREATE POLICY "aml_ministry_all" ON public.airstrip_maintenance_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "ap_agency_admin_insert" ON public.airstrip_photos;
CREATE POLICY "ap_agency_manager_insert" ON public.airstrip_photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "ap_ministry_all" ON public.airstrip_photos;
CREATE POLICY "ap_ministry_all" ON public.airstrip_photos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "ap_own_delete" ON public.airstrip_photos;
CREATE POLICY "ap_own_delete" ON public.airstrip_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

DROP POLICY "asl_ministry_insert" ON public.airstrip_status_log;
CREATE POLICY "asl_ministry_insert" ON public.airstrip_status_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role = ANY (ARRAY['superadmin'::text, 'agency_manager'::text])));

DROP POLICY "as_agency_admin_insert" ON public.airstrips;
CREATE POLICY "as_agency_manager_insert" ON public.airstrips
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "as_agency_admin_update" ON public.airstrips;
CREATE POLICY "as_agency_manager_update" ON public.airstrips
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'agency_manager'));

DROP POLICY "as_ministry_all" ON public.airstrips;
CREATE POLICY "as_ministry_all" ON public.airstrips
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "airstrip_option_types_write" ON public.airstrip_option_types;
CREATE POLICY "airstrip_option_types_write" ON public.airstrip_option_types
  FOR ALL TO authenticated
  USING (is_dg_or_above());

-- Customer applications family
DROP POLICY "caal_agency_select" ON public.customer_application_activity_log;
CREATE POLICY "caal_agency_select" ON public.customer_application_activity_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM customer_applications ca
    WHERE ca.id = customer_application_activity_log.application_id
      AND ca.agency = (SELECT users.agency FROM users WHERE users.id = auth.uid())));

DROP POLICY "caal_dg_all" ON public.customer_application_activity_log;
CREATE POLICY "caal_superadmin_all" ON public.customer_application_activity_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "caal_insert" ON public.customer_application_activity_log;
CREATE POLICY "caal_insert" ON public.customer_application_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid());

DROP POLICY "cad_agency_insert" ON public.customer_application_documents;
CREATE POLICY "cad_agency_insert" ON public.customer_application_documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM customer_applications ca
    WHERE ca.id = customer_application_documents.application_id
      AND ca.agency = (SELECT users.agency FROM users WHERE users.id = auth.uid())));

DROP POLICY "cad_agency_select" ON public.customer_application_documents;
CREATE POLICY "cad_agency_select" ON public.customer_application_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM customer_applications ca
    WHERE ca.id = customer_application_documents.application_id
      AND ca.agency = (SELECT users.agency FROM users WHERE users.id = auth.uid())));

DROP POLICY "cad_dg_all" ON public.customer_application_documents;
CREATE POLICY "cad_superadmin_all" ON public.customer_application_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "cad_own_delete" ON public.customer_application_documents;
CREATE POLICY "cad_own_delete" ON public.customer_application_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

DROP POLICY "can_agency_insert" ON public.customer_application_notes;
CREATE POLICY "can_agency_insert" ON public.customer_application_notes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM customer_applications ca
    WHERE ca.id = customer_application_notes.application_id
      AND ca.agency = (SELECT users.agency FROM users WHERE users.id = auth.uid())));

DROP POLICY "can_agency_select" ON public.customer_application_notes;
CREATE POLICY "can_agency_select" ON public.customer_application_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM customer_applications ca
    WHERE ca.id = customer_application_notes.application_id
      AND ca.agency = (SELECT users.agency FROM users WHERE users.id = auth.uid())));

DROP POLICY "can_dg_all" ON public.customer_application_notes;
CREATE POLICY "can_superadmin_all" ON public.customer_application_notes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "ca_agency_insert" ON public.customer_applications;
CREATE POLICY "ca_agency_insert" ON public.customer_applications
  FOR INSERT TO authenticated
  WITH CHECK (agency = (SELECT users.agency FROM users WHERE users.id = auth.uid()));

DROP POLICY "ca_agency_select" ON public.customer_applications;
CREATE POLICY "ca_agency_select" ON public.customer_applications
  FOR SELECT TO authenticated
  USING (agency = (SELECT users.agency FROM users WHERE users.id = auth.uid()));

DROP POLICY "ca_agency_update" ON public.customer_applications;
CREATE POLICY "ca_agency_update" ON public.customer_applications
  FOR UPDATE TO authenticated
  USING (agency = (SELECT users.agency FROM users WHERE users.id = auth.uid()));

DROP POLICY "ca_dg_all" ON public.customer_applications;
CREATE POLICY "ca_superadmin_all" ON public.customer_applications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

-- user_module_access family
DROP POLICY "uma_dg_all" ON public.user_module_access;
CREATE POLICY "uma_superadmin_all" ON public.user_module_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

DROP POLICY "uma_self_select" ON public.user_module_access;
CREATE POLICY "uma_self_select" ON public.user_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════
-- 7. NOTHING DROPPED: users.password_hash, _role_migration_backup, and the
--    legacy users_agency_values CHECK remain for a later, separately-flagged
--    cleanup after the soak period.
-- ════════════════════════════════════════════════════════════════════════
