import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";
export default async function OrderHistoryPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Order history</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login?next=%2Faccount%2Forders");
  const { data: orders, error } = await supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,total,created_at").eq("customer_id", user.id).order("created_at", { ascending: false });
  return <div className="wrap"><h1 className="page-title">Order history</h1>{error ? <div className="error">Order history could not be loaded.</div> : orders?.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Placed</th><th>Order status</th><th>Payment</th><th>Total</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.order_number}{order.payment_environment === "sandbox" ? <small className="status status-pending">Test</small> : null}</td><td>{new Date(order.created_at).toLocaleDateString("en-IN")}</td><td><span className={`status status-${order.status}`}>{order.status.replaceAll("_"," ")}</span></td><td><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_"," ")}</span></td><td>{money(order.total)}</td><td><Link href={`/account/orders/${order.id}`}>View / track</Link></td></tr>)}</tbody></table></div> : <EmptyState title="No orders yet" body="Your order history will appear after you place your first order." action="Shop products" href="/products"/>}</div>;
}
