-- Quick fix for streams table RLS policy issue
-- Run this in your Supabase SQL Editor

-- Step 1: Ensure the streams table exists with proper structure
CREATE TABLE IF NOT EXISTS public.streams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    location_id UUID,
    kind TEXT NOT NULL DEFAULT 'camera',
    enabled BOOLEAN DEFAULT true
);

-- Step 2: Ensure RLS is enabled
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing conflicting functions and policies
DROP FUNCTION IF EXISTS public.is_org_admin(uuid);
DROP FUNCTION IF EXISTS public.is_org_admin(p_org uuid);
DROP POLICY IF EXISTS "Users can view streams for their orgs" ON public.streams;
DROP POLICY IF EXISTS "Users can insert streams for their orgs" ON public.streams;
DROP POLICY IF EXISTS "Users can update streams for their orgs" ON public.streams;
DROP POLICY IF EXISTS "Users can delete streams for their orgs" ON public.streams;
DROP POLICY IF EXISTS "Allow authenticated users to manage streams" ON public.streams;

-- Step 4: Create a simple function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(target_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Try user_org_roles first (if it exists)
  IF to_regclass('public.user_org_roles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'user_id'
    ) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id AND user_id = auth.uid()
      );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'profile_id'
    ) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id AND profile_id = auth.uid()
      );
    END IF;
  END IF;
  
  -- Fallback to org_memberships
  IF to_regclass('public.org_memberships') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.org_memberships 
      WHERE org_id = target_org_id AND profile_id = auth.uid()
    );
  END IF;
  
  -- If no membership tables exist, allow access for now
  RETURN true;
END;
$$;

-- Step 5: Create a function to check if user can manage streams
CREATE OR REPLACE FUNCTION public.user_can_manage_streams(target_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Try user_org_roles first (if it exists)
  IF to_regclass('public.user_org_roles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'user_id'
    ) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND user_id = auth.uid()
          AND role IN ('admin', 'owner', 'usher')
      );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_org_roles' 
        AND column_name = 'profile_id'
    ) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_org_roles 
        WHERE org_id = target_org_id 
          AND profile_id = auth.uid()
          AND role IN ('admin', 'owner', 'usher')
      );
    END IF;
  END IF;
  
  -- Fallback to org_memberships
  IF to_regclass('public.org_memberships') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.org_memberships 
      WHERE org_id = target_org_id 
        AND profile_id = auth.uid()
        AND role IN ('admin', 'owner', 'usher')
    );
  END IF;
  
  -- If no membership tables exist, allow management for now
  RETURN true;
END;
$$;

-- Step 6: Grant function permissions
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_streams(uuid) TO authenticated;

-- Step 7: Create simple RLS policies
CREATE POLICY "view_streams" ON public.streams
    FOR SELECT 
    USING (public.user_belongs_to_org(org_id));

CREATE POLICY "manage_streams" ON public.streams
    FOR ALL 
    USING (public.user_can_manage_streams(org_id))
    WITH CHECK (public.user_can_manage_streams(org_id));