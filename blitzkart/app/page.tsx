import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { getBestsellers, getCategories, getProducts, getPromotionalBanners } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import type { Product } from "@/lib/types";

function ProductShelf({ title, products, href }: { title: string; products: Product[]; href?: string }) {
  if (!products.length) return null;
  return <section className="section product-shelf">
    <div className="section-head"><div><h2>{title}</h2></div>{href ? <Link href={href}>View all <ArrowRight size={15}/></Link> : null}</div>
    <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>
  </section>;
}

export default async function HomePage() {
  const [categoryResult, productResult, recentResult, catalogueResult, bannerResult, bestsellerResult, trendingResult] = await Promise.all([
    getCategories(), getProducts({ limit: 10 }), getProducts({ limit: 5 }), getProducts(), getPromotionalBanners(), getBestsellers(undefined, 5), getBestsellers(30, 5),
  ]);
  const { categories, error: categoryError } = categoryResult;
  const { products, error: productError } = productResult;
  const catalogue = catalogueResult.products;
  const catalogueError = productError || catalogueResult.error;
  const featured = catalogue.filter((product) => product.is_featured).slice(0, 5);
  const offers = catalogue.filter((product) => product.original_price && product.original_price > product.selling_price).slice(0, 5);

  return <div className="wrap home-page">
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-eyebrow"><Zap size={14} fill="currentColor"/> EVERYTHING YOU NEED, DELIVERED</span>
        <h1>Everything you need,<br/><span>delivered with ease.</span></h1>
        <p>Find everyday products in one simple shop. Browse what’s in the live catalogue and add it to your cart in a tap.</p>
        <div className="hero-actions"><Link className="btn" href="/products">Shop all products <ArrowRight size={17}/></Link><Link className="hero-secondary-link" href="/products">Explore the catalogue</Link></div>
        <div className="hero-note"><span className="hero-note-dot"/> Product prices and availability come from the live catalogue.</div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <span className="hero-art-spark hero-art-spark-one">✦</span><span className="hero-art-spark hero-art-spark-two">✦</span>
        <div className="hero-bag"><div className="hero-bag-handle"/><div className="hero-bag-logo"><Zap size={40} fill="currentColor"/><strong>BlitzKart</strong></div></div>
        <span className="hero-art-caption">Everyday shopping, made simple</span>
      </div>
    </section>

    {bannerResult.error ? <p className="notice home-notice">Promotions aren’t available right now.</p> : bannerResult.banners.length ? <section className="promotion-strip" aria-label="Promotions">{bannerResult.banners.map((banner) => <article className="promotion-card" key={banner.id}><span className="promotion-icon"><Zap size={17} fill="currentColor"/></span><div><strong>{banner.title}</strong>{banner.body ? <p>{banner.body}</p> : null}</div>{banner.href ? <Link href={banner.href} aria-label={`Explore ${banner.title}`}><ArrowRight size={17}/></Link> : null}</article>)}</section> : null}

    {categoryError ? <p className="notice home-notice">Categories couldn’t be loaded right now.</p> : categories.length ? <section id="categories" className="section category-section">
      <div className="section-head"><div><span className="section-kicker">FIND YOUR FAVOURITES</span><h2>Shop by category</h2></div><Link href="/products">All products <ArrowRight size={15}/></Link></div>
      <div className="category-strip">{categories.map((category) => <Link className="category-tile" href={`/categories/${category.slug}`} key={category.id}>{category.image_url ? <img className="category-image" src={category.image_url} alt=""/> : <span className="category-letter" aria-hidden="true">{category.name.slice(0, 1).toUpperCase()}</span>}<span className="category-tile-copy"><strong>{category.name}</strong>{category.description ? <small>{category.description}</small> : null}</span><ArrowRight size={15} className="category-arrow"/></Link>)}</div>
    </section> : null}

    {catalogueError ? <p className="error home-notice" role="status">Products couldn’t be loaded. Please try again in a moment.</p> : null}
    {!catalogue.length && !catalogueError ? <div className="catalogue-empty"><EmptyState title="The catalogue is getting ready" body="Products will appear here as soon as they’re added to the live BlitzKart catalogue." action="Browse products" href="/products"/></div> : null}
    <ProductShelf title="Featured products" products={featured}/>
    {bestsellerResult.error ? <p className="catalogue-soft-error">Bestsellers aren’t available right now.</p> : <ProductShelf title="Bestselling products" products={bestsellerResult.products} href="/products"/>}
    {trendingResult.error ? <p className="catalogue-soft-error">Recent sales recommendations aren’t available right now.</p> : <ProductShelf title="Trending this month" products={trendingResult.products}/>}
    {recentResult.error ? <p className="catalogue-soft-error">Recently added products aren’t available right now.</p> : <ProductShelf title="Recently added" products={recentResult.products}/>}
    <ProductShelf title="Special offers" products={offers}/>
    {catalogue.length ? <ProductShelf title="Explore the catalogue" products={products} href="/products"/> : null}
  </div>;
}
