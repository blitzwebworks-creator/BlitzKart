import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_IMAGES = 3;
const MAX_BYTES = 1024 * 1024;
const accepted = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  "image/webp": { extension: "webp", signature: (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
} as const;

type ImageFile = { file: File; contentType: keyof typeof accepted; extension: string };

export async function validateCustomerImageFiles(values: FormDataEntryValue[]): Promise<ImageFile[]> {
  const files = values.filter((value): value is File => typeof File !== "undefined" && value instanceof File && value.size > 0);
  if (files.length > MAX_IMAGES) throw new Error("You can attach up to three images.");
  const result: ImageFile[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new Error("Each image must be 1 MB or smaller.");
    const type = file.type as keyof typeof accepted;
    const definition = accepted[type];
    if (!definition) throw new Error("Use JPEG, PNG or WebP images only.");
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!definition.signature(bytes)) throw new Error("An image file did not match its declared format.");
    result.push({ file, contentType: type, extension: definition.extension });
  }
  return result;
}

export async function uploadCustomerImages(bucket: "product-review-images" | "customer-request-images", ownerId: string, files: ImageFile[]) {
  const admin = createSupabaseAdminClient();
  const paths: string[] = [];
  try {
    for (const image of files) {
      const path = `${ownerId}/${randomUUID()}.${image.extension}`;
      const { error } = await admin.storage.from(bucket).upload(path, image.file, { contentType: image.contentType, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error("An image could not be uploaded. Please try again.");
      paths.push(path);
    }
    return paths;
  } catch (error) {
    if (paths.length) await admin.storage.from(bucket).remove(paths);
    throw error;
  }
}

export async function removeCustomerImages(bucket: "product-review-images" | "customer-request-images", paths: string[]) {
  if (!paths.length) return;
  const { error } = await createSupabaseAdminClient().storage.from(bucket).remove(paths);
  if (error) console.error("Customer uploaded images could not be removed", { bucket, count: paths.length });
}
