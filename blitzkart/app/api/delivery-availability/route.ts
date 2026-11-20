import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { availableScheduledDeliveryMethods, formatAvailabilityNotice, type DeliveryOperatingSettings, type DeliveryScheduleZone } from "@/lib/delivery-operating-hours";

export const runtime = "nodejs";

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
    if (error) return NextResponse.json({ error: "PIN code details could not be checked. Apply migration 0010 and try again." }, { status: 503 });
    const zone = Array.isArray(matches) ? matches[0] : null;
    if (!zone) return NextResponse.json({ known: false, available: false, postal_code, error: unavailableMessage }, { headers: { "Cache-Control": "no-store" } });

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Delivery availability is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const admin = createSupabaseAdminClient();
    const [{ data: configuredZone, error: configuredZoneError }, { data: operatingSettings, error: settingsError }] = await Promise.all([
      admin.from("delivery_zones").select("postal_code,is_active,blitz_enabled,standard_enabled,blitz_price,standard_price,blitz_eta,standard_eta,blitz_schedule_override,standard_schedule_override")
        .eq("postal_code", postal_code).eq("city", "New Delhi").eq("state", "Delhi").eq("is_directory_verified", true).maybeSingle(),
      admin.from("delivery_operating_settings").select("timezone,blitz_enabled,standard_enabled,automatic_scheduling,blitz_paused,standard_paused,blitz_weekly_schedule,standard_weekly_schedule").eq("id", 1).maybeSingle(),
    ]);
    if (configuredZoneError || settingsError || !configuredZone || !operatingSettings) {
      console.error("[BlitzKart] Delivery schedule configuration is unavailable", { zoneCode: configuredZoneError?.code, settingsCode: settingsError?.code });
      return NextResponse.json({ error: "Delivery availability is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    let productDeliveryCharge = 0;
    if (product_id) {
      const { data: product, error: productError } = await supabase.from("products").select("product_delivery_charge").eq("id", product_id).eq("is_active", true).maybeSingle();
      if (productError) return NextResponse.json({ error: "Product delivery details could not be checked." }, { status: 503 });
      if (!product) return NextResponse.json({ error: "This product is no longer available." }, { status: 404 });
      productDeliveryCharge = Number(product.product_delivery_charge ?? 0);
    }
    const choices = [zone.locality, ...(zone.locality_aliases ?? [])].filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
    const decisionZone = configuredZone as DeliveryScheduleZone;
    const settings = operatingSettings as DeliveryOperatingSettings;
    const deliveryMethods = availableScheduledDeliveryMethods(decisionZone, settings);
    return NextResponse.json({
      known: true,
      available: Boolean(zone.is_serviceable && deliveryMethods.length),
      postal_code: zone.postal_code,
      locality: zone.locality,
      locality_aliases: zone.locality_aliases ?? [],
      locality_options: choices,
      district: zone.district,
      state: zone.state,
      city: "New Delhi",
      delivery_charge: Number(zone.delivery_charge),
      delivery_methods: deliveryMethods,
      delivery_notice: formatAvailabilityNotice(decisionZone, settings),
      timezone: "Asia/Kolkata",
      minimum_order_amount: Number(zone.minimum_order_amount),
      estimated_delivery_minutes: zone.estimated_delivery_minutes,
      product_delivery_charge: productDeliveryCharge,
      error: zone.is_serviceable && deliveryMethods.length ? undefined : "Sorry! Delivery is currently unavailable at your location.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "PIN code details could not be checked. Please try again." }, { status: 503 });
  }
}
