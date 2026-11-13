"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, ShoppingBasket, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { LocationSelector } from "@/components/location-selector";
import { announceNavigationStart } from "@/components/navigation-feedback";

export function Header() {
  const { count } = useCart();
  const router = useRouter();
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
          <Link className="nav-shop-all" href="/products"><span className="nav-burger" aria-hidden="true">☰</span> Shop all products</Link>
          <Link href="/products">Categories</Link>
          <Link href="/products">Browse catalogue</Link>
          <Link href="/account/orders">My orders</Link>
          <Link href="/track">Track an order</Link>
          <Link href="/contact">Help</Link>
        </nav>
      </div>
    </header>
  </>;
}
