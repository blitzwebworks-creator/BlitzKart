"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { EmptyState } from "@/components/empty-state";
import { availableStock, money } from "@/lib/types";

export function CartPage() {
  const { lines, setQuantity, remove } = useCart();
  const subtotal = lines.reduce((sum, line) => sum + Number(line.product.selling_price) * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  return <div className="wrap cart-page">
    <div className="cart-heading"><div><span className="section-kicker">YOUR SELECTION</span><h1>Your cart</h1><p>{itemCount} {itemCount === 1 ? "item" : "items"}</p></div><Link href="/products">Continue shopping <ArrowRight size={15}/></Link></div>
    {!lines.length ? <EmptyState title="Your cart is empty" body="Find something you need in the live BlitzKart catalogue." action="Browse products" href="/products"/> : <div className="cart-layout">
      <section className="cart-items panel" aria-label="Items in your cart">{lines.map(({ product, quantity }) => { const image = product.product_images?.[0]; return <article className="cart-item" key={product.id}>
        <Link href={`/products/${product.slug}`} className="cart-item-image">{image ? <Image fill sizes="(max-width: 640px) 63px, 90px" src={image.image_url} alt={image.alt_text || product.name}/> : <span>—</span>}</Link>
        <div className="cart-item-copy"><Link href={`/products/${product.slug}`}><strong>{product.name}</strong></Link><span>{money(product.selling_price)} each</span><button className="cart-remove" type="button" onClick={() => remove(product.id)}><Trash2 size={14}/> Remove</button></div>
        <div className="cart-item-actions"><strong>{money(Number(product.selling_price) * quantity)}</strong><div className="product-quantity" aria-label={`Quantity ${quantity}`}><button type="button" onClick={() => setQuantity(product.id, quantity - 1)} aria-label={`Remove one ${product.name}`}><Minus size={14}/></button><span aria-live="polite">{quantity}</span><button type="button" disabled={quantity >= availableStock(product)} onClick={() => setQuantity(product.id, quantity + 1)} aria-label={`Add one ${product.name}`}><Plus size={14}/></button></div></div>
      </article>; })}</section>
      <aside className="cart-summary panel"><span className="section-kicker">CHECK YOUR ORDER</span><h2>Order summary</h2><div className="cart-summary-row"><span>Items subtotal</span><strong>{money(subtotal)}</strong></div><p>Delivery availability, any applicable charges and valid coupons are confirmed at checkout.</p><Link className="btn cart-checkout-button" href="/checkout">Continue to checkout <ArrowRight size={16}/></Link><span className="cart-security"><ShieldCheck size={15}/> Secure checkout with configured payment providers</span></aside>
    </div>}
  </div>;
}
