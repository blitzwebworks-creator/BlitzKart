"use client";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { EmptyState } from "@/components/empty-state";
import { money } from "@/lib/types";

export function CartPage() {
  const { lines, setQuantity, remove } = useCart();
  const subtotal = lines.reduce((sum, line) => sum + Number(line.product.selling_price) * line.quantity, 0);
  return <div className="wrap"><h1 className="page-title">Your cart</h1>{!lines.length ? <EmptyState title="Your cart is empty" body="Add products from the live catalogue to get started." action="Browse products" href="/products"/> : <div className="split"><section className="panel">{lines.map(({ product, quantity }) => { const image = product.product_images?.[0]; return <div className="cart-row" key={product.id}><div className="cart-thumb">{image ? <img src={image.image_url} alt={image.alt_text || product.name}/> : "No image"}</div><div><strong>{product.name}</strong><div className="muted">{money(product.selling_price)} each</div><button className="btn btn-outline btn-small" style={{ marginTop: 7 }} onClick={() => remove(product.id)}>Remove</button></div><div style={{ textAlign: "right" }}><strong>{money(Number(product.selling_price) * quantity)}</strong><div className="qty-control" style={{ marginTop: 8 }}><button onClick={() => setQuantity(product.id, quantity - 1)} aria-label="Decrease quantity">−</button><span>{quantity}</span><button onClick={() => setQuantity(product.id, quantity + 1)} aria-label="Increase quantity">+</button></div></div></div>; })}</section><aside className="panel"><h2>Order summary</h2><p style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><strong>{money(subtotal)}</strong></p><p className="muted">Delivery availability and any applicable charges are confirmed at checkout.</p><Link className="btn" style={{ width: "100%" }} href="/checkout">Continue to checkout</Link></aside></div>}</div>;
}
