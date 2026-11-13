import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/data";

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://www.blitzkart.store";
  try {
    const url = new URL(configured);
    if (url.protocol === "https:" || url.hostname === "localhost") return url.origin;
  } catch { /* Use the verified storefront domain below. */ }
  return "https://www.blitzkart.store";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const base = ["", "/products", "/contact", "/about", "/privacy", "/terms"].map((path) => ({ url: `${origin}${path}` }));
  const [{ products }, { categories }] = await Promise.all([getProducts(), getCategories()]);
  return [
    ...base,
    ...categories.map((category) => ({ url: `${origin}/categories/${category.slug}` })),
    ...products.map((product) => ({ url: `${origin}/products/${product.slug}` })),
  ];
}
