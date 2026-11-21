import Link from "next/link";
import { ArrowLeft, Check, CircleHelp, MapPin, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/types";
import { formatDateTime } from "@/lib/datetime";
import { OrderProductRatings } from "@/components/order-product-ratings";
import { OrderLiveRefresh } from "@/components/order-live-refresh";
import { AdminOrderPaymentButton } from "@/components/admin-order-payment-button";

const readable = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const stages = [
  { label: "Order placed", matches: ["pending"] },
  { label: "Being prepared", matches: ["confirmed", "sourcing", "packed", "ready_for_pickup"] },
  { label: "Out for delivery", matches: ["out_for_delivery"] },
  { label: "Delivered", matches: ["delivered"] },
];

export default async function OrderTrackingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ review_message?: string; review_error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/orders/${id}`)}`);
  const { data: order } = await supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,payment_provider,total,subtotal,discount_amount,packaging_fee,platform_fee,handling_fee,delivery_charge,product_delivery_charge,delivery_method,delivery_pincode,delivery_location,estimated_delivery,created_at,delivery_address,return_status,return_request_id,refund_status,refund_amount,razorpay_refund_id,refund_initiated_at,refund_failure_details,order_source").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!order) notFound();

  const [{ data: items }, { data: history }, { data: delivery }, { data: returnHistory }, { data: refunds }, { data: refundHistory }, { data: returnRequest }] = await Promise.all([
    supabase.from("order_items").select("product_id,product_name,sku,quantity,unit_price,line_total").eq("order_id", id),
    supabase.from("order_status_history").select("new_status,note,created_at").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("deliveries").select("id,mode,status,tracking_reference,provider_reference,notes").eq("order_id", id).maybeSingle(),
    supabase.from("order_return_history").select("previous_status,new_status,note,created_at").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("order_refunds").select("id,razorpay_refund_id,amount_paise,status,failure_details,initiated_at,updated_at").eq("order_id", id).order("initiated_at", { ascending: false }),
    supabase.from("order_refund_history").select("refund_record_id,status,created_at").eq("order_id", id).order("created_at", { ascending: true }),
      order.return_request_id
        ? supabase.from("customer_requests").select("return_number,return_items,reason,status").eq("id", order.return_request_id).eq("customer_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const canRate = order.status === "delivered" && order.payment_status === "paid" && order.payment_environment === "live";
  const { data: reviewData } = canRate ? await supabase.rpc("get_order_product_reviews", { p_order_id: id }) : { data: [] };
  const existingReviews = (reviewData ?? []).map((review: { product_id: string; review_images?: string[] }) => ({
    ...review,
    review_images: (review.review_images ?? []).map((path) => supabase.storage.from("product-review-images").getPublicUrl(path).data.publicUrl),
  }));
  const { data: deliveryHistory } = delivery ? await supabase.from("delivery_history").select("new_status,tracking_reference,note,created_at").eq("delivery_id", delivery.id).order("created_at", { ascending: true }) : { data: [] };
  const currentStage = Math.max(0, stages.findIndex((stage) => stage.matches.includes(order.status)));
  const trackingReference = delivery?.tracking_reference || delivery?.provider_reference;
  const deliveryLabel = order.status === "cancelled" ? "Order cancelled" : order.status === "delivered" ? "Delivered" : order.status === "out_for_delivery" ? "Out for delivery" : order.status === "pending" ? "Order received" : "Being prepared";

  return <AccountLayout active="orders"><div className="order-tracking-page tracking-redesign"><OrderLiveRefresh orderId={id}/>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/account/orders">My orders</Link><span>›</span><span aria-current="page">{order.order_number}</span></nav>
    <header className="tracking-order-heading"><div><span className="section-kicker">ORDER TRACKING{order.payment_environment === "sandbox" ? " · TEST" : ""}</span><h1>{order.order_number}</h1><p>Placed {formatDateTime(order.created_at)}</p></div><div className="tracking-total"><small>Order total</small><strong>{money(order.total)}</strong><small>{items?.length ?? 0} {items?.length === 1 ? "item" : "items"}</small></div></header>
    {order.payment_environment === "sandbox" ? <p className="notice tracking-payment-note">Test order. No real payment was made.</p> : order.payment_status === "paid" ? <p className="notice tracking-payment-note"><ShieldCheck size={17}/> Payment confirmed by {order.payment_provider === "razorpay" ? "Razorpay" : "PayU"} · {money(order.total)}</p> : <p className="notice tracking-payment-note">Payment status: {readable(order.payment_status)}. Order preparation begins after payment is verified.</p>}
    {order.order_source === "admin" && order.payment_status === "pending" && order.status !== "cancelled" ? <section className="panel tracking-payment-panel"><h2>Complete payment</h2><p>BlitzKart created this order on your behalf. Payment remains pending until Razorpay verifies it.</p><AdminOrderPaymentButton orderId={id} disabled={Number(order.total) < 1}/>{Number(order.total) < 1 ? <p className="muted">This order has no payable Razorpay amount. Contact BlitzKart support.</p> : null}</section> : null}
    {query.review_message ? <p className="notice" role="status">{query.review_message}</p> : null}{query.review_error ? <p className="error" role="alert">{query.review_error}</p> : null}
    <section className={`tracking-current-card${order.status === "cancelled" ? " is-cancelled" : ""}`}><span className="tracking-current-icon">{order.status === "delivered" ? <Check size={23}/> : order.status === "out_for_delivery" ? <Truck size={23}/> : order.status === "cancelled" ? <CircleHelp size={23}/> : <PackageCheck size={23}/>}</span><div><small>Current order status</small><strong>{deliveryLabel}</strong><span>{order.status === "cancelled" ? "This order was cancelled." : order.status === "delivered" ? "Your order has been marked delivered." : "Follow status updates here as they are recorded."}</span></div>{trackingReference ? <span className="tracking-current-reference">Tracking · {trackingReference}</span> : null}</section>
    <div className="tracking-columns">
      <section className="tracking-main-column">
        <section className="panel tracking-progress-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><Truck size={19}/></span><div><h2>Delivery progress</h2><p>Status and times shown here come from the order history.</p></div></div>
          {order.status === "cancelled" ? <div className="tracking-cancelled">This order has been cancelled.</div> : <ol className="order-progress tracking-four-stages">{stages.map((stage, index) => {
            const complete = index < currentStage || order.status === "delivered";
            const current = index === currentStage && order.status !== "delivered";
            const timestamp = history?.filter((entry) => stage.matches.includes(entry.new_status)).at(-1)?.created_at;
            return <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={stage.label}><span className="order-progress-dot">{complete ? <Check size={13}/> : index + 1}</span><strong>{stage.label}</strong><time>{timestamp ? formatDateTime(timestamp, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</time></li>;
          })}</ol>}
          <div className="tracking-status-row"><span>Order status</span><span className={`status status-${order.status}`}>{readable(order.status)}</span><span>Delivery status</span><span className={`status status-${delivery?.status || "pending"}`}>{delivery ? readable(delivery.status) : "Not booked"}</span></div>
          {history?.length ? <ul className="tracking-list">{history.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{formatDateTime(entry.created_at)}</time>{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : <p className="muted tracking-no-history">Order updates will appear here after they are recorded.</p>}
        </section>
        {order.return_status ? <section className="panel tracking-progress-panel return-progress-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><PackageCheck size={19}/></span><div><h2>Return / exchange progress</h2><p>Updates are recorded by BlitzKart after reviewing your request.</p></div></div>
          {returnRequest?.return_number ? <p className="tracking-return-reference"><strong>Return ID</strong> {returnRequest.return_number}</p> : null}
          {order.return_status === "return_rejected" ? <p className="error" role="status">This return request was rejected. Contact support if you need help.</p> : <ol className="order-progress tracking-four-stages">{[
            { keys: ["return_requested","return_initiated"], label: "Return requested" },
            { keys: ["return_approved"], label: "Return approved" },
            { keys: ["return_pickup_scheduled","out_for_pickup"], label: "Pickup scheduled" },
            { keys: ["item_received","returned_successfully"], label: "Item received" },
            { keys: ["refund_initiated"], label: "Refund initiated" },
            { keys: ["refunded"], label: "Refunded" },
          ].map((stage, index, stages) => {
            const currentIndex = stages.findIndex((item) => item.keys.includes(order.return_status ?? ""));
            const complete = index < currentIndex;
            const current = index === currentIndex;
            const timestamp = returnHistory?.filter((entry) => stage.keys.includes(entry.new_status)).at(-1)?.created_at;
            return <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={stage.label}><span className="order-progress-dot">{complete ? <Check size={13}/> : index + 1}</span><strong>{stage.label}</strong><time>{timestamp ? formatDateTime(timestamp) : "—"}</time></li>;
          })}</ol>}
          {returnRequest?.return_items?.length ? <div className="tracking-return-items"><strong>Items in this return</strong><ul>{returnRequest.return_items.map((item: { order_item_id: string; name: string; sku: string; quantity: number }) => <li key={item.order_item_id}>{item.quantity} × {item.name} · {item.sku}</li>)}</ul></div> : null}
          {returnHistory?.length ? <ul className="tracking-list">{returnHistory.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{formatDateTime(entry.created_at)}</time>{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : null}
          {order.return_status === "refund_initiated" && order.refund_status !== "refund_pending" && order.refund_status !== "refunded" ? <p className="muted">This return status does not confirm that a payment refund has been initiated. Check the separate refund status below when available.</p> : null}
        </section> : null}
        {order.refund_status || refunds?.some((refund) => refund.status === "initiating") ? <section className="panel tracking-progress-panel refund-progress-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><Check size={19}/></span><div><h2>Refund status</h2><p>{order.refund_status === "refund_failed" ? "Razorpay could not complete this refund. Contact support if you need help." : "This timeline updates automatically when Razorpay confirms progress."}</p></div></div>
          {order.refund_status === "refund_failed" ? <p className="error" role="status">Refund failed. Our team has the refund reference and can assist you.</p> : order.refund_status === null && refunds?.[0]?.status === "initiating" ? <p className="notice" role="status">Refund request received. Razorpay is being contacted and this status will update automatically.</p> : <ol className="order-progress tracking-four-stages">{[
            { key: "initiated", label: "Refund initiated" }, { key: "processing", label: "Refund processing" }, { key: "refunded", label: "Refunded" },
          ].map((stage, index) => {
            const status = order.refund_status;
            const complete = status === "refunded" || (status === "refund_pending" && index === 0);
            const current = status === "refund_pending" && index === 1;
            const statusTime = index === 0
              ? refundHistory?.find((entry) => entry.refund_record_id === refunds?.[0]?.id && entry.status === "refund_pending")?.created_at || order.refund_initiated_at || refunds?.[0]?.initiated_at
              : index === 2 ? refundHistory?.find((entry) => entry.refund_record_id === refunds?.[0]?.id && entry.status === "refunded")?.created_at : null;
            return <li className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={stage.key}><span className="order-progress-dot">{complete ? <Check size={13}/> : index + 1}</span><strong>{stage.label}</strong><time>{current ? "In progress" : statusTime ? formatDateTime(statusTime) : "—"}</time></li>;
          })}</ol>}
          <div className="tracking-cost-row"><span>Refund amount</span><strong>{money(order.refund_amount ?? (refunds?.[0] ? Number(refunds[0].amount_paise) / 100 : 0))}</strong></div>
          {order.razorpay_refund_id || refunds?.[0]?.razorpay_refund_id ? <div className="tracking-cost-row"><span>Razorpay refund reference</span><strong>{order.razorpay_refund_id || refunds?.[0]?.razorpay_refund_id}</strong></div> : null}
          {order.refund_initiated_at || refunds?.[0]?.initiated_at ? <div className="tracking-cost-row"><span>Initiated</span><strong>{formatDateTime(order.refund_initiated_at || refunds?.[0]?.initiated_at)}</strong></div> : null}
          <p className="refund-processing-note">Please note that refunds may take <strong>2–3 business days</strong> to reflect in your payment method, depending on the payment provider used for your original purchase.</p>
        </section> : null}
        <section className="panel tracking-delivery-panel">
          <div className="tracking-panel-heading"><span className="tracking-heading-icon"><PackageCheck size={19}/></span><div><h2>Delivery details</h2><p>Reference and notes entered by the BlitzKart team.</p></div></div>
          {delivery ? <><div className="tracking-delivery-summary"><span className={`status status-${delivery.status}`}>{readable(delivery.status)}</span><span>{delivery.mode === "manual" ? "Manual delivery" : "Carrier delivery"}</span></div>{trackingReference ? <p className="tracking-reference">Tracking reference<strong>{trackingReference}</strong></p> : <p className="muted tracking-no-history">A tracking reference will appear here once the delivery team records one.</p>}{delivery.notes ? <p className="tracking-delivery-note">{delivery.notes}</p> : null}{deliveryHistory?.length ? <ul className="tracking-list">{deliveryHistory.map((entry) => <li key={`${entry.created_at}-${entry.new_status}`}><strong>{readable(entry.new_status)}</strong><time>{formatDateTime(entry.created_at)}</time>{entry.tracking_reference ? <span>Reference: {entry.tracking_reference}</span> : null}{entry.note ? <span className="muted">{entry.note}</span> : null}</li>)}</ul> : null}</> : <p className="muted tracking-no-history">Delivery details will appear after the order is paid and a delivery record is created.</p>}
        </section>
      </section>
      <aside className="panel tracking-order-summary">
        <h2>Order items</h2>
        <div className="tracking-order-items">{items?.map((item) => <div key={`${item.sku}-${item.product_name}`}><span>{item.product_name}<small>{item.quantity} × {money(item.unit_price)}</small></span><strong>{money(item.line_total)}</strong></div>)}</div>
        <div className="tracking-cost-row"><span>Items subtotal</span><strong>{money(order.subtotal)}</strong></div>
        <div className="tracking-cost-row"><span>Packaging fee</span><strong>{Number(order.packaging_fee) > 0 ? money(order.packaging_fee) : "FREE"}</strong></div>
        <div className="tracking-cost-row"><span>Platform fee</span><strong>{Number(order.platform_fee) > 0 ? money(order.platform_fee) : "FREE"}</strong></div>
        <div className="tracking-cost-row"><span>Handling fee</span><strong>{Number(order.handling_fee) > 0 ? money(order.handling_fee) : "FREE"}</strong></div>
        {Number(order.discount_amount) > 0 ? <div className="tracking-cost-row"><span>Discount</span><strong>−{money(order.discount_amount)}</strong></div> : null}
        <div className="tracking-cost-row"><span>{order.delivery_method === "blitz" ? "⚡ Blitz Delivery" : order.delivery_method === "standard" ? "🚚 Standard Delivery" : "PIN delivery"}{order.estimated_delivery ? <small>{order.estimated_delivery}</small> : null}</span><strong>{money(order.delivery_charge)}</strong></div>
        {order.product_delivery_charge ? <div className="tracking-cost-row"><span>Product delivery charges</span><strong>{money(order.product_delivery_charge)}</strong></div> : null}
        <div className="tracking-cost-row tracking-cost-total"><span>Total</span><strong>{money(order.total)}</strong></div>
        <div className="tracking-address"><h3><MapPin size={16}/> Delivery address</h3><p>{order.delivery_address?.recipient_name}<br/>{order.delivery_address?.address_line1}{order.delivery_address?.address_line2 ? `, ${order.delivery_address.address_line2}` : ""}<br/>{order.delivery_address?.locality}, {order.delivery_address?.city}, {order.delivery_address?.state} {order.delivery_address?.postal_code}<br/>{order.delivery_address?.phone}</p></div>
        <section className="tracking-request-panel"><h3>Returns, exchanges & cancellations</h3><p>{order.status === "out_for_delivery" || order.status === "delivered" ? "Cancellation is unavailable once an order is out for delivery. Delivered orders can be submitted for return or exchange review." : "Send a request about cancellation, returns or exchange for this order."}</p><Link className="btn btn-outline" href={`/account/requests?order_id=${encodeURIComponent(id)}`}>Order request options</Link></section>
        <Link className="btn btn-outline tracking-support-link" href="/account/support"><CircleHelp size={16}/> Need help with this order?</Link>
      </aside>
    </div>
    {canRate ? <section className="panel order-ratings"><div className="tracking-panel-heading"><span className="tracking-heading-icon"><Check size={19}/></span><div><h2>Rate your purchase</h2><p>Only paid, delivered purchases can submit verified product ratings.</p></div></div><OrderProductRatings orderId={id} items={(items ?? []).map((item)=>({product_id:item.product_id,product_name:item.product_name,sku:item.sku,quantity:item.quantity}))} reviews={existingReviews ?? []}/></section> : null}
    <Link className="catalog-back-link" href="/account/orders"><ArrowLeft size={15}/> Back to my orders</Link>
  </div></AccountLayout>;
}
