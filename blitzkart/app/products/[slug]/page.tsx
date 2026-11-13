import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/data";
import { availableStock } from "@/lib/types";
import { ProductDetail } from "@/components/product-detail";

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
  const structuredProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.product_images?.length ? { image: product.product_images.map((image) => image.image_url) } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(product.selling_price),
      availability: availableStock(product) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  return <div className="wrap"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredProduct).replace(/</g, "\\u003c") }}/><ProductDetail product={product}/></div>;
}
