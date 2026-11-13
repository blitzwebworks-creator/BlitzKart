import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { getCategories, getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Shop all products" };

export default async function ProductsPage() {
  const [{ products, error }, { categories, error: categoryError }] = await Promise.all([getProducts(), getCategories()]);
  return <div className="wrap catalog-page">
    <div className="catalog-heading"><div><span className="section-kicker">THE BLITZKART CATALOGUE</span><h1>Shop all products</h1><p>Browse the active products available in our catalogue.</p></div><span className="catalog-count"><SlidersHorizontal size={16}/>{error ? "—" : products.length} {products.length === 1 ? "product" : "products"}</span></div>
    {categoryError ? <p className="notice catalog-notice">Category filters couldn’t be loaded right now.</p> : categories.length ? <nav className="catalog-category-filter" aria-label="Browse categories"><Link className="is-selected" href="/products">All products</Link>{categories.map((category) => <Link key={category.id} href={`/categories/${category.slug}`}>{category.name}</Link>)}</nav> : null}
    {error ? <div className="error catalog-feedback">Products couldn’t be loaded. Please try again in a moment.</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products to show" body="The active product catalogue is empty. Check back after products have been added." action="Back to home" href="/"/>}
  </div>;
}
