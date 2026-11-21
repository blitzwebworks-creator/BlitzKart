import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: "Push notifications are not configured on this website yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}
