-- Create orgs table
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create metrics_occ table for people counting data
CREATE TABLE IF NOT EXISTS metrics_occ (
  id SERIAL PRIMARY KEY,
  org_id UUID REFERENCES orgs(id),
  location_id UUID,
  people_count INTEGER NOT NULL,
  open_seats INTEGER,
  observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confidence DECIMAL(3,2),
  source VARCHAR(50) DEFAULT 'detection'
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS metrics_occ_org_id_idx ON metrics_occ(org_id);
CREATE INDEX IF NOT EXISTS metrics_occ_location_id_idx ON metrics_occ(location_id);
CREATE INDEX IF NOT EXISTS metrics_occ_observed_at_idx ON metrics_occ(observed_at);

-- Enable RLS (Row Level Security)
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_occ ENABLE ROW LEVEL SECURITY;

-- Create policies for orgs table
CREATE POLICY "Users can view all orgs" ON orgs
    FOR SELECT USING (true);

CREATE POLICY "Users can insert orgs" ON orgs
    FOR INSERT WITH CHECK (true);

-- Create policies for metrics_occ table
CREATE POLICY "Users can view all metrics" ON metrics_occ
    FOR SELECT USING (true);

CREATE POLICY "Users can insert metrics" ON metrics_occ
    FOR INSERT WITH CHECK (true);