-- Create doors table: per-user, per-org saved doors
CREATE TABLE IF NOT EXISTS public.doors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  camera_id text NOT NULL,
  camera_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS doors_org_id_idx ON public.doors(org_id);
CREATE INDEX IF NOT EXISTS doors_user_id_idx ON public.doors(user_id);

-- Enable RLS
ALTER TABLE public.doors ENABLE ROW LEVEL SECURITY;

-- Policies: a user can manage their own doors
CREATE POLICY "doors_select_own" ON public.doors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "doors_insert_own" ON public.doors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "doors_update_own" ON public.doors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "doors_delete_own" ON public.doors
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

