"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, House, LayoutGrid, Tag, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/categories", label: "Categories", icon: LayoutGrid },
  { href: "/#offers", label: "Offers", icon: Tag },
  { href: "/account/orders", label: "Orders", icon: ClipboardList },
  { href: "/account", label: "Account", icon: UserRound },
];

export function MobileBottomNavigation() {
  const pathname = usePathname() || "/";
  const [hash, setHash] = useState("");
  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);
  if (pathname.startsWith("/admin") || pathname.startsWith("/checkout") || ["/login", "/register"].includes(pathname)) return null;

  return <nav className="mobile-bottom-nav" aria-label="Mobile shopping navigation">
    {links.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? pathname === "/"
        : label === "Categories" ? pathname.startsWith("/categories")
          : label === "Offers" ? pathname === "/" && hash === "#offers"
          : href === "/account/orders" ? pathname.startsWith("/account/orders") || pathname.startsWith("/track")
          : href === "/account" ? pathname === "/account" || (pathname.startsWith("/account/") && !pathname.startsWith("/account/orders"))
              : pathname === href;
      return <Link key={href} className={`mobile-bottom-nav-link${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined} aria-label={label}>
        <span className="mobile-bottom-nav-icon"><Icon size={20} strokeWidth={active ? 2.4 : 1.9}/></span>
        <span className="mobile-bottom-nav-label">{label}</span>
      </Link>;
    })}
  </nav>;
}
