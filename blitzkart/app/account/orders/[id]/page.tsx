import Link from "next/link";
import { ArrowLeft, Check, MapPin, PackageCheck, Truck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/types";

const orderStages = ["pending", "confirmed", "sourcing", "packed", "ready_for_pickup", "out_for_delivery", "delivered"];
const readable = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/orders/${id}`)}`);
  const { data: order } = await supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,total,subtotal,delivery_charge,created_at,delivery_address").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: history }, { data: delivery }] = await Promise.all([
    supabase.from("order_items").select("product_name,sku,quantity,unit_price,line_total").eq("order_id", id),
    supabase.from("order_status_history").select("new_status,note,created_at").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("deliveries").select("id,mode,status,tracking_reference,provider_reference,notes").eq("order_id", id).maybeSingle(),
  ]);
  const { data: deliveryHistory } = delivery ? await supabase.from("delivery_history").select("new_status,tracking_reference,note,created_at").eq("delivery_id", delivery.id).order("created_at", { ascending: true }) : { data: [] };
  const currentStage = orderStages.indexOf(order.status);
  const trackingReference = delivery?.tracking_reference || delivery?.provider_reference;

  return <AccountLayout active="orders"><div className="order-tracking-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/account/orders">My orders</Link><span>›</span><span aria-current="page">{order.order_number}</span></nav>
    <header className="tracking-order-heading"><div><span className="section-kicker">ORDER TRACKING{order.payment_environment === "sandbox" ? " · TEST" : ""}</span><h1>Order {order.order_number}</h1><p>Placed {new Date(order.created_at).toLocaleString("en-IN")}</p></div><div className="tracking-total"><small>Order total</small><strong>{money(order.total)}</strong></div></header>
    <div className="tracking-columns">
      <section className="tracking-main-column">
        <section className="panel tracking-progress-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><PackageCheck size={19}/></span><div><h2>Order progress</h2><p>We’ll update the steps here as your order moves along.</p></div></div>
          <div className="tracking-status-row"><span>Order status</span><span className={`status status-${order.status}`}>{readable(order.status)}</span><span>Payment</span><span className={`status status-${order.payment_status}`}>{readable(order.payment_status)}</span></div>
          {order.payment_environment === "sandbox" ? <p className="notice tracking-payment-note">Sandbox test order. No real payment was made.</p> : order.payment_status !== "paid" ? <p className="notice tracking-payment-note">Payment hasn’t been confirmed. Order preparation starts after the gateway verifies payment.</p> : <p className="notice tracking-payment-note">We received your payment. Your order is being prepared.</p>}
          {order.status === "cancelled" ? <div className="tracking-cancelled">This order has been cancelled.</div> : <ol className="order-progress">{orderStages.map((stage, index) => <li className={`${index < currentStage ? "is-complete" : ""}${index === currentStage ? " is-current" : ""}`} key={stage}><span className="order-progress-dot">{index < currentStage ? <Check size={13}/> : index + 1}</span><strong>{readable(stage)}</strong></li>)}</ol>}
          {history?.length ? <ul className="tracking-list">{history.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{new Date(entry.created_at).toLocaleString("en-IN")}</time>{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : <p className="muted tracking-no-history">Status updates will appear here when recorded.</p>}
        </section>
        <section className="panel tracking-delivery-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><Truck size={19}/></span><div><h2>Delivery tracking</h2><p>Latest delivery details recorded by BlitzKart.</p></div></div>
          {delivery ? <><div className="tracking-delivery-summary"><span className={`status status-${delivery.status}`}>{readable(delivery.status)}</span><span>{delivery.mode === "manual" ? "Manual delivery" : "Shiprocket Quick"}</span></div>{trackingReference ? <p className="tracking-reference">{delivery.tracking_reference ? "Tracking reference" : "Provider reference"}<strong>{trackingReference}</strong></p> : <p className="muted tracking-no-history">A tracking reference will appear after it’s recorded.</p>}{delivery.notes ? <p className="tracking-delivery-note">{delivery.notes}</p> : null}{deliveryHistory?.length ? <ul className="tracking-list">{deliveryHistory.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{new Date(entry.created_at).toLocaleString("en-IN")}</time>{entry.tracking_reference ? <span>Reference: {entry.tracking_reference}</span> : null}{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : null}</> : <p className="muted tracking-no-history">Delivery details will appear after a delivery record is created.</p>}
        </section>
      </section>
      <aside className="panel tracking-order-summary">
        <h2>Order summary</h2>
        <div className="tracking-order-items">{items?.map((item) => <div key={`${item.sku}-${item.product_name}`}><span>{item.product_name}<small>{item.quantity} × {money(item.unit_price)}</small></span><strong>{money(item.line_total)}</strong></div>)}</div>
        <div className="tracking-cost-row"><span>Items subtotal</span><strong>{money(order.subtotal)}</strong></div><div className="tracking-cost-row"><span>Delivery</span><strong>{money(order.delivery_charge)}</strong></div><div className="tracking-cost-row tracking-cost-total"><span>Total</span><strong>{money(order.total)}</strong></div>
        <div className="tracking-address"><h3><MapPin size={16}/> Delivering to</h3><p>{order.delivery_address?.recipient_name}<br/>{order.delivery_address?.address_line1}{order.delivery_address?.address_line2 ? `, ${order.delivery_address.address_line2}` : ""}<br/>{order.delivery_address?.locality}, {order.delivery_address?.city}, {order.delivery_address?.state} {order.delivery_address?.postal_code}<br/>{order.delivery_address?.phone}</p></div>
      </aside>
    </div>
    <Link className="catalog-back-link" href="/account/orders"><ArrowLeft size={15}/> Back to my orders</Link>
  </div></AccountLayout>;
}
