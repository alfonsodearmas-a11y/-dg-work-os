-- 000_baseline_prod_schema.sql
-- Read-only catalog capture of prod (ozcdsnpieeetzzwjqvjo) public schema, 2026-06-05
-- Generated via pg catalog (pg_get_constraintdef/indexdef/functiondef/triggerdef + reconstruction). Prod was READ-ONLY.
SET check_function_bodies = false;

-- ---------- extensions ----------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ---------- enums ----------
CREATE TYPE public."extension_status" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public."meeting_status" AS ENUM ('UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'ANALYZING', 'ANALYZED', 'ERROR');
CREATE TYPE public."nptab_delivery_method" AS ENUM ('email', 'hand_delivered', 'in_meeting', 'other');
CREATE TYPE public."nptab_report_status" AS ENUM ('drafted', 'submitted', 'closed');
CREATE TYPE public."task_action" AS ENUM ('created', 'status_changed', 'priority_changed', 'reassigned', 'commented', 'due_date_changed', 'extension_requested', 'extension_approved', 'extension_rejected', 'evidence_added', 'notion_synced');
CREATE TYPE public."task_notification_type" AS ENUM ('task_assigned', 'task_overdue', 'task_rejected', 'task_submitted', 'task_verified', 'extension_requested', 'extension_decided', 'comment_added', 'task_reminder');
CREATE TYPE public."task_priority" AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public."task_status" AS ENUM ('assigned', 'acknowledged', 'in_progress', 'submitted', 'verified', 'rejected', 'overdue', 'new', 'delayed', 'done');
CREATE TYPE public."tender_agency" AS ENUM ('MPUA', 'GPL', 'GWI', 'CJIA', 'GCAA', 'MARAD', 'HINTERLAND_AIRSTRIPS', 'HECI');
CREATE TYPE public."tender_match_status" AS ENUM ('pending', 'matched', 'created', 'skipped');
CREATE TYPE public."tender_method" AS ENUM ('open_tender', 'quotation', 'sole_source', 'restrictive', 'comm_participation');
CREATE TYPE public."tender_source" AS ENUM ('psip', 'trello', 'manual');
CREATE TYPE public."tender_stage" AS ENUM ('design', 'advertised', 'evaluation', 'awaiting_award', 'award');
CREATE TYPE public."tender_stage_source" AS ENUM ('status_column', 'inferred_from_dates', 'manual_override');
CREATE TYPE public."tender_upload_status" AS ENUM ('preview', 'applied', 'cancelled');

-- ---------- sequences ----------
CREATE SEQUENCE IF NOT EXISTS public."gpl_feeder_cache_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public."gpl_outage_cache_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public."gpl_power_stations_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public."gpl_pulse_scores_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public."nptab_report_ref_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.agency_scheduled_reports_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_dbis_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    station_record RECORD;
    fossil_total DECIMAL(8,2) := 0;
    renewable_total DECIMAL(8,2) := 0;
BEGIN
    -- Calculate fossil fuel total from station data
    FOR station_record IN
        SELECT key, value->>'available_mw' as available_mw
        FROM jsonb_each(NEW.station_data)
        WHERE key NOT IN ('HAMPSHIRE', 'PROSPECT', 'TRAFALGAR')
    LOOP
        fossil_total := fossil_total + COALESCE(station_record.available_mw::DECIMAL, 0);
    END LOOP;

    -- Calculate renewable total
    renewable_total := COALESCE(NEW.hampshire_solar_mwp, 0) +
                       COALESCE(NEW.prospect_solar_mwp, 0) +
                       COALESCE(NEW.trafalgar_solar_mwp, 0);

    -- Set calculated fields
    NEW.total_fossil_capacity_mw := fossil_total;
    NEW.total_renewable_capacity_mw := renewable_total;
    NEW.total_dbis_capacity_mw := fossil_total + renewable_total;

    -- Calculate fleet availability if we have data
    IF NEW.total_dbis_capacity_mw > 0 AND NEW.generation_availability_mw IS NOT NULL THEN
        NEW.fleet_availability_percent := (NEW.generation_availability_mw / NEW.total_dbis_capacity_mw) * 100;
    END IF;

    -- Calculate reserve margin if we have peak demand
    IF NEW.evening_peak_onbars_mw > 0 AND NEW.generation_availability_mw IS NOT NULL THEN
        NEW.reserve_margin_percent := ((NEW.generation_availability_mw - NEW.evening_peak_onbars_mw) / NEW.evening_peak_onbars_mw) * 100;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.data_exists_for_date(target_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS(
        SELECT 1 FROM daily_uploads
        WHERE data_date = target_date
          AND status = 'confirmed'
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_upload_for_date(target_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
    SELECT id FROM daily_uploads
    WHERE data_date = target_date
      AND status = 'confirmed'
    ORDER BY created_at DESC
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_dg_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role IN ('dg', 'minister', 'ps', 'parl_sec')
  );
$function$;

CREATE OR REPLACE FUNCTION public.sync_tender_status_from_decision()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE tender SET status = NEW.status_after WHERE id = NEW.tender_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tender_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trello_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_airstrips_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_customer_applications_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_integration_tokens_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_procurement_packages_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

-- ---------- tables ----------
CREATE TABLE public."action_item_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_id" uuid,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."action_item_extractions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" text NOT NULL,
  "meeting_title" text,
  "meeting_date" timestamp with time zone,
  "meeting_type" text NOT NULL,
  "modality" text NOT NULL,
  "meeting_type_overridden" boolean DEFAULT false NOT NULL,
  "modality_overridden" boolean DEFAULT false NOT NULL,
  "transcript_url" text,
  "transcript_hash" text,
  "prompt_version" text NOT NULL,
  "model" text NOT NULL,
  "raw_response" jsonb NOT NULL,
  "token_count_input" integer,
  "token_count_output" integer,
  "extraction_duration_ms" integer,
  "items_extracted" integer DEFAULT 0 NOT NULL,
  "items_accepted" integer DEFAULT 0 NOT NULL,
  "items_edited" integer DEFAULT 0 NOT NULL,
  "items_rejected" integer DEFAULT 0 NOT NULL,
  "items_added_manually" integer DEFAULT 0 NOT NULL,
  "review_status" text DEFAULT 'pending'::text NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."activity_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "object_type" text,
  "object_id" text,
  "object_name" text,
  "changes" jsonb,
  "reason" text,
  "result" text,
  "denial_reason" text,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."admin_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "target_user_id" uuid,
  "action" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."agency_head_notification_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "recipient_email" text NOT NULL,
  "recipient_name" text,
  "task_id" uuid,
  "event_type" text DEFAULT 'task_agency_head_notice'::text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."agency_health_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_slug" text NOT NULL,
  "health_score" integer,
  "status" text DEFAULT 'building'::text,
  "kpi_snapshot" jsonb,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."agency_intel_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sent_by_user_id" uuid NOT NULL,
  "agency" text NOT NULL,
  "recipients" text[] NOT NULL,
  "message" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "template" text DEFAULT 'plain'::text NOT NULL
);
CREATE TABLE public."agency_psip_focal_point" (
  "agency" text NOT NULL,
  "focal_point_name" text DEFAULT ''::text NOT NULL,
  "focal_point_email" text DEFAULT ''::text NOT NULL,
  "agency_head_name" text,
  "agency_head_email" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);
CREATE TABLE public."agency_psip_focal_point_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "field" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."agency_scheduled_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_by_user_id" uuid,
  "agency" text NOT NULL,
  "recipients" text[] NOT NULL,
  "cover_message" text,
  "frequency" text NOT NULL,
  "day_of_week" integer,
  "day_of_month" integer,
  "send_hour" integer DEFAULT 8 NOT NULL,
  "timezone" text DEFAULT 'America/Guyana'::text NOT NULL,
  "template" text DEFAULT 'plain'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_error" text,
  "last_error_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."ai_chat_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_page" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."ai_metric_snapshot" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "snapshot_data" jsonb NOT NULL,
  "precomputed_briefing" text,
  "briefing_suggestions" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "user_id" uuid
);
CREATE TABLE public."ai_response_cache" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "query_hash" text NOT NULL,
  "query_text" text NOT NULL,
  "current_page" text DEFAULT '/'::text NOT NULL,
  "model_tier" text NOT NULL,
  "response_text" text NOT NULL,
  "suggestions" jsonb,
  "actions" jsonb,
  "usage_input_tokens" integer,
  "usage_output_tokens" integer,
  "created_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."ai_usage_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" text DEFAULT 'anonymous'::text NOT NULL,
  "model_tier" text NOT NULL,
  "model_id" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "query_type" text,
  "current_page" text,
  "cached" boolean DEFAULT false NOT NULL,
  "local_answer" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."airstrip_inspections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "airstrip_id" uuid NOT NULL,
  "inspection_date" date NOT NULL,
  "inspector_name" text,
  "surface_condition" text,
  "runway_condition_notes" text,
  "vegetation_status" text,
  "drainage_condition" text,
  "buildings_condition" text,
  "findings" text,
  "recommendations" text,
  "signal_available" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "remarks" text
);
CREATE TABLE public."airstrip_maintenance_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "airstrip_id" uuid NOT NULL,
  "activity_type" text NOT NULL,
  "activity_description" text,
  "performed_date" date NOT NULL,
  "quarter" text,
  "contractor_name" text,
  "verification_method" text NOT NULL,
  "verified" boolean DEFAULT false,
  "verified_by" uuid,
  "verified_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);
