"use client";

import Link from "next/link";
import { Check, Minus, PackageCheck, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { availableStock, money, type Product } from "@/lib/types";

export function ProductDetail({ product }: { product: Product }) {
  const { lines, add, setQuantity } = useCart();
  const images = product.product_images ?? [];
  const [activeImage, setActiveImage] = useState(0);
  const stock = availableStock(product);
  const quantity = lines.find((line) => line.product.id === product.id)?.quantity ?? 0;
  useEffect(() => setActiveImage(0), [product.id]);

  return <div className="product-detail-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/products">Shop</Link>{product.categories?.name ? <><span>›</span><Link href={product.categories.slug ? `/categories/${product.categories.slug}` : "/products"}>{product.categories.name}</Link></> : null}<span>›</span><span aria-current="page">{product.name}</span></nav>
    <div className="product-detail-grid">
      <section className="product-gallery" aria-label="Product images">
        <div className="product-gallery-main">{images[activeImage] ? <img src={images[activeImage].image_url} alt={images[activeImage].alt_text || product.name}/> : <div className="product-image-empty">Image not available</div>}</div>
        {images.length > 1 ? <div className="product-gallery-thumbs">{images.map((image, index) => <button type="button" key={`${image.image_url}-${index}`} className={index === activeImage ? "is-selected" : ""} onClick={() => setActiveImage(index)} aria-label={`Show product image ${index + 1}`} aria-pressed={index === activeImage}><img src={image.image_url} alt=""/></button>)}</div> : null}
      </section>
      <section className="product-detail-copy">
        {product.categories?.name ? <Link className="product-tag" href={product.categories.slug ? `/categories/${product.categories.slug}` : "/products"}>{product.categories.name}</Link> : null}
        <h1>{product.name}</h1><p className="product-detail-sku">SKU: {product.sku}</p>
        <div className="product-detail-price">{money(product.selling_price)}{product.original_price && product.original_price > product.selling_price ? <span className="old-price">{money(product.original_price)}</span> : null}</div>
        <p className={`availability-pill${stock ? " is-available" : " is-unavailable"}`}><span aria-hidden="true">{stock ? "●" : "○"}</span>{stock ? `${stock} available` : "Currently out of stock"}</p>
        <div className="product-detail-actions">
          {quantity > 0 ? <div className="product-quantity product-quantity-large" aria-label={`${quantity} ${product.name} in cart`}>
            <button type="button" onClick={() => setQuantity(product.id, quantity - 1)} aria-label="Remove one from cart"><Minus size={17}/></button><span aria-live="polite">{quantity}</span><button type="button" disabled={quantity >= stock} onClick={() => add(product)} aria-label="Add one to cart"><Plus size={17}/></button>
          </div> : <button className="btn product-detail-add" type="button" disabled={!stock} onClick={() => add(product)}><Plus size={17}/>{stock ? "Add to cart" : "Out of stock"}</button>}
          {quantity > 0 ? <Link className="btn btn-outline product-detail-cart" href="/cart">View cart</Link> : null}
        </div>
        <div className="product-assurance"><PackageCheck size={19}/><span><strong>Inventory checked live</strong><small>Availability is based on the current catalogue stock.</small></span><Check size={16}/></div>
        {product.description ? <section className="product-detail-section"><h2>About this product</h2><p>{product.description}</p></section> : null}
        {product.specifications && Object.keys(product.specifications).length ? <section className="product-detail-section"><h2>Product details</h2><dl className="specification-list">{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl></section> : null}
      </section>
    </div>
  </div>;
}
