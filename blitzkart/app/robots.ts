import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://www.blitzkart.store";
  let origin = "https://www.blitzkart.store";
  try {
    const url = new URL(configured);
    if (url.protocol === "https:" || url.hostname === "localhost") origin = url.origin;
  } catch { /* Use the verified storefront domain below. */ }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/account/", "/api/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
