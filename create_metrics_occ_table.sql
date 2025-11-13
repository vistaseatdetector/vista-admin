-- Create metrics_occ table for people counting data
CREATE TABLE IF NOT EXISTS metrics_occ (
  id SERIAL PRIMARY KEY,
  org_id UUID REFERENCES orgs(id),
  location_id UUID REFERENCES locations(id),
  people_count INTEGER NOT NULL,
  open_seats INTEGER,
  observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confidence DECIMAL(3,2), -- Computer vision confidence score
  source VARCHAR(50) DEFAULT 'detection'
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS metrics_occ_org_id_idx ON metrics_occ(org_id);
CREATE INDEX IF NOT EXISTS metrics_occ_location_id_idx ON metrics_occ(location_id);
CREATE INDEX IF NOT EXISTS metrics_occ_observed_at_idx ON metrics_occ(observed_at);

-- Enable RLS (Row Level Security)
ALTER TABLE metrics_occ ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view metrics for their orgs
CREATE POLICY "Users can view metrics for their orgs" ON metrics_occ
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM org_members 
            WHERE org_members.org_id = metrics_occ.org_id 
            AND org_members.profile_id = auth.uid()
        )
    );

-- Create policy to allow service role to insert data
CREATE POLICY "Service role can insert metrics" ON metrics_occ
    FOR INSERT WITH CHECK (true);

-- Create policy to allow service role to select data
CREATE POLICY "Service role can select metrics" ON metrics_occ
    FOR SELECT USING (true);