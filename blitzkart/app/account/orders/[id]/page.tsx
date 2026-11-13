import Link from "next/link";
import { ArrowLeft, Check, CircleHelp, MapPin, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/types";

const readable = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const stages = [
  { label: "Order placed", matches: ["pending"] },
  { label: "Being prepared", matches: ["confirmed", "sourcing", "packed", "ready_for_pickup"] },
  { label: "Out for delivery", matches: ["out_for_delivery"] },
  { label: "Delivered", matches: ["delivered"] },
];

export default async function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/orders/${id}`)}`);
  const { data: order } = await supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,payment_provider,total,subtotal,delivery_charge,product_delivery_charge,created_at,delivery_address").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: history }, { data: delivery }] = await Promise.all([
    supabase.from("order_items").select("product_name,sku,quantity,unit_price,line_total").eq("order_id", id),
    supabase.from("order_status_history").select("new_status,note,created_at").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("deliveries").select("id,mode,status,tracking_reference,provider_reference,notes").eq("order_id", id).maybeSingle(),
  ]);
  const { data: deliveryHistory } = delivery ? await supabase.from("delivery_history").select("new_status,tracking_reference,note,created_at").eq("delivery_id", delivery.id).order("created_at", { ascending: true }) : { data: [] };
  const currentStage = Math.max(0, stages.findIndex((stage) => stage.matches.includes(order.status)));
  const trackingReference = delivery?.tracking_reference || delivery?.provider_reference;
  const deliveryLabel = order.status === "cancelled" ? "Order cancelled" : order.status === "delivered" ? "Delivered" : order.status === "out_for_delivery" ? "Out for delivery" : order.status === "pending" ? "Order received" : "Being prepared";

  return <AccountLayout active="orders"><div className="order-tracking-page tracking-redesign">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/account/orders">My orders</Link><span>›</span><span aria-current="page">{order.order_number}</span></nav>
    <header className="tracking-order-heading"><div><span className="section-kicker">ORDER TRACKING{order.payment_environment === "sandbox" ? " · TEST" : ""}</span><h1>{order.order_number}</h1><p>Placed {new Date(order.created_at).toLocaleString("en-IN")}</p></div><div className="tracking-total"><small>Order total</small><strong>{money(order.total)}</strong><small>{items?.length ?? 0} {items?.length === 1 ? "item" : "items"}</small></div></header>
    {order.payment_environment === "sandbox" ? <p className="notice tracking-payment-note">Test order. No real payment was made.</p> : order.payment_status === "paid" ? <p className="notice tracking-payment-note"><ShieldCheck size={17}/> Payment confirmed by {order.payment_provider === "razorpay" ? "Razorpay" : "PayU"} · {money(order.total)}</p> : <p className="notice tracking-payment-note">Payment status: {readable(order.payment_status)}. Order preparation begins after payment is verified.</p>}
    <section className={`tracking-current-card${order.status === "cancelled" ? " is-cancelled" : ""}`}><span className="tracking-current-icon">{order.status === "delivered" ? <Check size={23}/> : order.status === "out_for_delivery" ? <Truck size={23}/> : order.status === "cancelled" ? <CircleHelp size={23}/> : <PackageCheck size={23}/>}</span><div><small>Current order status</small><strong>{deliveryLabel}</strong><span>{order.status === "cancelled" ? "This order was cancelled." : order.status === "delivered" ? "Your order has been marked delivered." : "Follow status updates here as they are recorded."}</span></div>{trackingReference ? <span className="tracking-current-reference">Tracking · {trackingReference}</span> : null}</section>
    <div className="tracking-columns">
      <section className="tracking-main-column">
        <section className="panel tracking-progress-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><Truck size={19}/></span><div><h2>Delivery progress</h2><p>Status and times shown here come from the order history.</p></div></div>
          {order.status === "cancelled" ? <div className="tracking-cancelled">This order has been cancelled.</div> : <ol className="order-progress tracking-four-stages">{stages.map((stage, index) => {
            const complete = index < currentStage || order.status === "delivered";
            const current = index === currentStage && order.status !== "delivered";
            const timestamp = history?.filter((entry) => stage.matches.includes(entry.new_status)).at(-1)?.created_at;
            return <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={stage.label}><span className="order-progress-dot">{complete ? <Check size={13}/> : index + 1}</span><strong>{stage.label}</strong><time>{timestamp ? new Date(timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</time></li>;
          })}</ol>}
          <div className="tracking-status-row"><span>Order status</span><span className={`status status-${order.status}`}>{readable(order.status)}</span><span>Delivery status</span><span className={`status status-${delivery?.status || "pending"}`}>{delivery ? readable(delivery.status) : "Not booked"}</span></div>
          {history?.length ? <ul className="tracking-list">{history.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{new Date(entry.created_at).toLocaleString("en-IN")}</time>{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : <p className="muted tracking-no-history">Order updates will appear here after they are recorded.</p>}
        </section>
        <section className="panel tracking-delivery-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><PackageCheck size={19}/></span><div><h2>Delivery details</h2><p>Reference and notes entered by the BlitzKart team.</p></div></div>
          {delivery ? <><div className="tracking-delivery-summary"><span className={`status status-${delivery.status}`}>{readable(delivery.status)}</span><span>{delivery.mode === "manual" ? "Manual delivery" : "Carrier delivery"}</span></div>{trackingReference ? <p className="tracking-reference">Tracking reference<strong>{trackingReference}</strong></p> : <p className="muted tracking-no-history">A tracking reference will appear here once the delivery team records one.</p>}{delivery.notes ? <p className="tracking-delivery-note">{delivery.notes}</p> : null}{deliveryHistory?.length ? <ul className="tracking-list">{deliveryHistory.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{new Date(entry.created_at).toLocaleString("en-IN")}</time>{entry.tracking_reference ? <span>Reference: {entry.tracking_reference}</span> : null}{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : null}</> : <p className="muted tracking-no-history">Delivery details will appear after the order is paid and a delivery record is created.</p>}
        </section>
      </section>
      <aside className="panel tracking-order-summary">
        <h2>Order items</h2>
        <div className="tracking-order-items">{items?.map((item) => <div key={`${item.sku}-${item.product_name}`}><span>{item.product_name}<small>{item.quantity} × {money(item.unit_price)}</small></span><strong>{money(item.line_total)}</strong></div>)}</div>
        <div className="tracking-cost-row"><span>Items subtotal</span><strong>{money(order.subtotal)}</strong></div><div className="tracking-cost-row"><span>PIN delivery</span><strong>{money(order.delivery_charge)}</strong></div>{order.product_delivery_charge ? <div className="tracking-cost-row"><span>Product delivery charges</span><strong>{money(order.product_delivery_charge)}</strong></div> : null}<div className="tracking-cost-row tracking-cost-total"><span>Total</span><strong>{money(order.total)}</strong></div>
        <div className="tracking-address"><h3><MapPin size={16}/> Delivery address</h3><p>{order.delivery_address?.recipient_name}<br/>{order.delivery_address?.address_line1}{order.delivery_address?.address_line2 ? `, ${order.delivery_address.address_line2}` : ""}<br/>{order.delivery_address?.locality}, {order.delivery_address?.city}, {order.delivery_address?.state} {order.delivery_address?.postal_code}<br/>{order.delivery_address?.phone}</p></div>
        <Link className="btn btn-outline tracking-support-link" href="/account/support"><CircleHelp size={16}/> Need help with this order?</Link>
      </aside>
    </div>
    <Link className="catalog-back-link" href="/account/orders"><ArrowLeft size={15}/> Back to my orders</Link>
  </div></AccountLayout>;
}
