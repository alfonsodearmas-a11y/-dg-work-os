-- 134_airstrip_change_status_fn.sql
--
-- Phase 1 / debug carryover B9: eliminate the status-update vs status-log desync.
-- Previously routes ran the airstrips UPDATE and the airstrip_status_log INSERT in
-- parallel (Promise.all), so one could succeed while the other failed. This SQL
-- function does both in a single transaction (FOR UPDATE lock), logging only when
-- the status actually changes. The status route, [id] PATCH, and bulk PATCH all
-- call it via supabaseAdmin.rpc() instead of the parallel writes.

CREATE OR REPLACE FUNCTION public.airstrip_change_status(
  p_airstrip_id uuid,
  p_new_status  text,
  p_reason      text,
  p_user_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev text;
  v_row  public.airstrips;
BEGIN
  SELECT status INTO v_prev FROM public.airstrips WHERE id = p_airstrip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'airstrip % not found', p_airstrip_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.airstrips
     SET status = p_new_status, updated_by = p_user_id, updated_at = now()
   WHERE id = p_airstrip_id
   RETURNING * INTO v_row;

  IF v_prev IS DISTINCT FROM p_new_status THEN
    INSERT INTO public.airstrip_status_log (airstrip_id, previous_status, new_status, changed_by, reason)
    VALUES (p_airstrip_id, v_prev, p_new_status, p_user_id, NULLIF(btrim(coalesce(p_reason, '')), ''));
  END IF;

  RETURN jsonb_build_object('previous_status', v_prev, 'airstrip', to_jsonb(v_row));
END;
$$;
