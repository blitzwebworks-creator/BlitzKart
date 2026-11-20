import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false, address: null }, { headers: { "Cache-Control": "no-store" } });
    const { data, error } = await supabase.from("addresses")
      .select("id,recipient_name,locality,city,postal_code,is_default,updated_at")
      .eq("customer_id", user.id).eq("is_default", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: "The saved delivery address could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ authenticated: true, address: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The saved delivery address could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
