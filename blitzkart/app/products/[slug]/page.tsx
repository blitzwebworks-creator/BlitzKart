import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/data";
import { availableStock } from "@/lib/types";
import { ProductDetail } from "@/components/product-detail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/datetime";
import { Star } from "lucide-react";

type ProductReview = { rating: number; review_text: string | null; created_at: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProductBySlug(slug);
  if (!product) return { title: "Product unavailable", robots: { index: false, follow: false } };
  const images = product.product_images?.sort((a, b) => a.position - b.position).map((image) => image.image_url);
  return {
    title: product.name,
    description: product.description?.slice(0, 160) || `View ${product.name} in the BlitzKart catalogue.`,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.description?.slice(0, 160) || undefined, type: "website", images },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product } = await getProductBySlug(slug);
  if (!product) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: reviewData, error: reviewsError } = await supabase.rpc("get_product_reviews", { p_product_id: product.id });
  const reviews = reviewData as ProductReview[] | null;
  const ratingCount = reviews?.length ?? 0;
  const averageRating = ratingCount ? reviews!.reduce((total: number, review: ProductReview) => total + Number(review.rating), 0) / ratingCount : null;
  const structuredProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.product_images?.length ? { image: product.product_images.map((image) => image.image_url) } : {}),
    ...(averageRating !== null ? { aggregateRating: { "@type": "AggregateRating", ratingValue: averageRating.toFixed(1), reviewCount: ratingCount, bestRating: 5, worstRating: 1 } } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(product.selling_price),
      availability: availableStock(product) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  return <div className="wrap"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredProduct).replace(/</g, "\\u003c") }}/><ProductDetail product={product}/><section className="product-reviews" aria-labelledby="product-reviews-heading"><header><div><span className="section-kicker">VERIFIED PURCHASES</span><h2 id="product-reviews-heading">Customer ratings</h2></div>{averageRating !== null ? <p className="product-rating-summary"><Star size={18} fill="currentColor"/> <strong>{averageRating.toFixed(1)}</strong><span>from {ratingCount} {ratingCount === 1 ? "rating" : "ratings"}</span></p> : null}</header>{reviewsError ? <p className="muted">Verified product ratings are unavailable right now.</p> : reviews?.length ? <div className="product-review-list">{reviews.map((review,index)=><article key={`${review.created_at}-${index}`}><div className="product-review-stars" aria-label={`${review.rating} out of 5 stars`}>{Array.from({length:Number(review.rating)},(_,starIndex)=><Star key={starIndex} size={14} fill="currentColor"/>)}<strong>{review.rating}/5</strong></div><p>{review.review_text || "Rating only; no written review was provided."}</p><small>Verified purchase · {formatDate(review.created_at)}</small></article>)}</div> : <p className="muted">No verified customer ratings yet.</p>}</section></div>;
}
