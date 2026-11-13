import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return <footer className="site-footer">
    <div className="wrap footer-main">
      <div className="footer-brand-block">
        <Link className="brand" href="/"><span className="brand-mark"><Zap size={18} fill="currentColor"/></span><span className="brand-copy"><strong>BlitzKart</strong><small>Everything you need, delivered.</small></span></Link>
        <p>Everything you need, delivered.</p>
      </div>
      <div><h2>Shop</h2><nav className="footer-links"><Link href="/products">All products</Link><Link href="/products">Categories</Link><Link href="/cart">Your cart</Link></nav></div>
      <div><h2>Your orders</h2><nav className="footer-links"><Link href="/account/orders">Order history</Link><Link href="/track">Track an order</Link><Link href="/account">Your account</Link></nav></div>
      <div><h2>Help & information</h2><nav className="footer-links"><Link href="/contact">Contact</Link><Link href="/about">About BlitzKart</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms and conditions</Link></nav></div>
    </div>
    <div className="wrap footer-bottom"><span>© {new Date().getFullYear()} BlitzKart</span><span>Everyday shopping, made simple.</span></div>
  </footer>;
}
