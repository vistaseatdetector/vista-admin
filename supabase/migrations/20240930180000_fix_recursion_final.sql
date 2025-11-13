-- Fix recursion: define is_org_admin to only use user_org_roles and avoid org_memberships

-- We DO NOT drop the function, because many RLS policies depend on it.
-- Instead, we keep the same signature and parameter name (p_org) and just
-- replace the function body.

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Only check user_org_roles table (never org_memberships to avoid recursion)
  IF to_regclass('public.user_org_roles') IS NOT NULL THEN
    -- Check if user_id column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_org_roles'
        AND column_name = 'user_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.user_org_roles
        WHERE org_id = p_org
          AND user_id = auth.uid()
          AND role IN ('admin', 'owner')
      ) INTO is_admin;

    -- Check if profile_id column exists instead
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_org_roles'
        AND column_name = 'profile_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.user_org_roles
        WHERE org_id = p_org
          AND profile_id = auth.uid()
          AND role IN ('admin', 'owner')
      ) INTO is_admin;
    END IF;
  END IF;

  RETURN COALESCE(is_admin, false);
END;
$$;
