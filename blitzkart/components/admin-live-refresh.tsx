"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Radio, RadioTower } from "lucide-react";

export function AdminLiveRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => { if (active) router.refresh(); }, 350);
    };
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | undefined;
    try {
      const supabase = createSupabaseBrowserClient();
      channel = supabase.channel("blitzkart-admin-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_live_events" }, refresh)
        .subscribe((status) => { if (active) setConnected(status === "SUBSCRIBED"); });
    } catch { setConnected(false); }

    // Realtime is low-latency; this short poll also recovers from disconnected tabs/networks.
    const fallback = window.setInterval(() => { if (active) router.refresh(); }, 30_000);
    const visible = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [router]);

  return <span className={`admin-live-status${connected ? " is-live" : " is-fallback"}`} title={connected ? "Database changes refresh this dashboard automatically" : "Automatic refresh is checking for updates every 30 seconds"}>
    {connected ? <RadioTower size={14} aria-hidden="true"/> : <Radio size={14} aria-hidden="true"/>}{connected ? "Live updates" : "Auto refresh"}
  </span>;
}
