"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STREAM_ID = "f38934d1-ea71-43b9-9808-50e9e188e89f"; // paste the id from public.streams

export default function LivePage() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("occupancy").select("current_count")
      .eq("stream_id", STREAM_ID).maybeSingle()
      .then(({ data }) => setCount(data?.current_count ?? 0));

    const ch = supabase.channel(`occ:${STREAM_ID}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "occupancy", filter: `stream_id=eq.${STREAM_ID}` },
      (payload: any) => setCount(payload.new.current_count)
    ).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div style={{ padding: 24, display: "grid", gap: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1>Live Attendance & Video</h1>

      <div style={{ padding:16, borderRadius:12, boxShadow:"0 6px 20px rgba(0,0,0,.08)", background:"white" }}>
        <div style={{ opacity:.7, fontSize:12, textTransform:"uppercase" }}>Current Attendance</div>
        <div style={{ fontSize:56, fontWeight:800 }}>{count ?? "…"}</div>
      </div>

      <div style={{ padding:16, borderRadius:12, boxShadow:"0 6px 20px rgba(0,0,0,.08)", background:"white" }}>
        <div style={{ opacity:.7, fontSize:12, textTransform:"uppercase", marginBottom:8 }}>Live Stream</div>
        <img
          src={process.env.NEXT_PUBLIC_VIDEO_URL ?? "http://localhost:5055/video_feed"}
          alt="Live stream"
          style={{ width:"100%", maxWidth:960, borderRadius:12 }}
        />
      </div>
    </div>
  );
}
