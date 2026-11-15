import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { getCategories, getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Shop all products" };

const PAGE_SIZE = 24;

function validPrice(value?: string) {
  if (!value || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ min?: string; max?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const minPrice = validPrice(params.min);
  const maxPrice = validPrice(params.max);
  const invalidPriceRange = minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice;
  const sort = params.sort === "price-asc" || params.sort === "price-desc" ? params.sort : "newest";
  const requestedPage = /^\d{1,5}$/.test(params.page ?? "") ? Math.max(1, Number(params.page)) : 1;
  const [{ products, error, total }, { categories, error: categoryError }] = await Promise.all([
    getProducts({ minPrice: invalidPriceRange ? undefined : minPrice, maxPrice: invalidPriceRange ? undefined : maxPrice, sort, page: requestedPage, limit: PAGE_SIZE }),
    getCategories(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const queryForPage = (page: number) => {
    const query = new URLSearchParams();
    if (minPrice !== undefined) query.set("min", String(minPrice));
    if (maxPrice !== undefined) query.set("max", String(maxPrice));
    if (sort !== "newest") query.set("sort", sort);
    query.set("page", String(page));
    return `/products?${query.toString()}`;
  };
  return <div className="wrap catalog-page">
    <div className="catalog-heading"><div><span className="section-kicker">THE BLITZKART CATALOGUE</span><h1>Shop all products</h1><p>Browse the active products available in our catalogue.</p></div><span className="catalog-count"><SlidersHorizontal size={16}/>{error ? "—" : total} {total === 1 ? "product" : "products"}</span></div>
    {categoryError ? <p className="notice catalog-notice">Category filters couldn’t be loaded right now.</p> : categories.length ? <nav className="catalog-category-filter" aria-label="Browse categories"><Link className="is-selected" href="/products">All products</Link>{categories.map((category) => <Link key={category.id} href={`/categories/${category.slug}`}>{category.name}</Link>)}</nav> : null}
    <form className="catalog-controls" method="get" action="/products">
      <label><span>Minimum price</span><input name="min" type="number" min="0" step="1" inputMode="numeric" placeholder="₹ Min" defaultValue={minPrice}/></label>
      <label><span>Maximum price</span><input name="max" type="number" min="0" step="1" inputMode="numeric" placeholder="₹ Max" defaultValue={maxPrice}/></label>
      <label><span>Sort by</span><select name="sort" defaultValue={sort}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
      <button className="btn catalog-apply" type="submit">Apply filters</button>
      {(minPrice !== undefined || maxPrice !== undefined || sort !== "newest") ? <Link className="catalog-clear" href="/products">Clear</Link> : null}
    </form>
    {invalidPriceRange ? <p className="notice catalog-notice" role="alert">Maximum price must be at least the minimum price.</p> : null}
    {error ? <div className="error catalog-feedback">Products couldn’t be loaded. Please try again in a moment.</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products to show" body="The active product catalogue is empty. Check back after products have been added." action="Back to home" href="/"/>}
    {!error && total > PAGE_SIZE ? <nav className="catalog-pagination" aria-label="Product pages"><span>Page {currentPage} of {pageCount}</span><div>{currentPage > 1 ? <Link className="btn btn-outline" href={queryForPage(currentPage - 1)}>Previous</Link> : <span className="btn btn-outline is-disabled" aria-disabled="true">Previous</span>}{currentPage < pageCount ? <Link className="btn btn-outline" href={queryForPage(currentPage + 1)}>Next</Link> : <span className="btn btn-outline is-disabled" aria-disabled="true">Next</span>}</div></nav> : null}
  </div>;
}
