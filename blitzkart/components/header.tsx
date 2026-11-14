"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Crown, LayoutGrid, LifeBuoy, Menu, PackageSearch, Search, ShieldCheck, ShoppingBasket, Sparkles, Tag, Truck, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { LocationSelector } from "@/components/location-selector";
import { announceNavigationStart } from "@/components/navigation-feedback";

const mainNavigation = [
  { href: "/products", label: "Shop all products", icon: PackageSearch, active: (path: string) => path.startsWith("/products") || path.startsWith("/search") || path.startsWith("/categories") },
  { href: "/#categories", label: "Categories", icon: LayoutGrid, active: (path: string) => path.startsWith("/categories") },
  { href: "/#offers", label: "Offers & deals", icon: Tag, active: () => false },
  { href: "/#new-arrivals", label: "New arrivals", icon: Sparkles, active: () => false },
  { href: "/#bestsellers", label: "Bestsellers", icon: Crown, active: () => false },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => setMobileMenuOpen(false), [pathname]);
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
    <div className="topline"><div className="wrap topline-inner"><span className="topline-tagline"><strong>BlitzKart</strong><i aria-hidden="true">·</i> Everything you need, delivered.</span><div className="topline-services"><span><CheckCircle2 size={14}/> PIN checked delivery</span><span><ShieldCheck size={14}/> Verified payments</span><span><Truck size={14}/> Order tracking</span><span><LifeBuoy size={14}/> Customer support</span></div></div></div>
    <header className="site-header">
      <div className="wrap header-main">
        <button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Close shopping menu" : "Open shopping menu"} aria-expanded={mobileMenuOpen} aria-controls="mobile-shopping-menu" onClick={() => setMobileMenuOpen((value) => !value)}>
          {mobileMenuOpen ? <X size={22}/> : <Menu size={23}/>}
        </button>
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
          <Link className="header-orders-link" href="/account/orders"><ClipboardList size={19} aria-hidden="true" /><span>Orders</span></Link>
          <Link className="header-account-link" href="/account" aria-label="Account"><UserRound size={19} aria-hidden="true" /><span>Account</span></Link>
          <Link className="mobile-support-link" href="/contact" aria-label="Help and support"><LifeBuoy size={20} aria-hidden="true"/></Link>
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
      {mobileMenuOpen ? <nav className="mobile-menu-panel" id="mobile-shopping-menu" aria-label="Shopping menu">{mainNavigation.map(({ href, label, icon: Icon, active }) => {
        const isActive = active(pathname);
        return <Link className={`mobile-menu-link${isActive ? " is-active" : ""}`} href={href} key={label} aria-current={isActive ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}><Icon size={18} aria-hidden="true"/><span>{label}</span><span className="mobile-menu-arrow" aria-hidden="true">›</span></Link>;
      })}</nav> : null}
    </header>
  </>;
}
