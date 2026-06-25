-- 137_airstrip_assign_contractor_fn.sql
--
-- Phase 1: atomically set an airstrip's responsible contractor. Closes the current
-- open assignment (effective_to = today, Guyana) and opens a new one in a single
-- transaction, so the partial-unique "one open per airstrip" invariant can never be
-- left in a no-current-contractor gap. No-op when the contractor is already current.

CREATE OR REPLACE FUNCTION public.airstrip_assign_contractor(
  p_airstrip_id  uuid,
  p_contractor_id uuid,
  p_user_id      uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Guyana')::date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.airstrip_contractors
    WHERE airstrip_id = p_airstrip_id AND effective_to IS NULL AND contractor_id = p_contractor_id
  ) THEN
    RETURN; -- already the current contractor
  END IF;

  UPDATE public.airstrip_contractors
     SET effective_to = v_today
   WHERE airstrip_id = p_airstrip_id AND effective_to IS NULL;

  INSERT INTO public.airstrip_contractors (airstrip_id, contractor_id, effective_from, created_by)
  VALUES (p_airstrip_id, p_contractor_id, v_today, p_user_id);
END;
$$;
