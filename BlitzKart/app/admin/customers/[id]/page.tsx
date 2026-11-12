import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";
import { setCustomerStatusAction } from "@/lib/actions/admin";

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: customer, error } = await supabase.from("profiles")
    .select("id,full_name,email,phone,account_status,created_at")
    .eq("id", id).maybeSingle();
  if (error || !customer) notFound();
  const [{ data: adminAccount }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("admin_users").select("user_id").eq("user_id", id).maybeSingle(),
    supabase.from("orders").select("id,order_number,status,payment_status,total,created_at")
      .eq("customer_id", id).eq("payment_environment", "live").order("created_at", { ascending: false }),
  ]);
  if (adminAccount) notFound();

  return <>
    <p><Link href="/admin/customers">← Customers</Link></p>
    <h1 className="page-title" style={{ marginTop: 0 }}>{customer.full_name || "Customer account"}</h1>
    <div className="split">
      <section className="panel">
        <h2>Account details</h2>
        <p>Email: {customer.email}</p>
        <p>Phone: {customer.phone || "—"}</p>
        <p>Registered: {new Date(customer.created_at).toLocaleString("en-IN")}</p>
        <p>Account status: <span className="status">{customer.account_status}</span></p>
        <form action={setCustomerStatusAction}>
          <input type="hidden" name="customer_id" value={customer.id}/>
          <input type="hidden" name="status" value={customer.account_status === "active" ? "disabled" : "active"}/>
          <button className="btn btn-outline">{customer.account_status === "active" ? "Disable account" : "Enable account"}</button>
        </form>
      </section>
      <section>
        <h2>Order history</h2>
        {ordersError ? <div className="error">Order history could not be loaded.</div> : orders?.length ? <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Placed</th><th>Order status</th><th>Payment</th><th>Total</th><th></th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.id}>
            <td>{order.order_number}</td>
            <td>{new Date(order.created_at).toLocaleDateString("en-IN")}</td>
            <td><span className="status">{order.status.replaceAll("_", " ")}</span></td>
            <td><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></td>
            <td>{money(order.total)}</td>
            <td><Link href={`/admin/orders/${order.id}`}>Open</Link></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title="No orders found" body="This customer has no live orders."/>}
      </section>
    </div>
  </>;
}
