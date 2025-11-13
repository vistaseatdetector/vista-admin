-- Create door_zones table for managing door detection areas
CREATE TABLE IF NOT EXISTS door_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  stream_id TEXT NOT NULL,
  name TEXT NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_door_zones_org_id ON door_zones(org_id);
CREATE INDEX IF NOT EXISTS idx_door_zones_stream_id ON door_zones(stream_id);

-- Add RLS policy
ALTER TABLE door_zones ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access door zones for orgs they belong to
CREATE POLICY "Users can access door zones for their orgs" ON door_zones
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id 
      FROM user_org_roles 
      WHERE user_id = auth.uid()
    )
  );