-- RPCs for mass occurrences used by the app

-- Return the single latest running/live occurrence for an org
CREATE OR REPLACE FUNCTION public.get_current_mass_occurrence(
  p_org_id uuid
) RETURNS public.mass_occurrences
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mo.*
  FROM public.mass_occurrences mo
  WHERE mo.org_id = p_org_id
    AND mo.status IN ('running','live')
  ORDER BY mo.starts_at DESC NULLS LAST
  LIMIT 1;
$$;

-- End an occurrence by id
CREATE OR REPLACE FUNCTION public.end_mass_occurrence(
  p_occurrence_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.mass_occurrences
     SET status = 'ended',
         ends_at = COALESCE(ends_at, now())
   WHERE id = p_occurrence_id;
END
$$;

