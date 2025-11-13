-- Create streams table for managing cameras (webcams and RTSP)
-- This fixes the "new row violates row-level security policy for table streams" error

-- Create streams table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.streams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    location_id UUID,
    kind TEXT NOT NULL DEFAULT 'camera',
    enabled BOOLEAN DEFAULT true,
    
    -- Add foreign key constraint to organizations table
    CONSTRAINT streams_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS streams_org_id_idx ON public.streams(org_id);
CREATE INDEX IF NOT EXISTS streams_kind_idx ON public.streams(kind);

-- Enable RLS (Row Level Security)
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

-- Create function to check if user has access to org streams
-- Uses user_org_roles table to avoid recursion issues
CREATE OR REPLACE FUNCTION public.user_can_access_org_streams(target_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  has_access boolean := false;
BEGIN
  -- Check using user_org_roles table (primary table to avoid recursion)
  IF to_regclass('public.user_org_roles') IS NOT NULL THEN
    -- Check if user_id column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'user_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND user_id = auth.uid()
      ) INTO has_access;
    -- Check if profile_id column exists instead
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'profile_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND profile_id = auth.uid()
      ) INTO has_access;
    END IF;
  -- Fallback to org_memberships if user_org_roles doesn't work
  ELSIF to_regclass('public.org_memberships') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.org_memberships 
      WHERE org_id = target_org_id 
        AND profile_id = auth.uid()
    ) INTO has_access;
  END IF;

  RETURN COALESCE(has_access, false);
END;
$$;

-- Create function to check if user can manage org streams (admin/owner/usher roles)
CREATE OR REPLACE FUNCTION public.user_can_manage_org_streams(target_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  can_manage boolean := false;
BEGIN
  -- Check using user_org_roles table (primary table to avoid recursion)
  IF to_regclass('public.user_org_roles') IS NOT NULL THEN
    -- Check if user_id column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'user_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND user_id = auth.uid()
          AND role IN ('admin', 'owner', 'usher')
      ) INTO can_manage;
    -- Check if profile_id column exists instead
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'profile_id'
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND profile_id = auth.uid()
          AND role IN ('admin', 'owner', 'usher')
      ) INTO can_manage;
    END IF;
  -- Fallback to org_memberships if user_org_roles doesn't work
  ELSIF to_regclass('public.org_memberships') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.org_memberships 
      WHERE org_id = target_org_id 
        AND profile_id = auth.uid()
        AND role IN ('admin', 'owner', 'usher')
    ) INTO can_manage;
  END IF;

  RETURN COALESCE(can_manage, false);
END;
$$;

-- Grant permissions on the functions
REVOKE ALL ON FUNCTION public.user_can_access_org_streams(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.user_can_access_org_streams(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_org_streams(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.user_can_manage_org_streams(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.user_can_manage_org_streams(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_org_streams(uuid) TO service_role;

-- Create RLS policies for streams table
CREATE POLICY "Users can view streams for their orgs" ON public.streams
    FOR SELECT 
    USING (public.user_can_access_org_streams(org_id));

CREATE POLICY "Users can insert streams for their orgs" ON public.streams
    FOR INSERT 
    WITH CHECK (public.user_can_manage_org_streams(org_id));

CREATE POLICY "Users can update streams for their orgs" ON public.streams
    FOR UPDATE 
    USING (public.user_can_manage_org_streams(org_id))
    WITH CHECK (public.user_can_manage_org_streams(org_id));

CREATE POLICY "Users can delete streams for their orgs" ON public.streams
    FOR DELETE 
    USING (public.user_can_manage_org_streams(org_id));