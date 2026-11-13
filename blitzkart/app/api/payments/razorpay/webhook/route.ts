import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCapturedRazorpayPayment, razorpayEnvironment, verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; status?: string; captured?: boolean } };
    order?: { entity?: { id?: string } };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyRazorpayWebhookSignature(rawBody, request.headers.get("x-razorpay-signature") || "")) return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 401 });
  try {
    const event = JSON.parse(rawBody) as RazorpayEvent;
    if (!event.event || !["payment.captured", "order.paid"].includes(event.event)) return NextResponse.json({ received: true, ignored: true });
    const paymentEntity = event.payload?.payment?.entity;
    const providerOrderId = paymentEntity?.order_id || event.payload?.order?.entity?.id;
    if (!providerOrderId) throw new Error("Razorpay event has no order reference.");
    const admin = createSupabaseAdminClient();
    const { data: order, error } = await admin.from("orders").select("id,total,payment_provider,payment_environment,gateway_order_id").eq("gateway_order_id", providerOrderId).eq("payment_provider", "razorpay").maybeSingle();
    if (error || !order) throw new Error("Razorpay order does not match a BlitzKart order.");
    if ((order.payment_environment === "sandbox" ? "sandbox" : "live") !== razorpayEnvironment()) throw new Error("Razorpay environment does not match the saved order.");
    const payment = await getCapturedRazorpayPayment({ orderId: providerOrderId, paymentId: paymentEntity?.id, amount: Number(order.total) });
    if (!payment) return NextResponse.json({ received: true, pending_capture: true });
    const { error: confirmError } = await admin.rpc("confirm_external_payment", {
      p_order_id: order.id, p_provider: "razorpay", p_gateway_order_id: order.gateway_order_id,
      p_gateway_payment_id: payment.paymentId, p_amount: payment.amount,
      p_environment: order.payment_environment,
    });
    if (confirmError) throw confirmError;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "The Razorpay event could not be processed." }, { status: 500 });
  }
}
