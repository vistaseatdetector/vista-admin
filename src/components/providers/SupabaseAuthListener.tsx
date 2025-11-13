"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SupabaseAuthListener({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.refresh(); // forces server components to re-check cookies
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}
