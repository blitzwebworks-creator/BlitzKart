import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

const PAGE_SIZE = 24;

function validPrice(value?: string) {
  if (!value || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ min?: string; max?: string; sort?: string; page?: string }> }) {
  const { slug } = await params;
  const filters = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap catalog-page"><h1 className="page-title">Category</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: category } = await supabase.from("categories").select("id,name,description,image_url").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!category) notFound();
  const minPrice = validPrice(filters.min);
  const maxPrice = validPrice(filters.max);
  const invalidPriceRange = minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice;
  const sort = filters.sort === "price-asc" || filters.sort === "price-desc" ? filters.sort : "newest";
  const requestedPage = /^\d{1,5}$/.test(filters.page ?? "") ? Math.max(1, Number(filters.page)) : 1;
  const { products, error, total } = await getProducts({ categoryId: category.id, minPrice: invalidPriceRange ? undefined : minPrice, maxPrice: invalidPriceRange ? undefined : maxPrice, sort, page: requestedPage, limit: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const pageUrl = (page: number) => {
    const query = new URLSearchParams();
    if (minPrice !== undefined) query.set("min", String(minPrice));
    if (maxPrice !== undefined) query.set("max", String(maxPrice));
    if (sort !== "newest") query.set("sort", sort);
    query.set("page", String(page));
    return `/categories/${slug}?${query.toString()}`;
  };
  return <div className="wrap catalog-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/products">Shop</Link><span>›</span><span aria-current="page">{category.name}</span></nav>
    <div className="catalog-category-hero">{category.image_url ? <div className="catalog-category-image-wrap"><Image fill sizes="(max-width: 640px) 90px, 320px" src={category.image_url} alt=""/></div> : null}<div className="catalog-heading"><div><span className="section-kicker">SHOP BY CATEGORY</span><h1>{category.name}</h1>{category.description ? <p>{category.description}</p> : null}</div><span className="catalog-count">{error ? "—" : total} {total === 1 ? "product" : "products"}</span></div></div>
    <form className="catalog-controls" method="get" action={`/categories/${slug}`}>
      <label><span>Minimum price</span><input name="min" type="number" min="0" step="1" inputMode="numeric" placeholder="₹ Min" defaultValue={minPrice}/></label>
      <label><span>Maximum price</span><input name="max" type="number" min="0" step="1" inputMode="numeric" placeholder="₹ Max" defaultValue={maxPrice}/></label>
      <label><span>Sort by</span><select name="sort" defaultValue={sort}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
      <button className="btn catalog-apply" type="submit">Apply filters</button>
      {(minPrice !== undefined || maxPrice !== undefined || sort !== "newest") ? <Link className="catalog-clear" href={`/categories/${slug}`}>Clear</Link> : null}
    </form>
    {invalidPriceRange ? <p className="notice catalog-notice" role="alert">Maximum price must be at least the minimum price.</p> : null}
    {error ? <div className="error catalog-feedback">Products in this category couldn’t be loaded.</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products in this category yet" body="Products will appear here when they’re added to this category." action="Browse all products" href="/products"/>}
    {!error && total > PAGE_SIZE ? <nav className="catalog-pagination" aria-label="Category product pages"><span>Page {currentPage} of {pageCount}</span><div>{currentPage > 1 ? <Link className="btn btn-outline" href={pageUrl(currentPage - 1)}>Previous</Link> : <span className="btn btn-outline is-disabled" aria-disabled="true">Previous</span>}{currentPage < pageCount ? <Link className="btn btn-outline" href={pageUrl(currentPage + 1)}>Next</Link> : <span className="btn btn-outline is-disabled" aria-disabled="true">Next</span>}</div></nav> : null}
    <Link className="catalog-back-link" href="/products"><ArrowLeft size={15}/> All products</Link>
  </div>;
}