CREATE TABLE public."airstrip_option_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "value" text NOT NULL,
  "sort_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."airstrip_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "airstrip_id" uuid NOT NULL,
  "maintenance_log_id" uuid,
  "storage_path" text NOT NULL,
  "file_name" text,
  "caption" text,
  "photo_type" text,
  "taken_at" date,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "uploaded_by" uuid
);
CREATE TABLE public."airstrip_status_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "airstrip_id" uuid NOT NULL,
  "previous_status" text,
  "new_status" text NOT NULL,
  "changed_by" uuid,
  "reason" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."airstrips" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "region" integer NOT NULL,
  "engineered_structure" boolean DEFAULT false,
  "runway_length_m" numeric(8,2),
  "runway_width_m" numeric(8,2),
  "surface_type" text,
  "surface_condition" text,
  "last_inspection_date" date,
  "flight_frequency" text,
  "airside_buildings" text,
  "remarks" text,
  "status" text DEFAULT 'operational'::text NOT NULL,
  "coordinates_lat" numeric(10,7),
  "coordinates_lon" numeric(10,7),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_by" uuid
);
CREATE TABLE public."alerts" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "agency" character varying(20) NOT NULL,
  "severity" character varying(20) NOT NULL,
  "metric_name" character varying(100) NOT NULL,
  "current_value" numeric(15,2),
  "threshold_value" numeric(15,2),
  "message" text NOT NULL,
  "is_active" boolean DEFAULT true,
  "acknowledged_by" uuid,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."audit_log" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid,
  "action" character varying(50) NOT NULL,
  "entity_type" character varying(100) NOT NULL,
  "entity_id" uuid,
  "old_values" jsonb,
  "new_values" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."calendar_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "google_id" character varying(100) NOT NULL,
  "title" text NOT NULL,
  "start_time" timestamp without time zone,
  "end_time" timestamp without time zone,
  "location" text,
  "description" text,
  "last_synced" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."cjia_ai_insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "insight_type" text DEFAULT 'monthly_analysis'::text NOT NULL,
  "insight_json" jsonb NOT NULL,
  "model_used" text,
  "data_hash" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."cjia_daily_metrics" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "report_date" date NOT NULL,
  "arrivals" integer NOT NULL,
  "departures" integer NOT NULL,
  "on_time_departure_percent" numeric(5,2) NOT NULL,
  "revenue_mtd" numeric(15,2) NOT NULL,
  "revenue_target" numeric(15,2) NOT NULL,
  "safety_incidents" integer DEFAULT 0 NOT NULL,
  "safety_incident_details" text,
  "power_uptime_percent" numeric(5,2) NOT NULL,
  "baggage_uptime_percent" numeric(5,2) NOT NULL,
  "security_uptime_percent" numeric(5,2) NOT NULL,
  "submitted_by" uuid NOT NULL,
  "approved_by" uuid,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."cjia_monthly_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "operations_data" jsonb DEFAULT '{}'::jsonb,
  "passenger_data" jsonb DEFAULT '{}'::jsonb,
  "revenue_data" jsonb DEFAULT '{}'::jsonb,
  "project_data" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."core_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "resource" text NOT NULL,
  "action" text NOT NULL,
  "description" text NOT NULL,
  "is_admin_only" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."customer_application_activity_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "action" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "performed_by" uuid,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "details" jsonb
);
CREATE TABLE public."customer_application_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "file_type" text,
  "file_size" bigint,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."customer_application_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "note_text" text NOT NULL,
  "status_at_time" text,
  "new_status" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."customer_applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "applicant_name" text NOT NULL,
  "application_type" text NOT NULL,
  "reference_number" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."daily_analysis" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "upload_id" uuid NOT NULL,
  "data_date" date NOT NULL,
  "analysis_model" character varying(100) NOT NULL,
  "analysis_status" character varying(20) DEFAULT 'pending'::character varying,
  "executive_summary" text,
  "anomalies" jsonb DEFAULT '[]'::jsonb,
  "attention_items" jsonb DEFAULT '[]'::jsonb,
  "agency_summaries" jsonb DEFAULT '{}'::jsonb,
  "raw_response" jsonb,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "processing_time_ms" integer,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "completed_at" timestamp with time zone
);
CREATE TABLE public."daily_metrics" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "upload_id" uuid NOT NULL,
  "data_date" date NOT NULL,
  "row_number" integer NOT NULL,
  "metric_name" character varying(500) NOT NULL,
  "category" character varying(200),
  "subcategory" character varying(200),
  "agency" character varying(50),
  "unit" character varying(100),
  "raw_value" text,
  "numeric_value" numeric(20,6),
  "value_type" character varying(20) DEFAULT 'number'::character varying,
  "has_error" boolean DEFAULT false,
  "error_detail" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."daily_uploads" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "filename" character varying(500) NOT NULL,
  "file_size_bytes" integer NOT NULL,
  "data_date" date NOT NULL,
  "detected_date" date,
  "date_match_exact" boolean DEFAULT false,
  "row_count" integer DEFAULT 0,
  "error_count" integer DEFAULT 0,
  "warning_count" integer DEFAULT 0,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "error_message" text,
  "warnings" jsonb DEFAULT '[]'::jsonb,
  "uploaded_by" uuid NOT NULL,
  "confirmed_by" uuid,
  "confirmed_at" timestamp with time zone,
  "replaced_by" uuid,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."deadline_extension_requests" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "task_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "original_due_date" date NOT NULL,
  "requested_due_date" date NOT NULL,
  "reason" text NOT NULL,
  "status" extension_status DEFAULT 'pending'::extension_status NOT NULL,
  "decided_by" uuid,
  "decision_note" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."delayed_project_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "snapshot_date" date NOT NULL,
  "completion_percent" numeric(5,2),
  "contract_value" bigint,
  "project_end_date" date,
  "status" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."delayed_projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_reference" text NOT NULL,
  "executing_agency" text DEFAULT 'MOPUA'::text NOT NULL,
  "sub_agency" text NOT NULL,
  "project_name" text NOT NULL,
  "region" text,
  "tender_board_type" text,
  "contract_value" bigint DEFAULT 0,
  "contractors" text,
  "project_end_date" date,
  "completion_percent" numeric(5,2) DEFAULT 0,
  "has_images" boolean DEFAULT false,
  "status" text DEFAULT 'DELAYED'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."delegated_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "from_user_id" uuid NOT NULL,
  "to_user_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."document_chunks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid,
  "chunk_index" integer,
  "content" text NOT NULL,
  "created_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."document_queries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "created_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" character varying(255) NOT NULL,
  "original_filename" character varying(255) NOT NULL,
  "file_path" text NOT NULL,
  "file_size" integer,
  "mime_type" character varying(100),
  "title" text,
  "summary" text,
  "document_type" character varying(50),
  "document_date" date,
  "agency" character varying(50),
  "project_reference" character varying(50),
  "tags" text[],
  "extracted_data" jsonb,
  "processing_status" character varying(20) DEFAULT 'pending'::character varying,
  "processed_at" timestamp without time zone,
  "uploaded_at" timestamp without time zone DEFAULT now(),
  "created_at" timestamp without time zone DEFAULT now(),
  "google_drive_file_id" text,
  "sync_source" text DEFAULT 'manual'::text,
  "synced_at" timestamp with time zone
);
CREATE TABLE public."failed_extractions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fireflies_meeting_id" text NOT NULL,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "failure_reason" text NOT NULL,
  "failure_detail" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" text
);
CREATE TABLE public."funding_distributions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text NOT NULL,
  "date_distributed" date,
  "payment_type" text,
  "amount_distributed" numeric,
  "amount_expended" numeric,
  "distributed_balance" numeric,
  "funding_remarks" text,
  "contract_ref" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gcaa_ai_insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "insight_type" text DEFAULT 'monthly_analysis'::text NOT NULL,
  "insight_json" jsonb NOT NULL,
  "model_used" text,
  "data_hash" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gcaa_daily_metrics" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "report_date" date NOT NULL,
  "active_aircraft_registrations" integer NOT NULL,
  "inspections_completed_mtd" integer NOT NULL,
  "inspections_target" integer NOT NULL,
  "compliance_rate_percent" numeric(5,2) NOT NULL,
  "incident_reports" integer DEFAULT 0 NOT NULL,
  "incident_details" text,
  "renewals_pending" integer DEFAULT 0 NOT NULL,
  "submitted_by" uuid NOT NULL,
  "approved_by" uuid,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."gcaa_monthly_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "compliance_data" jsonb DEFAULT '{}'::jsonb,
  "inspection_data" jsonb DEFAULT '{}'::jsonb,
  "registration_data" jsonb DEFAULT '{}'::jsonb,
  "incident_data" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_analysis" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid,
  "report_date" date NOT NULL,
  "analysis_data" jsonb,
  "status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_chronic_outliers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_number" text NOT NULL,
  "customer_name" text,
  "town_city" text,
  "track" text NOT NULL,
  "stage" text NOT NULL,
  "service_order_number" text,
  "first_seen_date" date NOT NULL,
  "first_seen_snapshot_id" uuid,
  "latest_snapshot_id" uuid,
  "latest_days_elapsed" integer,
  "consecutive_snapshots" integer DEFAULT 1,
  "date_created" timestamp with time zone,
  "resolved" boolean DEFAULT false,
  "resolved_date" date
);
CREATE TABLE public."gpl_completed" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid,
  "track" text NOT NULL,
  "stage" text NOT NULL,
  "row_number" integer,
  "customer_number" text,
  "account_number" text,
  "customer_name" text,
  "service_address" text,
  "town_city" text,
  "account_status" text,
  "cycle" text,
  "account_type" text,
  "service_order_number" text,
  "service_type" text,
  "date_created" timestamp with time zone,
  "date_completed" date,
  "created_by" text,
  "days_taken" integer,
  "days_taken_calculated" integer,
  "is_data_quality_error" boolean DEFAULT false,
  "data_quality_note" text
);
CREATE TABLE public."gpl_daily_metrics" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "report_date" date NOT NULL,
  "current_load_mw" numeric(8,2) NOT NULL,
  "capacity_mw" numeric(8,2) NOT NULL,
  "active_outages" integer DEFAULT 0 NOT NULL,
  "affected_customers" integer DEFAULT 0 NOT NULL,
  "avg_restoration_time_hours" numeric(6,2),
  "collection_rate_percent" numeric(5,2) NOT NULL,
  "hfo_generation_percent" numeric(5,2) NOT NULL,
  "lfo_generation_percent" numeric(5,2) NOT NULL,
  "solar_generation_percent" numeric(5,2) NOT NULL,
  "other_generation_percent" numeric(5,2) NOT NULL,
  "submitted_by" uuid NOT NULL,
  "approved_by" uuid,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."gpl_daily_stations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid,
  "report_date" date NOT NULL,
  "station" text NOT NULL,
  "total_units" integer DEFAULT 0,
  "total_derated_capacity_mw" numeric,
  "total_available_mw" numeric,
  "units_online" integer DEFAULT 0,
  "units_offline" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_daily_summary" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid,
  "report_date" date NOT NULL,
  "total_fossil_capacity_mw" numeric,
  "expected_peak_demand_mw" numeric,
  "reserve_capacity_mw" numeric,
  "average_for" numeric,
  "hampshire_solar_mwp" numeric DEFAULT 0,
  "prospect_solar_mwp" numeric DEFAULT 0,
  "trafalgar_solar_mwp" numeric DEFAULT 0,
  "total_renewable_mwp" numeric DEFAULT 0,
  "total_dbis_capacity_mw" numeric,
  "evening_peak_on_bars_mw" numeric,
  "evening_peak_suppressed_mw" numeric,
  "day_peak_on_bars_mw" numeric,
  "day_peak_suppressed_mw" numeric,
  "created_at" timestamp with time zone DEFAULT now(),
  "expected_capacity_mw" numeric(10,4),
  "expected_reserve_mw" numeric(10,4),
  "gen_availability_at_suppressed_peak" numeric(10,4),
  "approx_suppressed_peak" numeric(10,4),
  "system_utilization_pct" numeric(6,2),
  "reserve_margin_pct" numeric(6,2)
);
CREATE TABLE public."gpl_daily_units" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid,
  "report_date" date NOT NULL,
  "station" text NOT NULL,
  "unit_number" text,
  "engine" text,
  "installed_capacity_mva" numeric,
  "derated_capacity_mw" numeric,
  "available_mw" numeric,
  "status" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_dbis_daily" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "report_date" date NOT NULL,
  "station_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hampshire_solar_mwp" numeric(6,2) DEFAULT 0,
  "prospect_solar_mwp" numeric(6,2) DEFAULT 0,
  "trafalgar_solar_mwp" numeric(6,2) DEFAULT 0,
  "total_fossil_capacity_mw" numeric(8,2) DEFAULT 0 NOT NULL,
  "total_renewable_capacity_mw" numeric(8,2) DEFAULT 0 NOT NULL,
  "total_dbis_capacity_mw" numeric(8,2) DEFAULT 0 NOT NULL,
  "evening_peak_onbars_mw" numeric(8,2),
  "evening_peak_suppressed_mw" numeric(8,2),
  "day_peak_onbars_mw" numeric(8,2),
  "day_peak_suppressed_mw" numeric(8,2),
  "generation_availability_mw" numeric(8,2),
  "fleet_availability_percent" numeric(5,2),
  "reserve_margin_percent" numeric(5,2),
  "active_outages" integer DEFAULT 0,
  "affected_customers" integer DEFAULT 0,
  "avg_restoration_time_hours" numeric(6,2),
  "collection_rate_percent" numeric(5,2),
  "hfo_generation_percent" numeric(5,2),
  "lfo_generation_percent" numeric(5,2),
  "solar_generation_percent" numeric(5,2),
  "other_generation_percent" numeric(5,2),
  "submitted_by" uuid NOT NULL,
  "approved_by" uuid,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."gpl_feeder_cache" (
  "id" integer DEFAULT nextval('gpl_feeder_cache_id_seq'::regclass) NOT NULL,
  "feeder_id" integer NOT NULL,
  "code" text,
  "name" text,
  "substation_code" text,
  "area_served" text,
  "customer_count" integer,
  "synced_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_ai_analysis" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_type" text DEFAULT 'strategic_briefing'::text,
  "data_through_date" date,
  "daily_data_points" integer,
  "monthly_data_points" integer,
  "executive_briefing" text,
  "demand_outlook" text,
  "capacity_risk" text,
  "infrastructure_reliability" text,
  "customer_revenue_impact" text,
  "essequibo_assessment" text,
  "recommendations" jsonb,
  "raw_response" jsonb,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "processing_time_ms" integer,
  "generated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_cache" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_json" jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now(),
  "data_hash" text NOT NULL,
  "model_used" text DEFAULT 'claude-opus-4-6'::text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "processing_time_ms" integer
);
CREATE TABLE public."gpl_forecast_capacity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "grid" text DEFAULT 'DBIS'::text,
  "current_capacity_mw" numeric,
  "projected_capacity_mw" numeric,
  "shortfall_date" date,
  "reserve_margin_pct" numeric,
  "months_until_shortfall" integer,
  "risk_level" text,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_demand" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "projected_month" date NOT NULL,
  "grid" text DEFAULT 'DBIS'::text,
  "projected_peak_mw" numeric,
  "confidence_low_mw" numeric,
  "confidence_high_mw" numeric,
  "growth_rate_pct" numeric,
  "data_source" text,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_kpi" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "kpi_name" text NOT NULL,
  "projected_month" date NOT NULL,
  "projected_value" numeric,
  "confidence_low" numeric,
  "confidence_high" numeric,
  "trend" text,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_load_shedding" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "period_days" integer DEFAULT 30,
  "avg_shed_mw" numeric,
  "max_shed_mw" numeric,
  "shed_days_count" integer,
  "trend" text,
  "projected_avg_6mo" numeric,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_reserve" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "projected_month" date NOT NULL,
  "projected_reserve_mw" numeric(10,2),
  "projected_reserve_pct" numeric(6,2),
  "below_threshold" boolean DEFAULT false,
  "risk_level" character varying(20),
  "computed_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_station_reliability" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "station" text NOT NULL,
  "period_days" integer DEFAULT 90,
  "uptime_pct" numeric,
  "avg_utilization_pct" numeric,
  "total_units" integer,
  "online_units" integer,
  "offline_units" integer,
  "failure_count" integer,
  "mtbf_days" numeric,
  "trend" text,
  "risk_level" text,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_forecast_unit_risk" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "forecast_date" date NOT NULL,
  "station" text NOT NULL,
  "engine" text,
  "unit_number" text,
  "derated_mw" numeric,
  "uptime_pct_90d" numeric,
  "failure_count_90d" integer,
  "mtbf_days" numeric,
  "days_since_last_failure" integer,
  "predicted_failure_days" integer,
  "risk_level" text,
  "risk_score" numeric,
  "computed_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_kpi_ai_analysis" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid,
  "analysis_date" date NOT NULL,
  "date_range_start" date,
  "date_range_end" date,
  "analysis_model" character varying(100),
  "analysis_status" character varying(20) DEFAULT 'pending'::character varying,
  "executive_briefing" text,
  "key_findings" jsonb,
  "concerning_trends" jsonb,
  "raw_response" jsonb,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "processing_time_ms" integer,
  "error_message" text,
  "created_at" timestamp without time zone DEFAULT now(),
  "completed_at" timestamp without time zone
);
CREATE TABLE public."gpl_kpi_uploads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" character varying(500),
  "file_size_bytes" integer,
  "rows_parsed" integer,
  "rows_inserted" integer,
  "rows_updated" integer,
  "date_range_start" date,
  "date_range_end" date,
  "kpis_found" text[],
  "warnings" jsonb,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "error_message" text,
  "uploaded_by" character varying(100),
  "created_at" timestamp without time zone DEFAULT now(),
  "confirmed_at" timestamp without time zone
);
CREATE TABLE public."gpl_monthly_kpis" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "kpi_name" text NOT NULL,
  "value" double precision NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_multivariate_forecasts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now(),
  "data_period" text,
  "methodology_summary" text,
  "conservative_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "aggressive_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "demand_drivers_json" jsonb,
  "executive_summary" text,
  "model_used" text,
  "processing_time_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "is_fallback" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_outage_cache" (
  "id" integer DEFAULT nextval('gpl_outage_cache_id_seq'::regclass) NOT NULL,
  "outage_id" integer NOT NULL,
  "feeder_id" integer,
  "date" date NOT NULL,
  "time_out" time without time zone,
  "time_in" time without time zone,
  "duration_minutes" integer,
  "customers_affected" integer,
  "mw_lost" numeric(6,2),
  "ens_mwh" numeric(8,3),
  "cause_category" text,
  "cause_subcategory" text,
  "cause_detail" text,
  "root_cause" text,
  "status" text,
  "feeder_code" text,
  "substation_code" text,
  "areas_affected" text,
  "synced_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gpl_outstanding" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid,
  "track" text NOT NULL,
  "stage" text NOT NULL,
  "row_number" integer,
  "customer_number" text,
  "account_number" text,
  "customer_name" text,
  "service_address" text,
  "town_city" text,
  "account_status" text,
  "cycle" text,
  "account_type" text,
  "division_code" text,
  "service_order_number" text,
  "service_type" text,
  "date_created" timestamp with time zone,
  "current_date_ref" date,
  "days_elapsed" integer,
  "days_elapsed_calculated" integer
);
CREATE TABLE public."gpl_power_stations" (
  "id" integer DEFAULT nextval('gpl_power_stations_id_seq'::regclass) NOT NULL,
  "station_code" character varying(20) NOT NULL,
  "station_name" character varying(100) NOT NULL,
  "station_type" character varying(20) NOT NULL,
  "location" character varying(100),
  "installed_capacity_mw" numeric(8,2),
  "is_active" boolean DEFAULT true,
  "display_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."gpl_pulse_scores" (
  "id" integer DEFAULT nextval('gpl_pulse_scores_id_seq'::regclass) NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now(),
  "overall" integer NOT NULL,
  "frequency_score" integer,
  "restoration_score" integer,
  "impact_score" integer,
  "outage_count_30d" integer,
  "avg_restoration_min" numeric(5,1),
  "cmi_per_1000" integer,
  "score_breakdown" jsonb
);
CREATE TABLE public."gpl_snapshot_metrics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_id" uuid,
  "track" text NOT NULL,
  "stage" text NOT NULL,
  "category" text NOT NULL,
  "total_count" integer,
  "valid_count" integer,
  "error_count" integer DEFAULT 0,
  "sla_target_days" integer,
  "within_sla_count" integer,
  "sla_compliance_pct" numeric(5,2),
  "mean_days" numeric(6,2),
  "median_days" numeric(6,2),
  "trimmed_mean_days" numeric(6,2),
  "mode_days" integer,
  "std_dev" numeric(6,2),
  "min_days" integer,
  "max_days" integer,
  "q1" numeric(6,2),
  "q3" numeric(6,2),
  "p90" numeric(6,2),
  "p95" numeric(6,2),
  "ageing_buckets" jsonb,
  "staff_breakdown" jsonb
);
CREATE TABLE public."gpl_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now(),
  "file_name" text,
  "track_a_outstanding" integer DEFAULT 0,
  "track_a_completed" integer DEFAULT 0,
  "track_b_design_outstanding" integer DEFAULT 0,
  "track_b_execution_outstanding" integer DEFAULT 0,
  "track_b_design_completed" integer DEFAULT 0,
  "track_b_execution_completed" integer DEFAULT 0,
  "track_b_total_outstanding" integer GENERATED ALWAYS AS ((track_b_design_outstanding + track_b_execution_outstanding)) STORED,
  "data_quality_warnings" jsonb DEFAULT '[]'::jsonb,
  "warning_count" integer DEFAULT 0,
  "user_id" uuid
);
CREATE TABLE public."gpl_uploads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" text NOT NULL,
  "file_size_bytes" integer DEFAULT 0,
  "report_date" date NOT NULL,
  "raw_data" jsonb,
  "status" text DEFAULT 'confirmed'::text,
  "uploaded_by" text DEFAULT 'dg-admin'::text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."gwi_ai_insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "insight_type" text NOT NULL,
  "insight_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "model_used" text,
  "data_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."gwi_daily_metrics" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "report_date" date NOT NULL,
  "nrw_percent" numeric(5,2) NOT NULL,
  "water_produced_cubic_meters" numeric(12,2) NOT NULL,
  "water_billed_cubic_meters" numeric(12,2) NOT NULL,
  "active_disruptions" integer DEFAULT 0 NOT NULL,
  "disruption_areas" text[],
  "avg_response_time_hours" numeric(6,2) NOT NULL,
  "avg_repair_time_hours" numeric(6,2) NOT NULL,
  "customer_complaints" integer DEFAULT 0,
  "submitted_by" uuid NOT NULL,
  "approved_by" uuid,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."gwi_monthly_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "report_type" text DEFAULT 'management'::text NOT NULL,
  "financial_data" jsonb DEFAULT '{}'::jsonb,
  "collections_data" jsonb DEFAULT '{}'::jsonb,
  "customer_service_data" jsonb DEFAULT '{}'::jsonb,
  "procurement_data" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."gwi_uploaded_files" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" text NOT NULL,
  "report_type" text NOT NULL,
  "report_period" date NOT NULL,
  "parsed_data" jsonb DEFAULT '{}'::jsonb,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."gwi_weekly_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_week" date NOT NULL,
  "complaints_data" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."integration_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text DEFAULT 'dg'::text NOT NULL,
  "provider" text NOT NULL,
  "refresh_token" text NOT NULL,
  "access_token" text,
  "token_expiry" timestamp with time zone,
  "calendar_id" text,
  "account_email" text,
  "scopes" text,
  "connected_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."interventions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "intervention_type" text NOT NULL,
  "description" text NOT NULL,
  "assigned_to" text,
  "due_date" date,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."invitation_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "token" text NOT NULL,
  "role_id" uuid NOT NULL,
  "assigned_agencies" text[],
  "created_by" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "accepted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."invite_tokens" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" character varying(64) NOT NULL,
  "type" character varying(20) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."kpi_alerts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency_slug" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "severity" text DEFAULT 'warning'::text,
  "resolved" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "resolved_at" timestamp with time zone
);
CREATE TABLE public."meeting_actions" (
  "id" text DEFAULT (gen_random_uuid())::text NOT NULL,
  "meeting_id" text NOT NULL,
  "task" text NOT NULL,
  "owner" text,
  "due_date" timestamp with time zone,
  "done" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "confidence" text DEFAULT 'AUTO_CREATE'::text NOT NULL,
  "review_reason" text,
  "task_id" uuid,
  "skipped" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."meetings" (
  "id" text DEFAULT (gen_random_uuid())::text NOT NULL,
  "title" text NOT NULL,
  "date" timestamp with time zone DEFAULT now() NOT NULL,
  "duration_secs" integer,
  "status" meeting_status DEFAULT 'UPLOADED'::meeting_status NOT NULL,
  "audio_path" text,
  "attendees" text[] DEFAULT '{}'::text[],
  "transcript_raw" jsonb,
  "transcript_text" text,
  "summary" text,
  "decisions" text[] DEFAULT '{}'::text[],
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text
);
CREATE TABLE public."meetings_seen" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fireflies_meeting_id" text NOT NULL,
  "meeting_title" text,
  "meeting_date" timestamp with time zone,
  "detected_type" text,
  "detected_modality" text,
  "attendee_emails" text[],
  "transcript_ready_at" timestamp with time zone,
  "pipeline_action" text NOT NULL,
  "skip_reason" text,
  "extraction_id" uuid,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."metric_definitions" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "row_number" integer NOT NULL,
  "metric_name" character varying(500) NOT NULL,
  "category" character varying(200),
  "subcategory" character varying(200),
  "agency" character varying(50),
  "unit" character varying(100),
  "expected_type" character varying(20) DEFAULT 'number'::character varying,
  "min_value" numeric(20,6),
  "max_value" numeric(20,6),
  "is_active" boolean DEFAULT true,
  "description" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."modules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "default_roles" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."notification_preferences" (
  "user_id" text DEFAULT 'dg'::text NOT NULL,
  "meeting_reminder_24h" boolean DEFAULT true,
  "meeting_reminder_1h" boolean DEFAULT true,
  "meeting_reminder_15m" boolean DEFAULT true,
  "task_due_reminders" boolean DEFAULT true,
  "task_overdue_alerts" boolean DEFAULT true,
  "meeting_minutes_ready" boolean DEFAULT true,
  "do_not_disturb" boolean DEFAULT false,
  "quiet_hours_start" time without time zone,
  "quiet_hours_end" time without time zone,
  "updated_at" timestamp with time zone DEFAULT now(),
  "projects_enabled" boolean DEFAULT true,
  "kpi_enabled" boolean DEFAULT true,
  "oversight_enabled" boolean DEFAULT true,
  "event_preferences" jsonb DEFAULT '{"task_blocked": {"email": "instant", "in_app": true}, "comment_reply": {"email": "instant", "in_app": true}, "task_assigned": {"email": "instant", "in_app": true}, "task_due_soon": {"email": "digest", "in_app": true}, "task_completed": {"email": "digest", "in_app": true}, "comment_mention": {"email": "instant", "in_app": true}, "subtask_completed": {"email": "off", "in_app": true}, "task_status_change": {"email": "digest", "in_app": true}}'::jsonb NOT NULL,
  "digest_frequency" text DEFAULT 'daily'::text NOT NULL,
  "digest_time" time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL
);
CREATE TABLE public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text DEFAULT 'dg'::text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "icon" text,
  "priority" text DEFAULT 'medium'::text NOT NULL,
  "reference_type" text,
  "reference_id" text,
  "reference_url" text,
  "scheduled_for" timestamp with time zone NOT NULL,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "push_sent" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "category" text DEFAULT 'system'::text,
  "source_module" text DEFAULT 'system'::text,
  "action_required" boolean DEFAULT false,
  "action_type" text,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now(),
  "actor_id" text,
  "event_type" text,
  "importance_tier" text DEFAULT 'informational'::text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "parent_entity_type" text,
  "parent_entity_id" text,
  "seen_at" timestamp with time zone,
  "email_sent_at" timestamp with time zone,
  "email_queued_at" timestamp with time zone,
  "digest_eligible" boolean DEFAULT false NOT NULL,
  "digest_batch_id" uuid
);
CREATE TABLE public."nptab_report_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "changed_by" uuid NOT NULL,
  "field_changed" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."nptab_report_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" text NOT NULL,
  "queued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "queued_by" uuid NOT NULL,
  "reason" text,
  "dequeued_at" timestamp with time zone,
  "dequeued_by" uuid,
  "dequeue_reason" text,
  "included_in_report_id" uuid
);
CREATE TABLE public."nptab_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "reference_number" text,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" uuid NOT NULL,
  "status" nptab_report_status DEFAULT 'drafted'::nptab_report_status NOT NULL,
  "submitted_at" timestamp with time zone,
  "delivery_method" nptab_delivery_method,
  "delivered_to" text,
  "narrative" text DEFAULT ''::text NOT NULL,
  "tender_count" integer DEFAULT 0 NOT NULL,
  "total_value" numeric,
  "closed_at" timestamp with time zone,
  "closure_reason" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."object_access_grants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text,
  "access_level" text NOT NULL,
  "reason" text,
  "granted_by" uuid NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone
);
CREATE TABLE public."object_ownership" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."pending_application_analyses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "analysis_date" date DEFAULT CURRENT_DATE NOT NULL,
  "analysis_type" text DEFAULT 'deep'::text NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'completed'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."pending_application_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "total_count" integer NOT NULL,
  "summary_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."pending_applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "customer_reference" text,
  "first_name" text,
  "last_name" text,
  "telephone" text,
  "region" text,
  "district" text,
  "village_ward" text,
  "street" text,
  "lot" text,
  "event_code" text,
  "event_description" text,
  "application_date" date NOT NULL,
  "days_waiting" integer NOT NULL,
  "raw_data" jsonb,
  "imported_at" timestamp with time zone DEFAULT now(),
  "data_as_of" date,
  "pipeline_stage" text,
  "account_type" text,
  "service_order_type" text,
  "service_order_number" text,
  "account_status" text,
  "cycle" text,
  "division_code" text
);
CREATE TABLE public."polling_state" (
  "id" uuid NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "last_poll_completed_at" timestamp with time zone
);
CREATE TABLE public."procurement_decision" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "decision_type" text NOT NULL,
  "target_kind" text NOT NULL,
  "target_id" uuid NOT NULL,
  "agency" text NOT NULL,
  "actor_id" uuid NOT NULL,
  "actor_role" text NOT NULL,
  "reason_code" text,
  "reason_text" text,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approval_state" text DEFAULT 'none'::text NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "approval_role" text
);
CREATE TABLE public."procurement_documents_archive_20260417" (
  "id" uuid,
  "package_id" uuid,
  "file_name" text,
  "file_path" text,
  "file_type" text,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone
);
CREATE TABLE public."procurement_excluded_fingerprint" (
  "fingerprint" text NOT NULL,
  "reason_code" text NOT NULL,
  "agency" text NOT NULL,
  "example_incoming" jsonb,
  "decided_by" uuid NOT NULL,
  "decided_role" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
CREATE TABLE public."procurement_import_batches_archive_20260417" (
  "id" uuid,
  "agency" text,
  "uploaded_by" uuid,
  "file_name" text,
  "row_count" integer,
  "status" text,
  "created_at" timestamp with time zone
);
CREATE TABLE public."procurement_match_decision" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" text NOT NULL,
  "resolution_tender_id" uuid NOT NULL,
  "reason_code" text NOT NULL,
  "agency" text NOT NULL,
  "decided_by" uuid NOT NULL,
  "decided_role" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."procurement_notes_archive_20260417" (
  "id" uuid,
  "package_id" uuid,
  "content" text,
  "created_by" uuid,
  "created_at" timestamp with time zone
);
CREATE TABLE public."procurement_packages_archive_20260417" (
  "id" uuid,
  "agency" text,
  "title" text,
  "description" text,
  "estimated_value" numeric,
  "procurement_method" text,
  "current_stage" text,
  "submitted_by" uuid,
  "oversight_project_id" uuid,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "expected_delivery_date" date,
  "bid_reference" text,
  "tender_board" text,
  "opening_date" date,
  "import_batch_id" uuid,
  "nptab_number" text,
  "psip_ref" text,
  "date_first_advertised" date,
  "tender_closing_date" date,
  "date_eval_submitted_mtb" date,
  "date_eval_submitted_nptab" date,
  "date_of_award" date,
  "psip_remarks" text,
  "psip_last_synced_at" timestamp with time zone
);
CREATE TABLE public."procurement_stage_history_archive_20260417" (
  "id" uuid,
  "package_id" uuid,
  "from_stage" text,
  "to_stage" text,
  "changed_by" uuid,
  "changed_at" timestamp with time zone,
  "notes" text
);
CREATE TABLE public."programme" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."project_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid,
  "note_text" text NOT NULL,
  "note_type" text DEFAULT 'general'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."project_progress_details" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text NOT NULL,
  "expected_progress_description" text,
  "expected_progress_value_pct" numeric,
  "actual_progress_description" text,
  "actual_progress_value_pct" numeric,
  "record_date" date,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."project_summaries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."project_uploads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" character varying(255),
  "row_count" integer,
  "changes_summary" jsonb,
  "uploaded_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text NOT NULL,
  "executing_agency" text,
  "sub_agency" text,
  "project_name" text,
  "region" text,
  "contract_value" numeric,
  "contractor" text,
  "project_end_date" date,
  "completion_pct" numeric DEFAULT 0,
  "has_images" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "health" text DEFAULT 'green'::text,
  "escalated" boolean DEFAULT false,
  "escalation_reason" text,
  "assigned_to" uuid,
  "start_date" date,
  "short_name" character varying(60),
  "tender_board_type" text,
  "balance_remaining" numeric,
  "remarks" text,
  "project_status" text,
  "extension_reason" text,
  "extension_date" date,
  "project_extended" boolean DEFAULT false,
  "total_distributed" numeric,
  "total_expended" numeric,
  "revised_start_date" date
);
CREATE TABLE public."projects_oversight" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" integer NOT NULL,
  "project_reference" text,
  "executing_agency" text DEFAULT 'MOPUA'::text,
  "sub_agency" text NOT NULL,
  "project_name" text NOT NULL,
  "region" integer,
  "tender_board_type" text,
  "contract_value_total" numeric,
  "contract_lots" jsonb DEFAULT '[]'::jsonb,
  "contractors" text[],
  "project_end_date" date,
  "project_status" text DEFAULT 'DELAYED'::text,
  "completion_percent" integer DEFAULT 0,
  "has_images" integer DEFAULT 0,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_resolved" boolean DEFAULT false,
  "resolved_at" timestamp with time zone
);
CREATE TABLE public."psip_nag_preview" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trigger_kind" text NOT NULL,
  "agency" text NOT NULL,
  "recipient_to" text NOT NULL,
  "recipient_bcc" text,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "would_have_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actually_sent" boolean DEFAULT false NOT NULL,
  "sent_at" timestamp with time zone,
  "sent_error" text
);
CREATE TABLE public."psip_nag_record" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "tender_id" uuid NOT NULL,
  "trigger_kind" text NOT NULL,
  "consecutive_weekly_count" integer DEFAULT 0 NOT NULL,
  "first_nagged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_nagged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE TABLE public."psip_nag_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "emails_enabled" boolean DEFAULT false NOT NULL,
  "bcc_to_dg" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);
