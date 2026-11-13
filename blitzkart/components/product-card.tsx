"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { availableStock, money, type Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { lines, add, setQuantity } = useCart();
  const image = product.product_images?.[0];
  const stock = availableStock(product);
  const quantity = lines.find((line) => line.product.id === product.id)?.quantity ?? 0;
  const maxed = quantity >= stock;

  return <article className="product-card">
    <Link href={`/products/${product.slug}`} className="product-image" aria-label={`View ${product.name}`}>
      {image ? <Image fill sizes="(max-width: 640px) 44vw, (max-width: 1100px) 30vw, 240px" src={image.image_url} alt={image.alt_text || product.name}/> : <span className="product-image-empty">Image not available</span>}
      {!stock ? <span className="stock-badge">Out of stock</span> : null}
    </Link>
    <div className="product-card-copy">
      {product.categories?.name ? <Link className="product-tag" href={product.categories.slug ? `/categories/${product.categories.slug}` : "/products"}>{product.categories.name}</Link> : <span className="product-tag">SKU {product.sku}</span>}
      <Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link>
      <div className="product-meta">{stock ? "Available now" : "Currently unavailable"}</div>
      <div className="product-bottom">
        <span className="price">{money(product.selling_price)}{product.original_price && product.original_price > product.selling_price ? <span className="old-price">{money(product.original_price)}</span> : null}</span>
        {quantity > 0 ? <div className="product-quantity" aria-label={`${quantity} ${product.name} in cart`}>
          <button type="button" onClick={() => setQuantity(product.id, quantity - 1)} aria-label={`Remove one ${product.name} from cart`}><Minus size={14}/></button>
          <span aria-live="polite">{quantity}</span>
          <button type="button" onClick={() => add(product)} disabled={maxed} aria-label={`Add one ${product.name} to cart`}><Plus size={14}/></button>
        </div> : <button className="btn btn-small product-add" type="button" disabled={!stock} onClick={() => add(product)}><Plus size={15}/>{stock ? "Add" : "Sold out"}</button>}
      </div>
    </div>
  </article>;
}
