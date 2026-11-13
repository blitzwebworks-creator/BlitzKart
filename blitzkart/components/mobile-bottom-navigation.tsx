"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, House, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useCart } from "@/components/cart-provider";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/products", label: "Categories", icon: LayoutGrid },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/account/orders", label: "Orders", icon: ClipboardList },
  { href: "/account", label: "Account", icon: UserRound },
];

export function MobileBottomNavigation() {
  const pathname = usePathname() || "/";
  const { count } = useCart();
  if (pathname.startsWith("/admin") || pathname.startsWith("/checkout") || ["/login", "/register"].includes(pathname)) return null;

  return <nav className="mobile-bottom-nav" aria-label="Mobile shopping navigation">
    {links.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? pathname === "/"
        : href === "/products" ? pathname.startsWith("/products") || pathname.startsWith("/categories") || pathname.startsWith("/search")
          : href === "/account/orders" ? pathname.startsWith("/account/orders") || pathname.startsWith("/track")
          : href === "/account" ? pathname === "/account" || (pathname.startsWith("/account/") && !pathname.startsWith("/account/orders"))
              : pathname === href;
      return <Link key={href} className={`mobile-bottom-nav-link${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined} aria-label={label === "Cart" && count ? `Cart, ${count} items` : label}>
        <span className="mobile-bottom-nav-icon"><Icon size={20} strokeWidth={active ? 2.4 : 1.9}/>{label === "Cart" && count > 0 ? <span className="mobile-bottom-nav-badge">{count > 99 ? "99+" : count}</span> : null}</span>
        <span className="mobile-bottom-nav-label">{label}</span>
      </Link>;
    })}
  </nav>;
}