CREATE TABLE public."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text DEFAULT 'dg'::text NOT NULL,
  "endpoint" text NOT NULL,
  "keys_p256dh" text NOT NULL,
  "keys_auth" text NOT NULL,
  "device_info" text,
  "platform" text DEFAULT 'other'::text,
  "active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_used_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."refresh_tokens" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" character varying(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" timestamp with time zone
);
CREATE TABLE public."role_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "hierarchy_level" integer NOT NULL,
  "is_custom" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."saved_filters" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "filter_name" text NOT NULL,
  "filter_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."service_connection_ai_insights" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_date" date DEFAULT CURRENT_DATE NOT NULL,
  "analysis_type" text DEFAULT 'efficiency'::text NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'completed'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."service_connection_monthly_stats" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_month" date NOT NULL,
  "opened_count" integer DEFAULT 0 NOT NULL,
  "completed_count" integer DEFAULT 0 NOT NULL,
  "queue_depth" integer DEFAULT 0 NOT NULL,
  "avg_days_to_complete" numeric(8,2),
  "median_days_to_complete" numeric(8,2),
  "pct_within_sla" numeric(5,2),
  "track_a_completed" integer DEFAULT 0,
  "track_a_avg_days" numeric(8,2),
  "track_a_sla_pct" numeric(5,2),
  "track_b_completed" integer DEFAULT 0,
  "track_b_avg_days" numeric(8,2),
  "track_b_sla_pct" numeric(5,2),
  "stage_breakdown" jsonb DEFAULT '{}'::jsonb,
  "complexity_breakdown" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "design_completed" integer DEFAULT 0,
  "design_avg_days" numeric,
  "design_sla_pct" numeric
);
CREATE TABLE public."service_connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "customer_reference" text,
  "service_order_number" text,
  "first_name" text,
  "last_name" text,
  "telephone" text,
  "region" text,
  "district" text,
  "village_ward" text,
  "street" text,
  "lot" text,
  "account_type" text,
  "service_order_type" text,
  "division_code" text,
  "cycle" text,
  "application_date" date,
  "track" text DEFAULT 'unknown'::text,
  "job_complexity" text DEFAULT 'unknown'::text,
  "status" text DEFAULT 'open'::text NOT NULL,
  "current_stage" text,
  "stage_history" jsonb DEFAULT '[]'::jsonb,
  "first_seen_date" date,
  "last_seen_date" date,
  "disappeared_date" date,
  "energisation_date" date,
  "total_days_to_complete" integer,
  "is_legacy" boolean DEFAULT false,
  "linked_so_number" text,
  "raw_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."sub_programme" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "programme_code" text NOT NULL,
  "agency" tender_agency NOT NULL,
  "is_excluded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."subtasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid,
  "title" text NOT NULL,
  "done" boolean DEFAULT false,
  "position" integer DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."task_activities" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid,
  "action" task_action NOT NULL,
  "from_value" text,
  "to_value" text,
  "comment" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."task_activity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid,
  "user_id" uuid,
  "action" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."task_comments" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid,
  "body" text NOT NULL,
  "attachments" text[] DEFAULT '{}'::text[],
  "parent_id" uuid,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."task_notifications" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" task_notification_type NOT NULL,
  "task_id" uuid,
  "title" character varying(255) NOT NULL,
  "message" text,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public."task_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "agency_slug" text,
  "priority" text DEFAULT 'medium'::text,
  "checklist" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "recurrence_rule" text,
  "recurrence_enabled" boolean DEFAULT false,
  "recurrence_assignee_id" uuid,
  "next_occurrence" date,
  "due_offset_days" integer DEFAULT 5
);
CREATE TABLE public."task_watchers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "added_by_user_id" uuid,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'not_started'::text NOT NULL,
  "priority" text DEFAULT 'medium'::text,
  "due_date" date,
  "agency" text,
  "role" text,
  "owner_user_id" uuid,
  "assigned_by_user_id" uuid,
  "source_meeting_id" text,
  "notion_id" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "blocked_reason" text,
  "completed_at" timestamp with time zone,
  "source" text DEFAULT 'manual'::text NOT NULL,
  "extraction_id" uuid,
  "extraction_item_idx" integer,
  "source_timestamp" text,
  "source_quote" text,
  "owner_name_raw" text,
  "delegated_to_id" uuid,
  "verb_category" text,
  "due_trigger" text,
  "confidence_overall" numeric(3,2),
  "confidence_reasons" text[],
  "task_embedding" vector(1536),
  "completion_note" text,
  "completed_by" uuid,
  "verified_by" uuid,
  "verified_at" timestamp with time zone,
  "dispute_note" text,
  "disputed_at" timestamp with time zone,
  "supersedes_id" uuid,
  "visibility_scope" text DEFAULT 'agency_normal'::text NOT NULL,
  "requires_minister_attention" boolean DEFAULT false NOT NULL,
  "referred_to_minister_at" timestamp with time zone,
  "referred_to_minister_by" uuid,
  "minister_seen_at" timestamp with time zone,
  "minister_closed_at" timestamp with time zone,
  "linked_source_type" text,
  "linked_source_id" text
);
CREATE TABLE public."tender" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source" tender_source DEFAULT 'psip'::tender_source NOT NULL,
  "external_id" text,
  "agency" tender_agency NOT NULL,
  "programme_code" text,
  "sub_programme_code" text,
  "programme_activity" text,
  "line_item_code" text,
  "description" text NOT NULL,
  "stage" tender_stage NOT NULL,
  "stage_source" tender_stage_source DEFAULT 'status_column'::tender_stage_source NOT NULL,
  "method" tender_method,
  "is_rollover" boolean DEFAULT false NOT NULL,
  "has_exception" boolean DEFAULT false NOT NULL,
  "date_advertised" date,
  "date_closed" date,
  "date_eval_sent_mtb_rtb" date,
  "date_eval_sent_nptab" date,
  "date_of_award" date,
  "contractor" text,
  "implementation_start_date" date,
  "implementation_end_date" date,
  "implementation_status_pct" integer,
  "remarks" text,
  "last_raw_row" jsonb,
  "first_seen_upload_id" uuid,
  "last_seen_upload_id" uuid,
  "missing_from_last_upload" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "awarded_at" timestamp with time zone,
  "first_appearance_already_awarded" boolean DEFAULT false NOT NULL,
  "stagnant_weeks" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "archived_role" text,
  "archive_reason_code" text,
  "archive_reason_text" text,
  "keep_tracking_despite_missing" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL
);
CREATE TABLE public."tender_cleanup_backup_20260417" (
  "id" uuid,
  "source" tender_source,
  "external_id" text,
  "agency" tender_agency,
  "programme_code" text,
  "sub_programme_code" text,
  "programme_activity" text,
  "line_item_code" text,
  "description" text,
  "stage" tender_stage,
  "stage_source" tender_stage_source,
  "method" tender_method,
  "is_rollover" boolean,
  "has_exception" boolean,
  "date_advertised" date,
  "date_closed" date,
  "date_eval_sent_mtb_rtb" date,
  "date_eval_sent_nptab" date,
  "date_of_award" date,
  "contractor" text,
  "implementation_start_date" date,
  "implementation_end_date" date,
  "implementation_status_pct" integer,
  "remarks" text,
  "last_raw_row" jsonb,
  "first_seen_upload_id" uuid,
  "last_seen_upload_id" uuid,
  "missing_from_last_upload" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "awarded_at" timestamp with time zone,
  "first_appearance_already_awarded" boolean
);
CREATE TABLE public."tender_document" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_path" text NOT NULL,
  "file_type" text,
  "uploaded_by" uuid NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tender_field_change" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" uuid NOT NULL,
  "field_name" text NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "upload_id" uuid,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tender_match_review" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "upload_id" uuid NOT NULL,
  "incoming_row" jsonb NOT NULL,
  "candidate_tender_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" tender_match_status DEFAULT 'pending'::tender_match_status NOT NULL,
  "resolution_tender_id" uuid,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "review_reason" text DEFAULT 'ambiguous_match'::text NOT NULL,
  "parsed_row_fingerprint" text,
  "seen_in_uploads" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
CREATE TABLE public."tender_note" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tender_presence_event" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "agency" text NOT NULL,
  "upload_id" uuid,
  "actor_id" uuid,
  "actor_role" text,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tender_status_decision" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" uuid NOT NULL,
  "status_before" text,
  "status_after" text NOT NULL,
  "reason_code" text,
  "decision_id" uuid,
  "decided_by" uuid NOT NULL,
  "decided_role" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tender_upload_snapshot" (
  "upload_id" uuid NOT NULL,
  "tender_id" uuid NOT NULL,
  "snapshot_fields" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."trello_board" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agency" text NOT NULL,
  "trello_board_id" text NOT NULL,
  "board_name" text NOT NULL,
  "webhook_id" text,
  "last_synced_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "list_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."upload" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "filename" text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "status" tender_upload_status DEFAULT 'preview'::tender_upload_status NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "applied_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone
);
CREATE TABLE public."user_module_access" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "module_id" uuid NOT NULL,
  "granted_by" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "access_type" text DEFAULT 'grant'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "can_edit" boolean DEFAULT false NOT NULL,
  "agency" text
);
CREATE TABLE public."user_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "key" text NOT NULL,
  "value" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "google_sub" text,
  "email" text NOT NULL,
  "name" text,
  "avatar_url" text,
  "role" text DEFAULT 'officer'::text NOT NULL,
  "agency" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_login" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "created_by" uuid,
  "status" text DEFAULT 'active'::text,
  "invited_by" uuid,
  "invited_at" timestamp with time zone,
  "first_login_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "login_count" integer DEFAULT 0,
  "archived_at" timestamp with time zone,
  "formal_title" text,
  "password_hash" text,
  "invite_token" text,
  "invite_token_expires_at" timestamp with time zone,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL,
  "closure_mode" text DEFAULT 'self_close'::text NOT NULL,
  "is_agency_head" boolean DEFAULT false NOT NULL
);

-- ---------- sequence ownership ----------
ALTER SEQUENCE public."gpl_feeder_cache_id_seq" OWNED BY public.gpl_feeder_cache.id;
ALTER SEQUENCE public."gpl_outage_cache_id_seq" OWNED BY public.gpl_outage_cache.id;
ALTER SEQUENCE public."gpl_power_stations_id_seq" OWNED BY public.gpl_power_stations.id;
ALTER SEQUENCE public."gpl_pulse_scores_id_seq" OWNED BY public.gpl_pulse_scores.id;

