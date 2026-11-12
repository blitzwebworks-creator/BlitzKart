"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type UploadTicket = { path: string; token: string };

export function ProductImageUploader({ productId, imageCount }: { productId: string; imageCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const remaining = Math.max(0, 6 - imageCount);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const input = form.elements.namedItem("images");
    const files = input instanceof HTMLInputElement && input.files ? Array.from(input.files) : [];
    const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (!files.length) { setError("Choose at least one product image."); return; }
    if (files.length > remaining) { setError("You can add " + remaining + " more image(s) to this product."); return; }
    if (files.some((file) => file.size < 1 || file.size > 5 * 1024 * 1024 || !supported.has(file.type))) {
      setError("Use JPEG, PNG, WebP or AVIF images up to 5 MB each.");
      return;
    }

    setBusy(true);
    const cleanupPaths: string[] = [];
    try {
      const prepared = await fetch("/api/admin/products/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "prepare", product_id: productId, files: files.map((file) => ({ type: file.type, size: file.size })) }),
      });
      const preparation = await prepared.json();
      if (!prepared.ok) throw new Error(preparation.error || "Secure image upload could not be prepared.");
      const tickets = preparation.uploads as UploadTicket[];
      if (!Array.isArray(tickets) || tickets.length !== files.length) throw new Error("Secure image upload returned an incomplete response.");
      cleanupPaths.push(...tickets.map((ticket) => ticket.path));

      const supabase = createSupabaseBrowserClient();
      for (const [index, file] of files.entries()) {
        setMessage("Uploading image " + (index + 1) + " of " + files.length + "…");
        const ticket = tickets[index];
        const { error: uploadError } = await supabase.storage.from("product-images").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
        if (uploadError) throw new Error("Image " + (index + 1) + " could not be uploaded.");
      }

      const completed = await fetch("/api/admin/products/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "complete", product_id: productId, alt_text: "", files: files.map((file, index) => ({ path: tickets[index].path, type: file.type, size: file.size })) }),
      });
      const completion = await completed.json();
      if (!completed.ok) throw new Error(completion.error || "The uploaded images could not be saved.");
      setMessage("Uploaded " + files.length + " image(s). The first image is the main image.");
      form.reset();
      router.refresh();
    } catch (reason) {
      if (cleanupPaths.length) {
        await fetch("/api/admin/products/images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "cleanup", product_id: productId, paths: cleanupPaths }),
        }).catch(() => undefined);
      }
      setError(reason instanceof Error ? reason.message : "Image upload failed. Please try again.");
      setMessage("");
    } finally { setBusy(false); }
  }

  return <form className="product-image-upload" onSubmit={submit}>
    <label className="field"><span>Add product images · {imageCount}/6 used</span><input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple required disabled={busy || remaining === 0}/><small>{remaining ? remaining + " image slot(s) left · first selected image becomes the main image" : "The six-image limit has been reached."}</small></label>
    <button className="btn btn-small" type="submit" disabled={busy || remaining === 0}>{busy ? <><LoaderCircle className="spin" size={14}/> Uploading…</> : <><ImagePlus size={15}/> Upload images</>}</button>
    {error ? <p className="error" role="alert">{error}</p> : message ? <p className="notice" role="status" aria-live="polite">{message}</p> : null}
  </form>;
}
