import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, Headset, LayoutGrid, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { getBestsellers, getCategories, getProducts, getPromotionalBanners } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import type { Product } from "@/lib/types";

function ProductShelf({ title, products, href, id, className = "" }: { title: string; products: Product[]; href?: string; id?: string; className?: string }) {
  if (!products.length) return null;
  return <section className={`section product-shelf ${className}`} id={id}>
    <div className="section-head"><div><h2>{title}</h2></div>{href ? <Link href={href}>View all <ArrowRight size={15}/></Link> : null}</div>
    <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>
  </section>;
}

const trustItems = [
  { icon: Truck, title: "Delivery area check", detail: "Check service for your PIN" },
  { icon: ShieldCheck, title: "Verified payments", detail: "Payment status confirmed securely" },
  { icon: PackageCheck, title: "Order updates", detail: "Follow recorded order progress" },
  { icon: Headset, title: "Customer support", detail: "Get help from BlitzKart", href: "/contact" },
];

export default async function HomePage() {
  const [categoryResult, catalogueResult, bannerResult, bestsellerResult, trendingResult] = await Promise.all([
    getCategories(), getProducts({ limit: 20 }), getPromotionalBanners(), getBestsellers(undefined, 5), getBestsellers(30, 5),
  ]);
  const { categories, error: categoryError } = categoryResult;
  const { products: catalogue, error: catalogueError } = catalogueResult;
  const featured = catalogue.filter((product) => product.is_featured).slice(0, 5);
  const offers = catalogue.filter((product) => product.original_price !== null && product.original_price > product.selling_price).slice(0, 5);
  const hasSales = bestsellerResult.products.length > 0 || trendingResult.products.length > 0;

  return <div className="wrap home-page">
    <section className="hero hero-image-banner" aria-label="BlitzKart delivery in Delhi">
      <Link className="hero-banner-link" href="/products" aria-label="Shop products available in Delhi">
        <Image className="hero-banner-image" src="/blitzkart-delhi-banner.png" alt="BlitzKart Delhi delivery banner" width={2172} height={724} priority sizes="(max-width: 700px) 100vw, (max-width: 1280px) 100vw, 1280px" />
        <span className="hero-banner-cta">Shop products <ArrowRight size={17}/></span>
      </Link>
    </section>

    {categoryError ? <p className="notice home-notice">Categories couldn’t be loaded right now.</p> : categories.length ? <section id="categories" className="section category-section">
      <div className="section-head"><div><span className="section-kicker">FIND YOUR FAVOURITES</span><h2>Shop by category</h2></div><Link href="/categories">View all categories <ArrowRight size={15}/></Link></div>
      <div className="category-strip">{categories.slice(0, 5).map((category) => <Link className="category-tile" href={`/categories/${category.slug}`} key={category.id}>
        <span className="category-tile-art">{category.image_url ? <Image className="category-image" src={category.image_url} alt="" width={64} height={64} sizes="64px"/> : <span className="category-letter" aria-hidden="true">{category.name.slice(0, 1).toUpperCase()}</span>}</span>
        <span className="category-tile-copy"><strong>{category.name}</strong>{category.description ? <small>{category.description}</small> : null}</span><ArrowRight size={15} className="category-arrow"/>
      </Link>)}<Link className="category-tile category-tile-more" href="/categories"><span className="category-tile-art"><LayoutGrid size={31}/></span><span className="category-tile-copy"><strong>More</strong></span><ArrowRight size={15} className="category-arrow"/></Link></div>
    </section> : null}

    {catalogueError ? <p className="error home-notice" role="status">Products couldn’t be loaded. Please try again in a moment.</p> : null}
    {!catalogue.length && !catalogueError ? <div className="catalogue-empty"><EmptyState title="The catalogue is getting ready" body="Products will appear here as soon as they’re added to the live BlitzKart catalogue." action="Browse products" href="/products"/></div> : null}

    <span id="offers" className="home-section-anchor" aria-hidden="true"/>
    <ProductShelf title="Special offers" products={offers} href="/products" className="offers-shelf"/>

    <section className="home-trust-row" aria-label="BlitzKart service information">{trustItems.map(({ icon: Icon, title, detail, href }) => {
      const content = <><span className="home-trust-icon"><Icon size={22}/></span><span><strong>{title}</strong><small>{detail}</small></span></>;
      return href ? <Link href={href} className="home-trust-item" key={title}>{content}</Link> : <div className="home-trust-item" key={title}>{content}</div>;
    })}</section>

    {bannerResult.error ? <p className="notice home-notice">Promotions couldn’t be loaded right now.</p> : bannerResult.banners.length ? <section className="promotion-strip" aria-label="Current promotions">{bannerResult.banners.map((banner) => <article className="promotion-card" key={banner.id}><span className="promotion-icon"><Check size={17}/></span><div><strong>{banner.title}</strong>{banner.body ? <p>{banner.body}</p> : null}</div>{banner.href ? <Link href={banner.href} aria-label={`Explore ${banner.title}`}><ArrowRight size={17}/></Link> : null}</article>)}</section> : null}

    <span id="bestsellers" className="home-section-anchor" aria-hidden="true"/>
    <span id="trending" className="home-section-anchor" aria-hidden="true"/>
    {hasSales ? <div className="home-sales-grid">
      <ProductShelf title="Bestselling products" products={bestsellerResult.products} href="/products" className="sales-grid-shelf"/>
      <ProductShelf title="Trending this month" products={trendingResult.products} href="/products" className="sales-grid-shelf"/>
    </div> : null}
    <span id="new-arrivals" className="home-section-anchor" aria-hidden="true"/>
    <ProductShelf title="New arrivals" products={catalogue.slice(0, 5)} href="/products"/>
    <ProductShelf title="Featured products" products={featured} href="/products"/>
    {catalogue.length ? <ProductShelf title="Explore the catalogue" products={catalogue.slice(5, 15)} href="/products"/> : null}

    <section className="home-why section">
      <div><span className="section-kicker">A SIMPLE WAY TO SHOP</span><h2>Why shop with BlitzKart?</h2><p>Browse the live catalogue, confirm delivery for your PIN, and keep up with your order from your account.</p></div>
      <ul><li><Check size={16}/> Check delivery availability before ordering</li><li><Check size={16}/> Review delivery and product charges at checkout</li><li><Check size={16}/> Follow order updates from your account</li></ul>
      <Link className="btn" href="/products">Browse products <ArrowRight size={16}/></Link>
    </section>
  </div>;
}