-- ---------- constraints (PK/UNIQUE/CHECK then FK) ----------
ALTER TABLE public."action_item_events" ADD CONSTRAINT "action_item_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "action_item_extractions_pkey" PRIMARY KEY (id);
ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_audit_log" ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."agency_head_notification_log" ADD CONSTRAINT "agency_head_notification_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."agency_health_snapshots" ADD CONSTRAINT "agency_health_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."agency_intel_reports" ADD CONSTRAINT "agency_intel_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."agency_psip_focal_point" ADD CONSTRAINT "agency_psip_focal_point_pkey" PRIMARY KEY (agency);
ALTER TABLE public."agency_psip_focal_point_history" ADD CONSTRAINT "agency_psip_focal_point_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_metric_snapshot" ADD CONSTRAINT "ai_metric_snapshot_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_response_cache" ADD CONSTRAINT "ai_response_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_usage_log" ADD CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrip_inspections" ADD CONSTRAINT "airstrip_inspections_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrip_option_types" ADD CONSTRAINT "airstrip_option_types_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrip_photos" ADD CONSTRAINT "airstrip_photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrip_status_log" ADD CONSTRAINT "airstrip_status_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_pkey" PRIMARY KEY (id);
ALTER TABLE public."alerts" ADD CONSTRAINT "alerts_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_log" ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."calendar_events" ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."cjia_ai_insights" ADD CONSTRAINT "cjia_ai_insights_pkey" PRIMARY KEY (id);
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."cjia_monthly_reports" ADD CONSTRAINT "cjia_monthly_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."core_permissions" ADD CONSTRAINT "core_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."customer_application_activity_log" ADD CONSTRAINT "customer_application_activity_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."customer_application_documents" ADD CONSTRAINT "customer_application_documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."customer_application_notes" ADD CONSTRAINT "customer_application_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_pkey" PRIMARY KEY (id);
ALTER TABLE public."daily_analysis" ADD CONSTRAINT "daily_analysis_pkey" PRIMARY KEY (id);
ALTER TABLE public."daily_metrics" ADD CONSTRAINT "daily_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."daily_uploads" ADD CONSTRAINT "daily_uploads_pkey" PRIMARY KEY (id);
ALTER TABLE public."deadline_extension_requests" ADD CONSTRAINT "deadline_extension_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."delayed_project_snapshots" ADD CONSTRAINT "delayed_project_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."delayed_projects" ADD CONSTRAINT "delayed_projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."delegated_permissions" ADD CONSTRAINT "delegated_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."document_chunks" ADD CONSTRAINT "document_chunks_pkey" PRIMARY KEY (id);
ALTER TABLE public."document_queries" ADD CONSTRAINT "document_queries_pkey" PRIMARY KEY (id);
ALTER TABLE public."documents" ADD CONSTRAINT "documents_pkey" PRIMARY KEY (id);
ALTER TABLE public."failed_extractions" ADD CONSTRAINT "failed_extractions_pkey" PRIMARY KEY (id);
ALTER TABLE public."funding_distributions" ADD CONSTRAINT "funding_distributions_pkey" PRIMARY KEY (id);
ALTER TABLE public."gcaa_ai_insights" ADD CONSTRAINT "gcaa_ai_insights_pkey" PRIMARY KEY (id);
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."gcaa_monthly_reports" ADD CONSTRAINT "gcaa_monthly_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_analysis" ADD CONSTRAINT "gpl_analysis_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_chronic_outliers" ADD CONSTRAINT "gpl_chronic_outliers_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_completed" ADD CONSTRAINT "gpl_completed_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_daily_stations" ADD CONSTRAINT "gpl_daily_stations_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_daily_summary" ADD CONSTRAINT "gpl_daily_summary_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_daily_units" ADD CONSTRAINT "gpl_daily_units_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_feeder_cache" ADD CONSTRAINT "gpl_feeder_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_ai_analysis" ADD CONSTRAINT "gpl_forecast_ai_analysis_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_cache" ADD CONSTRAINT "gpl_forecast_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_capacity" ADD CONSTRAINT "gpl_forecast_capacity_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_demand" ADD CONSTRAINT "gpl_forecast_demand_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_kpi" ADD CONSTRAINT "gpl_forecast_kpi_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_load_shedding" ADD CONSTRAINT "gpl_forecast_load_shedding_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_reserve" ADD CONSTRAINT "gpl_forecast_reserve_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_station_reliability" ADD CONSTRAINT "gpl_forecast_station_reliability_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_forecast_unit_risk" ADD CONSTRAINT "gpl_forecast_unit_risk_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_kpi_ai_analysis" ADD CONSTRAINT "gpl_kpi_ai_analysis_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_kpi_uploads" ADD CONSTRAINT "gpl_kpi_uploads_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_monthly_kpis" ADD CONSTRAINT "gpl_monthly_kpis_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_multivariate_forecasts" ADD CONSTRAINT "gpl_multivariate_forecasts_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_outage_cache" ADD CONSTRAINT "gpl_outage_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_outstanding" ADD CONSTRAINT "gpl_outstanding_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_power_stations" ADD CONSTRAINT "gpl_power_stations_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_pulse_scores" ADD CONSTRAINT "gpl_pulse_scores_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_snapshot_metrics" ADD CONSTRAINT "gpl_snapshot_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_snapshots" ADD CONSTRAINT "gpl_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."gpl_uploads" ADD CONSTRAINT "gpl_uploads_pkey" PRIMARY KEY (id);
ALTER TABLE public."gwi_ai_insights" ADD CONSTRAINT "gwi_ai_insights_pkey" PRIMARY KEY (id);
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_pkey" PRIMARY KEY (id);
ALTER TABLE public."gwi_monthly_reports" ADD CONSTRAINT "gwi_monthly_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."gwi_uploaded_files" ADD CONSTRAINT "gwi_uploaded_files_pkey" PRIMARY KEY (id);
ALTER TABLE public."gwi_weekly_reports" ADD CONSTRAINT "gwi_weekly_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."integration_tokens" ADD CONSTRAINT "integration_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."interventions" ADD CONSTRAINT "interventions_pkey" PRIMARY KEY (id);
ALTER TABLE public."invitation_tokens" ADD CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."invite_tokens" ADD CONSTRAINT "invite_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."kpi_alerts" ADD CONSTRAINT "kpi_alerts_pkey" PRIMARY KEY (id);
ALTER TABLE public."meeting_actions" ADD CONSTRAINT "meeting_actions_pkey" PRIMARY KEY (id);
ALTER TABLE public."meetings" ADD CONSTRAINT "meetings_pkey" PRIMARY KEY (id);
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_pkey" PRIMARY KEY (id);
ALTER TABLE public."metric_definitions" ADD CONSTRAINT "metric_definitions_pkey" PRIMARY KEY (id);
ALTER TABLE public."modules" ADD CONSTRAINT "modules_pkey" PRIMARY KEY (id);
ALTER TABLE public."notification_preferences" ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."nptab_report_audit_log" ADD CONSTRAINT "nptab_report_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "nptab_report_queue_pkey" PRIMARY KEY (id);
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "nptab_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."object_access_grants" ADD CONSTRAINT "object_access_grants_pkey" PRIMARY KEY (id);
ALTER TABLE public."object_ownership" ADD CONSTRAINT "object_ownership_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_application_analyses" ADD CONSTRAINT "pending_application_analyses_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_application_snapshots" ADD CONSTRAINT "pending_application_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_applications" ADD CONSTRAINT "pending_applications_pkey" PRIMARY KEY (id);
ALTER TABLE public."polling_state" ADD CONSTRAINT "polling_state_pkey" PRIMARY KEY (id);
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_pkey" PRIMARY KEY (id);
ALTER TABLE public."procurement_excluded_fingerprint" ADD CONSTRAINT "procurement_excluded_fingerprint_pkey" PRIMARY KEY (fingerprint);
ALTER TABLE public."procurement_match_decision" ADD CONSTRAINT "procurement_match_decision_pkey" PRIMARY KEY (id);
ALTER TABLE public."programme" ADD CONSTRAINT "programme_pkey" PRIMARY KEY (code);
ALTER TABLE public."project_notes" ADD CONSTRAINT "project_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_progress_details" ADD CONSTRAINT "project_progress_details_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_summaries" ADD CONSTRAINT "project_summaries_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_uploads" ADD CONSTRAINT "project_uploads_pkey" PRIMARY KEY (id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."projects_oversight" ADD CONSTRAINT "projects_oversight_pkey" PRIMARY KEY (id);
ALTER TABLE public."psip_nag_preview" ADD CONSTRAINT "psip_nag_preview_pkey" PRIMARY KEY (id);
ALTER TABLE public."psip_nag_record" ADD CONSTRAINT "psip_nag_record_pkey" PRIMARY KEY (id);
ALTER TABLE public."psip_nag_settings" ADD CONSTRAINT "psip_nag_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."push_subscriptions" ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."role_permissions" ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);
ALTER TABLE public."saved_filters" ADD CONSTRAINT "saved_filters_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_connection_ai_insights" ADD CONSTRAINT "service_connection_ai_insights_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_connection_monthly_stats" ADD CONSTRAINT "service_connection_monthly_stats_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_connections" ADD CONSTRAINT "service_connections_pkey" PRIMARY KEY (id);
ALTER TABLE public."sub_programme" ADD CONSTRAINT "sub_programme_pkey" PRIMARY KEY (code);
ALTER TABLE public."subtasks" ADD CONSTRAINT "subtasks_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_activities" ADD CONSTRAINT "task_activities_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_activity" ADD CONSTRAINT "task_activity_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_notifications" ADD CONSTRAINT "task_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_templates" ADD CONSTRAINT "task_templates_pkey" PRIMARY KEY (id);
ALTER TABLE public."task_watchers" ADD CONSTRAINT "task_watchers_pkey" PRIMARY KEY (id);
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_document" ADD CONSTRAINT "tender_document_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_field_change" ADD CONSTRAINT "tender_field_change_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_match_review" ADD CONSTRAINT "tender_match_review_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_note" ADD CONSTRAINT "tender_note_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_pkey" PRIMARY KEY (id);
ALTER TABLE public."tender_upload_snapshot" ADD CONSTRAINT "tender_upload_snapshot_pkey" PRIMARY KEY (upload_id, tender_id);
ALTER TABLE public."trello_board" ADD CONSTRAINT "procurement_boards_pkey" PRIMARY KEY (id);
ALTER TABLE public."upload" ADD CONSTRAINT "upload_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_module_access" ADD CONSTRAINT "user_module_access_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_settings" ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "extractions_meeting_prompt_unique" UNIQUE (meeting_id, prompt_version);
ALTER TABLE public."ai_response_cache" ADD CONSTRAINT "ai_response_cache_query_hash_key" UNIQUE (query_hash);
ALTER TABLE public."airstrip_option_types" ADD CONSTRAINT "airstrip_option_types_category_value_key" UNIQUE (category, value);
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_name_key" UNIQUE (name);
ALTER TABLE public."calendar_events" ADD CONSTRAINT "calendar_events_google_id_key" UNIQUE (google_id);
ALTER TABLE public."cjia_ai_insights" ADD CONSTRAINT "cjia_ai_insights_report_month_insight_type_key" UNIQUE (report_month, insight_type);
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_report_date_key" UNIQUE (report_date);
ALTER TABLE public."cjia_monthly_reports" ADD CONSTRAINT "cjia_monthly_reports_report_month_key" UNIQUE (report_month);
ALTER TABLE public."core_permissions" ADD CONSTRAINT "core_permissions_name_key" UNIQUE (name);
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_reference_number_key" UNIQUE (reference_number);
ALTER TABLE public."delayed_projects" ADD CONSTRAINT "delayed_projects_project_reference_key" UNIQUE (project_reference);
ALTER TABLE public."delegated_permissions" ADD CONSTRAINT "delegated_permissions_from_user_id_to_user_id_permission_id_key" UNIQUE (from_user_id, to_user_id, permission_id);
ALTER TABLE public."gcaa_ai_insights" ADD CONSTRAINT "gcaa_ai_insights_report_month_insight_type_key" UNIQUE (report_month, insight_type);
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_report_date_key" UNIQUE (report_date);
ALTER TABLE public."gcaa_monthly_reports" ADD CONSTRAINT "gcaa_monthly_reports_report_month_key" UNIQUE (report_month);
ALTER TABLE public."gpl_chronic_outliers" ADD CONSTRAINT "gpl_chronic_outliers_account_number_service_order_number_key" UNIQUE (account_number, service_order_number);
ALTER TABLE public."gpl_completed" ADD CONSTRAINT "gpl_completed_snapshot_id_account_number_service_order_numb_key" UNIQUE (snapshot_id, account_number, service_order_number);
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_report_date_key" UNIQUE (report_date);
ALTER TABLE public."gpl_daily_summary" ADD CONSTRAINT "gpl_daily_summary_report_date_key" UNIQUE (report_date);
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_report_date_key" UNIQUE (report_date);
ALTER TABLE public."gpl_feeder_cache" ADD CONSTRAINT "gpl_feeder_cache_feeder_id_key" UNIQUE (feeder_id);
ALTER TABLE public."gpl_forecast_cache" ADD CONSTRAINT "gpl_forecast_cache_data_hash_key" UNIQUE (data_hash);
ALTER TABLE public."gpl_forecast_capacity" ADD CONSTRAINT "gpl_forecast_capacity_forecast_date_grid_key" UNIQUE (forecast_date, grid);
ALTER TABLE public."gpl_forecast_demand" ADD CONSTRAINT "gpl_forecast_demand_forecast_date_projected_month_grid_key" UNIQUE (forecast_date, projected_month, grid);
ALTER TABLE public."gpl_forecast_kpi" ADD CONSTRAINT "gpl_forecast_kpi_forecast_date_kpi_name_projected_month_key" UNIQUE (forecast_date, kpi_name, projected_month);
ALTER TABLE public."gpl_forecast_load_shedding" ADD CONSTRAINT "gpl_forecast_load_shedding_forecast_date_period_days_key" UNIQUE (forecast_date, period_days);
ALTER TABLE public."gpl_forecast_reserve" ADD CONSTRAINT "gpl_forecast_reserve_forecast_date_projected_month_key" UNIQUE (forecast_date, projected_month);
ALTER TABLE public."gpl_forecast_station_reliability" ADD CONSTRAINT "gpl_forecast_station_reliabil_forecast_date_station_period__key" UNIQUE (forecast_date, station, period_days);
ALTER TABLE public."gpl_forecast_unit_risk" ADD CONSTRAINT "gpl_forecast_unit_risk_forecast_date_station_unit_number_key" UNIQUE (forecast_date, station, unit_number);
ALTER TABLE public."gpl_outage_cache" ADD CONSTRAINT "gpl_outage_cache_outage_id_key" UNIQUE (outage_id);
ALTER TABLE public."gpl_outstanding" ADD CONSTRAINT "gpl_outstanding_snapshot_id_account_number_service_order_nu_key" UNIQUE (snapshot_id, account_number, service_order_number);
ALTER TABLE public."gpl_power_stations" ADD CONSTRAINT "gpl_power_stations_station_code_key" UNIQUE (station_code);
ALTER TABLE public."gpl_snapshot_metrics" ADD CONSTRAINT "gpl_snapshot_metrics_snapshot_id_track_stage_category_key" UNIQUE (snapshot_id, track, stage, category);
ALTER TABLE public."gpl_snapshots" ADD CONSTRAINT "gpl_snapshots_snapshot_date_key" UNIQUE (snapshot_date);
ALTER TABLE public."gwi_ai_insights" ADD CONSTRAINT "gwi_ai_insights_report_month_insight_type_key" UNIQUE (report_month, insight_type);
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_report_date_key" UNIQUE (report_date);
ALTER TABLE public."gwi_monthly_reports" ADD CONSTRAINT "gwi_monthly_reports_report_month_report_type_key" UNIQUE (report_month, report_type);
ALTER TABLE public."gwi_weekly_reports" ADD CONSTRAINT "gwi_weekly_reports_report_week_key" UNIQUE (report_week);
ALTER TABLE public."integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_provider_key" UNIQUE (user_id, provider);
ALTER TABLE public."invitation_tokens" ADD CONSTRAINT "invitation_tokens_token_key" UNIQUE (token);
ALTER TABLE public."invite_tokens" ADD CONSTRAINT "invite_tokens_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_fireflies_meeting_id_key" UNIQUE (fireflies_meeting_id);
ALTER TABLE public."metric_definitions" ADD CONSTRAINT "metric_definitions_row_number_key" UNIQUE (row_number);
ALTER TABLE public."modules" ADD CONSTRAINT "modules_slug_key" UNIQUE (slug);
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "nptab_reports_reference_number_key" UNIQUE (reference_number);
ALTER TABLE public."object_access_grants" ADD CONSTRAINT "object_access_grants_user_id_object_type_object_id_key" UNIQUE (user_id, object_type, object_id);
ALTER TABLE public."object_ownership" ADD CONSTRAINT "object_ownership_object_type_object_id_key" UNIQUE (object_type, object_id);
ALTER TABLE public."pending_application_snapshots" ADD CONSTRAINT "pending_application_snapshots_agency_snapshot_date_key" UNIQUE (agency, snapshot_date);
ALTER TABLE public."project_summaries" ADD CONSTRAINT "project_summaries_project_id_key" UNIQUE (project_id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_project_id_key" UNIQUE (project_id);
ALTER TABLE public."projects_oversight" ADD CONSTRAINT "projects_oversight_project_id_key" UNIQUE (project_id);
ALTER TABLE public."psip_nag_record" ADD CONSTRAINT "psip_nag_record_agency_tender_id_key" UNIQUE (agency, tender_id);
ALTER TABLE public."role_permissions" ADD CONSTRAINT "role_permissions_role_id_permission_id_key" UNIQUE (role_id, permission_id);
ALTER TABLE public."roles" ADD CONSTRAINT "roles_name_key" UNIQUE (name);
ALTER TABLE public."service_connection_monthly_stats" ADD CONSTRAINT "service_connection_monthly_stats_report_month_key" UNIQUE (report_month);
ALTER TABLE public."task_watchers" ADD CONSTRAINT "task_watchers_task_id_user_id_key" UNIQUE (task_id, user_id);
ALTER TABLE public."trello_board" ADD CONSTRAINT "procurement_boards_trello_board_id_key" UNIQUE (trello_board_id);
ALTER TABLE public."user_settings" ADD CONSTRAINT "user_settings_user_id_key_key" UNIQUE (user_id, key);
ALTER TABLE public."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);
ALTER TABLE public."users" ADD CONSTRAINT "users_google_sub_key" UNIQUE (google_sub);
ALTER TABLE public."users" ADD CONSTRAINT "users_invite_token_key" UNIQUE (invite_token);
ALTER TABLE public."action_item_events" ADD CONSTRAINT "action_item_events_event_type_check" CHECK ((event_type = ANY (ARRAY['created'::text, 'accepted'::text, 'edited'::text, 'rejected'::text, 'status_change'::text, 'dispute_raised'::text, 'dispute_resolved'::text, 'superseded_by'::text, 'supersedes'::text, 'attribution_error_flagged'::text])));
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "action_item_extractions_meeting_type_check" CHECK ((meeting_type = ANY (ARRAY['internal'::text, 'agency'::text, 'external'::text])));
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "action_item_extractions_modality_check" CHECK ((modality = ANY (ARRAY['virtual'::text, 'in_person'::text, 'mixed'::text])));
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "action_item_extractions_review_status_check" CHECK ((review_status = ANY (ARRAY['pending'::text, 'in_review'::text, 'complete'::text, 'skipped'::text, 'failed'::text])));
ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_result_check" CHECK ((result = ANY (ARRAY['success'::text, 'denied'::text, 'error'::text])));
ALTER TABLE public."agency_head_notification_log" ADD CONSTRAINT "agency_head_notification_log_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped_blank'::text, 'skipped_dup_assignee'::text])));
ALTER TABLE public."agency_health_snapshots" ADD CONSTRAINT "agency_health_snapshots_status_check" CHECK ((status = ANY (ARRAY['live'::text, 'building'::text, 'offline'::text])));
ALTER TABLE public."agency_intel_reports" ADD CONSTRAINT "agency_intel_reports_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'scheduled'::text])));
ALTER TABLE public."agency_intel_reports" ADD CONSTRAINT "agency_intel_reports_template_check" CHECK ((template = ANY (ARRAY['plain'::text, 'editorial'::text])));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_day_of_month_check" CHECK (((day_of_month >= 1) AND (day_of_month <= 28)));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_freq_fields_chk" CHECK ((((frequency = ANY (ARRAY['weekly'::text, 'fortnightly'::text])) AND (day_of_week IS NOT NULL) AND (day_of_month IS NULL)) OR ((frequency = 'monthly'::text) AND (day_of_month IS NOT NULL) AND (day_of_week IS NULL))));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_frequency_check" CHECK ((frequency = ANY (ARRAY['weekly'::text, 'fortnightly'::text, 'monthly'::text])));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_recipients_check" CHECK ((cardinality(recipients) > 0));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_send_hour_check" CHECK (((send_hour >= 0) AND (send_hour <= 23)));
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_template_check" CHECK ((template = ANY (ARRAY['plain'::text, 'editorial'::text])));
ALTER TABLE public."ai_response_cache" ADD CONSTRAINT "ai_response_cache_model_tier_check" CHECK ((model_tier = ANY (ARRAY['haiku'::text, 'sonnet'::text, 'opus'::text])));
ALTER TABLE public."ai_usage_log" ADD CONSTRAINT "ai_usage_log_model_tier_check" CHECK ((model_tier = ANY (ARRAY['haiku'::text, 'sonnet'::text, 'opus'::text])));
ALTER TABLE public."airstrip_inspections" ADD CONSTRAINT "airstrip_inspections_surface_condition_check" CHECK ((surface_condition = ANY (ARRAY['Good'::text, 'Satisfactory'::text, 'Poor'::text])));
ALTER TABLE public."airstrip_inspections" ADD CONSTRAINT "airstrip_inspections_vegetation_status_check" CHECK ((vegetation_status = ANY (ARRAY['cleared'::text, 'overgrown'::text, 'partially_cleared'::text])));
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_activity_type_check" CHECK ((activity_type = ANY (ARRAY['weeding_cleaning'::text, 'pothole_patching'::text, 'runway_resurfacing'::text, 'drainage_clearing'::text, 'lighting_papi'::text, 'fencing_repairs'::text, 'vegetation_management'::text, 'marking_signage'::text, 'threshold_overrun'::text, 'other'::text])));
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_verification_method_check" CHECK ((verification_method = ANY (ARRAY['physical_inspection'::text, 'photo_verification'::text, 'whatsapp_photo'::text, 'contractor_report'::text, 'aerial_survey'::text, 'unverified'::text, 'other'::text])));
ALTER TABLE public."airstrip_photos" ADD CONSTRAINT "airstrip_photos_photo_type_check" CHECK ((photo_type = ANY (ARRAY['verification'::text, 'inspection'::text, 'aerial'::text, 'damage'::text, 'general'::text, 'maintenance'::text])));
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_flight_frequency_check" CHECK ((flight_frequency = ANY (ARRAY['Low'::text, 'Moderate'::text, 'High'::text])));
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_region_check" CHECK (((region >= 1) AND (region <= 10)));
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_status_check" CHECK ((status = ANY (ARRAY['operational'::text, 'limited'::text, 'closed'::text, 'under_rehabilitation'::text, 'unknown'::text])));
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_surface_condition_check" CHECK ((surface_condition = ANY (ARRAY['Good'::text, 'Satisfactory'::text, 'Poor'::text])));
ALTER TABLE public."alerts" ADD CONSTRAINT "alerts_severity_check" CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_arrivals_check" CHECK ((arrivals >= 0));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_baggage_uptime_percent_check" CHECK (((baggage_uptime_percent >= (0)::numeric) AND (baggage_uptime_percent <= (100)::numeric)));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_departures_check" CHECK ((departures >= 0));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_on_time_departure_percent_check" CHECK (((on_time_departure_percent >= (0)::numeric) AND (on_time_departure_percent <= (100)::numeric)));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_power_uptime_percent_check" CHECK (((power_uptime_percent >= (0)::numeric) AND (power_uptime_percent <= (100)::numeric)));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_revenue_mtd_check" CHECK ((revenue_mtd >= (0)::numeric));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_revenue_target_check" CHECK ((revenue_target >= (0)::numeric));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_safety_incidents_check" CHECK ((safety_incidents >= 0));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_security_uptime_percent_check" CHECK (((security_uptime_percent >= (0)::numeric) AND (security_uptime_percent <= (100)::numeric)));
ALTER TABLE public."cjia_daily_metrics" ADD CONSTRAINT "cjia_daily_metrics_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."daily_analysis" ADD CONSTRAINT "daily_analysis_analysis_status_check" CHECK (((analysis_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE public."daily_metrics" ADD CONSTRAINT "daily_metrics_value_type_check" CHECK (((value_type)::text = ANY ((ARRAY['number'::character varying, 'text'::character varying, 'percentage'::character varying, 'currency'::character varying, 'error'::character varying, 'empty'::character varying])::text[])));
ALTER TABLE public."daily_uploads" ADD CONSTRAINT "daily_uploads_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'preview'::character varying, 'confirmed'::character varying, 'failed'::character varying, 'replaced'::character varying])::text[])));
ALTER TABLE public."delayed_projects" ADD CONSTRAINT "delayed_projects_completion_percent_check" CHECK (((completion_percent >= (0)::numeric) AND (completion_percent <= (100)::numeric)));
ALTER TABLE public."failed_extractions" ADD CONSTRAINT "failed_extractions_failure_reason_check" CHECK ((failure_reason = ANY (ARRAY['claude_error'::text, 'malformed_json'::text, 'transcript_unavailable'::text, 'speaker_collapse_virtual'::text, 'transcript_partial'::text, 'quota_exceeded'::text, 'other'::text])));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_active_aircraft_registrations_check" CHECK ((active_aircraft_registrations >= 0));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_compliance_rate_percent_check" CHECK (((compliance_rate_percent >= (0)::numeric) AND (compliance_rate_percent <= (100)::numeric)));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_incident_reports_check" CHECK ((incident_reports >= 0));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_inspections_completed_mtd_check" CHECK ((inspections_completed_mtd >= 0));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_inspections_target_check" CHECK ((inspections_target >= 0));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_renewals_pending_check" CHECK ((renewals_pending >= 0));
ALTER TABLE public."gcaa_daily_metrics" ADD CONSTRAINT "gcaa_daily_metrics_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."gpl_completed" ADD CONSTRAINT "gpl_completed_stage_check" CHECK ((stage = ANY (ARRAY['metering'::text, 'design'::text, 'execution'::text])));
ALTER TABLE public."gpl_completed" ADD CONSTRAINT "gpl_completed_track_check" CHECK ((track = ANY (ARRAY['A'::text, 'B'::text])));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_active_outages_check" CHECK ((active_outages >= 0));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_affected_customers_check" CHECK ((affected_customers >= 0));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_avg_restoration_time_hours_check" CHECK ((avg_restoration_time_hours >= (0)::numeric));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_capacity_mw_check" CHECK ((capacity_mw > (0)::numeric));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_collection_rate_percent_check" CHECK (((collection_rate_percent >= (0)::numeric) AND (collection_rate_percent <= (100)::numeric)));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_current_load_mw_check" CHECK ((current_load_mw >= (0)::numeric));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_hfo_generation_percent_check" CHECK (((hfo_generation_percent >= (0)::numeric) AND (hfo_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_lfo_generation_percent_check" CHECK (((lfo_generation_percent >= (0)::numeric) AND (lfo_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_other_generation_percent_check" CHECK (((other_generation_percent >= (0)::numeric) AND (other_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_solar_generation_percent_check" CHECK (((solar_generation_percent >= (0)::numeric) AND (solar_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_daily_metrics" ADD CONSTRAINT "gpl_daily_metrics_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_collection_rate_percent_check" CHECK (((collection_rate_percent >= (0)::numeric) AND (collection_rate_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_fleet_availability_percent_check" CHECK (((fleet_availability_percent >= (0)::numeric) AND (fleet_availability_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_hfo_generation_percent_check" CHECK (((hfo_generation_percent >= (0)::numeric) AND (hfo_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_lfo_generation_percent_check" CHECK (((lfo_generation_percent >= (0)::numeric) AND (lfo_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_other_generation_percent_check" CHECK (((other_generation_percent >= (0)::numeric) AND (other_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_solar_generation_percent_check" CHECK (((solar_generation_percent >= (0)::numeric) AND (solar_generation_percent <= (100)::numeric)));
ALTER TABLE public."gpl_dbis_daily" ADD CONSTRAINT "gpl_dbis_daily_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."gpl_outstanding" ADD CONSTRAINT "gpl_outstanding_stage_check" CHECK ((stage = ANY (ARRAY['metering'::text, 'design'::text, 'execution'::text])));
ALTER TABLE public."gpl_outstanding" ADD CONSTRAINT "gpl_outstanding_track_check" CHECK ((track = ANY (ARRAY['A'::text, 'B'::text])));
ALTER TABLE public."gpl_power_stations" ADD CONSTRAINT "gpl_power_stations_station_type_check" CHECK (((station_type)::text = ANY ((ARRAY['fossil'::character varying, 'solar'::character varying, 'hydro'::character varying, 'wind'::character varying])::text[])));
ALTER TABLE public."gpl_snapshot_metrics" ADD CONSTRAINT "gpl_snapshot_metrics_category_check" CHECK ((category = ANY (ARRAY['outstanding'::text, 'completed'::text])));
ALTER TABLE public."gwi_ai_insights" ADD CONSTRAINT "gwi_ai_insights_insight_type_check" CHECK ((insight_type = ANY (ARRAY['monthly_analysis'::text, 'financial'::text, 'operational'::text, 'customer_service'::text, 'procurement'::text])));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_active_disruptions_check" CHECK ((active_disruptions >= 0));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_avg_repair_time_hours_check" CHECK ((avg_repair_time_hours >= (0)::numeric));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_avg_response_time_hours_check" CHECK ((avg_response_time_hours >= (0)::numeric));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_nrw_percent_check" CHECK (((nrw_percent >= (0)::numeric) AND (nrw_percent <= (100)::numeric)));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_water_billed_cubic_meters_check" CHECK ((water_billed_cubic_meters >= (0)::numeric));
ALTER TABLE public."gwi_daily_metrics" ADD CONSTRAINT "gwi_daily_metrics_water_produced_cubic_meters_check" CHECK ((water_produced_cubic_meters >= (0)::numeric));
ALTER TABLE public."gwi_uploaded_files" ADD CONSTRAINT "gwi_uploaded_files_report_type_check" CHECK ((report_type = ANY (ARRAY['management'::text, 'cscr'::text, 'procurement'::text])));
ALTER TABLE public."interventions" ADD CONSTRAINT "interventions_intervention_type_check" CHECK ((intervention_type = ANY (ARRAY['SITE_VISIT'::text, 'CONTRACTOR_MEETING'::text, 'ESCALATION_TO_PS'::text, 'BOND_WARNING'::text, 'TERMINATION_NOTICE'::text, 'TIMELINE_EXTENSION'::text, 'VARIATION_ORDER'::text, 'OTHER'::text])));
ALTER TABLE public."interventions" ADD CONSTRAINT "interventions_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'OVERDUE'::text])));
ALTER TABLE public."invite_tokens" ADD CONSTRAINT "invite_tokens_type_check" CHECK (((type)::text = ANY ((ARRAY['invite'::character varying, 'password_reset'::character varying])::text[])));
ALTER TABLE public."kpi_alerts" ADD CONSTRAINT "kpi_alerts_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));
ALTER TABLE public."meeting_actions" ADD CONSTRAINT "meeting_actions_confidence_check" CHECK ((confidence = ANY (ARRAY['AUTO_CREATE'::text, 'NEEDS_REVIEW'::text])));
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_detected_modality_check" CHECK ((detected_modality = ANY (ARRAY['virtual'::text, 'in_person'::text, 'mixed'::text])));
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_detected_type_check" CHECK ((detected_type = ANY (ARRAY['internal'::text, 'agency'::text, 'external'::text])));
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_pipeline_action_check" CHECK ((pipeline_action = ANY (ARRAY['extracted'::text, 'skipped_out_of_scope'::text, 'queued'::text, 'failed'::text, 'manually_processed'::text])));
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_importance_tier_check" CHECK ((importance_tier = ANY (ARRAY['critical'::text, 'important'::text, 'informational'::text])));
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "no_em_dash_dequeue_reason" CHECK (((dequeue_reason IS NULL) OR (POSITION((chr(8212)) IN (dequeue_reason)) = 0)));
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "no_em_dash_reason" CHECK (((reason IS NULL) OR (POSITION((chr(8212)) IN (reason)) = 0)));
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "no_em_dash_closure_reason" CHECK (((closure_reason IS NULL) OR (POSITION((chr(8212)) IN (closure_reason)) = 0)));
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "no_em_dash_narrative" CHECK ((POSITION((chr(8212)) IN (narrative)) = 0));
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "period_valid" CHECK ((period_end >= period_start));
ALTER TABLE public."object_access_grants" ADD CONSTRAINT "object_access_grants_access_level_check" CHECK ((access_level = ANY (ARRAY['view'::text, 'edit'::text, 'manage'::text])));
ALTER TABLE public."pending_application_analyses" ADD CONSTRAINT "pending_application_analyses_agency_check" CHECK ((agency = ANY (ARRAY['GPL'::text, 'GWI'::text])));
ALTER TABLE public."pending_application_analyses" ADD CONSTRAINT "pending_application_analyses_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public."pending_application_snapshots" ADD CONSTRAINT "pending_application_snapshots_agency_check" CHECK ((agency = ANY (ARRAY['GPL'::text, 'GWI'::text])));
ALTER TABLE public."pending_applications" ADD CONSTRAINT "pending_applications_agency_check" CHECK ((agency = ANY (ARRAY['GPL'::text, 'GWI'::text])));
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_approval_state_check" CHECK ((approval_state = ANY (ARRAY['none'::text, 'proposed'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_decision_type_check" CHECK ((decision_type = ANY (ARRAY['archive'::text, 'unarchive'::text, 'resurrect'::text, 'revoke_tracking'::text, 'skip'::text, 'permanent_ignore'::text, 'match'::text, 'create_from_review'::text, 'assign_stage'::text, 'status_change'::text, 'system_collapse'::text])));
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_target_kind_check" CHECK ((target_kind = ANY (ARRAY['tender'::text, 'review_row'::text])));
ALTER TABLE public."procurement_excluded_fingerprint" ADD CONSTRAINT "procurement_excluded_fingerprint_reason_code_check" CHECK ((reason_code = ANY (ARRAY['header_or_subtotal'::text, 'not_a_tender'::text, 'agency_error'::text])));
ALTER TABLE public."procurement_match_decision" ADD CONSTRAINT "procurement_match_decision_reason_code_check" CHECK ((reason_code = ANY (ARRAY['supersedes'::text, 'duplicates'::text])));
ALTER TABLE public."project_notes" ADD CONSTRAINT "project_notes_note_type_check" CHECK ((note_type = ANY (ARRAY['general'::text, 'escalation'::text, 'status_update'::text])));
ALTER TABLE public."projects" ADD CONSTRAINT "projects_health_check" CHECK ((health = ANY (ARRAY['green'::text, 'amber'::text, 'red'::text])));
ALTER TABLE public."projects_oversight" ADD CONSTRAINT "projects_oversight_completion_percent_check" CHECK (((completion_percent >= 0) AND (completion_percent <= 100)));
ALTER TABLE public."projects_oversight" ADD CONSTRAINT "projects_oversight_region_check" CHECK (((region >= 1) AND (region <= 10)));
ALTER TABLE public."psip_nag_settings" ADD CONSTRAINT "psip_nag_settings_id_check" CHECK ((id = 1));
ALTER TABLE public."push_subscriptions" ADD CONSTRAINT "push_subscriptions_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'macos'::text, 'android'::text, 'windows'::text, 'other'::text])));
ALTER TABLE public."service_connection_ai_insights" ADD CONSTRAINT "service_connection_ai_insights_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public."service_connections" ADD CONSTRAINT "service_connections_job_complexity_check" CHECK ((job_complexity = ANY (ARRAY['simple'::text, 'extensive'::text, 'unknown'::text])));
ALTER TABLE public."service_connections" ADD CONSTRAINT "service_connections_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text, 'legacy_excluded'::text])));
ALTER TABLE public."service_connections" ADD CONSTRAINT "service_connections_track_check" CHECK ((track = ANY (ARRAY['A'::text, 'B'::text, 'Design'::text, 'unknown'::text])));
ALTER TABLE public."tasks" ADD CONSTRAINT "extraction_provenance_required" CHECK (((source = 'manual'::text) OR ((extraction_id IS NOT NULL) AND (source_meeting_id IS NOT NULL) AND (extraction_item_idx IS NOT NULL) AND (confidence_overall IS NOT NULL))));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_agency_check" CHECK (((agency IS NULL) OR (agency = ANY (ARRAY['GPL'::text, 'GWI'::text, 'CJIA'::text, 'GCAA'::text, 'MARAD'::text, 'HECI'::text, 'HAS'::text, 'Ministry'::text]))));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_linked_source_type_check" CHECK (((linked_source_type IS NULL) OR (linked_source_type = ANY (ARRAY['tender'::text, 'project'::text]))));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'extraction'::text])));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'active'::text, 'blocked'::text, 'done'::text, 'awaiting_verification'::text, 'superseded'::text])));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_verb_category_check" CHECK (((verb_category = ANY (ARRAY['correspondence'::text, 'decision'::text, 'information'::text, 'scheduling'::text, 'project_update'::text, 'analysis'::text])) OR (verb_category IS NULL)));
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_visibility_scope_check" CHECK ((visibility_scope = ANY (ARRAY['agency_normal'::text, 'dg_only'::text])));
ALTER TABLE public."tender" ADD CONSTRAINT "tender_archive_consistency" CHECK ((((archived_at IS NULL) AND (archived_by IS NULL) AND (archived_role IS NULL) AND (archive_reason_code IS NULL)) OR ((archived_at IS NOT NULL) AND (archived_by IS NOT NULL) AND (archived_role IS NOT NULL) AND (archive_reason_code IS NOT NULL))));
ALTER TABLE public."tender" ADD CONSTRAINT "tender_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'missing_pending_decision'::text, 'withdrawn'::text, 'completed_outside_psip'::text, 'agency_error'::text, 'archived'::text])));
ALTER TABLE public."tender_match_review" ADD CONSTRAINT "tender_match_review_review_reason_check" CHECK ((review_reason = ANY (ARRAY['ambiguous_match'::text, 'ambiguous_stage'::text])));
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_attribution" CHECK (((upload_id IS NOT NULL) OR (actor_id IS NOT NULL)));
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_event_type_check" CHECK ((event_type = ANY (ARRAY['disappeared'::text, 'reappeared'::text])));
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_status_after_check" CHECK ((status_after = ANY (ARRAY['active'::text, 'missing_pending_decision'::text, 'withdrawn'::text, 'completed_outside_psip'::text, 'agency_error'::text, 'archived'::text])));
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_status_before_check" CHECK ((status_before = ANY (ARRAY['active'::text, 'missing_pending_decision'::text, 'withdrawn'::text, 'completed_outside_psip'::text, 'agency_error'::text, 'archived'::text])));
ALTER TABLE public."user_module_access" ADD CONSTRAINT "uma_agency_values" CHECK (((agency IS NULL) OR (lower(agency) = ANY (ARRAY['gpl'::text, 'gwi'::text, 'cjia'::text, 'gcaa'::text, 'marad'::text, 'heci'::text, 'has'::text]))));
ALTER TABLE public."user_module_access" ADD CONSTRAINT "user_module_access_access_type_check" CHECK ((access_type = ANY (ARRAY['grant'::text, 'deny'::text])));
ALTER TABLE public."users" ADD CONSTRAINT "users_agency_check" CHECK (((agency IS NULL) OR (agency = ANY (ARRAY['GPL'::text, 'GWI'::text, 'CJIA'::text, 'GCAA'::text, 'MARAD'::text, 'HECI'::text, 'HAS'::text]))));
ALTER TABLE public."users" ADD CONSTRAINT "users_agency_values" CHECK (((agency IS NULL) OR (lower(agency) = ANY (ARRAY['gpl'::text, 'gwi'::text, 'cjia'::text, 'gcaa'::text, 'marad'::text, 'heci'::text, 'has'::text]))));
ALTER TABLE public."users" ADD CONSTRAINT "users_closure_mode_check" CHECK ((closure_mode = ANY (ARRAY['self_close'::text, 'dg_managed'::text])));
ALTER TABLE public."users" ADD CONSTRAINT "users_role_check" CHECK ((role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'parl_sec'::text, 'agency_admin'::text, 'officer'::text, 'system'::text])));
ALTER TABLE public."users" ADD CONSTRAINT "users_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text, 'suspended'::text, 'archived'::text])));
ALTER TABLE public."action_item_events" ADD CONSTRAINT "action_item_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE public."action_item_events" ADD CONSTRAINT "action_item_events_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public."action_item_extractions" ADD CONSTRAINT "action_item_extractions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."agency_head_notification_log" ADD CONSTRAINT "agency_head_notification_log_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE public."agency_intel_reports" ADD CONSTRAINT "agency_intel_reports_sent_by_user_id_fkey" FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."agency_psip_focal_point" ADD CONSTRAINT "agency_psip_focal_point_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."agency_psip_focal_point_history" ADD CONSTRAINT "agency_psip_focal_point_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE public."agency_scheduled_reports" ADD CONSTRAINT "agency_scheduled_reports_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."ai_metric_snapshot" ADD CONSTRAINT "ai_metric_snapshot_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."airstrip_inspections" ADD CONSTRAINT "airstrip_inspections_airstrip_id_fkey" FOREIGN KEY (airstrip_id) REFERENCES airstrips(id) ON DELETE CASCADE;
ALTER TABLE public."airstrip_inspections" ADD CONSTRAINT "airstrip_inspections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_airstrip_id_fkey" FOREIGN KEY (airstrip_id) REFERENCES airstrips(id) ON DELETE CASCADE;
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."airstrip_maintenance_log" ADD CONSTRAINT "airstrip_maintenance_log_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE public."airstrip_photos" ADD CONSTRAINT "airstrip_photos_airstrip_id_fkey" FOREIGN KEY (airstrip_id) REFERENCES airstrips(id) ON DELETE CASCADE;
ALTER TABLE public."airstrip_photos" ADD CONSTRAINT "airstrip_photos_maintenance_log_id_fkey" FOREIGN KEY (maintenance_log_id) REFERENCES airstrip_maintenance_log(id) ON DELETE SET NULL;
ALTER TABLE public."airstrip_photos" ADD CONSTRAINT "airstrip_photos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public."airstrip_status_log" ADD CONSTRAINT "airstrip_status_log_airstrip_id_fkey" FOREIGN KEY (airstrip_id) REFERENCES airstrips(id) ON DELETE CASCADE;
ALTER TABLE public."airstrip_status_log" ADD CONSTRAINT "airstrip_status_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."airstrips" ADD CONSTRAINT "airstrips_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."customer_application_activity_log" ADD CONSTRAINT "customer_application_activity_log_application_id_fkey" FOREIGN KEY (application_id) REFERENCES customer_applications(id) ON DELETE CASCADE;
ALTER TABLE public."customer_application_activity_log" ADD CONSTRAINT "customer_application_activity_log_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."customer_application_documents" ADD CONSTRAINT "customer_application_documents_application_id_fkey" FOREIGN KEY (application_id) REFERENCES customer_applications(id) ON DELETE CASCADE;
ALTER TABLE public."customer_application_documents" ADD CONSTRAINT "customer_application_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."customer_application_notes" ADD CONSTRAINT "customer_application_notes_application_id_fkey" FOREIGN KEY (application_id) REFERENCES customer_applications(id) ON DELETE CASCADE;
ALTER TABLE public."customer_application_notes" ADD CONSTRAINT "customer_application_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."customer_applications" ADD CONSTRAINT "customer_applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."daily_analysis" ADD CONSTRAINT "daily_analysis_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES daily_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."daily_metrics" ADD CONSTRAINT "daily_metrics_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES daily_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."daily_uploads" ADD CONSTRAINT "daily_uploads_replaced_by_fkey" FOREIGN KEY (replaced_by) REFERENCES daily_uploads(id);
ALTER TABLE public."delayed_project_snapshots" ADD CONSTRAINT "delayed_project_snapshots_project_id_fkey" FOREIGN KEY (project_id) REFERENCES delayed_projects(id) ON DELETE CASCADE;
ALTER TABLE public."delegated_permissions" ADD CONSTRAINT "delegated_permissions_from_user_id_fkey" FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."delegated_permissions" ADD CONSTRAINT "delegated_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES core_permissions(id) ON DELETE CASCADE;
ALTER TABLE public."delegated_permissions" ADD CONSTRAINT "delegated_permissions_to_user_id_fkey" FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public."document_queries" ADD CONSTRAINT "document_queries_document_id_fkey" FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE public."funding_distributions" ADD CONSTRAINT "funding_distributions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
ALTER TABLE public."gpl_analysis" ADD CONSTRAINT "gpl_analysis_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES gpl_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_chronic_outliers" ADD CONSTRAINT "gpl_chronic_outliers_first_seen_snapshot_id_fkey" FOREIGN KEY (first_seen_snapshot_id) REFERENCES gpl_snapshots(id);
ALTER TABLE public."gpl_chronic_outliers" ADD CONSTRAINT "gpl_chronic_outliers_latest_snapshot_id_fkey" FOREIGN KEY (latest_snapshot_id) REFERENCES gpl_snapshots(id);
ALTER TABLE public."gpl_completed" ADD CONSTRAINT "gpl_completed_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES gpl_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_daily_stations" ADD CONSTRAINT "gpl_daily_stations_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES gpl_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_daily_summary" ADD CONSTRAINT "gpl_daily_summary_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES gpl_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_daily_units" ADD CONSTRAINT "gpl_daily_units_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES gpl_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_kpi_ai_analysis" ADD CONSTRAINT "gpl_kpi_ai_analysis_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES gpl_kpi_uploads(id) ON DELETE SET NULL;
ALTER TABLE public."gpl_outstanding" ADD CONSTRAINT "gpl_outstanding_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES gpl_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public."gpl_snapshot_metrics" ADD CONSTRAINT "gpl_snapshot_metrics_snapshot_id_fkey" FOREIGN KEY (snapshot_id) REFERENCES gpl_snapshots(id) ON DELETE CASCADE;
ALTER TABLE public."interventions" ADD CONSTRAINT "interventions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES delayed_projects(id) ON DELETE CASCADE;
ALTER TABLE public."invitation_tokens" ADD CONSTRAINT "invitation_tokens_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."invitation_tokens" ADD CONSTRAINT "invitation_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."invitation_tokens" ADD CONSTRAINT "invitation_tokens_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public."meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE public."meeting_actions" ADD CONSTRAINT "meeting_actions_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE public."meetings_seen" ADD CONSTRAINT "meetings_seen_extraction_id_fkey" FOREIGN KEY (extraction_id) REFERENCES action_item_extractions(id);
ALTER TABLE public."nptab_report_audit_log" ADD CONSTRAINT "nptab_report_audit_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public."nptab_report_audit_log" ADD CONSTRAINT "nptab_report_audit_log_report_id_fkey" FOREIGN KEY (report_id) REFERENCES nptab_reports(id) ON DELETE CASCADE;
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "nptab_report_queue_dequeued_by_fkey" FOREIGN KEY (dequeued_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "nptab_report_queue_included_in_report_id_fkey" FOREIGN KEY (included_in_report_id) REFERENCES nptab_reports(id) ON DELETE SET NULL;
ALTER TABLE public."nptab_report_queue" ADD CONSTRAINT "nptab_report_queue_queued_by_fkey" FOREIGN KEY (queued_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public."nptab_reports" ADD CONSTRAINT "nptab_reports_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public."object_access_grants" ADD CONSTRAINT "object_access_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."object_access_grants" ADD CONSTRAINT "object_access_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."object_ownership" ADD CONSTRAINT "object_ownership_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE public."procurement_decision" ADD CONSTRAINT "procurement_decision_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE public."procurement_excluded_fingerprint" ADD CONSTRAINT "procurement_excluded_fingerprint_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES users(id);
ALTER TABLE public."procurement_match_decision" ADD CONSTRAINT "procurement_match_decision_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES users(id);
ALTER TABLE public."procurement_match_decision" ADD CONSTRAINT "procurement_match_decision_resolution_tender_id_fkey" FOREIGN KEY (resolution_tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."project_notes" ADD CONSTRAINT "project_notes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_notes" ADD CONSTRAINT "project_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."project_progress_details" ADD CONSTRAINT "project_progress_details_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
ALTER TABLE public."project_summaries" ADD CONSTRAINT "project_summaries_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."projects" ADD CONSTRAINT "projects_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."psip_nag_record" ADD CONSTRAINT "psip_nag_record_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."psip_nag_settings" ADD CONSTRAINT "psip_nag_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES core_permissions(id) ON DELETE CASCADE;
ALTER TABLE public."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_filters" ADD CONSTRAINT "saved_filters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."sub_programme" ADD CONSTRAINT "sub_programme_programme_code_fkey" FOREIGN KEY (programme_code) REFERENCES programme(code);
ALTER TABLE public."subtasks" ADD CONSTRAINT "subtasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."subtasks" ADD CONSTRAINT "subtasks_task_fk" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public."task_activity" ADD CONSTRAINT "task_activity_task_fk" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public."task_activity" ADD CONSTRAINT "task_activity_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES task_comments(id);
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_task_fk" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."task_templates" ADD CONSTRAINT "task_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."task_templates" ADD CONSTRAINT "task_templates_recurrence_assignee_id_fkey" FOREIGN KEY (recurrence_assignee_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."task_watchers" ADD CONSTRAINT "task_watchers_added_by_user_id_fkey" FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."task_watchers" ADD CONSTRAINT "task_watchers_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public."task_watchers" ADD CONSTRAINT "task_watchers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES users(id);
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_delegated_to_id_fkey" FOREIGN KEY (delegated_to_id) REFERENCES users(id);
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_extraction_id_fkey" FOREIGN KEY (extraction_id) REFERENCES action_item_extractions(id);
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_referred_to_minister_by_fkey" FOREIGN KEY (referred_to_minister_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_supersedes_id_fkey" FOREIGN KEY (supersedes_id) REFERENCES tasks(id);
ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES users(id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_first_seen_upload_id_fkey" FOREIGN KEY (first_seen_upload_id) REFERENCES upload(id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_last_seen_upload_id_fkey" FOREIGN KEY (last_seen_upload_id) REFERENCES upload(id);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_programme_code_fkey" FOREIGN KEY (programme_code) REFERENCES programme(code);
ALTER TABLE public."tender" ADD CONSTRAINT "tender_sub_programme_code_fkey" FOREIGN KEY (sub_programme_code) REFERENCES sub_programme(code);
ALTER TABLE public."tender_document" ADD CONSTRAINT "tender_document_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_document" ADD CONSTRAINT "tender_document_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public."tender_field_change" ADD CONSTRAINT "tender_field_change_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE public."tender_field_change" ADD CONSTRAINT "tender_field_change_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_field_change" ADD CONSTRAINT "tender_field_change_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES upload(id);
ALTER TABLE public."tender_match_review" ADD CONSTRAINT "tender_match_review_resolution_tender_id_fkey" FOREIGN KEY (resolution_tender_id) REFERENCES tender(id);
ALTER TABLE public."tender_match_review" ADD CONSTRAINT "tender_match_review_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE public."tender_match_review" ADD CONSTRAINT "tender_match_review_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES upload(id) ON DELETE CASCADE;
ALTER TABLE public."tender_note" ADD CONSTRAINT "tender_note_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."tender_note" ADD CONSTRAINT "tender_note_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_presence_event" ADD CONSTRAINT "tender_presence_event_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES upload(id);
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES users(id);
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES procurement_decision(id) ON DELETE SET NULL;
ALTER TABLE public."tender_status_decision" ADD CONSTRAINT "tender_status_decision_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_upload_snapshot" ADD CONSTRAINT "tender_upload_snapshot_tender_id_fkey" FOREIGN KEY (tender_id) REFERENCES tender(id) ON DELETE CASCADE;
ALTER TABLE public."tender_upload_snapshot" ADD CONSTRAINT "tender_upload_snapshot_upload_id_fkey" FOREIGN KEY (upload_id) REFERENCES upload(id) ON DELETE CASCADE;
ALTER TABLE public."upload" ADD CONSTRAINT "upload_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public."user_module_access" ADD CONSTRAINT "user_module_access_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."user_module_access" ADD CONSTRAINT "user_module_access_module_id_fkey" FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE;
ALTER TABLE public."user_module_access" ADD CONSTRAINT "user_module_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."users" ADD CONSTRAINT "users_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- indexes ----------
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log USING btree (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON public.admin_audit_log USING btree (target_user_id);
CREATE INDEX agency_health_slug_idx ON public.agency_health_snapshots USING btree (agency_slug, computed_at DESC);
CREATE INDEX idx_activity_logs_action ON public.activity_logs USING btree (action);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at DESC);
CREATE INDEX idx_activity_logs_object ON public.activity_logs USING btree (object_type, object_id);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);
CREATE INDEX idx_agency_head_notif_log_agency_sent ON public.agency_head_notification_log USING btree (agency, sent_at DESC);
CREATE INDEX idx_agency_head_notif_log_task ON public.agency_head_notification_log USING btree (task_id);
CREATE INDEX idx_agency_intel_reports_agency_sent ON public.agency_intel_reports USING btree (agency, sent_at DESC);
CREATE INDEX idx_agency_intel_reports_user_sent ON public.agency_intel_reports USING btree (sent_by_user_id, sent_at DESC);
CREATE INDEX idx_agency_intel_reports_user_source_sent ON public.agency_intel_reports USING btree (sent_by_user_id, source, sent_at DESC);
CREATE INDEX idx_agency_psip_focal_point_history_agency_time ON public.agency_psip_focal_point_history USING btree (agency, changed_at DESC);
CREATE INDEX idx_agency_scheduled_reports_active_next_run ON public.agency_scheduled_reports USING btree (active, next_run_at) WHERE (active = true);
CREATE INDEX idx_agency_scheduled_reports_agency ON public.agency_scheduled_reports USING btree (agency);
CREATE INDEX idx_agency_scheduled_reports_created_by ON public.agency_scheduled_reports USING btree (created_by_user_id);
CREATE INDEX idx_ai_cache_expires ON public.ai_response_cache USING btree (expires_at);
CREATE INDEX idx_ai_cache_hash ON public.ai_response_cache USING btree (query_hash);
CREATE INDEX idx_ai_chat_sessions_session ON public.ai_chat_sessions USING btree (session_id);
CREATE INDEX idx_ai_chat_sessions_updated ON public.ai_chat_sessions USING btree (updated_at DESC);
CREATE INDEX idx_ai_snapshot_date ON public.ai_metric_snapshot USING btree (snapshot_date);
CREATE UNIQUE INDEX idx_ai_snapshot_user_date ON public.ai_metric_snapshot USING btree (user_id, snapshot_date);
CREATE INDEX idx_ai_usage_created ON public.ai_usage_log USING btree (created_at);
CREATE INDEX idx_ai_usage_session ON public.ai_usage_log USING btree (session_id);
CREATE INDEX idx_ai_usage_tier ON public.ai_usage_log USING btree (model_tier);
CREATE INDEX idx_airstrip_inspections_airstrip ON public.airstrip_inspections USING btree (airstrip_id);
CREATE INDEX idx_airstrip_inspections_date ON public.airstrip_inspections USING btree (inspection_date DESC);
CREATE INDEX idx_airstrip_maintenance_airstrip ON public.airstrip_maintenance_log USING btree (airstrip_id);
CREATE INDEX idx_airstrip_maintenance_date ON public.airstrip_maintenance_log USING btree (performed_date DESC);
CREATE INDEX idx_airstrip_maintenance_quarter ON public.airstrip_maintenance_log USING btree (quarter);
CREATE INDEX idx_airstrip_option_types_category ON public.airstrip_option_types USING btree (category, sort_order);
CREATE INDEX idx_airstrip_photos_airstrip ON public.airstrip_photos USING btree (airstrip_id);
CREATE INDEX idx_airstrip_photos_maintenance ON public.airstrip_photos USING btree (maintenance_log_id);
CREATE INDEX idx_airstrip_status_log_airstrip ON public.airstrip_status_log USING btree (airstrip_id);
CREATE INDEX idx_airstrips_region ON public.airstrips USING btree (region);
CREATE INDEX idx_airstrips_status ON public.airstrips USING btree (status);
CREATE INDEX idx_alerts_active ON public.alerts USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_app_notes_application ON public.customer_application_notes USING btree (application_id);
CREATE INDEX idx_app_notes_created ON public.customer_application_notes USING btree (created_at DESC);
CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at DESC);
CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);
CREATE INDEX idx_cjia_date ON public.cjia_daily_metrics USING btree (report_date DESC);
CREATE INDEX idx_cjia_insights_month ON public.cjia_ai_insights USING btree (report_month DESC);
CREATE INDEX idx_cjia_monthly_month ON public.cjia_monthly_reports USING btree (report_month DESC);
CREATE INDEX idx_customer_app_activity_app ON public.customer_application_activity_log USING btree (application_id);
CREATE INDEX idx_customer_app_activity_at ON public.customer_application_activity_log USING btree (performed_at DESC);
CREATE INDEX idx_customer_app_docs_app ON public.customer_application_documents USING btree (application_id);
CREATE INDEX idx_customer_applications_agency ON public.customer_applications USING btree (agency);
CREATE INDEX idx_customer_applications_created_by ON public.customer_applications USING btree (created_by);
CREATE INDEX idx_customer_applications_status ON public.customer_applications USING btree (status);
CREATE INDEX idx_customer_applications_submitted_at ON public.customer_applications USING btree (submitted_at DESC);
CREATE INDEX idx_daily_analysis_date ON public.daily_analysis USING btree (data_date DESC);
CREATE INDEX idx_daily_analysis_status ON public.daily_analysis USING btree (analysis_status);
CREATE INDEX idx_daily_analysis_upload ON public.daily_analysis USING btree (upload_id);
CREATE INDEX idx_daily_metrics_agency ON public.daily_metrics USING btree (agency);
CREATE INDEX idx_daily_metrics_category ON public.daily_metrics USING btree (category);
CREATE INDEX idx_daily_metrics_date ON public.daily_metrics USING btree (data_date DESC);
CREATE INDEX idx_daily_metrics_name ON public.daily_metrics USING btree (metric_name);
CREATE UNIQUE INDEX idx_daily_metrics_unique ON public.daily_metrics USING btree (data_date, row_number, metric_name);
CREATE INDEX idx_daily_metrics_upload ON public.daily_metrics USING btree (upload_id);
CREATE INDEX idx_daily_uploads_created ON public.daily_uploads USING btree (created_at DESC);
CREATE INDEX idx_daily_uploads_date ON public.daily_uploads USING btree (data_date DESC);
CREATE INDEX idx_daily_uploads_status ON public.daily_uploads USING btree (status);
CREATE INDEX idx_daily_uploads_user ON public.daily_uploads USING btree (uploaded_by);
CREATE INDEX idx_delegated_permissions_from ON public.delegated_permissions USING btree (from_user_id);
CREATE INDEX idx_delegated_permissions_to ON public.delegated_permissions USING btree (to_user_id);
CREATE INDEX idx_documents_agency ON public.documents USING btree (agency);
CREATE UNIQUE INDEX idx_documents_google_drive_file_id ON public.documents USING btree (google_drive_file_id) WHERE (google_drive_file_id IS NOT NULL);
CREATE INDEX idx_documents_sync_source ON public.documents USING btree (sync_source) WHERE (sync_source IS NOT NULL);
CREATE INDEX idx_documents_type ON public.documents USING btree (document_type);
CREATE INDEX idx_documents_uploaded ON public.documents USING btree (uploaded_at);
CREATE INDEX idx_dp_completion ON public.delayed_projects USING btree (completion_percent);
CREATE INDEX idx_dp_contract_value ON public.delayed_projects USING btree (contract_value DESC);
CREATE INDEX idx_dp_project_end_date ON public.delayed_projects USING btree (project_end_date);
CREATE INDEX idx_dp_ref ON public.delayed_projects USING btree (project_reference);
CREATE INDEX idx_dp_region ON public.delayed_projects USING btree (region);
CREATE INDEX idx_dp_status ON public.delayed_projects USING btree (status);
CREATE INDEX idx_dp_sub_agency ON public.delayed_projects USING btree (sub_agency);
CREATE INDEX idx_dps_date ON public.delayed_project_snapshots USING btree (snapshot_date);
CREATE INDEX idx_dps_project_date ON public.delayed_project_snapshots USING btree (project_id, snapshot_date DESC);
CREATE UNIQUE INDEX idx_dps_unique_project_date ON public.delayed_project_snapshots USING btree (project_id, snapshot_date);
CREATE INDEX idx_events_task ON public.action_item_events USING btree (task_id, occurred_at DESC);
CREATE INDEX idx_extension_requests_status ON public.deadline_extension_requests USING btree (status) WHERE (status = 'pending'::extension_status);
CREATE INDEX idx_extension_requests_task ON public.deadline_extension_requests USING btree (task_id);
CREATE INDEX idx_extractions_meeting_date ON public.action_item_extractions USING btree (meeting_date DESC);
CREATE INDEX idx_extractions_review_status ON public.action_item_extractions USING btree (review_status) WHERE (review_status = ANY (ARRAY['pending'::text, 'in_review'::text]));
CREATE INDEX idx_failed_extractions_unresolved ON public.failed_extractions USING btree (attempted_at DESC) WHERE (resolved_at IS NULL);
CREATE INDEX idx_forecast_ai_date ON public.gpl_forecast_ai_analysis USING btree (generated_at DESC);
CREATE INDEX idx_forecast_demand_month ON public.gpl_forecast_demand USING btree (projected_month);
CREATE INDEX idx_forecast_station_reliability_station ON public.gpl_forecast_station_reliability USING btree (station);
CREATE INDEX idx_forecast_unit_risk_level ON public.gpl_forecast_unit_risk USING btree (risk_level);
CREATE INDEX idx_funding_dist_contract_ref ON public.funding_distributions USING btree (contract_ref);
CREATE INDEX idx_funding_dist_date ON public.funding_distributions USING btree (date_distributed);
CREATE INDEX idx_funding_dist_project ON public.funding_distributions USING btree (project_id);
CREATE INDEX idx_gcaa_date ON public.gcaa_daily_metrics USING btree (report_date DESC);
CREATE INDEX idx_gcaa_insights_month ON public.gcaa_ai_insights USING btree (report_month DESC);
CREATE INDEX idx_gcaa_monthly_month ON public.gcaa_monthly_reports USING btree (report_month DESC);
CREATE INDEX idx_gpl_chronic_outliers_active ON public.gpl_chronic_outliers USING btree (resolved, track, stage);
CREATE INDEX idx_gpl_completed_account ON public.gpl_completed USING btree (account_number);
CREATE INDEX idx_gpl_completed_created_by ON public.gpl_completed USING btree (created_by);
CREATE INDEX idx_gpl_completed_snapshot_track_stage ON public.gpl_completed USING btree (snapshot_id, track, stage);
CREATE INDEX idx_gpl_date ON public.gpl_daily_metrics USING btree (report_date DESC);
CREATE INDEX idx_gpl_dbis_date ON public.gpl_dbis_daily USING btree (report_date DESC);
CREATE INDEX idx_gpl_dbis_status ON public.gpl_dbis_daily USING btree (status);
CREATE INDEX idx_gpl_feeder_code ON public.gpl_feeder_cache USING btree (code);
CREATE INDEX idx_gpl_forecast_cache_generated ON public.gpl_forecast_cache USING btree (generated_at DESC);
CREATE INDEX idx_gpl_forecast_cache_hash ON public.gpl_forecast_cache USING btree (data_hash);
CREATE INDEX idx_gpl_kpi_analysis_date ON public.gpl_kpi_ai_analysis USING btree (analysis_date DESC);
CREATE INDEX idx_gpl_monthly_kpis_kpi ON public.gpl_monthly_kpis USING btree (kpi_name);
CREATE INDEX idx_gpl_monthly_kpis_month ON public.gpl_monthly_kpis USING btree (report_month DESC);
CREATE INDEX idx_gpl_outage_date ON public.gpl_outage_cache USING btree (date);
CREATE INDEX idx_gpl_outage_feeder ON public.gpl_outage_cache USING btree (feeder_code);
CREATE INDEX idx_gpl_outage_status ON public.gpl_outage_cache USING btree (status);
CREATE INDEX idx_gpl_outage_sub ON public.gpl_outage_cache USING btree (substation_code);
CREATE INDEX idx_gpl_outstanding_account ON public.gpl_outstanding USING btree (account_number);
CREATE INDEX idx_gpl_outstanding_snapshot_track_stage ON public.gpl_outstanding USING btree (snapshot_id, track, stage);
CREATE INDEX idx_gpl_pulse_computed ON public.gpl_pulse_scores USING btree (computed_at DESC);
CREATE INDEX idx_gpl_snapshot_metrics_snapshot ON public.gpl_snapshot_metrics USING btree (snapshot_id);
CREATE INDEX idx_gpl_snapshots_date ON public.gpl_snapshots USING btree (snapshot_date DESC);
CREATE INDEX idx_gpl_stations_date ON public.gpl_daily_stations USING btree (report_date DESC);
CREATE INDEX idx_gpl_units_date ON public.gpl_daily_units USING btree (report_date DESC);
CREATE INDEX idx_gpl_uploads_date ON public.gpl_uploads USING btree (report_date DESC);
CREATE INDEX idx_gwi_ai_insights_month ON public.gwi_ai_insights USING btree (report_month DESC);
CREATE INDEX idx_gwi_date ON public.gwi_daily_metrics USING btree (report_date DESC);
CREATE INDEX idx_gwi_monthly_reports_month ON public.gwi_monthly_reports USING btree (report_month DESC);
CREATE INDEX idx_gwi_weekly_reports_week ON public.gwi_weekly_reports USING btree (report_week DESC);
CREATE INDEX idx_int_created_at ON public.interventions USING btree (created_at DESC);
CREATE INDEX idx_int_due_date ON public.interventions USING btree (due_date);
CREATE INDEX idx_int_project ON public.interventions USING btree (project_id);
CREATE INDEX idx_int_status ON public.interventions USING btree (status);
CREATE INDEX idx_int_type ON public.interventions USING btree (intervention_type);
CREATE INDEX idx_invitation_tokens_email ON public.invitation_tokens USING btree (email);
CREATE INDEX idx_invitation_tokens_expires ON public.invitation_tokens USING btree (expires_at);
CREATE INDEX idx_invitation_tokens_token ON public.invitation_tokens USING btree (token);
CREATE INDEX idx_invite_tokens_hash ON public.invite_tokens USING btree (token_hash);
CREATE INDEX idx_invite_tokens_user ON public.invite_tokens USING btree (user_id);
CREATE INDEX idx_meeting_actions_confidence ON public.meeting_actions USING btree (confidence) WHERE ((confidence = 'NEEDS_REVIEW'::text) AND (NOT done) AND (NOT skipped));
CREATE INDEX idx_meeting_actions_done ON public.meeting_actions USING btree (done) WHERE (NOT done);
CREATE INDEX idx_meeting_actions_meeting ON public.meeting_actions USING btree (meeting_id);
CREATE INDEX idx_meetings_date ON public.meetings USING btree (date DESC);
CREATE INDEX idx_meetings_seen_action ON public.meetings_seen USING btree (pipeline_action);
CREATE INDEX idx_meetings_seen_date ON public.meetings_seen USING btree (meeting_date DESC);
CREATE INDEX idx_meetings_status ON public.meetings USING btree (status);
CREATE INDEX idx_modules_active ON public.modules USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_modules_slug ON public.modules USING btree (slug);
CREATE INDEX idx_multivariate_forecasts_generated ON public.gpl_multivariate_forecasts USING btree (generated_at DESC);
CREATE INDEX idx_notifications_action ON public.notifications USING btree (user_id, action_required) WHERE ((action_required = true) AND (dismissed_at IS NULL));
CREATE INDEX idx_notifications_category ON public.notifications USING btree (user_id, category) WHERE (dismissed_at IS NULL);
CREATE INDEX idx_notifications_dedup ON public.notifications USING btree (type, reference_id, scheduled_for);
CREATE INDEX idx_notifications_digest ON public.notifications USING btree (user_id, digest_eligible) WHERE ((email_sent_at IS NULL) AND (digest_eligible = true));
CREATE INDEX idx_notifications_event_type ON public.notifications USING btree (user_id, event_type);
CREATE INDEX idx_notifications_expires ON public.notifications USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX idx_notifications_importance ON public.notifications USING btree (user_id, importance_tier) WHERE (read_at IS NULL);
CREATE INDEX idx_notifications_recipient_created ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread_v2 ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE INDEX idx_notifications_user_scheduled ON public.notifications USING btree (user_id, scheduled_for DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read_at) WHERE (read_at IS NULL);
CREATE INDEX idx_object_access_object ON public.object_access_grants USING btree (object_type, object_id);
CREATE INDEX idx_object_access_user ON public.object_access_grants USING btree (user_id);
CREATE INDEX idx_object_ownership_object ON public.object_ownership USING btree (object_type, object_id);
CREATE INDEX idx_object_ownership_owner ON public.object_ownership USING btree (owner_user_id);
CREATE INDEX idx_pa_analyses_agency_date ON public.pending_application_analyses USING btree (agency, analysis_date DESC);
CREATE INDEX idx_pa_snapshots_agency_date ON public.pending_application_snapshots USING btree (agency, snapshot_date DESC);
CREATE INDEX idx_pending_applications_agency ON public.pending_applications USING btree (agency);
CREATE INDEX idx_pending_applications_application_date ON public.pending_applications USING btree (application_date);
CREATE INDEX idx_pending_applications_days_waiting ON public.pending_applications USING btree (days_waiting DESC);
CREATE INDEX idx_pending_applications_pipeline_stage ON public.pending_applications USING btree (pipeline_stage);
CREATE INDEX idx_pending_applications_region ON public.pending_applications USING btree (region);
CREATE INDEX idx_po_agency_status_region ON public.projects_oversight USING btree (sub_agency, project_status, region);
CREATE INDEX idx_po_completion ON public.projects_oversight USING btree (completion_percent);
CREATE INDEX idx_po_contract_value ON public.projects_oversight USING btree (contract_value_total);
CREATE INDEX idx_po_contractors ON public.projects_oversight USING gin (contractors);
CREATE INDEX idx_po_is_resolved ON public.projects_oversight USING btree (is_resolved);
CREATE INDEX idx_po_last_synced ON public.projects_oversight USING btree (last_synced_at);
CREATE INDEX idx_po_project_status ON public.projects_oversight USING btree (project_status);
CREATE INDEX idx_po_region ON public.projects_oversight USING btree (region);
CREATE INDEX idx_po_sub_agency ON public.projects_oversight USING btree (sub_agency);
CREATE INDEX idx_procurement_boards_agency ON public.trello_board USING btree (agency);
CREATE INDEX idx_procurement_boards_trello_board_id ON public.trello_board USING btree (trello_board_id);
CREATE INDEX idx_procurement_decision_actor_time ON public.procurement_decision USING btree (actor_id, decided_at DESC);
CREATE INDEX idx_procurement_decision_agency_time ON public.procurement_decision USING btree (agency, decided_at DESC);
CREATE INDEX idx_procurement_decision_pending_approval ON public.procurement_decision USING btree (approval_state, decided_at DESC) WHERE (approval_state = 'proposed'::text);
CREATE INDEX idx_procurement_decision_target ON public.procurement_decision USING btree (target_kind, target_id, decided_at DESC);
CREATE INDEX idx_procurement_decision_type_time ON public.procurement_decision USING btree (decision_type, decided_at DESC);
CREATE INDEX idx_procurement_excluded_fingerprint_agency_time ON public.procurement_excluded_fingerprint USING btree (agency, decided_at DESC);
CREATE INDEX idx_procurement_match_decision_agency_time ON public.procurement_match_decision USING btree (agency, decided_at DESC);
CREATE INDEX idx_procurement_match_decision_fingerprint_time ON public.procurement_match_decision USING btree (fingerprint, decided_at DESC);
CREATE INDEX idx_progress_details_date ON public.project_progress_details USING btree (record_date);
CREATE INDEX idx_progress_details_project ON public.project_progress_details USING btree (project_id);
CREATE INDEX idx_project_notes_project ON public.project_notes USING btree (project_id, created_at DESC);
CREATE INDEX idx_project_notes_user ON public.project_notes USING btree (user_id);
CREATE INDEX idx_project_summaries_project ON public.project_summaries USING btree (project_id);
CREATE INDEX idx_projects_assigned ON public.projects USING btree (assigned_to);
CREATE INDEX idx_projects_completion ON public.projects USING btree (completion_pct);
CREATE INDEX idx_projects_contract_value ON public.projects USING btree (contract_value);
CREATE INDEX idx_projects_contractor ON public.projects USING btree (contractor);
CREATE INDEX idx_projects_end_date ON public.projects USING btree (project_end_date);
CREATE INDEX idx_projects_escalated ON public.projects USING btree (escalated) WHERE (escalated = true);
CREATE INDEX idx_projects_extended ON public.projects USING btree (project_extended) WHERE (project_extended = true);
CREATE INDEX idx_projects_health ON public.projects USING btree (health);
CREATE INDEX idx_projects_project_status ON public.projects USING btree (project_status);
CREATE INDEX idx_projects_region ON public.projects USING btree (region);
CREATE INDEX idx_projects_short_name ON public.projects USING btree (short_name);
CREATE INDEX idx_projects_start_date ON public.projects USING btree (start_date);
CREATE INDEX idx_projects_sub_agency ON public.projects USING btree (sub_agency);
CREATE INDEX idx_psip_nag_preview_agency_time ON public.psip_nag_preview USING btree (agency, would_have_sent_at DESC);
CREATE INDEX idx_psip_nag_preview_time ON public.psip_nag_preview USING btree (would_have_sent_at DESC);
CREATE INDEX idx_psip_nag_record_agency_active ON public.psip_nag_record USING btree (agency, last_nagged_at DESC) WHERE (resolved_at IS NULL);
CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions USING btree (endpoint);
CREATE INDEX idx_push_subscriptions_user_active ON public.push_subscriptions USING btree (user_id) WHERE (active = true);
CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id);
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions USING btree (role_id);
CREATE INDEX idx_saved_filters_user ON public.saved_filters USING btree (user_id);
CREATE INDEX idx_sc_application_date ON public.service_connections USING btree (application_date);
CREATE INDEX idx_sc_current_stage ON public.service_connections USING btree (current_stage);
CREATE INDEX idx_sc_customer_ref ON public.service_connections USING btree (customer_reference);
CREATE INDEX idx_sc_disappeared_date ON public.service_connections USING btree (disappeared_date);
CREATE UNIQUE INDEX idx_sc_natural_key ON public.service_connections USING btree (customer_reference, service_order_number) WHERE ((customer_reference IS NOT NULL) AND (service_order_number IS NOT NULL));
CREATE INDEX idx_sc_region ON public.service_connections USING btree (region);
CREATE INDEX idx_sc_status ON public.service_connections USING btree (status);
CREATE INDEX idx_sc_track ON public.service_connections USING btree (track);
CREATE INDEX idx_scai_date ON public.service_connection_ai_insights USING btree (analysis_date DESC);
CREATE INDEX idx_scms_month ON public.service_connection_monthly_stats USING btree (report_month DESC);
CREATE INDEX idx_sub_programme_agency ON public.sub_programme USING btree (agency) WHERE (is_excluded = false);
CREATE INDEX idx_sub_programme_programme_code ON public.sub_programme USING btree (programme_code);
CREATE INDEX idx_task_activities_created ON public.task_activities USING btree (created_at DESC);
CREATE INDEX idx_task_activities_task ON public.task_activities USING btree (task_id);
CREATE INDEX idx_task_comments_task ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_notifications_created ON public.task_notifications USING btree (created_at DESC);
CREATE INDEX idx_task_notifications_user ON public.task_notifications USING btree (user_id, is_read);
CREATE INDEX idx_task_watchers_task ON public.task_watchers USING btree (task_id);
CREATE INDEX idx_task_watchers_user ON public.task_watchers USING btree (user_id);
CREATE INDEX idx_tasks_agency ON public.tasks USING btree (agency);
CREATE INDEX idx_tasks_assigned_by ON public.tasks USING btree (assigned_by_user_id);
CREATE INDEX idx_tasks_completed_at_status ON public.tasks USING btree (completed_at, status) WHERE (status = ANY (ARRAY['done'::text, 'superseded'::text]));
CREATE INDEX idx_tasks_due ON public.tasks USING btree (due_date);
CREATE INDEX idx_tasks_embedding ON public.tasks USING ivfflat (task_embedding vector_cosine_ops);
CREATE INDEX idx_tasks_extraction ON public.tasks USING btree (extraction_id) WHERE (extraction_id IS NOT NULL);
CREATE INDEX idx_tasks_owner ON public.tasks USING btree (owner_user_id);
CREATE INDEX idx_tasks_owner_status_open ON public.tasks USING btree (owner_user_id, status) WHERE (status = ANY (ARRAY['new'::text, 'active'::text, 'blocked'::text, 'awaiting_verification'::text]));
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_status_due_open ON public.tasks USING btree (status, due_date) WHERE (status = ANY (ARRAY['new'::text, 'active'::text, 'blocked'::text, 'awaiting_verification'::text]));
CREATE INDEX idx_tasks_supersedes ON public.tasks USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL);
CREATE INDEX idx_tender_active ON public.tender USING btree (agency, stage) WHERE (stage <> 'award'::tender_stage);
CREATE INDEX idx_tender_agency ON public.tender USING btree (agency);
CREATE INDEX idx_tender_archived ON public.tender USING btree (agency, archived_at DESC) WHERE (archived_at IS NOT NULL);
CREATE INDEX idx_tender_awarded_at ON public.tender USING btree (awarded_at DESC) WHERE (awarded_at IS NOT NULL);
CREATE INDEX idx_tender_created_by ON public.tender USING btree (created_by) WHERE (created_by IS NOT NULL);
CREATE INDEX idx_tender_document_tender ON public.tender_document USING btree (tender_id, uploaded_at DESC);
CREATE INDEX idx_tender_field_change_field_time ON public.tender_field_change USING btree (field_name, changed_at DESC);
CREATE INDEX idx_tender_field_change_tender_time ON public.tender_field_change USING btree (tender_id, changed_at DESC);
CREATE INDEX idx_tender_field_change_upload ON public.tender_field_change USING btree (upload_id);
CREATE INDEX idx_tender_keep_tracking ON public.tender USING btree (agency, updated_at DESC) WHERE (keep_tracking_despite_missing = true);
CREATE INDEX idx_tender_match_review_fingerprint_status ON public.tender_match_review USING btree (parsed_row_fingerprint, status) WHERE (status = ANY (ARRAY['pending'::tender_match_status, 'skipped'::tender_match_status]));
CREATE INDEX idx_tender_match_review_pending ON public.tender_match_review USING btree (upload_id, created_at) WHERE (status = 'pending'::tender_match_status);
CREATE INDEX idx_tender_match_review_reason_status ON public.tender_match_review USING btree (review_reason, status);
CREATE INDEX idx_tender_match_review_upload ON public.tender_match_review USING btree (upload_id);
CREATE INDEX idx_tender_missing ON public.tender USING btree (missing_from_last_upload) WHERE (missing_from_last_upload = true);
CREATE INDEX idx_tender_note_tender ON public.tender_note USING btree (tender_id, created_at DESC);
CREATE INDEX idx_tender_presence_event_agency_time ON public.tender_presence_event USING btree (agency, at DESC);
CREATE INDEX idx_tender_presence_event_tender_time ON public.tender_presence_event USING btree (tender_id, at DESC);
CREATE INDEX idx_tender_presence_event_type_time ON public.tender_presence_event USING btree (event_type, at DESC);
CREATE INDEX idx_tender_prog_subprog ON public.tender USING btree (programme_code, sub_programme_code);
CREATE INDEX idx_tender_source ON public.tender USING btree (source);
CREATE UNIQUE INDEX idx_tender_source_external_id ON public.tender USING btree (source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_tender_stage ON public.tender USING btree (stage);
CREATE INDEX idx_tender_stagnant ON public.tender USING btree (stagnant_weeks DESC, agency) WHERE ((stagnant_weeks >= 3) AND (is_rollover = false) AND (has_exception = false) AND (missing_from_last_upload = false));
CREATE INDEX idx_tender_status_active ON public.tender USING btree (agency, updated_at DESC) WHERE (status = 'active'::text);
CREATE INDEX idx_tender_status_decision_after_time ON public.tender_status_decision USING btree (status_after, decided_at DESC);
CREATE INDEX idx_tender_status_decision_tender_time ON public.tender_status_decision USING btree (tender_id, decided_at DESC);
CREATE INDEX idx_tender_status_missing_pending ON public.tender USING btree (agency, updated_at DESC) WHERE (status = 'missing_pending_decision'::text);
CREATE INDEX idx_tender_updated_at ON public.tender USING btree (updated_at DESC);
CREATE INDEX idx_tender_upload_snapshot_tender_created ON public.tender_upload_snapshot USING btree (tender_id, created_at DESC);
CREATE INDEX idx_uma_agency ON public.user_module_access USING btree (agency) WHERE (agency IS NOT NULL);
CREATE INDEX idx_upload_status_uploaded_at ON public.upload USING btree (status, uploaded_at DESC);
CREATE INDEX idx_upload_uploaded_by ON public.upload USING btree (uploaded_by);
CREATE INDEX idx_user_module_access_module ON public.user_module_access USING btree (module_id);
CREATE INDEX idx_user_module_access_user ON public.user_module_access USING btree (user_id);
CREATE INDEX idx_user_settings_user_key ON public.user_settings USING btree (user_id, key);
CREATE INDEX idx_users_agency ON public.users USING btree (agency);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_invite_token ON public.users USING btree (invite_token) WHERE (invite_token IS NOT NULL);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX nptab_audit_report_idx ON public.nptab_report_audit_log USING btree (report_id, "timestamp" DESC);
CREATE UNIQUE INDEX nptab_queue_active_unique ON public.nptab_report_queue USING btree (tender_id) WHERE ((dequeued_at IS NULL) AND (included_in_report_id IS NULL));
CREATE INDEX nptab_queue_report_idx ON public.nptab_report_queue USING btree (included_in_report_id);
CREATE INDEX nptab_queue_tender_idx ON public.nptab_report_queue USING btree (tender_id);
CREATE INDEX nptab_reports_period_idx ON public.nptab_reports USING btree (period_end DESC);
CREATE INDEX nptab_reports_status_idx ON public.nptab_reports USING btree (status);
CREATE INDEX nptab_reports_submitted_at_idx ON public.nptab_reports USING btree (submitted_at DESC);
CREATE INDEX subtasks_task_id_idx ON public.subtasks USING btree (task_id);
CREATE INDEX task_activity_task_id_idx ON public.task_activity USING btree (task_id);
CREATE INDEX tasks_linked_source_idx ON public.tasks USING btree (linked_source_type, linked_source_id) WHERE (linked_source_id IS NOT NULL);
CREATE INDEX tasks_minister_attention_idx ON public.tasks USING btree (requires_minister_attention, minister_closed_at) WHERE (requires_minister_attention = true);
CREATE UNIQUE INDEX uniq_tasks_extraction_item ON public.tasks USING btree (extraction_id, extraction_item_idx) WHERE (extraction_id IS NOT NULL);
CREATE UNIQUE INDEX user_module_access_user_module_agency_idx ON public.user_module_access USING btree (user_id, module_id, COALESCE(agency, '__all__'::text));
CREATE INDEX users_email_active_idx ON public.users USING btree (email) WHERE (is_active = true);

-- ---------- views ----------
CREATE OR REPLACE VIEW public."pending_applications_with_wait" AS
WITH ranked AS (
         SELECT pa.id,
            pa.agency,
            pa.customer_reference,
            pa.first_name,
            pa.last_name,
            pa.telephone,
            pa.region,
            pa.district,
            pa.village_ward,
            pa.street,
            pa.lot,
            pa.event_code,
            pa.event_description,
            pa.application_date,
            pa.days_waiting,
            pa.raw_data,
            pa.imported_at,
            pa.data_as_of,
            pa.pipeline_stage,
            pa.account_type,
            pa.service_order_type,
            pa.service_order_number,
            pa.account_status,
            pa.cycle,
            pa.division_code,
            row_number() OVER (PARTITION BY pa.agency, (COALESCE(pa.customer_reference, pa.id::text)), (COALESCE(pa.service_order_number, ''::text)) ORDER BY pa.id DESC) AS rn
           FROM pending_applications pa
        )
 SELECT id,
    agency,
    customer_reference,
    first_name,
    last_name,
    telephone,
    region,
    district,
    village_ward,
    street,
    lot,
    event_code,
    event_description,
    application_date,
    GREATEST(0, (now() AT TIME ZONE 'America/Guyana'::text)::date - application_date) AS days_waiting,
    raw_data,
    imported_at,
    data_as_of,
    pipeline_stage,
    account_type,
    service_order_type,
    service_order_number,
    account_status,
    cycle,
    division_code
   FROM ranked
  WHERE rn = 1;
CREATE OR REPLACE VIEW public."v_metrics_by_agency" AS
SELECT m.data_date,
    m.agency,
    m.category,
    count(*) AS metric_count,
    count(*) FILTER (WHERE m.has_error) AS error_count,
    count(*) FILTER (WHERE m.numeric_value IS NOT NULL) AS numeric_count
   FROM daily_metrics m
     JOIN daily_uploads u ON m.upload_id = u.id
  WHERE u.status::text = 'confirmed'::text
  GROUP BY m.data_date, m.agency, m.category
  ORDER BY m.data_date DESC, m.agency;

-- ---------- triggers ----------
CREATE TRIGGER trg_agency_scheduled_reports_updated_at BEFORE UPDATE ON public.agency_scheduled_reports FOR EACH ROW EXECUTE FUNCTION agency_scheduled_reports_set_updated_at();
CREATE TRIGGER trg_airstrips_updated_at BEFORE UPDATE ON public.airstrips FOR EACH ROW EXECUTE FUNCTION update_airstrips_updated_at();
CREATE TRIGGER tr_cjia_updated BEFORE UPDATE ON public.cjia_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customer_applications_updated_at BEFORE UPDATE ON public.customer_applications FOR EACH ROW EXECUTE FUNCTION update_customer_applications_updated_at();
CREATE TRIGGER tr_daily_uploads_updated BEFORE UPDATE ON public.daily_uploads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_dp_updated_at BEFORE UPDATE ON public.delayed_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_gcaa_updated BEFORE UPDATE ON public.gcaa_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gpl_updated BEFORE UPDATE ON public.gpl_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gpl_dbis_calculate BEFORE INSERT OR UPDATE ON public.gpl_dbis_daily FOR EACH ROW EXECUTE FUNCTION calculate_dbis_totals();
CREATE TRIGGER tr_gpl_dbis_updated BEFORE UPDATE ON public.gpl_dbis_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_gwi_updated BEFORE UPDATE ON public.gwi_daily_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_integration_tokens_updated_at BEFORE UPDATE ON public.integration_tokens FOR EACH ROW EXECUTE FUNCTION update_integration_tokens_updated_at();
CREATE TRIGGER tr_metric_definitions_updated BEFORE UPDATE ON public.metric_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_nptab_reports_updated_at BEFORE UPDATE ON public.nptab_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON public.projects_oversight FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_task_comments_updated BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tender_updated_at BEFORE UPDATE ON public.tender FOR EACH ROW EXECUTE FUNCTION tender_set_updated_at();
CREATE TRIGGER trg_sync_tender_status_from_decision AFTER INSERT ON public.tender_status_decision FOR EACH ROW EXECUTE FUNCTION sync_tender_status_from_decision();
CREATE TRIGGER trg_trello_board_updated_at BEFORE UPDATE ON public.trello_board FOR EACH ROW EXECUTE FUNCTION trello_set_updated_at();

-- ---------- RLS enable ----------
ALTER TABLE public."activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_head_notification_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_health_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_intel_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_psip_focal_point" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_psip_focal_point_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_scheduled_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrip_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrip_maintenance_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrip_option_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrip_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrip_status_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."airstrips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."core_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_application_activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_application_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_application_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delayed_project_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delayed_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."funding_distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_chronic_outliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_completed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_feeder_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_outage_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_outstanding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_pulse_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_snapshot_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gpl_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."integration_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."interventions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invitation_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."kpi_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nptab_report_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nptab_report_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."nptab_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."object_access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."object_ownership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."procurement_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."procurement_excluded_fingerprint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."procurement_match_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."programme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_progress_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."project_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects_oversight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psip_nag_preview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psip_nag_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."psip_nag_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saved_filters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sub_programme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subtasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."task_watchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_field_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_match_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_presence_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_status_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tender_upload_snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trello_board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_module_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
CREATE POLICY "activity_logs_insert" ON public."activity_logs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "activity_logs_select" ON public."activity_logs" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "activity_logs_service_all" ON public."activity_logs" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agency_head_notif_log_select" ON public."agency_head_notification_log" AS PERMISSIVE FOR SELECT TO authenticated USING (is_dg_or_above());
CREATE POLICY "agency_head_notif_log_service_all" ON public."agency_head_notification_log" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agency_health_snapshots_agency_read" ON public."agency_health_snapshots" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['agency_admin'::text, 'officer'::text])) AND (upper(users.agency) = upper(agency_health_snapshots.agency_slug))))));
CREATE POLICY "agency_health_snapshots_ministry_read" ON public."agency_health_snapshots" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'parl_sec'::text]))))));
CREATE POLICY "agency_intel_reports_insert" ON public."agency_intel_reports" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((sent_by_user_id = auth.uid()));
CREATE POLICY "agency_intel_reports_select" ON public."agency_intel_reports" AS PERMISSIVE FOR SELECT TO authenticated USING (((sent_by_user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "agency_intel_reports_service_all" ON public."agency_intel_reports" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read agency_psip_focal_point" ON public."agency_psip_focal_point" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full agency_psip_focal_point" ON public."agency_psip_focal_point" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read agency_psip_focal_point_history" ON public."agency_psip_focal_point_history" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full agency_psip_focal_point_history" ON public."agency_psip_focal_point_history" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agency_scheduled_reports_delete" ON public."agency_scheduled_reports" AS PERMISSIVE FOR DELETE TO authenticated USING (((created_by_user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "agency_scheduled_reports_insert" ON public."agency_scheduled_reports" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by_user_id = auth.uid()));
CREATE POLICY "agency_scheduled_reports_select" ON public."agency_scheduled_reports" AS PERMISSIVE FOR SELECT TO authenticated USING (((created_by_user_id = auth.uid()) OR is_dg_or_above() OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['agency_admin'::text, 'officer'::text])) AND (upper(u.agency) = upper(agency_scheduled_reports.agency)))))));
CREATE POLICY "agency_scheduled_reports_service_all" ON public."agency_scheduled_reports" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agency_scheduled_reports_update" ON public."agency_scheduled_reports" AS PERMISSIVE FOR UPDATE TO authenticated USING (((created_by_user_id = auth.uid()) OR is_dg_or_above())) WITH CHECK (((created_by_user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "ai_agency_admin_insert" ON public."airstrip_inspections" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "ai_authenticated_select" ON public."airstrip_inspections" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_ministry_all" ON public."airstrip_inspections" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text]))))));
CREATE POLICY "aml_agency_admin_insert" ON public."airstrip_maintenance_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "aml_agency_admin_update" ON public."airstrip_maintenance_log" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "aml_authenticated_select" ON public."airstrip_maintenance_log" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "aml_ministry_all" ON public."airstrip_maintenance_log" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text]))))));
CREATE POLICY "airstrip_option_types_read" ON public."airstrip_option_types" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "airstrip_option_types_write" ON public."airstrip_option_types" AS PERMISSIVE FOR ALL TO public USING ((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text])));
CREATE POLICY "ap_agency_admin_insert" ON public."airstrip_photos" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "ap_authenticated_select" ON public."airstrip_photos" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "ap_ministry_all" ON public."airstrip_photos" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text]))))));
CREATE POLICY "ap_own_delete" ON public."airstrip_photos" AS PERMISSIVE FOR DELETE TO authenticated USING ((uploaded_by = ((auth.jwt() ->> 'userId'::text))::uuid));
CREATE POLICY "asl_authenticated_select" ON public."airstrip_status_log" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "asl_ministry_insert" ON public."airstrip_status_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'agency_admin'::text]))))));
CREATE POLICY "as_agency_admin_insert" ON public."airstrips" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "as_agency_admin_update" ON public."airstrips" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'agency_admin'::text)))));
CREATE POLICY "as_authenticated_select" ON public."airstrips" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "as_ministry_all" ON public."airstrips" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text]))))));
CREATE POLICY "core_perms_delete" ON public."core_permissions" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "core_perms_insert" ON public."core_permissions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "core_perms_select" ON public."core_permissions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "core_perms_service_all" ON public."core_permissions" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "core_perms_update" ON public."core_permissions" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
CREATE POLICY "caal_agency_select" ON public."customer_application_activity_log" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM customer_applications ca
  WHERE ((ca.id = customer_application_activity_log.application_id) AND (ca.agency = ( SELECT users.agency
           FROM users
          WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid)))))));
