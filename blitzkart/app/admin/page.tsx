import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";
import { formatDate } from "@/lib/datetime";

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();
  const [{ data: rows, error: metricsError }, { data: recent, error: recentError }] = await Promise.all([
    supabase.rpc("admin_dashboard_metrics"),
    supabase.from("orders").select("id,order_number,status,payment_status,total,created_at")
      .eq("payment_environment", "live").order("created_at", { ascending: false }).limit(6),
  ]);
  const metrics = rows?.[0];
  const unavailable = Boolean(metricsError || !metrics);
  const value = (key: string) => unavailable ? "—" : Number(metrics?.[key] ?? 0).toLocaleString("en-IN");
  const revenue = unavailable ? "—" : money(Number(metrics?.revenue ?? 0));
  const primary = [
    ["Orders", value("total_orders"), "/admin/orders", "All live orders"],
    ["Paid revenue", revenue, "/admin/analytics", "Delivered orders only"],
    ["Need attention", value("pending_orders"), "/admin/orders?status=pending", "Pending orders"],
    ["Customers", value("registered_customers"), "/admin/customers", "Registered accounts"],
  ];
  const secondary = [
    ["Processing", value("processing_orders")],
    ["Completed", value("completed_orders")],
    ["Cancelled", value("cancelled_orders")],
    ["Active products", value("active_products")],
    ["Low stock", value("low_stock_products")],
  ];

  return <>
    <div className="admin-page-heading"><div><p className="admin-overline">Overview</p><h1>Good to see you</h1><p>Here’s what’s happening across your store.</p></div><div className="admin-heading-actions"><Link className="btn btn-outline" href="/admin/products">Manage products</Link><Link className="btn" href="/admin/orders">View orders</Link></div></div>
    {unavailable ? <p className="notice admin-data-notice">Some summary data could not be loaded. Unavailable values are shown as dashes.</p> : null}
    <section className="admin-primary-metrics" aria-label="Store summary">
      {primary.map(([label, number, href, detail]) => <Link className="admin-metric-card" href={href} key={label}><span>{label}</span><strong>{number}</strong><small>{detail}</small></Link>)}
    </section>
    <section className="admin-secondary-metrics" aria-label="Additional store metrics">
      {secondary.map(([label, number]) => <div className="admin-secondary-metric" key={label}><span>{label}</span><strong>{number}</strong></div>)}
    </section>
    <div className="admin-overview-grid">
      <section className="admin-surface">
        <div className="admin-section-heading"><div><h2>Recent orders</h2><p>Latest live customer orders</p></div><Link href="/admin/orders">All orders <span aria-hidden="true">→</span></Link></div>
        {recentError ? <div className="error">Order data could not be loaded.</div> : recent?.length ? <div className="table-wrap admin-table-wrap"><table>
          <thead><tr><th>Order</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>{recent.map((order) => <tr key={order.id}>
            <td><Link className="admin-order-link" href={`/admin/orders/${order.id}`}><strong>{order.order_number}</strong><small>{formatDate(order.created_at)}</small></Link></td>
            <td><span className="status">{order.status.replaceAll("_", " ")}</span></td>
            <td><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></td>
            <td>{money(order.total)}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title="No orders yet" body="New customer orders will appear here when received."/>}
      </section>
      <aside className="admin-side-stack">
        <section className="admin-surface">
          <div className="admin-section-heading"><div><h2>Inventory</h2><p>Stock that may need attention</p></div><Link href="/admin/inventory">Open <span aria-hidden="true">→</span></Link></div>
          {unavailable ? <div className="error">Inventory summary could not be loaded.</div> : Number(metrics?.low_stock_products ?? 0) > 0
            ? <div className="admin-stock-alert"><strong>{value("low_stock_products")}</strong><span>products at or below their configured low-stock threshold</span></div>
            : <div className="admin-inline-empty"><span className="admin-empty-check" aria-hidden="true">✓</span><span><strong>No low-stock alerts</strong><small>Stock levels are within configured thresholds.</small></span></div>}
        </section>
        <section className="admin-surface admin-shortcuts">
          <h2>Quick access</h2>
          <Link href="/admin/deliveries">Update delivery tracking <span aria-hidden="true">→</span></Link>
          <Link href="/admin/sourcing">Manage sourcing <span aria-hidden="true">→</span></Link>
          <Link href="/admin/categories">Edit categories <span aria-hidden="true">→</span></Link>
        </section>
      </aside>
    </div>
  </>;
}
