import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEW_DELHI_CITY } from "@/lib/india";

export async function POST(request: Request) {
  try {
    const { postal_code } = z.object({ postal_code: z.string().regex(/^110\d{3}$/) }).parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("delivery_zones").select("postal_code,city,delivery_charge").eq("postal_code",postal_code).eq("city",NEW_DELHI_CITY).eq("is_active",true).maybeSingle();
    if (error) return NextResponse.json({ error: "Delivery availability could not be checked." }, { status: 503 });
    if (!data) return NextResponse.json({ available: false });
    return NextResponse.json({ available: true, postal_code: data.postal_code, city: data.city, delivery_charge: data.delivery_charge });
  } catch {
    return NextResponse.json({ error: "Enter a valid six-digit Delhi PIN code." }, { status: 400 });
  }
}
