import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";
import { formatDateTime } from "@/lib/datetime";
import { deleteOrderAction, initiateOrderRefundAction, updateDeliveryAction, updateOrderStatusAction, updateReturnStatusAction } from "@/lib/actions/admin";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const states = ["pending","confirmed","sourcing","packed","ready_for_pickup","out_for_delivery","delivered","cancelled"];
const deliveryStates = ["pending","booked","picked_up","in_transit","out_for_delivery","delivered","exception","cancelled"];
const readableStatus = (value: unknown) => String(value ?? "unknown").replaceAll("_", " ");

export default async function AdminOrderDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase } = await requireAdmin();
  // Select the current row shape so older deployments without optional newer
  // columns (for example product_delivery_charge) can still open existing orders.
  let orderResult;
  try {
    orderResult = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  } catch (error) {
    console.error("Admin order lookup failed", error);
    return <OrderLoadError />;
  }
  const { data: order, error: orderError } = orderResult;
  if (orderError) {
    console.error("Admin order lookup failed", orderError);
    return <OrderLoadError />;
  }
  if (!order) notFound();

  let customer: any = null;
  let items: any[] = [];
  let history: any[] = [];
  let notes: any[] = [];
  let delivery: any = null;
  let refunds: any[] = [];
  let refundHistory: any[] = [];
  let relatedDataUnavailable = false;
  try {
    const [customerResult, itemsResult, historyResult, notesResult, deliveryResult, refundsResult, refundHistoryResult] = await Promise.all([
      order.customer_id ? supabase.from("profiles").select("full_name,email,phone,account_status,created_at").eq("id", order.customer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("order_items").select("product_name,sku,quantity,unit_price,line_total").eq("order_id", id),
      supabase.from("order_status_history").select("previous_status,new_status,created_at,changed_by,note").eq("order_id", id).order("created_at", { ascending: true }),
      supabase.from("internal_order_notes").select("id,note,admin_id,created_at").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("deliveries").select("id,mode,status,tracking_reference,notes,updated_at").eq("order_id", id).maybeSingle(),
      supabase.from("order_refunds").select("id,razorpay_refund_id,amount_paise,status,failure_details,initiated_at,updated_at").eq("order_id", id).order("initiated_at",{ascending:false}),
      supabase.from("order_refund_history").select("refund_record_id,status,created_at").eq("order_id", id).order("created_at",{ascending:true}),
    ]);
    relatedDataUnavailable = Boolean(customerResult.error || itemsResult.error || historyResult.error || notesResult.error || deliveryResult.error || refundsResult.error || refundHistoryResult.error);
    customer = customerResult.data;
    items = itemsResult.data ?? [];
    history = historyResult.data ?? [];
    notes = notesResult.data ?? [];
    delivery = deliveryResult.data;
    refunds = refundsResult.data ?? [];
    refundHistory = refundHistoryResult.data ?? [];
  } catch (error) {
    console.error("Admin order related data lookup failed", error);
    relatedDataUnavailable = true;
  }
  const orderStatus = typeof order.status === "string" ? order.status : "pending";
  const paymentStatus = typeof order.payment_status === "string" ? order.payment_status : "pending";
  const visibleStates = states.filter((status) => status !== "cancelled" || paymentStatus !== "paid" || orderStatus === "cancelled");
  const address = order.delivery_address && typeof order.delivery_address === "object" ? order.delivery_address as Record<string, unknown> : {};

  return <>
    <p><Link href="/admin/orders">← Orders</Link></p>
    <h1 className="page-title" style={{ marginTop: 0 }}>Order {order.order_number || id}</h1>
    {query.message ? <p className="notice">{query.message}</p> : null}
    {query.error ? <p className="error">{query.error}</p> : null}
    {order.return_status || refunds.length ? <p className="notice admin-order-delete">This order has return or refund activity and is retained for customer tracking and financial records.</p> : <form action={deleteOrderAction} className="admin-order-delete"><input type="hidden" name="order_id" value={id}/><ConfirmSubmitButton className="btn btn-outline" message={`Permanently delete order ${order.order_number || id}, including its items, tracking and notes? This does not issue a payment refund.`}>Delete order</ConfirmSubmitButton><small>This removes the order from operational records and analytics. It does not refund a payment.</small></form>}
    {relatedDataUnavailable ? <p className="notice">Some order details could not be loaded. Refresh the page or check the database configuration.</p> : null}
    <div className="split">
      <section>
        <div className="panel">
          <h2>Order items</h2>
          {items?.length ? items.map((item: any) => <p key={`${item.sku}-${item.product_name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{item.product_name} · {item.sku} × {item.quantity} · {money(item.unit_price)} each</span><strong>{money(item.line_total)}</strong>
          </p>) : <EmptyState title="No order items found" body="Order line items could not be shown."/>}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)" }}/>
          <p>Product subtotal: {money(order.subtotal)}</p>
          <p>Packaging fee: {money(Number(order.packaging_fee ?? 0))}</p>
          <p>Platform fee: {money(Number(order.platform_fee ?? 0))}</p>
          <p>Handling fee: {money(Number(order.handling_fee ?? 0))}</p>
          <p>Discount: −{money(order.discount_amount)}</p>
          <p>{order.delivery_method === "blitz" ? "⚡ Blitz Delivery" : order.delivery_method === "standard" ? "🚚 Standard Delivery" : "Delivery"}: {money(order.delivery_charge)}</p>
          {Number(order.product_delivery_charge) > 0 ? <p>Product delivery charges: {money(order.product_delivery_charge)}</p> : null}
          {order.delivery_method ? <p>Delivery PIN: {order.delivery_pincode || address.postal_code as string} · {order.estimated_delivery || "Estimate not recorded"}</p> : null}
          <p><strong>Total: {money(order.total)}</strong></p>
          <p>Payment: <span className={`status status-${paymentStatus}`}>{paymentStatus.replaceAll("_", " ")}</span></p>
          <p>Payment provider: {order.payment_provider || "—"}</p>
          <p>Refund status: <span className={`status status-${order.refund_status || "pending"}`}>{order.refund_status ? order.refund_status.replaceAll("_"," ") : "Not initiated"}</span></p>
          {order.refund_amount !== null && order.refund_amount !== undefined ? <p>Refund amount: {money(order.refund_amount)}</p> : null}
          {order.razorpay_refund_id ? <p>Razorpay refund ID: <code>{order.razorpay_refund_id}</code></p> : null}
          {order.refund_initiated_at ? <p>Refund initiated: {formatDateTime(order.refund_initiated_at)}</p> : null}
          {order.refund_failure_details ? <p className="error">Refund failure: {order.refund_failure_details}</p> : null}
          {refunds.length ? <div className="tracking-list"><strong>Refund history</strong>{refunds.map((refund)=> <p key={refund.id}><span className={`status status-${refund.status}`}>{refund.status.replaceAll("_"," ")}</span> · {money(Number(refund.amount_paise)/100)} · {formatDateTime(refund.initiated_at)}{refund.razorpay_refund_id ? <> · <code>{refund.razorpay_refund_id}</code></> : null}{refund.failure_details ? <><br/><small>{refund.failure_details}</small></> : null}<br/><small>{refundHistory.filter((entry)=>entry.refund_record_id===refund.id).map((entry)=>`${entry.status.replaceAll("_"," ")} · ${formatDateTime(entry.created_at)}`).join(" → ")}</small></p>)}</div> : null}
          <p>Gateway order: {order.gateway_order_id || "Not created"}</p>
          {order.payment_environment === "sandbox" ? <p className="notice">Sandbox test order. It is excluded from live operations and revenue.</p> : null}
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Customer</h2>
          {customer ? <><p>{customer.full_name || "—"}</p><p>{customer.email || "—"}</p><p>{customer.phone || "—"}</p><p>Account: {customer.account_status || "—"}</p></> : <p className="muted">Customer account is unavailable or was deleted. Retained order details are shown below.</p>}
          {customer ? <p><Link href={`/admin/customers/${order.customer_id}`}>Open customer and order history</Link></p> : null}
          <h3>Delivery address</h3>
          <p>{address.recipient_name as string}<br/>{address.address_line1 as string}{address.address_line2 ? `, ${address.address_line2 as string}` : ""}<br/>
            {address.locality as string}, {address.city as string}, {address.state as string} {address.postal_code as string}<br/>{address.phone as string}</p>
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Order status history</h2>
          {history?.length ? <ul className="tracking-list">{history.map((entry: any) => <li key={`${entry.created_at}-${entry.new_status}`}>
            <strong>{readableStatus(entry.new_status)}</strong><time>{formatDateTime(entry.created_at)}</time>{entry.note ? <span>{entry.note}</span> : null}
          </li>)}</ul> : <EmptyState title="No status history" body="Status history is recorded when the order changes."/>}
        </div>
      </section>
      <aside>
        {order.return_status ? <section className="panel" style={{marginBottom:14}}>
          <h2>Return / exchange handling</h2>
          <p>Current status: <span className={`status status-${order.return_status}`}>{String(order.return_status).replaceAll("_"," ")}</span></p>
          <p className="muted">Order status remains delivered while the separate return timeline advances. Return status changes do not initiate a payment refund.</p>
          {["return_requested","return_approved","return_pickup_scheduled","item_received","refund_initiated","refunded","return_rejected"].includes(order.return_status) ? <Link className="btn btn-outline" href="/admin/requests">Manage return in customer requests</Link>
            : order.return_status !== "returned_successfully" ? <form action={updateReturnStatusAction}><input type="hidden" name="order_id" value={id}/><label className="field"><span>Next status</span><select name="return_status" defaultValue={order.return_status === "return_initiated" ? "out_for_pickup" : "returned_successfully"}>{order.return_status === "return_initiated" ? <option value="out_for_pickup">Out for pickup</option> : <option value="returned_successfully">Returned successfully</option>}</select></label><label className="field"><span>Customer update note (optional)</span><textarea name="note" maxLength={500}/></label><button className="btn">Save return status</button></form>
            : <p className="notice">Return workflow completed.</p>}
        </section> : null}
        {order.payment_environment === "live" && order.payment_provider === "razorpay" && paymentStatus === "paid" && order.refund_status !== "refund_pending" && order.refund_status !== "refunded" ? <form action={initiateOrderRefundAction} className="panel" style={{marginBottom:14}}>
          <h2>Razorpay refund</h2><p>Initiate a full refund for the captured order amount: <strong>{money(order.total)}</strong>.</p><p className="muted">Razorpay controls settlement timing. BlitzKart will show refunded only after Razorpay confirms it.</p><input type="hidden" name="order_id" value={id}/><ConfirmSubmitButton className="btn" message={`Initiate a full Razorpay refund of ${money(order.total)} for order ${order.order_number || id}?`}>Initiate full refund</ConfirmSubmitButton>
        </form> : order.payment_provider === "payu" ? <div className="panel" style={{marginBottom:14}}><h2>Refund unavailable here</h2><p className="muted">This order was paid through legacy PayU checkout. Razorpay refunds cannot be issued against PayU payments.</p></div> : null}
        <form action={updateOrderStatusAction} className="panel">
          <h2>Update order status</h2>
          {paymentStatus === "paid" ? <p className="notice">Paid orders cannot be cancelled until the payment has been refunded.</p> : null}
          <input type="hidden" name="order_id" value={id}/>
          <label className="field"><span>Status</span><select name="status" defaultValue={orderStatus}>
            {visibleStates.map((status) => <option key={status} value={status} disabled={status === "cancelled" && paymentStatus === "paid"}>{status.replaceAll("_", " ")}</option>)}
          </select></label>
          <label className="field"><span>Internal note (admin only)</span><textarea name="note" maxLength={1000}/></label>
          <button className="btn">Save status and note</button>
        </form>
        <form action={updateDeliveryAction} className="panel" style={{ marginTop: 14 }}>
          <h2>Delivery tracking</h2>
          <input type="hidden" name="order_id" value={id}/>
          <label className="field"><span>Status</span><select name="status" defaultValue={delivery?.status ?? "pending"}>
            {deliveryStates.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
          </select></label>
          <label className="field"><span>Delivery mode</span><select name="mode" defaultValue="manual"><option value="manual">Manual</option></select></label>
          <label className="field"><span>Carrier tracking reference</span><input name="tracking_reference" defaultValue={delivery?.tracking_reference ?? ""}/></label>
          <label className="field"><span>Customer delivery update</span><textarea name="notes" defaultValue={delivery?.notes ?? ""} maxLength={1000}/></label>
          <button className="btn">Save delivery update</button>
        </form>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Internal notes</h2>
          {notes?.length ? notes.map((note: any) => <p key={note.id} className="notice">{note.note}<br/><small>{formatDateTime(note.created_at)}</small></p>) : <p className="muted">No internal notes yet.</p>}
        </div>
      </aside>
    </div>
  </>;
}

function OrderLoadError() {
  return <>
    <p><Link href="/admin/orders">← Orders</Link></p>
    <section className="panel" role="alert">
      <h1 className="page-title" style={{ marginTop: 0 }}>Order details unavailable</h1>
      <p>The order could not be loaded from the store database. Check the database connection and migrations, then refresh this page.</p>
      <Link className="btn btn-outline" href="/admin/orders">Return to orders</Link>
    </section>
  </>;
}
