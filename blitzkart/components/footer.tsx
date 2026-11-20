import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return <footer className="site-footer">
    <div className="wrap footer-main">
      <div className="footer-brand-block">
        <Link className="brand" href="/" aria-label="BlitzKart home"><Image className="brand-logo-image footer-logo-image" src="/blitzkart-logo.png" alt="BlitzKart" width={2172} height={724} sizes="190px"/></Link>
        <p>Everything you need, delivered.</p>
      </div>
      <div><h2>Shop</h2><nav className="footer-links"><Link href="/products">All products</Link><Link href="/categories">Categories</Link><Link href="/cart">Your cart</Link></nav></div>
      <div><h2>Your orders</h2><nav className="footer-links"><Link href="/account/orders">Order history</Link><Link href="/track">Track an order</Link><Link href="/account">Your account</Link></nav></div>
      <div><h2>Help & information</h2><nav className="footer-links"><Link href="/contact">Contact</Link><Link href="/about">About BlitzKart</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms & Conditions</Link></nav></div>
      <div><h2>Customer policies</h2><nav className="footer-links"><Link href="/refund-policy">Refund Policy</Link><Link href="/return-exchange">Return & Exchange Policy</Link><Link href="/shipping-delivery">Shipping & Delivery Policy</Link><Link href="/cancellation-policy">Cancellation Policy</Link></nav></div>
    </div>
    <div className="wrap footer-bottom"><span>© {new Date().getFullYear()} BlitzKart</span><span>Everyday shopping, made simple.</span></div>
  </footer>;
}
