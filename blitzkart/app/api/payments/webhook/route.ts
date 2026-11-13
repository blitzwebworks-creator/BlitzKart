import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.UPI_GATEWAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") || "";
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature);
  if (!match || Math.abs(Math.floor(Date.now() / 1000) - Number(match[1])) > 300) return NextResponse.json({ error: "Invalid or expired signature." }, { status: 401 });
  const expected = createHmac("sha256", secret).update(`${match[1]}.${rawBody}`).digest();
  const supplied = Buffer.from(match[2], "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  try {
    const event = JSON.parse(rawBody) as { event_id?: string; event_sequence?: number; event?: string; data?: { order_id?: string; environment?: string } };
    if (!event.event_id || !event.event || !event.data?.order_id || request.headers.get("x-event-id") !== event.event_id) return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
    const configuredEnvironment = process.env.UPI_GATEWAY_ENVIRONMENT || "live";
    if (event.data.environment !== configuredEnvironment || (configuredEnvironment === "sandbox" && process.env.NODE_ENV === "production")) return NextResponse.json({ error: "Payment environment mismatch." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("apply_gateway_event", { p_event: event });
    if (error) throw error;
    return NextResponse.json({ received: true, result: data });
  } catch {
    // Return 500 so the gateway's durable outbox retries the event.
    return NextResponse.json({ error: "The event could not be processed." }, { status: 500 });
  }
}
