import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const unavailableMessage = "Sorry! BlitzKart is not available in your area yet.";

export async function POST(request: Request) {
  let postal_code: string;
  let product_id: string | undefined;
  try {
    ({ postal_code, product_id } = z.object({ postal_code: z.string().regex(/^[0-9]{6}$/), product_id: z.string().uuid().optional() }).parse(await request.json()));
  } catch {
    return NextResponse.json({ error: "Enter a valid six-digit PIN code." }, { status: 400 });
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data: matches, error } = await supabase.rpc("lookup_delivery_pincode", { p_postal_code: postal_code });
    if (error) return NextResponse.json({ error: "PIN code details could not be checked. Apply migration 0008 and try again." }, { status: 503 });
    const zone = Array.isArray(matches) ? matches[0] : null;
    if (!zone) return NextResponse.json({ known: false, available: false, postal_code, error: unavailableMessage }, { headers: { "Cache-Control": "no-store" } });

    let productDeliveryCharge = 0;
    if (product_id) {
      const { data: product, error: productError } = await supabase.from("products").select("product_delivery_charge").eq("id", product_id).eq("is_active", true).maybeSingle();
      if (productError) return NextResponse.json({ error: "Product delivery details could not be checked." }, { status: 503 });
      if (!product) return NextResponse.json({ error: "This product is no longer available." }, { status: 404 });
      productDeliveryCharge = Number(product.product_delivery_charge ?? 0);
    }
    const choices = [zone.locality, ...(zone.locality_aliases ?? [])].filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
    return NextResponse.json({
      known: true,
      available: Boolean(zone.is_serviceable),
      postal_code: zone.postal_code,
      locality: zone.locality,
      locality_aliases: zone.locality_aliases ?? [],
      locality_options: choices,
      district: zone.district,
      state: zone.state,
      city: "New Delhi",
      delivery_charge: Number(zone.delivery_charge),
      minimum_order_amount: Number(zone.minimum_order_amount),
      estimated_delivery_minutes: zone.estimated_delivery_minutes,
      product_delivery_charge: productDeliveryCharge,
      error: zone.is_serviceable ? undefined : unavailableMessage,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "PIN code details could not be checked. Please try again." }, { status: 503 });
  }
}
