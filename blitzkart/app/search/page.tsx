import Link from "next/link";
import { Search } from "lucide-react";
import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const { products, error } = query ? await getProducts({ search: query }) : { products: [], error: null };
  return <div className="wrap catalog-page search-page">
    <div className="catalog-heading"><div><span className="section-kicker">SEARCH BLITZKART</span><h1>{query ? "Search results" : "Search products"}</h1><p>{query ? <>Results for <strong>“{query}”</strong></> : "Use the search box at the top to find products in the active catalogue."}</p></div><span className="catalog-count"><Search size={16}/>{error ? "—" : products.length} {products.length === 1 ? "match" : "matches"}</span></div>
    {error ? <div className="error catalog-feedback">Search couldn’t be completed right now.</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title={query ? "No matching products" : "Start with a product name"} body={query ? "Try another search term or browse the full catalogue." : "Search uses product names from the active BlitzKart catalogue."} action="Browse all products" href="/products"/>}
    {query && products.length ? <p className="search-back-link"><Link href="/products">Browse the full catalogue</Link></p> : null}
  </div>;
}
