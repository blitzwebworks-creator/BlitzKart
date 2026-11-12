"use client";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { availableStock, money, type Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const image = product.product_images?.[0];
  const stock = availableStock(product);
  return <article className="product-card">
    <Link href={`/products/${product.slug}`} className="product-image">{image ? <img src={image.image_url} alt={image.alt_text || product.name}/> : <span>Image not available</span>}</Link>
    <div className="product-tag">{product.categories?.name || ""}</div>
    <Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link>
    <div className="product-meta">{stock ? "In stock" : "Out of stock"}</div>
    <div className="product-bottom"><span className="price">{money(product.selling_price)}{product.original_price && product.original_price > product.selling_price ? <span className="old-price">{money(product.original_price)}</span> : null}</span><button className="btn btn-small" disabled={!stock} onClick={() => add(product)}>{stock ? "Add" : "Sold out"}</button></div>
  </article>;
}
