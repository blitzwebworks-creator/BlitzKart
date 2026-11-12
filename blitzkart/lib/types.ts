export type Category = { id: string; name: string; slug: string; description: string | null };

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  specifications?: Record<string, unknown> | null;
  sku: string;
  selling_price: number;
  original_price: number | null;
  is_featured: boolean;
  category_id: string | null;
  categories?: Pick<Category, "name" | "slug"> | null;
  product_images?: { image_url: string; alt_text: string | null; position: number }[];
  inventory?: { quantity: number; reserved_quantity: number; low_stock_threshold: number } | null;
};

export type CartLine = { product: Product; quantity: number };

export type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  gateway_payment_url: string | null;
  tracking_token: string | null;
};

export const orderStatuses = [
  "pending", "confirmed", "sourcing", "packed", "ready_for_pickup",
  "out_for_delivery", "delivered", "cancelled",
] as const;

export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function availableStock(product: Product) {
  return Math.max(0, (product.inventory?.quantity ?? 0) - (product.inventory?.reserved_quantity ?? 0));
}