CREATE POLICY "caal_dg_all" ON public."customer_application_activity_log" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'dg'::text)))));
CREATE POLICY "caal_insert" ON public."customer_application_activity_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((performed_by = ((auth.jwt() ->> 'userId'::text))::uuid));
CREATE POLICY "cad_agency_insert" ON public."customer_application_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM customer_applications ca
  WHERE ((ca.id = customer_application_documents.application_id) AND (ca.agency = ( SELECT users.agency
           FROM users
          WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid)))))));
CREATE POLICY "cad_agency_select" ON public."customer_application_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM customer_applications ca
  WHERE ((ca.id = customer_application_documents.application_id) AND (ca.agency = ( SELECT users.agency
           FROM users
          WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid)))))));
CREATE POLICY "cad_dg_all" ON public."customer_application_documents" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'dg'::text)))));
CREATE POLICY "cad_own_delete" ON public."customer_application_documents" AS PERMISSIVE FOR DELETE TO authenticated USING ((uploaded_by = ((auth.jwt() ->> 'userId'::text))::uuid));
CREATE POLICY "can_agency_insert" ON public."customer_application_notes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM customer_applications ca
  WHERE ((ca.id = customer_application_notes.application_id) AND (ca.agency = ( SELECT users.agency
           FROM users
          WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid)))))));
