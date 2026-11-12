import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

const links = [
  ["Overview","/admin"],["Orders","/admin/orders"],["Products","/admin/products"],["Categories","/admin/categories"],
  ["Inventory","/admin/inventory"],["Customers","/admin/customers"],["Coupons","/admin/coupons"],["Deliveries","/admin/deliveries"],
  ["Suppliers","/admin/suppliers"],["Sourcing","/admin/sourcing"],["Analytics","/admin/analytics"],["Settings","/admin/settings"],["Support","/admin/support"],
];
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="wrap admin-shell"><nav className="admin-nav" aria-label="Admin navigation"><strong style={{ padding: "8px 10px 12px" }}>BlitzKart admin</strong>{links.map(([label,href]) => <Link key={href} href={href}>{label}</Link>)}</nav><section style={{ minWidth: 0 }}>{children}</section></div>;
}
