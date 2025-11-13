-- Ensure start_mass_occurrence always sets org_id on mass_occurrences

CREATE OR REPLACE FUNCTION public.start_mass_occurrence(
  p_mass_id uuid,
  p_schedule_id uuid,
  p_started_by uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- derive org_id from the mass
  SELECT org_id INTO v_org_id FROM public.masses WHERE id = p_mass_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Mass % not found or has no org_id', p_mass_id;
  END IF;

  IF p_schedule_id IS NOT NULL THEN
    -- promote scheduled occurrence to running/live and ensure org_id/mass_id are set
    UPDATE public.mass_occurrences
       SET status = 'running',
           starts_at = COALESCE(starts_at, now()),
           started_by = COALESCE(p_started_by, started_by),
           org_id = COALESCE(org_id, v_org_id),
           mass_id = COALESCE(mass_id, p_mass_id)
     WHERE id = p_schedule_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Scheduled occurrence % not found', p_schedule_id;
    END IF;
  ELSE
    -- ad-hoc: create a new running occurrence with derived org_id
    INSERT INTO public.mass_occurrences (org_id, mass_id, schedule_id, status, starts_at, started_by)
    VALUES (v_org_id, p_mass_id, NULL, 'running', now(), p_started_by);
  END IF;

  END
$$;

-- Defensive trigger to backfill org_id on any inserts missing it
CREATE OR REPLACE FUNCTION public.mass_occurrences_fill_org_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_org_id uuid;
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO v_org_id FROM public.masses WHERE id = NEW.mass_id;
    NEW.org_id := v_org_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_mass_occurrences_fill_org_id ON public.mass_occurrences;
CREATE TRIGGER trg_mass_occurrences_fill_org_id
BEFORE INSERT ON public.mass_occurrences
FOR EACH ROW EXECUTE FUNCTION public.mass_occurrences_fill_org_id();
