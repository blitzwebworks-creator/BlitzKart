"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ClipboardList, LayoutGrid, LifeBuoy, PackageSearch, Search, ShoppingBasket, Truck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { LocationSelector } from "@/components/location-selector";
import { announceNavigationStart } from "@/components/navigation-feedback";

const mainNavigation = [
  { href: "/products", label: "Shop all products", icon: PackageSearch, active: (path: string) => path.startsWith("/products") || path.startsWith("/search") || path.startsWith("/categories") },
  { href: "/#categories", label: "Categories", icon: LayoutGrid, active: (path: string) => path.startsWith("/categories") },
  { href: "/account/orders", label: "My orders", icon: ClipboardList, active: (path: string) => path.startsWith("/account/orders") },
  { href: "/track", label: "Track an order", icon: Truck, active: (path: string) => path.startsWith("/track") },
  { href: "/contact", label: "Help", icon: LifeBuoy, active: (path: string) => path.startsWith("/contact") },
];

export function Header() {
  const { count } = useCart();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/suggest?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        .then(async (response) => response.ok ? await response.json() as { suggestions?: string[] } : { suggestions: [] })
        .then((body) => setSuggestions(body.suggestions ?? []))
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  function search(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) {
      announceNavigationStart();
      router.push(`/search?q=${encodeURIComponent(value)}`);
    }
  }

  return <>
    <div className="topline"><span>BlitzKart</span><i aria-hidden="true">·</i> Everything you need, delivered.</div>
    <header className="site-header">
      <div className="wrap header-main">
        <Link className="brand" href="/" aria-label="BlitzKart home">
          <Image className="brand-logo-image" src="/blitzkart-logo.png" alt="BlitzKart" width={2172} height={724} priority sizes="(max-width: 700px) 148px, 190px" />
        </Link>
        <LocationSelector />
        <form className="searchbar" onSubmit={search} data-navigation-feedback="false">
          <Search size={18} aria-hidden="true" />
          <input list="blitzkart-product-suggestions" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products in our catalogue" aria-label="Search products" />
          <datalist id="blitzkart-product-suggestions">{suggestions.map((name) => <option key={name} value={name}/>)}</datalist>
          <button type="submit" aria-label="Search"><span>Search</span><Search size={16} aria-hidden="true" /></button>
        </form>
        <nav className="header-actions" aria-label="Your account and cart">
          <Link href="/account/orders"><ClipboardList size={19} aria-hidden="true" /><span>Orders</span></Link>
          <Link href="/account"><UserRound size={19} aria-hidden="true" /><span>Account</span></Link>
          <Link className="cart-link" href="/cart" aria-label={`Cart${count ? `, ${count} items` : ""}`}>
            <ShoppingBasket size={20} aria-hidden="true" /><span className="cart-label">Cart</span>
            <span className="cart-count" aria-live="polite">{count}</span>
          </Link>
        </nav>
      </div>
      <div className="navrow">
        <nav className="wrap navrow-inner" aria-label="Main navigation">
          {mainNavigation.map(({ href, label, icon: Icon, active }, index) => {
            const isActive = active(pathname);
            return <Link className={`nav-link${index === 0 ? " nav-shop-all" : ""}${isActive ? " is-active" : ""}`} href={href} key={label} aria-current={isActive ? "page" : undefined}>
              <Icon size={16} strokeWidth={index === 0 || isActive ? 2.2 : 1.8} aria-hidden="true"/><span>{label}</span>
            </Link>;
          })}
        </nav>
      </div>
    </header>
  </>;
}
