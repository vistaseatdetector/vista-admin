-- Handle user profile creation automatically
-- This function will be called whenever a new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create an 'orgs' table that matches what the code expects
CREATE TABLE IF NOT EXISTS public.orgs (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on orgs table
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view orgs
CREATE POLICY "Authenticated users can view orgs" 
  ON public.orgs FOR SELECT 
  TO authenticated 
  USING (true);

-- Insert some default data
INSERT INTO public.orgs (id, name, slug) VALUES 
  ('st-mark-parish', 'St. Mark Parish', 'st-mark')
ON CONFLICT (id) DO NOTHING;