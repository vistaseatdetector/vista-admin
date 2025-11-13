-- Create streams table if it doesn't exist
CREATE TABLE IF NOT EXISTS streams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    location_id UUID,
    kind TEXT NOT NULL DEFAULT 'camera',
    enabled BOOLEAN DEFAULT true,
    
    -- Add foreign key constraints
    CONSTRAINT streams_org_id_fkey FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
    CONSTRAINT streams_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS streams_org_id_idx ON streams(org_id);
CREATE INDEX IF NOT EXISTS streams_kind_idx ON streams(kind);

-- Enable RLS (Row Level Security)
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to access streams for their orgs
CREATE POLICY "Users can view streams for their orgs" ON streams
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM org_members 
            WHERE org_members.org_id = streams.org_id 
            AND org_members.profile_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert streams for their orgs" ON streams
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM org_members 
            WHERE org_members.org_id = streams.org_id 
            AND org_members.profile_id = auth.uid()
            AND org_members.role IN ('admin', 'usher')
        )
    );

CREATE POLICY "Users can update streams for their orgs" ON streams
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM org_members 
            WHERE org_members.org_id = streams.org_id 
            AND org_members.profile_id = auth.uid()
            AND org_members.role IN ('admin', 'usher')
        )
    );

CREATE POLICY "Users can delete streams for their orgs" ON streams
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM org_members 
            WHERE org_members.org_id = streams.org_id 
            AND org_members.profile_id = auth.uid()
            AND org_members.role IN ('admin', 'usher')
        )
    );