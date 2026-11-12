import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGatewayOrder } from "@/lib/payments/gateway";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { order_id: orderId } = z.object({ order_id: z.string().uuid() }).parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to check this order." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id",user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot access orders." }, { status: 403 });
    const admin = createSupabaseAdminClient();
    const { data: order, error } = await admin.from("orders").select("id,customer_id,order_number,status,payment_status,payment_environment,total,gateway_order_id,created_at").eq("id", orderId).eq("customer_id", user.id).maybeSingle();
    if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_status !== "paid" && order.gateway_order_id) {
      const gateway = await getGatewayOrder(order.gateway_order_id);
      const environment = order.payment_environment;
      if (gateway && (environment === "sandbox") === Boolean(gateway.test) && gateway.order_id === order.gateway_order_id && gateway.client_order_id === order.id && Math.round(Number(gateway.amount) * 100) === Math.round(Number(order.total) * 100) && gateway.status === "paid") {
        const { error: confirmError } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id, p_gateway_order_id: gateway.order_id, p_amount: Number(gateway.amount), p_environment: environment });
        if (confirmError) throw confirmError;
      }
    }
    const { data: current } = await admin.from("orders").select("status,payment_status").eq("id", order.id).single();
    return NextResponse.json({ orderNumber: order.order_number, status: current?.status ?? order.status, paymentStatus: current?.payment_status ?? order.payment_status, paymentEnvironment: order.payment_environment, total: Number(order.total), createdAt: order.created_at });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid order reference." : error instanceof Error ? error.message : "Payment status could not be checked.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 502 });
  }
}
