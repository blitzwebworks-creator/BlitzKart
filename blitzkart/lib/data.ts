import "server-only";
import type { Category, Product } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const productSelect = "id,name,slug,description,specifications,sku,selling_price,original_price,product_delivery_charge,is_featured,category_id,categories(name,slug),product_images(image_url,alt_text,position),inventory(quantity,reserved_quantity,low_stock_threshold)";

export async function getProducts(options: { categoryId?: string; search?: string; featured?: boolean; limit?: number; minPrice?: number; maxPrice?: number; sort?: "newest" | "price-asc" | "price-desc"; page?: number } = {}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { products: [] as Product[], total: 0, error: "Supabase is not configured. Add your project URL and anon key to .env.local." };
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("products").select(productSelect, { count: "exact" }).eq("is_active", true);
  if (options.categoryId) query = query.eq("category_id", options.categoryId);
  if (options.featured) query = query.eq("is_featured", true);
  if (options.search) query = query.ilike("name", `%${options.search.replace(/[%_]/g, "\\$&")}%`);
  if (options.minPrice !== undefined) query = query.gte("selling_price", options.minPrice);
  if (options.maxPrice !== undefined) query = query.lte("selling_price", options.maxPrice);
  if (options.sort === "price-asc") query = query.order("selling_price", { ascending: true }).order("created_at", { ascending: false });
  else if (options.sort === "price-desc") query = query.order("selling_price", { ascending: false }).order("created_at", { ascending: false });
  else query = query.order("created_at", { ascending: false });
  if (options.page !== undefined && options.limit) {
    const page = Math.max(1, Math.floor(options.page));
    query = query.range((page - 1) * options.limit, page * options.limit - 1);
  } else if (options.limit) query = query.limit(options.limit);
  const { data, error, count } = await query;
  if (error) return { products: [] as Product[], total: 0, error: "Products could not be loaded. Please refresh in a moment." };
  const products = (data ?? []) as unknown as Product[];
  products.forEach((product) => product.product_images?.sort((a, b) => a.position - b.position));
  return { products, total: count ?? products.length, error: null };
}

export async function getCategories() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { categories: [] as Category[], error: "Supabase is not configured." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("categories").select("id,name,slug,description,image_url").eq("is_active", true).order("name");
  if (error) return { categories: [] as Category[], error: "Categories could not be loaded." };
  return { categories: (data ?? []) as Category[], error: null };
}

export async function getProductBySlug(slug: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { product: null, error: "Supabase is not configured." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select(productSelect).eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) return { product: null, error: "Product information could not be loaded." };
  const product = data as unknown as Product | null;
  product?.product_images?.sort((a, b) => a.position - b.position);
  return { product, error: null };
}

export async function getBestsellers(days?: number, limit = 5) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { products: [] as Product[], error: "Analytics access is not configured." };
  const admin = createSupabaseAdminClient();
  let query = admin.from("order_items").select("product_id,quantity,orders!inner(status,payment_status,payment_environment,created_at)").eq("orders.status","delivered").eq("orders.payment_status","paid").eq("orders.payment_environment","live");
  if (days) query = query.gte("orders.created_at", new Date(Date.now() - days * 86400000).toISOString());
  const { data, error } = await query;
  if (error) return { products: [] as Product[], error: "Sales data could not be loaded." };
  const counts = new Map<string,number>();
  (data ?? []).forEach((item:any) => { if (item.product_id) counts.set(item.product_id,(counts.get(item.product_id) ?? 0)+Number(item.quantity)); });
  const ids = [...counts.keys()]; if (!ids.length) return { products: [] as Product[], error: null };
  const { data: products, error: productError } = await admin.from("products").select(productSelect).in("id",ids).eq("is_active",true);
  if (productError) return { products: [] as Product[], error: "Product records could not be loaded." };
  const byId = new Map(((products ?? []) as unknown as Product[]).map((product)=>[product.id,product]));
  const sorted = ids.sort((a,b)=>(counts.get(b)??0)-(counts.get(a)??0)).map((id)=>byId.get(id)).filter((product): product is Product=>Boolean(product)).slice(0,limit);
  sorted.forEach((product)=>product.product_images?.sort((a,b)=>a.position-b.position));
  return { products: sorted, error: null };
}

export async function getPromotionalBanners() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { banners: [] as { id:string;title:string;body:string|null;href:string|null }[], error: "Supabase is not configured." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("promotional_banners").select("id,title,body,href").eq("is_active",true).order("created_at",{ascending:false});
  if (error) return { banners: [] as { id:string;title:string;body:string|null;href:string|null }[], error: "Promotional banners could not be loaded." };
  return { banners: data ?? [], error: null };
}
