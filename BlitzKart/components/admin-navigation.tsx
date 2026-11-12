"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, Factory, Layers3, LayoutDashboard, Package, Settings2, ShoppingBag, Tag, Truck, Users } from "lucide-react";

const groups = [
  { label: "Workspace", links: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  ] },
  { label: "Catalogue", links: [
    { href: "/admin/products", label: "Products", icon: Package },
    { href: "/admin/categories", label: "Categories", icon: Layers3 },
    { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  ] },
  { label: "Operations", links: [
    { href: "/admin/deliveries", label: "Deliveries", icon: Truck },
    { href: "/admin/sourcing", label: "Sourcing", icon: Factory },
    { href: "/admin/suppliers", label: "Suppliers", icon: Users },
  ] },
  { label: "Business", links: [
    { href: "/admin/customers", label: "Customers", icon: Users },
    { href: "/admin/coupons", label: "Coupons", icon: Tag },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/settings", label: "Settings", icon: Settings2 },
  ] },
];

function NavigationLinks({ current }: { current: string }) {
  return <>{groups.map((group) => <div className="admin-nav-group" key={group.label}>
    <span className="admin-nav-label">{group.label}</span>
    {group.links.map(({ href, label, icon: Icon }) => {
      const selected = href === "/admin" ? current === href : current === href || current.startsWith(`${href}/`);
      return <Link key={href} href={href} className={`admin-nav-link${selected ? " is-current" : ""}`} aria-current={selected ? "page" : undefined}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
      </Link>;
    })}
  </div>)}</>;
}

export function AdminNavigation() {
  const pathname = usePathname() || "/admin";
  return <>
    <nav className="admin-nav admin-nav-desktop" aria-label="Admin navigation"><NavigationLinks current={pathname}/></nav>
    <details className="admin-nav-mobile"><summary><LayoutDashboard size={17}/> Admin menu <span aria-hidden="true">⌄</span></summary><nav aria-label="Admin navigation"><NavigationLinks current={pathname}/></nav></details>
  </>;
}
