import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const productSelect = "id,name,slug,description,specifications,sku,selling_price,original_price,is_featured,category_id,categories(name,slug),product_images(image_url,alt_text,position),inventory(quantity,reserved_quantity,low_stock_threshold)";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to sync your saved cart." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user.id).maybeSingle();
    if (profile?.account_status !== "active") return NextResponse.json({ error: "This account cannot access its cart." }, { status: 403 });
    const { data: cart, error: cartError } = await supabase.from("carts").select("id").eq("customer_id", user.id).maybeSingle();
    if (cartError) throw cartError;
    if (!cart) return NextResponse.json({ hasCart: false, lines: [] });
    const { data, error } = await supabase.from("cart_items").select(`quantity,products!inner(${productSelect})`).eq("cart_id", cart.id);
    if (error) throw error;
    const lines = (data ?? []).flatMap((row: any) => row.products ? [{ product: row.products, quantity: Number(row.quantity) }] : []);
    return NextResponse.json({ hasCart: true, lines });
  } catch {
    return NextResponse.json({ error: "Saved cart could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = z.object({ lines: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).max(50) }).parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to sync your saved cart." }, { status: 401 });
    const { error } = await supabase.rpc("sync_cart", { p_lines: body.lines });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Cart contents were invalid." : "Saved cart could not be updated." }, { status: 400 });
  }
}
