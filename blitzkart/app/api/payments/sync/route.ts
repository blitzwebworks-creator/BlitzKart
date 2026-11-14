import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCapturedRazorpayPayment, razorpayEnvironment } from "@/lib/payments/razorpay";
import { payuEnvironment, verifyPayUTransaction } from "@/lib/payments/payu";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { order_id: orderId } = z.object({ order_id: z.string().uuid() }).parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to check this order." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot access orders." }, { status: 403 });
    const admin = createSupabaseAdminClient();
    const { data: order, error } = await admin.from("orders").select("id,customer_id,order_number,status,payment_status,payment_provider,payment_environment,total,gateway_order_id,created_at").eq("id", orderId).eq("customer_id", user.id).maybeSingle();
    if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_status !== "paid" && order.gateway_order_id && order.payment_provider === "razorpay" && (order.payment_environment === "sandbox" ? "sandbox" : "live") === razorpayEnvironment()) {
      const payment = await getCapturedRazorpayPayment({ orderId: order.gateway_order_id, amount: Number(order.total) });
      if (payment) {
        const { error: confirmationError } = await admin.rpc("confirm_external_payment", {
          p_order_id: order.id, p_provider: "razorpay", p_gateway_order_id: order.gateway_order_id,
          p_gateway_payment_id: payment.paymentId, p_amount: payment.amount, p_environment: order.payment_environment,
        });
        if (confirmationError) throw confirmationError;
      }
    } else if (order.payment_status !== "paid" && order.gateway_order_id && order.payment_provider === "payu" && (order.payment_environment === "sandbox" ? "sandbox" : "live") === payuEnvironment()) {
      const payment = await verifyPayUTransaction(order.gateway_order_id, Number(order.total));
      if (payment) {
        const { error: confirmationError } = await admin.rpc("confirm_external_payment", {
          p_order_id: order.id, p_provider: "payu", p_gateway_order_id: order.gateway_order_id,
          p_gateway_payment_id: payment.paymentId, p_amount: payment.amount, p_environment: order.payment_environment,
        });
        if (confirmationError) throw confirmationError;
      }
    }
    const { data: current, error: currentError } = await admin.from("orders").select("status,payment_status").eq("id", order.id).single();
    if (currentError) throw currentError;
    return NextResponse.json({ orderNumber: order.order_number, status: current.status, paymentStatus: current.payment_status, paymentEnvironment: order.payment_environment, total: Number(order.total), createdAt: order.created_at });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid order reference." : error instanceof Error ? error.message : "Payment status could not be checked.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
