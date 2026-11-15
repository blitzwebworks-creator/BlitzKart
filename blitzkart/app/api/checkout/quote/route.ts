import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEW_DELHI_CITY } from "@/lib/india";
import { availableDeliveryMethods, selectedDeliveryMethod } from "@/lib/delivery";
import { calculateCheckoutFees, calculateCheckoutTotal } from "@/lib/checkout-fees";

export const runtime = "nodejs";

const quoteSchema = z.object({
  lines: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  postal_code: z.string().regex(/^[0-9]{6}$/, "Enter a six-digit Delhi PIN code to see delivery charges."),
  locality: z.string().trim().min(1).max(100),
  delivery_method: z.enum(["blitz", "standard"]).optional(),
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
    const { data: feeSettings, error: feeSettingsError } = await admin.from("checkout_fee_settings")
      .select("packaging_enabled,packaging_amount,platform_enabled,platform_amount,handling_enabled,handling_amount")
      .eq("id", 1).maybeSingle();
    if (feeSettingsError || !feeSettings) {
      console.error("[BlitzKart] Checkout fee settings are unavailable", { code: feeSettingsError?.code });
      return NextResponse.json({ error: "Checkout pricing is being configured. Please try again shortly." }, { status: 503 });
    }
    let fees;
    try {
      fees = calculateCheckoutFees({
        packaging_enabled: feeSettings.packaging_enabled,
        packaging_amount: Number(feeSettings.packaging_amount),
        platform_enabled: feeSettings.platform_enabled,
        platform_amount: Number(feeSettings.platform_amount),
        handling_enabled: feeSettings.handling_enabled,
        handling_amount: Number(feeSettings.handling_amount),
      });
    } catch (error) {
      console.error("[BlitzKart] Invalid checkout fee settings", error);
      return NextResponse.json({ error: "Checkout pricing is being configured. Please try again shortly." }, { status: 503 });
    }
    const { data: zone, error: zoneError } = await admin.from("delivery_zones").select("postal_code,city,locality,district,state,locality_aliases,delivery_charge,minimum_order_amount,estimated_delivery_minutes,is_active,is_directory_verified,blitz_enabled,standard_enabled,blitz_price,standard_price,blitz_eta,standard_eta").eq("postal_code", input.postal_code).eq("city", NEW_DELHI_CITY).eq("state", "Delhi").eq("is_directory_verified", true).eq("is_active", true).maybeSingle();
    if (zoneError) return NextResponse.json({ error: "Delivery charge could not be checked. Try again." }, { status: 503 });
    if (!zone) return NextResponse.json({ error: "Delivery is not available for this New Delhi PIN code." }, { status: 400 });
    const deliveryMethods = availableDeliveryMethods(zone);
    if (!deliveryMethods.length) return NextResponse.json({ error: "Sorry! Delivery is currently unavailable at your location." }, { status: 400 });
    const selectedMethod = selectedDeliveryMethod(zone, input.delivery_method);
    if (input.delivery_method && !selectedMethod) return NextResponse.json({ error: "That delivery option is no longer available. Choose another option." }, { status: 409 });
    const locality = input.locality.toLocaleLowerCase();
    if (locality !== zone.locality.toLocaleLowerCase() && !(zone.locality_aliases ?? []).some((alias: string) => locality === alias.toLocaleLowerCase())) {
      return NextResponse.json({ error: "Choose a postal locality listed for this PIN code." }, { status: 400 });
    }

    const quantities = new Map<string, number>();
    for (const line of input.lines) quantities.set(line.product_id, (quantities.get(line.product_id) ?? 0) + line.quantity);
    if ([...quantities.values()].some((quantity) => quantity > 50)) return NextResponse.json({ error: "A product quantity cannot exceed 50." }, { status: 400 });

    const { data: products, error: productError } = await admin.from("products").select("id,name,selling_price,product_delivery_charge,is_active,inventory(quantity,reserved_quantity)").in("id", [...quantities.keys()]).eq("is_active", true);
    if (productError) {
      if (productError.message.toLowerCase().includes("product_delivery_charge")) console.error("[BlitzKart] Checkout needs migration 0006_product_delivery_charges.sql.", { code: productError.code });
      return NextResponse.json({ error: "Product prices could not be checked. Try again." }, { status: 503 });
    }
    const productById = new Map<string, any>((products ?? []).map((product: any) => [product.id, product] as const));
    const items: { product_id: string; name: string; quantity: number; unit_price: number; line_total: number }[] = [];
    let subtotalPaise = 0;
    let productDeliveryPaise = 0;

    for (const [productId, quantity] of quantities) {
      const product = productById.get(productId) as any;
      const inventory = Array.isArray(product?.inventory) ? product.inventory[0] : product?.inventory;
      if (!product || !inventory) return NextResponse.json({ error: "A product in your cart is unavailable." }, { status: 409 });
      const available = Number(inventory.quantity) - Number(inventory.reserved_quantity);
      if (!Number.isFinite(available) || available < quantity) return NextResponse.json({ error: `There isn’t enough stock for ${product.name}. Update your cart and try again.` }, { status: 409 });
      const unitPaise = toPaise(Number(product.selling_price));
      const linePaise = unitPaise * quantity;
      const productDeliveryUnitPaise = toPaise(Number(product.product_delivery_charge ?? 0));
      const productDeliveryLinePaise = productDeliveryUnitPaise * quantity;
      if (!Number.isSafeInteger(unitPaise) || unitPaise < 0 || !Number.isSafeInteger(linePaise) || !Number.isSafeInteger(subtotalPaise + linePaise) || !Number.isSafeInteger(productDeliveryUnitPaise) || productDeliveryUnitPaise < 0 || !Number.isSafeInteger(productDeliveryPaise + productDeliveryLinePaise)) {
        return NextResponse.json({ error: "The order total is outside supported payment limits." }, { status: 400 });
      }
      subtotalPaise += linePaise;
      productDeliveryPaise += productDeliveryLinePaise;
      items.push({ product_id: productId, name: product.name, quantity, unit_price: fromPaise(unitPaise), line_total: fromPaise(linePaise) });
    }

    const minimumOrderPaise = toPaise(Number(zone.minimum_order_amount ?? 0));
    if (!Number.isSafeInteger(minimumOrderPaise) || minimumOrderPaise < 0) return NextResponse.json({ error: "The minimum order setting could not be checked." }, { status: 503 });
    if (subtotalPaise < minimumOrderPaise) {
      const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(fromPaise(minimumOrderPaise));
      return NextResponse.json({ error: `This PIN code requires a minimum order of ${amount}.` }, { status: 400 });
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

    const deliveryPaise = selectedMethod ? toPaise(selectedMethod.price) : 0;
    if (!Number.isSafeInteger(deliveryPaise) || deliveryPaise < 0) return NextResponse.json({ error: "The delivery charge could not be calculated." }, { status: 503 });
    let total: number;
    try {
      total = calculateCheckoutTotal({
        subtotal: fromPaise(subtotalPaise), discount: fromPaise(discountPaise), fees,
        delivery: fromPaise(deliveryPaise), productDelivery: fromPaise(productDeliveryPaise),
      });
    } catch {
      return NextResponse.json({ error: "The order total is outside supported payment limits." }, { status: 400 });
    }
    return NextResponse.json({
      items,
      subtotal: fromPaise(subtotalPaise),
      discount: fromPaise(discountPaise),
      ...fees,
      delivery_charge: input.delivery_method ? fromPaise(deliveryPaise) : null,
      delivery_method: input.delivery_method ?? null,
      estimated_delivery: selectedMethod?.eta ?? null,
      delivery_methods: deliveryMethods,
      estimated_delivery_minutes: input.delivery_method ? zone.estimated_delivery_minutes : null,
      product_delivery_charge: fromPaise(productDeliveryPaise),
      total,
      coupon_code: discountPaise ? couponCode : null,
      coupon_error: couponError,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Check your delivery details." : "Checkout totals could not be calculated. Please try again.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
