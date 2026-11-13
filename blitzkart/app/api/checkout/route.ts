import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, razorpayEnvironment, razorpayKeyId } from "@/lib/payments/razorpay";
import { createPayUCheckout, payuEnvironment } from "@/lib/payments/payu";
import { isDelhiState, isNewDelhiCity, NEW_DELHI_CITY, normalizeIndianMobile } from "@/lib/india";

export const runtime = "nodejs";
const schema = z.object({
  payment_provider: z.enum(["razorpay", "payu"]),
  lines: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  coupon_code: z.string().trim().max(64).optional().default(""),
  address: z.object({
    recipient_name: z.string().trim().min(1).max(100), phone: z.string().trim().min(10).max(20),
    address_line1: z.string().trim().min(1).max(200), address_line2: z.string().trim().max(200).optional().default(""),
    locality: z.string().trim().min(1).max(100), city: z.string().trim().refine(isNewDelhiCity, "Delivery is available only in New Delhi."), state: z.string().trim().refine(isDelhiState, "Enter Delhi as the delivery state or union territory."),
    postal_code: z.string().trim().regex(/^110[0-9]{3}$/, "Enter a valid Delhi PIN code."), landmark: z.string().trim().max(100).optional().default(""),
  }),
});

function publicSiteUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NODE_ENV === "production" && (!configured || !configured.startsWith("https://"))) throw new Error("Set the public BlitzKart URL to HTTPS before accepting live payments.");
  let site: URL;
  try { site = new URL(configured || new URL(request.url).origin); }
  catch { throw new Error("The public BlitzKart URL is invalid."); }
  if (site.username || site.password || (process.env.NODE_ENV === "production" && site.protocol !== "https:")) throw new Error("The public BlitzKart URL must be a valid HTTPS origin in production.");
  return site;
}

const customerSafeOrderErrors = [
  "An active customer account is required",
  "Your cart is empty",
  "Please provide a complete delivery address",
  "Delivery is not available for this PIN code yet",
  "Delivery is not available for this New Delhi PIN code yet",
  "Delivery is currently available only in New Delhi",
  "A valid Indian mobile number is required for delivery",
  "Quantity is outside the allowed range",
  "A product in your cart is unavailable",
  "Insufficient stock for ",
  "This coupon is not valid",
  "This coupon has expired",
  "Your cart does not meet this coupon minimum",
  "This coupon has reached its usage limit",
];

function checkoutOrderErrorMessage(rawMessage: string | undefined) {
  const safeMessage = customerSafeOrderErrors.find((prefix) => rawMessage?.startsWith(prefix));
  return safeMessage ? rawMessage! : "We couldn’t place your order right now. Please refresh and try again.";
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const normalizedPhone = normalizeIndianMobile(body.address.phone);
    if (!normalizedPhone) return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number for delivery updates." }, { status: 400 });
    body.address.phone = normalizedPhone;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot place orders." }, { status: 403 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Server-side Supabase settings are required before checkout can accept payment." }, { status: 503 });
    if (body.payment_provider === "payu" && !user.email) return NextResponse.json({ error: "Add a verified email address to your account before choosing PayU." }, { status: 400 });

    let paymentEnvironment: "live" | "sandbox";
    try {
      paymentEnvironment = body.payment_provider === "razorpay" ? razorpayEnvironment() : payuEnvironment();
      if (paymentEnvironment === "sandbox" && process.env.NODE_ENV === "production") throw new Error("Test payments are disabled on the live website. Configure live merchant credentials.");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "The selected payment provider is not configured." }, { status: 503 });
    }
    const siteUrl = publicSiteUrl(request);
    const admin = createSupabaseAdminClient();
    const { data: serviceableZone, error: zoneError } = await admin.from("delivery_zones").select("postal_code").eq("postal_code", body.address.postal_code).eq("city", NEW_DELHI_CITY).eq("is_active", true).maybeSingle();
    if (zoneError) return NextResponse.json({ error: "New Delhi delivery availability could not be checked." }, { status: 503 });
    if (!serviceableZone) return NextResponse.json({ error: "We currently deliver only to New Delhi PIN codes configured for service." }, { status: 400 });

    const { data: orderId, error: orderError } = await admin.rpc("place_order", { p_customer_id: user.id, p_address: body.address, p_lines: body.lines, p_coupon_code: body.coupon_code });
    if (orderError || !orderId) return NextResponse.json({ error: checkoutOrderErrorMessage(orderError?.message) }, { status: 400 });
    const { data: order, error: fetchError } = await admin.from("orders").select("id,total,order_number").eq("id", orderId).single();
    if (fetchError || !order) return NextResponse.json({ error: "The order was saved, but payment could not be started. Contact support with your order reference." }, { status: 500 });

    try {
      if (body.payment_provider === "razorpay") {
        const payment = await createRazorpayOrder({ orderId: order.id, orderNumber: order.order_number, amount: Number(order.total) });
        const { error: saveError } = await admin.rpc("store_payment_session", {
          p_order_id: order.id, p_provider: "razorpay", p_gateway_order_id: payment.id,
          p_payment_url: null, p_environment: paymentEnvironment,
        });
        if (saveError) throw new Error("The Razorpay order could not be linked to this BlitzKart order.");
        return NextResponse.json({
          provider: "razorpay", orderId: order.id, orderNumber: order.order_number,
          keyId: razorpayKeyId(), razorpayOrderId: payment.id, amount: payment.amount, currency: payment.currency,
          customer: { name: body.address.recipient_name, email: user.email || "", phone: body.address.phone },
        });
      }

      const callbackUrl = new URL("/api/payments/payu/return", siteUrl.origin).toString();
      const payment = createPayUCheckout({
        orderId: order.id, amount: Number(order.total), customerName: body.address.recipient_name,
        email: user.email || "", phone: body.address.phone,
        address: { line1: body.address.address_line1, line2: body.address.address_line2, city: body.address.city, state: body.address.state, postalCode: body.address.postal_code },
        callbackUrl,
      });
      const { error: saveError } = await admin.rpc("store_payment_session", {
        p_order_id: order.id, p_provider: "payu", p_gateway_order_id: payment.txnid,
        p_payment_url: payment.action, p_environment: paymentEnvironment,
      });
      if (saveError) throw new Error("The PayU session could not be linked to this BlitzKart order.");
      return NextResponse.json({ provider: "payu", orderId: order.id, orderNumber: order.order_number, paymentUrl: payment.action, fields: payment.fields });
    } catch (error) {
      await admin.rpc("fail_gateway_initialization", { p_order_id: order.id });
      throw error;
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Please check the checkout details." : error instanceof Error ? error.message : "Checkout could not be started.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
