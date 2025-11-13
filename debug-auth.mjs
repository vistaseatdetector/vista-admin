import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wfiwrvvrzfepcwjfrare.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmaXdydnZyemZlcGN3amZyYXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NDQ3MTMsImV4cCI6MjA3MzUyMDcxM30.2DF4SnnN9HrEejeRPJF64boUZ45pAgbHerKgD_XDsp8';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔄 Testing Supabase authentication...');

async function testAuth() {
  try {
    // Test basic connection
    console.log('\n1. Testing basic API connectivity...');
    const { data, error } = await supabase.from('user_org_roles').select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ API Error:', error.message);
      console.error('Details:', error);
    } else {
      console.log('✅ API connection successful');
    }

    // Test auth session
    console.log('\n2. Testing auth session...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('ℹ️ Auth error (expected for no session):', authError.message);
    } else if (user) {
      console.log('✅ User authenticated:', user.email);
    } else {
      console.log('ℹ️ No user session (expected)');
    }

    // Test auth sign up capability
    console.log('\n3. Testing auth configuration...');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: 'test@example.com',
        password: 'testpassword123'
      });
      
      if (error) {
        if (error.message.includes('User already registered')) {
          console.log('✅ Auth is configured (user already exists)');
        } else if (error.message.includes('signup is disabled')) {
          console.log('⚠️ Signup is disabled - check Supabase auth settings');
        } else {
          console.log('❌ Auth configuration error:', error.message);
        }
      } else {
        console.log('✅ Auth signup test successful');
      }
    } catch (err) {
      console.error('❌ Auth test failed:', err);
    }

  } catch (error) {
    console.error('❌ Connection failed:', error);
  }
}

testAuth();