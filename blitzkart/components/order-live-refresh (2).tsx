"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function OrderLiveRefresh({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    let timer: number | undefined;
    const refresh = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (active) router.refresh(); }, 200);
    };
    try {
      supabase = createSupabaseBrowserClient();
      channel = supabase.channel(`blitzkart-order-${orderId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, refresh)
        .subscribe();
    } catch (error) {
      console.warn("Order live updates are unavailable; periodic refresh remains active.", error);
    }
    const fallback = window.setInterval(refresh, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [orderId, router]);
  return null;
}
