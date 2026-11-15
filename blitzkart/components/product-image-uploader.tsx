"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, LoaderCircle, Trash2, UploadCloud } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type UploadTicket = { path: string; token: string };
const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function ProductImageUploader({ productId, imageCount }: { productId: string; imageCount: number }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadedCount, setUploadedCount] = useState(imageCount);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const remaining = Math.max(0, 6 - uploadedCount);
  const previews = useMemo(() => selected.map((file) => ({ file, url: URL.createObjectURL(file) })), [selected]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  function choose(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length > remaining) setError(`This product has room for ${remaining} more image${remaining === 1 ? "" : "s"}.`);
    else setError("");
    setMessage("");
    setSelected(list.slice(0, remaining));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(""); setError(""); setProgress(0);
    const files = selected;
    if (!files.length) { setError("Choose product images to upload."); return; }
    if (files.some((file) => file.size < 1 || file.size > 5 * 1024 * 1024 || !supported.has(file.type))) {
      setError("Use JPEG, PNG, WebP or AVIF images up to 5 MB each."); return;
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
        setMessage(`Uploading image ${index + 1} of ${files.length}…`);
        const ticket = tickets[index];
        const { error: uploadError } = await supabase.storage.from("product-images").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
        if (uploadError) throw new Error(`Image ${index + 1} could not be uploaded.`);
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }

      const completed = await fetch("/api/admin/products/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "complete", product_id: productId, alt_text: "", files: files.map((file, index) => ({ path: tickets[index].path, type: file.type, size: file.size })) }),
      });
      const completion = await completed.json();
      if (!completed.ok) throw new Error(completion.error || "The uploaded images could not be saved.");
      setUploadedCount((current) => current + files.length);
      setMessage(`Uploaded ${files.length} image${files.length === 1 ? "" : "s"}. ${uploadedCount === 0 ? "The first is the main image." : "They were added to the gallery."}`);
      setSelected([]); setProgress(100); router.refresh();
    } catch (reason) {
      if (cleanupPaths.length) await fetch("/api/admin/products/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "cleanup", product_id: productId, paths: cleanupPaths }),
      }).catch(() => undefined);
      setError(reason instanceof Error ? reason.message : "Image upload failed. Please try again."); setMessage(""); setProgress(0);
    } finally { setBusy(false); }
  }

  return <form className={`product-image-upload${dragging ? " is-dragging" : ""}`} onSubmit={submit}>
    <input ref={fileInput} className="product-image-file-input" id={`product-images-${productId}`} type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={busy || remaining === 0} onChange={(event) => choose(event.currentTarget.files)}/>
    <label className="product-image-dropzone" htmlFor={`product-images-${productId}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) choose(event.dataTransfer.files); }}>
      <span className="product-image-drop-icon"><UploadCloud size={20}/></span>
      <span><strong>{remaining ? "Add product photos" : "Image limit reached"}</strong><small>{remaining ? `${remaining} slot${remaining === 1 ? "" : "s"} left · JPEG, PNG, WebP or AVIF · max 5 MB each` : "This product already has six images."}</small></span>
      <span className="btn btn-outline btn-small">Browse files</span>
    </label>
    {previews.length ? <div className="product-image-previews" aria-label="Selected images">{previews.map(({ file, url }, index) => <figure key={`${file.name}-${file.lastModified}-${index}`}><Image src={url} alt={`Preview of ${file.name}`} width={66} height={58} style={{ width: 66, height: 58 }} unoptimized/><figcaption>{uploadedCount === 0 && index === 0 ? "Main image" : `Gallery ${uploadedCount + index}`}</figcaption><button type="button" disabled={busy} onClick={() => setSelected((current) => current.filter((_, currentIndex) => currentIndex !== index))} aria-label={`Remove ${file.name} from selection`}><Trash2 size={14}/></button></figure>)}</div> : null}
    {busy ? <div className="product-image-progress" role="progressbar" aria-label="Image upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div> : null}
    <div className="product-image-upload-footer"><span>{message || (selected.length ? `${selected.length} image${selected.length === 1 ? "" : "s"} selected` : "Choose images or drag them here")}</span><button className="btn btn-small" type="submit" disabled={busy || remaining === 0 || selected.length === 0}>{busy ? <><LoaderCircle className="spin" size={14}/> Uploading…</> : <><ImagePlus size={15}/> Upload selected</>}</button></div>
    {error ? <p className="error" role="alert">{error}</p> : message && !busy ? <p className="notice" role="status" aria-live="polite">{message}</p> : null}
  </form>;
}
