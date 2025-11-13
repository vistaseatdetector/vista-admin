-- Ensure enum role_type exists and includes expected labels
-- This guards against errors like: invalid input value for enum role_type: "owner"

DO $$
BEGIN
  -- Create enum if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t WHERE t.typname = 'role_type'
  ) THEN
    EXECUTE 'CREATE TYPE role_type AS ENUM (''owner'',''admin'',''usher'',''viewer'')';
  END IF;
END $$;

-- Add missing labels if needed (order not critical for our use case)
DO $$
DECLARE
  lbl text;
BEGIN
  FOREACH lbl IN ARRAY ARRAY['owner','admin','usher','viewer'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'role_type' AND e.enumlabel = lbl
    ) THEN
      EXECUTE format('ALTER TYPE role_type ADD VALUE %L', lbl);
    END IF;
  END LOOP;
END $$;

