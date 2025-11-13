-- Migration: Remove Vista M7 Integration
-- Date: 2025-10-01
-- Purpose: Remove all Vista M7 related database objects and schema
-- 
-- This migration removes:
-- - vista schema and all associated tables/functions
-- - source column from metrics_occ table (if it exists)
-- - Any vista-specific RLS policies
--
-- REVERSIBILITY: This migration removes data permanently. 
-- To restore, you would need to re-run the original vista schema migration
-- and restore any data from backups.

BEGIN;

-- Drop vista schema if it exists (this will cascade to all tables/functions within)
DROP SCHEMA IF EXISTS vista CASCADE;

-- Remove source column from metrics_occ if it exists
-- (This column was added specifically for vista_m7 integration)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'metrics_occ' AND column_name = 'source') THEN
        ALTER TABLE metrics_occ DROP COLUMN source;
        RAISE NOTICE 'Removed source column from metrics_occ table';
    END IF;
END $$;

-- Remove any vista-specific RLS policies
-- (These would have been named with 'vista' prefix/suffix)
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT schemaname, tablename, policyname
        FROM pg_policies 
        WHERE policyname ILIKE '%vista%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
                      policy_record.policyname, 
                      policy_record.schemaname, 
                      policy_record.tablename);
        RAISE NOTICE 'Removed policy: % on %.%', 
                     policy_record.policyname, 
                     policy_record.schemaname, 
                     policy_record.tablename;
    END LOOP;
END $$;

-- Remove any vista-specific functions in public schema
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname as schema_name, p.proname as function_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname ILIKE '%vista%'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I.%I CASCADE', 
                      func_record.schema_name, 
                      func_record.function_name);
        RAISE NOTICE 'Removed function: %.%', 
                     func_record.schema_name, 
                     func_record.function_name;
    END LOOP;
END $$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Vista M7 integration removal completed successfully';
    RAISE NOTICE 'Removed: vista schema, source column, vista policies, and vista functions';
END $$;

COMMIT;