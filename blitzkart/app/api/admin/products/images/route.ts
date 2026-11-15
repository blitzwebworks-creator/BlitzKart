import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const imageType = z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const imageFile = z.object({ type: imageType, size: z.number().int().min(1).max(5 * 1024 * 1024) });
const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("prepare"), product_id: z.string().uuid(), files: z.array(imageFile).min(1).max(6) }),
  z.object({ operation: z.literal("complete"), product_id: z.string().uuid(), alt_text: z.string().trim().max(200).default(""), files: z.array(imageFile.extend({ path: z.string().max(160) })).min(1).max(6) }),
  z.object({ operation: z.literal("cleanup"), product_id: z.string().uuid(), paths: z.array(z.string().max(160)).min(1).max(6) }),
]);

const extensionByType: Record<z.infer<typeof imageType>, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
};

function validPath(productId: string, path: string, type?: z.infer<typeof imageType>) {
  const match = path.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp|avif)$/i);
  return Boolean(match && match[1].toLowerCase() === productId.toLowerCase() && (!type || match[3] === extensionByType[type]));
}

async function authorizeAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: NextResponse.json({ error: "Sign in as an administrator." }, { status: 401 }) };
  const { data: role, error: roleError } = await supabase.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (roleError) return { error: NextResponse.json({ error: "Administrator access could not be checked." }, { status: 503 }) };
  if (!role?.active) return { error: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  try { return { admin: createSupabaseAdminClient() }; }
  catch { return { error: NextResponse.json({ error: "Image storage is not configured." }, { status: 503 }) }; }
}

export async function POST(request: Request) {
  let payload: z.infer<typeof requestSchema>;
  try { payload = requestSchema.parse(await request.json()); }
  catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Check the image upload details." : "Invalid image upload request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const authorization = await authorizeAdmin();
  if ("error" in authorization) return authorization.error;
  const admin = authorization.admin;

  try {
    const { data: product, error: productError } = await admin.from("products").select("id").eq("id", payload.product_id).maybeSingle();
    if (productError) return NextResponse.json({ error: "Product access could not be checked." }, { status: 503 });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    if (payload.operation === "prepare") {
      const { count, error } = await admin.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", payload.product_id);
      if (error) return NextResponse.json({ error: "Current product images could not be checked." }, { status: 503 });
      if ((count ?? 0) + payload.files.length > 6) return NextResponse.json({ error: "This product can have up to 6 images total. Remove files from your selection and try again." }, { status: 400 });

      const storage = admin.storage.from("product-images");
      const uploads: { path: string; token: string }[] = [];
      for (const file of payload.files) {
        const path = payload.product_id + "/" + crypto.randomUUID() + "." + extensionByType[file.type];
        const { data, error: signedUrlError } = await storage.createSignedUploadUrl(path, { upsert: false });
        if (signedUrlError || !data) {
          if (uploads.length) await storage.remove(uploads.map((upload) => upload.path));
          return NextResponse.json({ error: "Secure upload could not be prepared. Please try again." }, { status: 502 });
        }
        uploads.push({ path, token: data.token });
      }
      return NextResponse.json({ uploads });
    }

    if (payload.operation === "cleanup") {
      if (payload.paths.some((path) => !validPath(payload.product_id, path))) return NextResponse.json({ error: "Invalid image reference." }, { status: 400 });
      const publicUrls = payload.paths.map((path) => storagePublicUrl(admin, path));
      const { data: linked, error } = await admin.from("product_images").select("image_url").eq("product_id", payload.product_id).in("image_url", publicUrls);
      if (error) return NextResponse.json({ error: "Image cleanup could not be checked." }, { status: 503 });
      const linkedUrls = new Set((linked ?? []).map((row) => row.image_url));
      const unusedPaths = payload.paths.filter((_path, index) => !linkedUrls.has(publicUrls[index]));
      if (unusedPaths.length) {
        const { error: cleanupError } = await admin.storage.from("product-images").remove(unusedPaths);
        if (cleanupError) return NextResponse.json({ error: "Some unfinished uploads need cleanup in Supabase Storage." }, { status: 502 });
      }
      return NextResponse.json({ cleaned: unusedPaths.length });
    }

    const files = payload.files;
    if (files.some((file) => !validPath(payload.product_id, file.path, file.type))) return NextResponse.json({ error: "Invalid image upload reference." }, { status: 400 });
    if (new Set(files.map((file) => file.path)).size !== files.length) return NextResponse.json({ error: "Duplicate image references were submitted." }, { status: 400 });

    const { count, error: countError } = await admin.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", payload.product_id);
    if (countError) return NextResponse.json({ error: "Current product images could not be checked." }, { status: 503 });
    if ((count ?? 0) + files.length > 6) return NextResponse.json({ error: "The product image limit was reached before this upload finished." }, { status: 409 });

    const storage = admin.storage.from("product-images");
    const objectChecks = await Promise.all(files.map(async (file) => {
      const filename = file.path.slice(file.path.lastIndexOf("/") + 1);
      const { data, error } = await storage.list(payload.product_id, { limit: 20, search: filename });
      const object = data?.find((entry) => entry.name === filename);
      const storedSize = Number(object?.metadata?.size);
      const storedType = String(object?.metadata?.mimetype ?? "");
      return !error && object && Number.isFinite(storedSize) && storedSize === file.size && storedType === file.type;
    }));
    if (objectChecks.some((exists) => !exists)) {
      await storage.remove(files.map((file) => file.path));
      return NextResponse.json({ error: "Uploaded files could not be verified. Please select the images again." }, { status: 400 });
    }

    const insertedUrls: string[] = [];
    for (const [index, file] of files.entries()) {
      const imageUrl = storagePublicUrl(admin, file.path);
      const { error } = await admin.from("product_images").insert({ product_id: payload.product_id, image_url: imageUrl, alt_text: payload.alt_text || null, position: (count ?? 0) + index });
      if (error) {
        if (insertedUrls.length) await admin.from("product_images").delete().eq("product_id", payload.product_id).in("image_url", [...insertedUrls, imageUrl]);
        await storage.remove(files.map((entry) => entry.path));
        return NextResponse.json({ error: "Images could not be saved. Uploaded files were cleaned up." }, { status: 409 });
      }
      insertedUrls.push(imageUrl);
    }

    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/admin/products");
    return NextResponse.json({ uploaded: files.length });
  } catch {
    return NextResponse.json({ error: "Image upload failed. Please try again." }, { status: 500 });
  }
}

function storagePublicUrl(admin: ReturnType<typeof createSupabaseAdminClient>, path: string) {
  return admin.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
