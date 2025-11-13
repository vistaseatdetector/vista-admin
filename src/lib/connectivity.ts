// Utility to check network connectivity and Supabase status
export async function checkConnectivity() {
  const checks = {
    internet: false,
    supabase: false,
    database: false
  };

  try {
    // Check internet connectivity
    const response = await fetch('https://httpbin.org/get', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    checks.internet = response.ok;
  } catch {
    checks.internet = false;
  }

  if (checks.internet) {
    try {
      // Check Supabase connectivity
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'GET',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          signal: AbortSignal.timeout(5000)
        });
        checks.supabase = response.status < 500; // Accept auth errors, just not server errors
      }
    } catch {
      checks.supabase = false;
    }
  }

  return checks;
}

export function getConnectivityMessage(checks: Awaited<ReturnType<typeof checkConnectivity>>) {
  if (!checks.internet) {
    return "No internet connection. Please check your network connection and try again.";
  }
  
  if (!checks.supabase) {
    return "Cannot connect to authentication service. The service may be temporarily unavailable.";
  }
  
  return "Connection established but authentication is taking longer than expected.";
}