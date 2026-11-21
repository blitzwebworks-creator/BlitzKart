import { NextResponse } from "next/server";
import { availableScheduledDeliveryMethods, type DeliveryOperatingSettings, type DeliveryScheduleZone } from "@/lib/delivery-operating-hours";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 });
  const { data: admin } = await supabase.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (!admin?.active) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid registered customer email." }, { status: 400 });
  }
  const { data: customer, error: customerError } = await supabase.from("profiles")
    .select("id,full_name,email,phone,account_status").eq("email", email).maybeSingle();
  if (customerError) return NextResponse.json({ error: "Customer lookup is unavailable. Apply migration 0017 and try again." }, { status: 503 });
  if (!customer || customer.account_status !== "active") return NextResponse.json({ error: "No active registered customer was found for that email." }, { status: 404 });

  const [{ data: addresses, error: addressError }, { data: settings, error: settingsError }, { data: feeSettings, error: feeError }] = await Promise.all([
    supabase.from("addresses").select("id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default").eq("customer_id", customer.id).order("is_default", { ascending: false }),
    supabase.from("delivery_operating_settings").select("timezone,blitz_enabled,standard_enabled,automatic_scheduling,blitz_paused,standard_paused,blitz_weekly_schedule,standard_weekly_schedule").eq("id", 1).maybeSingle(),
    supabase.from("checkout_fee_settings").select("packaging_enabled,packaging_amount,platform_enabled,platform_amount,handling_enabled,handling_amount").eq("id", 1).maybeSingle(),
  ]);
  if (addressError) return NextResponse.json({ error: "Saved addresses could not be loaded." }, { status: 503 });
  if (settingsError || !settings) return NextResponse.json({ error: "Delivery settings could not be loaded." }, { status: 503 });
  if (feeError || !feeSettings) return NextResponse.json({ error: "Checkout fee settings could not be loaded." }, { status: 503 });
  const pins = [...new Set((addresses ?? []).map((address) => address.postal_code))];
  const { data: zones, error: zonesError } = pins.length
    ? await supabase.from("delivery_zones").select("postal_code,locality,locality_aliases,is_active,is_directory_verified,blitz_enabled,standard_enabled,blitz_price,standard_price,blitz_eta,standard_eta,minimum_order_amount,blitz_schedule_override,standard_schedule_override").in("postal_code", pins)
    : { data: [], error: null };
  if (zonesError) return NextResponse.json({ error: "Delivery areas could not be checked." }, { status: 503 });
  const zoneByPin = new Map((zones ?? []).map((zone) => [zone.postal_code, zone]));
  const deliverySettings = settings as DeliveryOperatingSettings;
  const results = (addresses ?? []).map((address) => {
    const zone = zoneByPin.get(address.postal_code) as (DeliveryScheduleZone & { is_directory_verified?: boolean }) | undefined;
    const methods = zone?.is_directory_verified ? availableScheduledDeliveryMethods(zone, deliverySettings) : [];
    return { ...address, available_delivery_methods: methods };
  });
  return NextResponse.json({ customer, addresses: results, fees: feeSettings });
}
