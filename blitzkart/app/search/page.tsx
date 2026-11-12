import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams; const query = q.trim(); const { products, error } = query ? await getProducts({ search: query }) : { products: [], error: null };
  return <div className="wrap"><h1 className="page-title">{query ? `Search results for “${query}”` : "Search products"}</h1>{error ? <div className="notice">{error}</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title={query ? "No matching products" : "Enter a product name"} body={query ? "Try a different search term." : "Use the search bar to find products in the active catalogue."}/>}</div>;
}
