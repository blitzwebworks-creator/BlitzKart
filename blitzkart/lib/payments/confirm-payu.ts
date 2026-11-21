import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { payuEnvironment, verifyPayUResponse, verifyPayUTransaction, type PayUFields } from "@/lib/payments/payu";

export async function confirmPayUFields(fields: PayUFields) {
  if (!verifyPayUResponse(fields)) throw new Error("PayU response signature could not be verified.");
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin.from("orders").select("id,order_number,total,payment_provider,payment_environment,gateway_order_id").eq("gateway_order_id", fields.txnid).eq("payment_provider", "payu").maybeSingle();
  if (error || !order) throw new Error("PayU transaction does not match a BlitzKart order.");
  if (fields.udf1 !== order.id || Math.round(Number(fields.amount) * 100) !== Math.round(Number(order.total) * 100)) throw new Error("PayU response amount or order reference does not match.");
  if ((order.payment_environment === "sandbox" ? "sandbox" : "live") !== payuEnvironment()) throw new Error("PayU environment does not match the saved order.");
  if (fields.status.toLowerCase() !== "success") return { orderId: order.id, paid: false };
  const payment = await verifyPayUTransaction(order.gateway_order_id, Number(order.total));
  if (!payment) return { orderId: order.id, paid: false };
  const { error: confirmError } = await admin.rpc("confirm_external_payment", {
    p_order_id: order.id, p_provider: "payu", p_gateway_order_id: order.gateway_order_id,
    p_gateway_payment_id: payment.paymentId, p_amount: payment.amount,
    p_environment: order.payment_environment,
  });
  if (confirmError) throw confirmError;
  return { orderId: order.id, orderNumber: order.order_number, paid: true };
}
