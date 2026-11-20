import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCapturedRazorpayPayment, razorpayEnvironment, verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; status?: string; captured?: boolean } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; currency?: string; status?: string; receipt?: string | null; notes?: Record<string,string> | null; error_reason?: string | null; error_description?: string | null } };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyRazorpayWebhookSignature(rawBody, request.headers.get("x-razorpay-signature") || "")) return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 401 });
  try {
    const event = JSON.parse(rawBody) as RazorpayEvent;
    if (["refund.created", "refund.processed", "refund.failed"].includes(event.event || "")) {
      const entity = event.payload?.refund?.entity;
      const eventId = request.headers.get("x-razorpay-event-id")?.trim();
      if (!eventId || !entity?.id || !entity.payment_id || !Number.isSafeInteger(entity.amount) || (entity.currency && entity.currency !== "INR")) {
        return NextResponse.json({ error: "Razorpay refund event is incomplete." }, { status: 400 });
      }
      const admin = createSupabaseAdminClient();
      const { data: result, error } = await admin.rpc("apply_razorpay_refund_webhook", {
        p_event_id: eventId,
        p_event_name: event.event,
        p_refund_id: entity.id,
        p_payment_id: entity.payment_id,
        p_receipt: entity.receipt ?? entity.notes?.blitzkart_refund_id ?? null,
        p_amount_paise: entity.amount,
        p_failure_reason: [entity.error_reason, entity.error_description].filter(Boolean).join(": ").slice(0, 1000) || null,
      });
      if (error) throw error;
      return NextResponse.json({ received: true, refund_status: result });
    }
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