CREATE POLICY "can_agency_select" ON public."customer_application_notes" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM customer_applications ca
  WHERE ((ca.id = customer_application_notes.application_id) AND (ca.agency = ( SELECT users.agency
           FROM users
          WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid)))))));
CREATE POLICY "can_dg_all" ON public."customer_application_notes" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'dg'::text)))));
CREATE POLICY "ca_agency_insert" ON public."customer_applications" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((agency = ( SELECT users.agency
   FROM users
  WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid))));
CREATE POLICY "ca_agency_select" ON public."customer_applications" AS PERMISSIVE FOR SELECT TO authenticated USING ((agency = ( SELECT users.agency
   FROM users
  WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid))));
CREATE POLICY "ca_agency_update" ON public."customer_applications" AS PERMISSIVE FOR UPDATE TO authenticated USING ((agency = ( SELECT users.agency
   FROM users
  WHERE (users.id = ((auth.jwt() ->> 'userId'::text))::uuid))));
CREATE POLICY "ca_dg_all" ON public."customer_applications" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'dg'::text)))));
CREATE POLICY "dps_select" ON public."delayed_project_snapshots" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "dps_service_all" ON public."delayed_project_snapshots" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "dp_select" ON public."delayed_projects" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "dp_service_all" ON public."delayed_projects" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "documents_agency_read" ON public."documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['agency_admin'::text, 'officer'::text])) AND ((upper(users.agency) = upper((documents.agency)::text)) OR (documents.agency IS NULL))))));
CREATE POLICY "documents_delete" ON public."documents" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'dg'::text)))));
CREATE POLICY "documents_insert" ON public."documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'ps'::text, 'agency_admin'::text]))))));
CREATE POLICY "documents_ministry_read" ON public."documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'parl_sec'::text]))))));
CREATE POLICY "documents_service_all" ON public."documents" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "funding_distributions_select" ON public."funding_distributions" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "gpl_chronic_outliers_read" ON public."gpl_chronic_outliers" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "gpl_chronic_outliers_service_write" ON public."gpl_chronic_outliers" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "gpl_completed_read" ON public."gpl_completed" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "gpl_completed_service_all" ON public."gpl_completed" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "gpl_completed_service_write" ON public."gpl_completed" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "gpl_feeder_cache_read" ON public."gpl_feeder_cache" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "gpl_feeder_cache_write" ON public."gpl_feeder_cache" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "gpl_outage_cache_read" ON public."gpl_outage_cache" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "gpl_outage_cache_write" ON public."gpl_outage_cache" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "gpl_outstanding_read" ON public."gpl_outstanding" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "gpl_outstanding_service_all" ON public."gpl_outstanding" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "gpl_outstanding_service_write" ON public."gpl_outstanding" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "gpl_pulse_scores_read" ON public."gpl_pulse_scores" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "gpl_pulse_scores_write" ON public."gpl_pulse_scores" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "gpl_snapshot_metrics_read" ON public."gpl_snapshot_metrics" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "gpl_snapshot_metrics_service_all" ON public."gpl_snapshot_metrics" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "gpl_snapshot_metrics_service_write" ON public."gpl_snapshot_metrics" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "gpl_snapshots_read" ON public."gpl_snapshots" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "gpl_snapshots_service_all" ON public."gpl_snapshots" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "gpl_snapshots_service_write" ON public."gpl_snapshots" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "tokens_own" ON public."integration_tokens" AS PERMISSIVE FOR ALL TO public USING ((user_id = ( SELECT (users.id)::text AS id
   FROM users
  WHERE (users.id = auth.uid()))));
