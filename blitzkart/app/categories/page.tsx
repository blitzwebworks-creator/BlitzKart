import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getCategories } from "@/lib/data";

export const metadata: Metadata = {
  title: "Shop by Category | BlitzKart",
  description: "Browse BlitzKart’s live product categories and find what you need.",
};

export default async function CategoriesPage() {
  const { categories, error } = await getCategories();

  return <main className="wrap category-directory-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><span aria-current="page">Categories</span></nav>
    <header className="category-directory-heading">
      <span className="section-kicker">FIND WHAT YOU NEED</span>
      <h1>Shop by category</h1>
      <p>Browse the categories currently available in the BlitzKart catalogue.</p>
      <Link className="btn category-directory-all" href="/products">Browse all products <ArrowRight size={16}/></Link>
    </header>

    {error ? <section className="category-directory-state" role="alert"><strong>Categories couldn’t be loaded.</strong><p>Please try again shortly, or browse all products.</p><Link className="btn btn-outline" href="/products">Browse all products</Link></section>
      : categories.length ? <div className="category-directory-grid">
        {categories.map((category) => <Link className="category-directory-card" href={`/categories/${category.slug}`} key={category.id}>
          <span className="category-directory-art">
            {category.image_url ? <Image src={category.image_url} alt="" fill sizes="(max-width: 600px) 42vw, (max-width: 1000px) 28vw, 220px"/>
              : <span className="category-directory-letter" aria-hidden="true"><LayoutGrid size={25}/></span>}
          </span>
          <span className="category-directory-copy"><strong>{category.name}</strong>{category.description ? <small>{category.description}</small> : null}</span>
          <ArrowRight className="category-directory-arrow" size={17} aria-hidden="true"/>
        </Link>)}
      </div> : <EmptyState title="No categories are available yet" body="Categories will appear here when they are added to the live BlitzKart catalogue." action="Browse all products" href="/products"/>}
  </main>;
}
