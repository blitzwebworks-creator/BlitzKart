import { NextResponse } from "next/server";
import { createRazorpayOrder, razorpayEnvironment, razorpayKeyId } from "@/lib/payments/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to pay for this order." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
  if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot access orders." }, { status: 403 });
  let body: { order_id?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Choose a valid order." }, { status: 400 }); }
  const orderId = String(body.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Choose a valid order." }, { status: 400 });
  try {
    if (razorpayEnvironment() !== "live") return NextResponse.json({ error: "Online payment is unavailable while the payment gateway is in test mode." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Razorpay is not configured for online payments." }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order, error: orderError } = await admin.from("orders")
    .select("id,customer_id,order_number,status,payment_status,payment_environment,payment_provider,gateway_order_id,total,delivery_address,order_source")
    .eq("id", orderId).eq("customer_id", user.id).maybeSingle();
  if (orderError) return NextResponse.json({ error: "Order payment could not be loaded." }, { status: 503 });
  if (!order || order.order_source !== "admin") return NextResponse.json({ error: "This order cannot use this payment flow." }, { status: 404 });
  if (order.payment_status !== "pending" || order.status !== "pending" || order.payment_environment !== "live") {
    return NextResponse.json({ error: "This order is no longer eligible for payment." }, { status: 409 });
  }
  if (Number(order.total) < 1) return NextResponse.json({ error: "This order has no payable Razorpay amount. Contact BlitzKart support." }, { status: 400 });

  let razorpayOrderId = order.gateway_order_id;
  if (razorpayOrderId) {
    if (order.payment_provider !== "razorpay") return NextResponse.json({ error: "This order has a different payment provider." }, { status: 409 });
  } else {
    try {
      const payment = await createRazorpayOrder({ orderId: order.id, orderNumber: order.order_number, amount: Number(order.total) });
      const { error: saveError } = await admin.rpc("store_payment_session", {
        p_order_id: order.id, p_provider: "razorpay", p_gateway_order_id: payment.id,
        p_payment_url: null, p_environment: "live",
      });
      if (saveError) {
        const { data: current } = await admin.from("orders").select("gateway_order_id,payment_provider,payment_status").eq("id", order.id).maybeSingle();
        if (!current || current.payment_status !== "pending" || current.payment_provider !== "razorpay" || !current.gateway_order_id) throw saveError;
        razorpayOrderId = current.gateway_order_id;
      } else razorpayOrderId = payment.id;
    } catch (error) {
      console.error("Admin-created order payment session failed", error);
      return NextResponse.json({ error: "Razorpay could not start payment for this order. Try again or contact BlitzKart support." }, { status: 502 });
    }
  }
  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number,
    keyId: razorpayKeyId(),
    razorpayOrderId,
    amount: Math.round(Number(order.total) * 100),
    currency: "INR",
    customer: {
      name: String(order.delivery_address?.recipient_name ?? "Customer"),
      email: user.email ?? "",
      phone: String(order.delivery_address?.phone ?? ""),
    },
  });
}
