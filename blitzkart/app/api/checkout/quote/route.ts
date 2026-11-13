import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEW_DELHI_CITY } from "@/lib/india";

export const runtime = "nodejs";

const quoteSchema = z.object({
  lines: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  postal_code: z.string().regex(/^110\d{3}$/, "Enter a New Delhi PIN code to see delivery charges."),
  coupon_code: z.string().trim().max(64).optional().default(""),
});

const toPaise = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromPaise = (value: number) => Number((value / 100).toFixed(2));

export async function POST(request: Request) {
  try {
    const input = quoteSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before checkout." }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot place orders." }, { status: 403 });
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Checkout pricing is not configured yet." }, { status: 503 });

    const admin = createSupabaseAdminClient();
    const { data: zone, error: zoneError } = await admin.from("delivery_zones").select("postal_code,city,delivery_charge").eq("postal_code", input.postal_code).eq("city", NEW_DELHI_CITY).eq("is_active", true).maybeSingle();
    if (zoneError) return NextResponse.json({ error: "Delivery charge could not be checked. Try again." }, { status: 503 });
    if (!zone) return NextResponse.json({ error: "Delivery is not available for this New Delhi PIN code." }, { status: 400 });

    const quantities = new Map<string, number>();
    for (const line of input.lines) quantities.set(line.product_id, (quantities.get(line.product_id) ?? 0) + line.quantity);
    if ([...quantities.values()].some((quantity) => quantity > 50)) return NextResponse.json({ error: "A product quantity cannot exceed 50." }, { status: 400 });

    const { data: products, error: productError } = await admin.from("products").select("id,name,selling_price,is_active,inventory(quantity,reserved_quantity)").in("id", [...quantities.keys()]).eq("is_active", true);
    if (productError) return NextResponse.json({ error: "Product prices could not be checked. Try again." }, { status: 503 });
    const productById = new Map<string, any>((products ?? []).map((product: any) => [product.id, product] as const));
    const items: { product_id: string; name: string; quantity: number; unit_price: number; line_total: number }[] = [];
    let subtotalPaise = 0;

    for (const [productId, quantity] of quantities) {
      const product = productById.get(productId) as any;
      const inventory = Array.isArray(product?.inventory) ? product.inventory[0] : product?.inventory;
      if (!product || !inventory) return NextResponse.json({ error: "A product in your cart is unavailable." }, { status: 409 });
      const available = Number(inventory.quantity) - Number(inventory.reserved_quantity);
      if (!Number.isFinite(available) || available < quantity) return NextResponse.json({ error: `There isn’t enough stock for ${product.name}. Update your cart and try again.` }, { status: 409 });
      const unitPaise = toPaise(Number(product.selling_price));
      const linePaise = unitPaise * quantity;
      if (!Number.isSafeInteger(unitPaise) || unitPaise < 0 || !Number.isSafeInteger(linePaise) || !Number.isSafeInteger(subtotalPaise + linePaise)) {
        return NextResponse.json({ error: "The order total is outside supported payment limits." }, { status: 400 });
      }
      subtotalPaise += linePaise;
      items.push({ product_id: productId, name: product.name, quantity, unit_price: fromPaise(unitPaise), line_total: fromPaise(linePaise) });
    }

    let discountPaise = 0;
    let couponError: string | null = null;
    const couponCode = input.coupon_code.trim().toUpperCase();
    if (couponCode) {
      const { data: coupon, error: couponQueryError } = await admin.from("coupons").select("id,code,discount_type,discount_value,minimum_order_value,usage_limit,usage_count,expires_at,is_active").eq("code", couponCode).eq("is_active", true).maybeSingle();
      if (couponQueryError) return NextResponse.json({ error: "Coupon details could not be checked. Try again." }, { status: 503 });
      if (!coupon) couponError = "That coupon code isn’t valid.";
      else if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) couponError = "That coupon has expired.";
      else if (subtotalPaise < toPaise(Number(coupon.minimum_order_value))) couponError = `Add items worth ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(coupon.minimum_order_value))} to use this coupon.`;
      else if (coupon.usage_limit !== null && Number(coupon.usage_count) >= Number(coupon.usage_limit)) couponError = "That coupon has reached its usage limit.";
      else {
        const value = Number(coupon.discount_value);
        discountPaise = coupon.discount_type === "percentage"
          ? Math.min(subtotalPaise, Math.round(subtotalPaise * value / 100))
          : Math.min(subtotalPaise, toPaise(value));
      }
    }

    const deliveryPaise = toPaise(Number(zone.delivery_charge));
    if (!Number.isSafeInteger(deliveryPaise) || deliveryPaise < 0) return NextResponse.json({ error: "The delivery charge could not be calculated." }, { status: 503 });
    return NextResponse.json({
      items,
      subtotal: fromPaise(subtotalPaise),
      discount: fromPaise(discountPaise),
      delivery_charge: fromPaise(deliveryPaise),
      total: fromPaise(subtotalPaise - discountPaise + deliveryPaise),
      coupon_code: discountPaise ? couponCode : null,
      coupon_error: couponError,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Check your delivery details." : "Checkout totals could not be calculated. Please try again.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
