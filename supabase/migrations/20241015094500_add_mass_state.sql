DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mass_status') THEN
    CREATE TYPE mass_status AS ENUM ('scheduled','live','ended','canceled');
  END IF;
END $$;

ALTER TABLE public.masses
  ADD COLUMN IF NOT EXISTS status mass_status DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_masses_org_scheduled ON public.masses (org_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_masses_status ON public.masses (status);

CREATE TABLE IF NOT EXISTS public.org_states (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  current_mass_id uuid REFERENCES public.masses(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.start_mass(p_org_id uuid, p_mass_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.masses
    SET status='ended', ended_at=COALESCE(ended_at, now())
  WHERE org_id=p_org_id AND status='live';

  UPDATE public.masses
    SET status='live', started_at=COALESCE(started_at, now())
  WHERE id=p_mass_id;

  INSERT INTO public.org_states (org_id, current_mass_id, updated_at)
  VALUES (p_org_id, p_mass_id, now())
  ON CONFLICT (org_id) DO UPDATE
    SET current_mass_id=EXCLUDED.current_mass_id, updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.create_and_start_mass(p_org_id uuid, p_name text, p_user uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_mass_id uuid;
BEGIN
  INSERT INTO public.masses (id, org_id, name, status, started_at, created_by)
  VALUES (gen_random_uuid(), p_org_id, p_name, 'live', now(), p_user)
  RETURNING id INTO v_mass_id;

  PERFORM public.start_mass(p_org_id, v_mass_id);
  RETURN v_mass_id;
END;
$$;
