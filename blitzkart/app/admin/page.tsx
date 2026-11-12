import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();
  const [{ data: rows, error: metricsError }, { data: recent, error: recentError }] = await Promise.all([
    supabase.rpc("admin_dashboard_metrics"),
    supabase.from("orders").select("id,order_number,status,payment_status,total,created_at")
      .eq("payment_environment", "live").order("created_at", { ascending: false }).limit(8),
  ]);
  const metrics = rows?.[0];
  const unavailable = Boolean(metricsError || !metrics);
  const metricValue = (value: unknown) => unavailable ? "—" : Number(value ?? 0);
  const metric = (label: string, value: string | number) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>;

  return <>
    <h1 className="page-title" style={{ marginTop: 0 }}>Overview</h1>
    <div className="metric-grid">{[
      metric("Total orders", metricValue(metrics?.total_orders)),
      metric("Revenue · paid & delivered", unavailable ? "—" : money(Number(metrics.revenue ?? 0))),
      metric("Pending orders", metricValue(metrics?.pending_orders)),
      metric("Processing orders", metricValue(metrics?.processing_orders)),
      metric("Completed orders", metricValue(metrics?.completed_orders)),
      metric("Cancelled orders", metricValue(metrics?.cancelled_orders)),
      metric("Registered customers", metricValue(metrics?.registered_customers)),
      metric("Active products", metricValue(metrics?.active_products)),
      metric("Low-stock products", metricValue(metrics?.low_stock_products)),
    ]}</div>
    {unavailable ? <p className="notice" style={{ marginTop: 12 }}>Dashboard metrics could not be loaded. Unavailable values are shown as dashes.</p> : null}
    <section className="section">
      <div className="section-head"><h2>Recent orders</h2><Link href="/admin/orders">Manage orders</Link></div>
      {recentError ? <div className="error">Order data could not be loaded.</div> : recent?.length ? <div className="table-wrap"><table>
        <thead><tr><th>Order</th><th>Placed</th><th>Order status</th><th>Payment</th><th>Total</th></tr></thead>
        <tbody>{recent.map((order) => <tr key={order.id}>
          <td><Link href={`/admin/orders/${order.id}`}>{order.order_number}</Link></td>
          <td>{new Date(order.created_at).toLocaleDateString("en-IN")}</td>
          <td><span className="status">{order.status.replaceAll("_", " ")}</span></td>
          <td><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></td>
          <td>{money(order.total)}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="No orders received" body="Order operations and analytics will appear after real orders are received."/>}
    </section>
    <section className="section">
      <div className="section-head"><h2>Inventory attention</h2><Link href="/admin/inventory">Open inventory</Link></div>
      {unavailable ? <div className="error">Low-stock alerts could not be loaded.</div> : Number(metrics.low_stock_products) > 0
        ? <div className="notice">{Number(metrics.low_stock_products)} product{Number(metrics.low_stock_products) === 1 ? "" : "s"} at or below their configured low-stock threshold.</div>
        : <EmptyState title="No low-stock alerts" body="Low-stock alerts use current stock, active reservations and each product’s configured threshold."/>}
    </section>
  </>;
}
