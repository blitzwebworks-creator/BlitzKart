"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { createCategoryAction } from "@/lib/actions/admin";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Ticket = { path: string; token: string };
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

async function uploadImage(categoryId: string, file: File) {
  if (!supportedImageTypes.has(file.type) || file.size > 5 * 1024 * 1024 || file.size < 1) {
    throw new Error("Use a JPEG, PNG, WebP or AVIF image up to 5 MB.");
  }

  const prepared = await fetch("/api/admin/categories/images", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "prepare", category_id: categoryId, type: file.type, size: file.size }),
  });
  const result = await prepared.json();
  if (!prepared.ok) throw new Error(result.error || "Secure upload could not be prepared.");

  const ticket = result as Ticket;
  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage.from("category-images").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (uploadError) throw new Error("Image upload failed. Please try again.");

  const completed = await fetch("/api/admin/categories/images", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "complete", category_id: categoryId, path: ticket.path, type: file.type, size: file.size }),
  });
  const completion = await completed.json();
  if (!completed.ok) throw new Error(completion.error || "Category image could not be saved.");
}

export function NewCategoryForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isBusy = busy;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const form = event.currentTarget;
    const file = fileInput.current?.files?.[0];
    if (file && (!supportedImageTypes.has(file.type) || file.size > 5 * 1024 * 1024 || file.size < 1)) {
      setError("Use a JPEG, PNG, WebP or AVIF image up to 5 MB."); return;
    }
    const data = new FormData(form);
    setBusy(true);
    let category: { id: string } | null = null;
    try {
      category = await createCategoryAction(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Category could not be saved.");
      setBusy(false);
      return;
    }
    form.reset(); router.refresh();
    if (file && category) {
      try {
        await uploadImage(category.id, file);
        setMessage("Category and photo saved.");
      } catch (reason) {
        setMessage(reason instanceof Error ? `Category created. ${reason.message} Upload a photo from its category card.` : "Category created. The photo could not be uploaded; upload it from the category card.");
      }
    } else {
      setMessage("Category saved. Add a photo from the category card when ready.");
    }
    setBusy(false);
  }

  return <form className="panel category-create-form" onSubmit={submit}>
    <h2>Add a category</h2>
    <div className="form-grid"><label className="field"><span>Category name</span><input name="name" required minLength={2} maxLength={100}/></label><label className="field"><span>Slug <small>Optional</small></span><input name="slug" maxLength={100}/></label><label className="field" style={{ gridColumn: "1 / -1" }}><span>Description <small>Optional</small></span><textarea name="description" maxLength={500} rows={2}/></label><label className="field" style={{ gridColumn: "1 / -1" }}><span>Category photo <small>Optional · max 5 MB</small></span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif"/></label></div>
    <button className="btn" type="submit" disabled={isBusy}>{isBusy ? <><LoaderCircle size={15} className="spin"/> Saving…</> : "Create category"}</button>
    {error ? <p className="error" role="alert">{error}</p> : message ? <p className="notice" role="status">{message}</p> : null}
  </form>;
}

export function CategoryImageUpload({ categoryId, imageUrl }: { categoryId: string; imageUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    await uploadImage(categoryId, file);
  }

  async function change(event: React.ChangeEvent<HTMLInputElement>) {
    const target = event.currentTarget;
    const file = target.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try { await upload(file); setMessage("Category photo updated."); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Category photo could not be uploaded."); }
    finally { setBusy(false); target.value = ""; }
  }

  return <div className="category-image-manager">
    {imageUrl ? <Image className="category-admin-image" src={imageUrl} alt="Category" width={62} height={62} sizes="62px" style={{ width: 62, height: 62 }}/> : <span className="category-admin-image category-admin-image-empty"><UploadCloud size={20}/> No photo</span>}
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={change}/>
    <button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => input.current?.click()}>{busy ? <><LoaderCircle size={14} className="spin"/> Uploading…</> : <><ImagePlus size={14}/>{imageUrl ? "Change photo" : "Upload photo"}</>}</button>
    {error ? <small className="error" role="alert">{error}</small> : message ? <small className="notice" role="status">{message}</small> : null}
  </div>;
}
