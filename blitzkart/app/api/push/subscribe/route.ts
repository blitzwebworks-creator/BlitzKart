import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
});
const bodySchema = z.object({ audience: z.literal("admin"), subscription: subscriptionSchema });
const deleteSchema = z.object({ audience: z.literal("admin"), endpoint: z.string().url().max(2048) });

async function authorizedAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const admin = createSupabaseAdminClient();
  const { data: adminUser, error } = await admin.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (error || !adminUser?.active) return null;
  return { admin, user };
}

export async function POST(request: Request) {
  const auth = await authorizedAdmin();
  if (!auth) return NextResponse.json({ error: "Administrator sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const body = bodySchema.parse(await request.json());
    const endpoint = new URL(body.subscription.endpoint);
    if (endpoint.protocol !== "https:") return NextResponse.json({ error: "The push endpoint must use HTTPS." }, { status: 400 });
    const { error } = await auth.admin.from("web_push_subscriptions").upsert({
      user_id: auth.user.id,
      audience: body.audience,
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) {
      console.error("Admin push subscription could not be saved.", { code: error.code });
      return NextResponse.json({ error: "This device could not be registered for notifications." }, { status: 503 });
    }
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "The browser returned an invalid notification subscription." }, { status: 400 });
    return NextResponse.json({ error: "This device could not be registered for notifications." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorizedAdmin();
  if (!auth) return NextResponse.json({ error: "Administrator sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const body = deleteSchema.parse(await request.json());
    const { error } = await auth.admin.from("web_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: "This device could not be removed from notifications." }, { status: 503 });
    return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The notification subscription could not be removed." }, { status: 400 });
  }
}
