import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEW_DELHI_CITY } from "@/lib/india";

export async function POST(request: Request) {
  try {
    const { postal_code, product_id } = z.object({ postal_code: z.string().regex(/^110\d{3}$/), product_id: z.string().uuid().optional() }).parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("delivery_zones").select("postal_code,city,delivery_charge").eq("postal_code",postal_code).eq("city",NEW_DELHI_CITY).eq("is_active",true).maybeSingle();
    if (error) return NextResponse.json({ error: "Delivery availability could not be checked." }, { status: 503 });
    if (!data) return NextResponse.json({ available: false });
    let productDeliveryCharge = 0;
    if (product_id) {
      const { data: product, error: productError } = await supabase.from("products").select("product_delivery_charge").eq("id", product_id).eq("is_active", true).maybeSingle();
      if (productError) return NextResponse.json({ error: "Product delivery details could not be checked." }, { status: 503 });
      if (!product) return NextResponse.json({ error: "This product is no longer available." }, { status: 404 });
      productDeliveryCharge = Number(product.product_delivery_charge ?? 0);
    }
    return NextResponse.json({ available: true, postal_code: data.postal_code, city: data.city, delivery_charge: data.delivery_charge, product_delivery_charge: productDeliveryCharge });
  } catch {
    return NextResponse.json({ error: "Enter a valid six-digit Delhi PIN code." }, { status: 400 });
  }
}
