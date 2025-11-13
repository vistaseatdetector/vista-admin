// Minimal per-minute tick that calls the RPC autostart_autoend_tick
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // Service role key bypasses RLS
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase.rpc("autostart_autoend_tick", {});
  if (error) {
    console.error("autostart_autoend_tick error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, result: data }),
    { headers: { "Content-Type": "application/json" } }
  );
});
