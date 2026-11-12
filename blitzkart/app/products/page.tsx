import type { Metadata } from "next";
import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
export const metadata: Metadata = { title: "Shop all products" };
export default async function ProductsPage() {
  const { products, error } = await getProducts();
  return <div className="wrap"><h1 className="page-title">Shop all products</h1>{error ? <div className="notice">{error}</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products to show" body="The active product catalogue is empty. Check back after products have been added."/>}</div>;
}
