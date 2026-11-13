import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCapturedRazorpayPayment, razorpayEnvironment, verifyRazorpayCheckoutSignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
const schema = z.object({ order_id: z.string().uuid(), razorpay_payment_id: z.string().min(8).max(64), razorpay_order_id: z.string().min(8).max(64), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to verify this payment." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot access orders." }, { status: 403 });
    const admin = createSupabaseAdminClient();
    const { data: order, error } = await admin.from("orders").select("id,customer_id,total,payment_status,payment_provider,payment_environment,gateway_order_id").eq("id", input.order_id).eq("customer_id", user.id).maybeSingle();
    if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_provider !== "razorpay" || order.gateway_order_id !== input.razorpay_order_id) return NextResponse.json({ error: "Razorpay order reference does not match." }, { status: 400 });
    if ((order.payment_environment === "sandbox" ? "sandbox" : "live") !== razorpayEnvironment()) return NextResponse.json({ error: "Razorpay environment does not match this order." }, { status: 400 });
    if (!verifyRazorpayCheckoutSignature(order.gateway_order_id, input.razorpay_payment_id, input.razorpay_signature)) return NextResponse.json({ error: "Razorpay payment signature is invalid." }, { status: 400 });
    const payment = await getCapturedRazorpayPayment({ orderId: order.gateway_order_id, paymentId: input.razorpay_payment_id, amount: Number(order.total) });
    if (!payment) return NextResponse.json({ error: "Razorpay has not captured this payment yet." }, { status: 409 });
    const { error: confirmError } = await admin.rpc("confirm_external_payment", {
      p_order_id: order.id, p_provider: "razorpay", p_gateway_order_id: order.gateway_order_id,
      p_gateway_payment_id: payment.paymentId, p_amount: payment.amount,
      p_environment: order.payment_environment,
    });
    if (confirmError) throw confirmError;
    return NextResponse.json({ verified: true, order_id: order.id });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid Razorpay payment response." : error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
