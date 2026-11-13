import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const querySchema = z.string().trim().min(2).max(60);

export async function GET(request: Request) {
  const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const supabase = await createSupabaseServerClient();
  const escaped = parsed.data.replace(/[%_]/g, "\\$&");
  const { data, error } = await supabase.from("products").select("name").eq("is_active", true).ilike("name", `%${escaped}%`).order("name").limit(8);
  return NextResponse.json({ suggestions: error ? [] : (data ?? []).map((row) => row.name) }, { headers: { "Cache-Control": "no-store" } });
}
