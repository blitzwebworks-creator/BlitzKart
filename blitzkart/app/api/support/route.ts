import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeIndianMobile } from "@/lib/india";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(20).optional().default(""),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
  website: z.string().max(200).optional().default(""),
});

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 20000) return NextResponse.json({ error: "The message is too large." }, { status: 413 });
  const requestOrigin = request.headers.get("origin");
  let expectedOrigin: string;
  try { expectedOrigin = new URL(request.url).origin; }
  catch { return NextResponse.json({ error: "Support is not available right now." }, { status: 503 }); }
  if (requestOrigin && requestOrigin !== expectedOrigin) return NextResponse.json({ error: "This request could not be accepted." }, { status: 403 });

  try {
    const input = schema.parse(await request.json());
    if (input.website) return NextResponse.json({ received: true });
    const phone = input.phone ? normalizeIndianMobile(input.phone) : null;
    if (input.phone && !phone) return NextResponse.json({ error: "Enter a valid Indian mobile number or leave the phone field blank." }, { status: 400 });
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Support messaging is not configured yet." }, { status: 503 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = request.headers.get("x-real-ip") || forwarded?.split(",").at(-1)?.trim() || "unknown";
    const rateKey = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY).update(ip).digest("hex");
    const { data: requestId, error } = await admin.rpc("submit_public_support_request", {
      p_rate_key: rateKey,
      p_customer_id: user?.id ?? null,
      p_contact_name: input.name,
      p_contact_email: input.email.toLowerCase(),
      p_contact_phone: phone,
      p_subject: input.subject,
      p_message: input.message,
    });
    if (error) return NextResponse.json({ error: "Your request could not be saved. Please try again later." }, { status: 503 });
    if (!requestId) return NextResponse.json({ error: "Too many support requests were sent from this connection. Please try again later." }, { status: 429 });
    return NextResponse.json({ received: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the contact details and message, then try again." }, { status: 400 });
    return NextResponse.json({ error: "Your request could not be sent. Please try again later." }, { status: 400 });
  }
}
