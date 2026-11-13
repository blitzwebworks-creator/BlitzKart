import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";

export default async function OrderHistoryPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Order history</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Forders");
  const { data: orders, error } = await supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,total,created_at").eq("customer_id", user.id).order("created_at", { ascending: false });

  return <AccountLayout active="orders"><div className="order-history-page">
    <div className="order-history-heading"><div><span className="section-kicker">YOUR BLITZKART ACCOUNT</span><h1>My orders</h1><p>Check payment status and follow delivery updates.</p></div><Link className="btn btn-outline" href="/products">Shop products <ArrowRight size={15}/></Link></div>
    {error ? <div className="error">Order history couldn’t be loaded. Please try again.</div> : orders?.length ? <div className="order-history-list">
      {orders.map((order) => <article className="order-history-card" key={order.id}>
        <div className="order-history-icon"><Package size={20}/></div>
        <div className="order-history-main"><div><span className="order-history-number">Order {order.order_number}</span>{order.payment_environment === "sandbox" ? <span className="status status-pending">Test</span> : null}</div><span className="order-history-date">Placed {new Date(order.created_at).toLocaleDateString("en-IN")}</span></div>
        <div className="order-history-status"><span className={`status status-${order.status}`}>{order.status.replaceAll("_", " ")}</span><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></div>
        <div className="order-history-total"><small>Order total</small><strong>{money(order.total)}</strong></div>
        <Link className="order-history-link" href={`/account/orders/${order.id}`}>View tracking <ArrowRight size={15}/></Link>
      </article>)}
    </div> : <EmptyState title="No orders yet" body="Your orders and delivery updates will appear here after checkout." action="Shop products" href="/products"/>}
  </div></AccountLayout>;
}