CREATE POLICY "int_select" ON public."interventions" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "int_service_all" ON public."interventions" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "invitation_tokens_all" ON public."invitation_tokens" AS PERMISSIVE FOR ALL TO authenticated USING (is_dg_or_above()) WITH CHECK (is_dg_or_above());
CREATE POLICY "invitation_tokens_service_all" ON public."invitation_tokens" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "kpi_alerts_agency_read" ON public."kpi_alerts" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['agency_admin'::text, 'officer'::text])) AND (upper(users.agency) = upper(kpi_alerts.agency_slug))))));
CREATE POLICY "kpi_alerts_ministry_read" ON public."kpi_alerts" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'parl_sec'::text]))))));
CREATE POLICY "modules_select" ON public."modules" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "notifications_own" ON public."notifications" AS PERMISSIVE FOR ALL TO public USING ((user_id = (auth.uid())::text));
CREATE POLICY "nptab_audit_authenticated_select" ON public."nptab_report_audit_log" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "nptab_audit_service_role" ON public."nptab_report_audit_log" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "nptab_queue_authenticated_select" ON public."nptab_report_queue" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "nptab_queue_service_role" ON public."nptab_report_queue" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "nptab_reports_authenticated_select" ON public."nptab_reports" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "nptab_reports_service_role" ON public."nptab_reports" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "obj_grants_delete" ON public."object_access_grants" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "obj_grants_insert" ON public."object_access_grants" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "obj_grants_select" ON public."object_access_grants" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "obj_grants_service_all" ON public."object_access_grants" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "obj_grants_update" ON public."object_access_grants" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
CREATE POLICY "obj_own_delete" ON public."object_ownership" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "obj_own_insert" ON public."object_ownership" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "obj_own_select" ON public."object_ownership" AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_user_id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "obj_own_service_all" ON public."object_ownership" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "obj_own_update" ON public."object_ownership" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
CREATE POLICY "auth read procurement_decision" ON public."procurement_decision" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full procurement_decision" ON public."procurement_decision" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read procurement_excluded_fingerprint" ON public."procurement_excluded_fingerprint" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full procurement_excluded_fingerprint" ON public."procurement_excluded_fingerprint" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read procurement_match_decision" ON public."procurement_match_decision" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full procurement_match_decision" ON public."procurement_match_decision" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read programme" ON public."programme" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full programme" ON public."programme" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "project_notes_insert" ON public."project_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "project_notes_select" ON public."project_notes" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "project_progress_details_select" ON public."project_progress_details" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "project_summaries_select" ON public."project_summaries" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "projects_agency_read" ON public."projects" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['agency_admin'::text, 'officer'::text])) AND (upper(users.agency) = upper(projects.sub_agency))))));
CREATE POLICY "projects_ministry_read" ON public."projects" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'minister'::text, 'ps'::text, 'parl_sec'::text]))))));
CREATE POLICY "projects_ministry_update" ON public."projects" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['dg'::text, 'ps'::text, 'parl_sec'::text]))))));
CREATE POLICY "projects_service_all" ON public."projects" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "po_select" ON public."projects_oversight" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "po_service_all" ON public."projects_oversight" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));
CREATE POLICY "auth read psip_nag_preview" ON public."psip_nag_preview" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_preview" ON public."psip_nag_preview" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read psip_nag_record" ON public."psip_nag_record" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_record" ON public."psip_nag_record" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read psip_nag_settings" ON public."psip_nag_settings" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full psip_nag_settings" ON public."psip_nag_settings" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "push_subs_delete" ON public."push_subscriptions" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = (auth.uid())::text));
CREATE POLICY "push_subs_insert" ON public."push_subscriptions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (auth.uid())::text));
CREATE POLICY "push_subs_select" ON public."push_subscriptions" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (auth.uid())::text));
CREATE POLICY "push_subs_service_all" ON public."push_subscriptions" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "push_subs_update" ON public."push_subscriptions" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = (auth.uid())::text));
CREATE POLICY "role_perms_delete" ON public."role_permissions" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "role_perms_insert" ON public."role_permissions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "role_perms_select" ON public."role_permissions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_perms_service_all" ON public."role_permissions" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "role_perms_update" ON public."role_permissions" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
CREATE POLICY "roles_delete" ON public."roles" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "roles_insert" ON public."roles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "roles_select" ON public."roles" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_service_all" ON public."roles" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "roles_update" ON public."roles" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
CREATE POLICY "saved_filters_own" ON public."saved_filters" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "auth read sub_programme" ON public."sub_programme" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full sub_programme" ON public."sub_programme" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "subtasks_delete" ON public."subtasks" AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = subtasks.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "subtasks_insert" ON public."subtasks" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = subtasks.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "subtasks_select" ON public."subtasks" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = subtasks.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "subtasks_service_all" ON public."subtasks" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "subtasks_update" ON public."subtasks" AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = subtasks.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_activity_insert" ON public."task_activity" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_activity.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_activity_select" ON public."task_activity" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_activity.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_activity_service_all" ON public."task_activity" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "task_comments_delete" ON public."task_comments" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "task_comments_insert" ON public."task_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_comments.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_comments_select" ON public."task_comments" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_comments.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_comments_service_all" ON public."task_comments" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "task_comments_update" ON public."task_comments" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "task_watchers_delete" ON public."task_watchers" AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_watchers.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_watchers_insert" ON public."task_watchers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_watchers.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_watchers_select" ON public."task_watchers" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_watchers.task_id) AND ((tasks.owner_user_id = auth.uid()) OR (tasks.assigned_by_user_id = auth.uid()))))) OR is_dg_or_above()));
CREATE POLICY "task_watchers_service_all" ON public."task_watchers" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender" ON public."tender" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender" ON public."tender" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_document" ON public."tender_document" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_document" ON public."tender_document" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_field_change" ON public."tender_field_change" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_field_change" ON public."tender_field_change" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_match_review" ON public."tender_match_review" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_match_review" ON public."tender_match_review" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_note" ON public."tender_note" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_note" ON public."tender_note" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_presence_event" ON public."tender_presence_event" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_presence_event" ON public."tender_presence_event" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_status_decision" ON public."tender_status_decision" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_status_decision" ON public."tender_status_decision" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read tender_upload_snapshot" ON public."tender_upload_snapshot" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_upload_snapshot" ON public."tender_upload_snapshot" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read trello_board" ON public."trello_board" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full trello_board" ON public."trello_board" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth read upload" ON public."upload" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full upload" ON public."upload" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "uma_dg_all" ON public."user_module_access" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ((auth.jwt() ->> 'userId'::text))::uuid) AND (users.role = 'dg'::text)))));
CREATE POLICY "uma_self_select" ON public."user_module_access" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ((auth.jwt() ->> 'userId'::text))::uuid));
CREATE POLICY "user_settings_own" ON public."user_settings" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "users_delete" ON public."users" AS PERMISSIVE FOR DELETE TO authenticated USING (is_dg_or_above());
CREATE POLICY "users_insert" ON public."users" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_dg_or_above());
CREATE POLICY "users_select" ON public."users" AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR is_dg_or_above()));
CREATE POLICY "users_service_all" ON public."users" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "users_update" ON public."users" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_dg_or_above());
