import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 });
  const { data: admin } = await supabase.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (!admin?.active) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  let body: { order_reference?: unknown; email?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Enter the order and customer details." }, { status: 400 }); }
  const orderReference = String(body.order_reference ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 320);
  if (!orderReference || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid order ID and customer email." }, { status: 400 });
  const { data, error } = await supabase.rpc("admin_lookup_return", { p_order_reference: orderReference, p_customer_email: email });
  if (error) {
    const unavailable = error.code === "PGRST202" || error.message.toLowerCase().includes("schema cache");
    return NextResponse.json({ error: unavailable ? "Return lookup is unavailable. Apply migration 0017 and try again." : error.message }, { status: unavailable ? 503 : 400 });
  }
  return NextResponse.json(data);
}
