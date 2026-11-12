import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProducts } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Category</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: category } = await supabase.from("categories").select("id,name,description").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!category) notFound();
  const { products, error } = await getProducts({ categoryId: category.id });
  return <div className="wrap"><h1 className="page-title">{category.name}</h1>{category.description ? <p className="muted">{category.description}</p> : null}{error ? <div className="notice">{error}</div> : products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState title="No products in this category" body="Products will appear here when they are added to this category."/>}</div>;
}
