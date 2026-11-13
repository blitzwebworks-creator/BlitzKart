import { redirect } from "next/navigation";
import { PaymentReturn } from "@/components/payment-return";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function CheckoutConfirmedPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const { order_id: orderId } = await searchParams;
  if (!orderId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) redirect("/account/orders");
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/confirmed?order_id=${orderId}`)}`);
  const { data } = await supabase.from("orders").select("id").eq("id", orderId).eq("customer_id", user.id).maybeSingle();
  if (!data) redirect("/account/orders");
  return <div className="wrap" style={{ minHeight: 400, display: "grid", placeItems: "center" }}><PaymentReturn orderId={orderId}/></div>;
}
