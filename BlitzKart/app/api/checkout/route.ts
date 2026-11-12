import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGatewayOrder } from "@/lib/payments/gateway";

export const runtime = "nodejs";
const schema = z.object({
  lines: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  coupon_code: z.string().trim().max(64).optional().default(""),
  address: z.object({
    recipient_name: z.string().trim().min(1).max(100), phone: z.string().trim().min(7).max(20),
    address_line1: z.string().trim().min(1).max(200), address_line2: z.string().trim().max(200).optional().default(""),
    locality: z.string().trim().min(1).max(100), city: z.string().trim().min(1).max(100), state: z.string().trim().min(1).max(100),
    postal_code: z.string().trim().regex(/^[0-9]{6}$/), landmark: z.string().trim().max(100).optional().default(""),
  }),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id",user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot place orders." }, { status: 403 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.UPI_GATEWAY_URL || !process.env.UPI_GATEWAY_API_KEY || !process.env.UPI_GATEWAY_API_SECRET || !process.env.UPI_GATEWAY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Server-side Supabase and UPI Gateway settings are required before checkout can accept payment." }, { status: 503 });
    }
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.NODE_ENV === "production" && (!configuredSiteUrl || !configuredSiteUrl.startsWith("https://"))) {
      return NextResponse.json({ error: "Set the public BlitzKart URL to HTTPS before accepting live payments." }, { status: 503 });
    }
    let siteUrl: URL;
    try { siteUrl = new URL(configuredSiteUrl || new URL(request.url).origin); }
    catch { return NextResponse.json({ error: "The public BlitzKart URL is invalid." }, { status: 503 }); }
    if (siteUrl.username || siteUrl.password || (process.env.NODE_ENV === "production" && siteUrl.protocol !== "https:")) {
      return NextResponse.json({ error: "The public BlitzKart URL must be a valid HTTPS origin in production." }, { status: 503 });
    }
    const paymentEnvironment = process.env.UPI_GATEWAY_ENVIRONMENT || "live";
    if (!["live","sandbox"].includes(paymentEnvironment) || (paymentEnvironment === "sandbox" && process.env.NODE_ENV === "production")) {
      return NextResponse.json({ error: "Sandbox payments are disabled in production. Configure live merchant credentials." }, { status: 503 });
    }

    const admin = createSupabaseAdminClient();
    const { data: orderId, error: orderError } = await admin.rpc("place_order", { p_customer_id: user.id, p_address: body.address, p_lines: body.lines, p_coupon_code: body.coupon_code });
    if (orderError || !orderId) return NextResponse.json({ error: orderError?.message || "The order could not be created." }, { status: 400 });

    const { data: order, error: fetchError } = await admin.from("orders").select("id,total,order_number").eq("id", orderId).single();
    if (fetchError || !order) return NextResponse.json({ error: "The order was saved, but payment could not be started. Contact support with your order reference." }, { status: 500 });

    try {
      const returnUrl = new URL("/checkout/confirmed", siteUrl.origin);
      returnUrl.searchParams.set("order_id", order.id);
      const payment = await createGatewayOrder({
        orderId: order.id, amount: Number(order.total), customerName: body.address.recipient_name,
        customerEmail: user.email || "", mobile: body.address.phone,
        redirectUrl: returnUrl.toString(),
      });
      if ((paymentEnvironment === "sandbox") !== Boolean(payment.test)) throw new Error("Gateway environment did not match the configured payment environment.");
      if (payment.client_order_id !== order.id || Math.round(Number(payment.amount) * 100) !== Math.round(Number(order.total) * 100)) throw new Error("Gateway amount or order reference did not match.");
      const paymentUrl = new URL(payment.payment_url);
      const gatewayUrl = new URL(process.env.UPI_GATEWAY_URL);
      if (paymentUrl.protocol !== "https:" || paymentUrl.host !== gatewayUrl.host) throw new Error("Gateway returned an unexpected checkout URL.");
      const { error: saveError } = await admin.rpc("store_gateway_session", { p_order_id: order.id, p_gateway_order_id: payment.order_id, p_payment_url: payment.payment_url, p_expires_at: payment.expires_at || null, p_environment: paymentEnvironment });
      if (saveError) throw new Error("The payment session could not be linked to this order.");
      return NextResponse.json({ orderNumber: order.order_number, paymentUrl: payment.payment_url, total: Number(order.total) });
    } catch (error) {
      await admin.rpc("fail_gateway_initialization", { p_order_id: order.id });
      throw error;
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Please check the checkout details." : error instanceof Error ? error.message : "Checkout could not be started.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
