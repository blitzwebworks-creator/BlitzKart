"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShoppingBasket, Zap } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { LocationSelector } from "@/components/location-selector";

export function Header() {
  const { count } = useCart();
  const router = useRouter();
  const [query, setQuery] = useState("");
  function search(event: React.FormEvent) { event.preventDefault(); const q = query.trim(); if (q) router.push(`/search?q=${encodeURIComponent(q)}`); }
  return <>
    <div className="topline">Everything you need, delivered.</div>
    <header className="site-header"><div className="wrap header-main">
      <Link className="brand" href="/" aria-label="BlitzKart home"><span className="brand-mark"><Zap size={20} fill="currentColor" /></span>BlitzKart</Link>
      <LocationSelector/>
      <form className="searchbar" onSubmit={search}><Search size={18} color="#6a756d"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for products" aria-label="Search products"/><button className="btn btn-small" type="submit">Search</button></form>
      <div className="header-actions"><Link href="/account">Account</Link><Link className="cart-link" href="/cart"><ShoppingBasket size={18}/><span>Cart{count ? ` (${count})` : ""}</span></Link></div>
    </div><div className="navrow"><nav className="wrap navrow-inner" aria-label="Main navigation"><Link href="/products">Shop all</Link><Link href="/#categories">Categories</Link><Link href="/account/orders">My orders</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></nav></div></header>
  </>;
}
