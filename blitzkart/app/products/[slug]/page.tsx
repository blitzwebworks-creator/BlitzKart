import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/data";
import { ProductDetail } from "@/components/product-detail";
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const { product } = await getProductBySlug(slug); if (!product) notFound();
  return <div className="wrap"><ProductDetail product={product}/></div>;
}
