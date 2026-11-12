import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap catalog-page"><h1 className="page-title">Category</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: category } = await supabase.from("categories").select("id,name,description").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!category) notFound();
  const { products, error } = await getProducts({ categoryId: category.id });
  return <div className="wrap catalog-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><Link href="/products">Shop</Link><span>›</span><span aria-current="page">{category.name}</span></nav>
    <div className="catalog-heading"><div><span className="section-kicker">SHOP BY CATEGORY</span><h1>{category.name}</h1>{category.description ? <p>{category.description}</p> : null}</div><span className="catalog-count">{error ? "—" : products.length} {products.length === 1 ? "product" : "products"}</span></div>
    {error ? <div className="error catalog-feedback">Products in this category couldn’t be loaded.</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products in this category yet" body="Products will appear here when they’re added to this category." action="Browse all products" href="/products"/>}
    <Link className="catalog-back-link" href="/products"><ArrowLeft size={15}/> All products</Link>
  </div>;
}
