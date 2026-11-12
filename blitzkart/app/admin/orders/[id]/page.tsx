import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";
import { updateDeliveryAction, updateOrderStatusAction } from "@/lib/actions/admin";

const states = ["pending","confirmed","sourcing","packed","ready_for_pickup","out_for_delivery","delivered","cancelled"];
const deliveryStates = ["pending","booked","picked_up","in_transit","out_for_delivery","delivered","exception","cancelled"];

export default async function AdminOrderDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: order } = await supabase.from("orders")
    .select("id,customer_id,order_number,status,payment_status,payment_environment,subtotal,discount_amount,delivery_charge,total,delivery_address,created_at,gateway_order_id")
    .eq("id", id).maybeSingle();
  if (!order) notFound();

  const [{ data: customer }, { data: items }, { data: history }, { data: notes }, { data: delivery }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,phone,account_status,created_at").eq("id", order.customer_id).maybeSingle(),
    supabase.from("order_items").select("product_name,sku,quantity,unit_price,line_total").eq("order_id", id),
    supabase.from("order_status_history").select("previous_status,new_status,created_at,changed_by,note").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("internal_order_notes").select("id,note,admin_id,created_at").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("deliveries").select("id,mode,status,tracking_reference,notes,updated_at").eq("order_id", id).maybeSingle(),
  ]);
  const visibleStates = states.filter((status) => status !== "cancelled" || order.payment_status !== "paid" || order.status === "cancelled");

  return <>
    <p><Link href="/admin/orders">← Orders</Link></p>
    <h1 className="page-title" style={{ marginTop: 0 }}>Order {order.order_number}</h1>
    {query.message ? <p className="notice">{query.message}</p> : null}
    {query.error ? <p className="error">{query.error}</p> : null}
    <div className="split">
      <section>
        <div className="panel">
          <h2>Order items</h2>
          {items?.length ? items.map((item: any) => <p key={`${item.sku}-${item.product_name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{item.product_name} · {item.sku} × {item.quantity} · {money(item.unit_price)} each</span><strong>{money(item.line_total)}</strong>
          </p>) : <EmptyState title="No order items found" body="Order line items could not be shown."/>}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)" }}/>
          <p>Subtotal: {money(order.subtotal)}</p><p>Discount: {money(order.discount_amount)}</p><p>Delivery: {money(order.delivery_charge)}</p>
          <p><strong>Total: {money(order.total)}</strong></p>
          <p>Payment: <span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></p>
          <p>Gateway order: {order.gateway_order_id || "Not created"}</p>
          {order.payment_environment === "sandbox" ? <p className="notice">Sandbox test order. It is excluded from live operations and revenue.</p> : null}
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Customer</h2>
          <p>{customer?.full_name || "—"}</p><p>{customer?.email || "—"}</p><p>{customer?.phone || "—"}</p><p>Account: {customer?.account_status || "—"}</p>
          {customer ? <p><Link href={`/admin/customers/${order.customer_id}`}>Open customer and order history</Link></p> : null}
          <h3>Delivery address</h3>
          <p>{order.delivery_address?.recipient_name}<br/>{order.delivery_address?.address_line1}{order.delivery_address?.address_line2 ? `, ${order.delivery_address.address_line2}` : ""}<br/>
            {order.delivery_address?.locality}, {order.delivery_address?.city}, {order.delivery_address?.state} {order.delivery_address?.postal_code}<br/>{order.delivery_address?.phone}</p>
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Order status history</h2>
          {history?.length ? <ul className="tracking-list">{history.map((entry: any) => <li key={`${entry.created_at}-${entry.new_status}`}>
            <strong>{entry.new_status.replaceAll("_", " ")}</strong><time>{new Date(entry.created_at).toLocaleString("en-IN")}</time>{entry.note ? <span>{entry.note}</span> : null}
          </li>)}</ul> : <EmptyState title="No status history" body="Status history is recorded when the order changes."/>}
        </div>
      </section>
      <aside>
        <form action={updateOrderStatusAction} className="panel">
          <h2>Update order status</h2>
          {order.payment_status === "paid" ? <p className="notice">Paid orders cannot be cancelled until a refund workflow is configured.</p> : null}
          <input type="hidden" name="order_id" value={id}/>
          <label className="field"><span>Status</span><select name="status" defaultValue={order.status}>
            {visibleStates.map((status) => <option key={status} value={status} disabled={status === "cancelled" && order.payment_status === "paid"}>{status.replaceAll("_", " ")}</option>)}
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
          {notes?.length ? notes.map((note: any) => <p key={note.id} className="notice">{note.note}<br/><small>{new Date(note.created_at).toLocaleString("en-IN")}</small></p>) : <p className="muted">No internal notes yet.</p>}
        </div>
      </aside>
    </div>
  </>;
}
