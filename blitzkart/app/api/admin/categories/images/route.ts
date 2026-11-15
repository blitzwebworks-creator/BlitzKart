import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const imageType = z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("prepare"), category_id: z.string().uuid(), type: imageType, size: z.number().int().min(1).max(5 * 1024 * 1024) }),
  z.object({ operation: z.literal("complete"), category_id: z.string().uuid(), path: z.string().max(160), type: imageType, size: z.number().int().min(1).max(5 * 1024 * 1024) }),
]);
const extensions: Record<z.infer<typeof imageType>, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
function publicUrl(admin: ReturnType<typeof createSupabaseAdminClient>, path: string) { return admin.storage.from("category-images").getPublicUrl(path).data.publicUrl; }

async function authorize() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 }) };
  const { data: role, error } = await supabase.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Administrator access could not be checked." }, { status: 503 }) };
  if (!role?.active) return { error: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  try { return { admin: createSupabaseAdminClient() }; }
  catch { return { error: NextResponse.json({ error: "Image storage is not configured." }, { status: 503 }) }; }
}

export async function POST(request: Request) {
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); }
  catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || "Invalid image details." : "Invalid image request." }, { status: 400 });
  }
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  try {
    const { data: category, error } = await auth.admin.from("categories").select("id,image_url").eq("id", input.category_id).maybeSingle();
    if (error || !category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    if (input.operation === "prepare") {
      const path = `${category.id}/${crypto.randomUUID()}.${extensions[input.type]}`;
      const { data, error: signedError } = await auth.admin.storage.from("category-images").createSignedUploadUrl(path, { upsert: false });
      if (signedError || !data) return NextResponse.json({ error: "Secure image upload could not be prepared." }, { status: 502 });
      return NextResponse.json({ path, token: data.token });
    }
    const match = input.path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp|avif)$/i);
    if (!match || match[1].toLowerCase() !== category.id.toLowerCase() || match[3] !== extensions[input.type]) return NextResponse.json({ error: "Invalid category image reference." }, { status: 400 });
    const storage = auth.admin.storage.from("category-images");
    const filename = input.path.slice(input.path.lastIndexOf("/") + 1);
    const { data: objects, error: listError } = await storage.list(category.id, { limit: 50, search: filename });
    const object = objects?.find((entry) => entry.name === filename);
    if (listError || !object || Number(object.metadata?.size) !== input.size || String(object.metadata?.mimetype ?? "") !== input.type) {
      await storage.remove([input.path]);
      return NextResponse.json({ error: "Uploaded file could not be verified." }, { status: 400 });
    }
    const imageUrl = publicUrl(auth.admin, input.path);
    const { error: updateError } = await auth.admin.from("categories").update({ image_url: imageUrl }).eq("id", category.id);
    if (updateError) { await storage.remove([input.path]); return NextResponse.json({ error: "Category image could not be saved." }, { status: 502 }); }
    if (category.image_url) {
      const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")}/storage/v1/object/public/category-images/`;
      if (category.image_url.startsWith(prefix)) {
        try { await storage.remove([decodeURIComponent(new URL(category.image_url).pathname.slice(new URL(prefix).pathname.length))]); } catch { /* old image cleanup can be done from Storage */ }
      }
    }
    return NextResponse.json({ image_url: imageUrl });
  } catch {
    return NextResponse.json({ error: "Category image could not be saved." }, { status: 500 });
  }
}
