"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, LoaderCircle, PackagePlus } from "lucide-react";
import { createProductAction } from "@/lib/actions/admin";
import { ProductImageUploader } from "@/components/product-image-uploader";

export function NewProductForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProductId, setCreatedProductId] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setCreatedProductId(""); setBusy(true);
    const form = event.currentTarget;
    try {
      const id = await createProductAction(new FormData(form));
      setCreatedProductId(id); form.reset(); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
    } finally { setBusy(false); }
  }

  return <div className="panel new-product-panel">
    <div className="new-product-heading"><span className="new-product-icon"><PackagePlus size={18}/></span><div><h2>Add a product</h2><p>Start with the name, price, category and stock. You can add up to six photos.</p></div></div>
    <form onSubmit={submit} className="new-product-form">
      <div className="form-grid">
        <label className="field"><span>Product name</span><input name="name" required minLength={2} maxLength={160} placeholder="e.g. Whole wheat bread"/></label>
        <label className="field"><span>Selling price (₹)</span><input name="selling_price" type="number" min="0" step="0.01" required placeholder="0.00"/></label>
        <label className="field"><span>Original price <small>Optional</small></span><input name="original_price" type="number" min="0" step="0.01" placeholder="Leave blank when not applicable"/></label>
        <label className="field"><span>Category</span><select name="category_id" defaultValue=""><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>Starting stock quantity</span><input name="quantity" type="number" min="0" step="1" required defaultValue="0"/></label>
        <label className="field"><span>Low-stock alert at</span><input name="low_stock_threshold" type="number" min="0" step="1" defaultValue="5"/></label>
        <label className="field new-product-wide"><span>Description <small>Optional</small></span><textarea name="description" maxLength={4000} rows={3} placeholder="Product information customers need"/></label>
      </div>
      <details className="new-product-advanced"><summary>More product settings <ChevronDown size={15}/></summary><div className="form-grid"><label className="field"><span>Slug <small>Leave blank to generate from the name</small></span><input name="slug" maxLength={100}/></label><label className="field"><span>Specifications <small>Optional JSON object</small></span><textarea name="specifications" maxLength={5000} placeholder="{}" rows={3}/></label><label className="new-product-check"><input type="checkbox" name="is_featured"/> Show in featured products</label><label className="new-product-check"><input type="checkbox" name="is_active" defaultChecked/> Active in the catalogue</label></div></details>
      <div className="new-product-actions"><button className="btn" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin"/> Creating…</> : <><Check size={15}/> Create product</>}</button><span className="muted">Stock and photos can be updated later.</span></div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
    {createdProductId ? <div className="new-product-created"><strong>Product created. Add photos now or later from its product card.</strong><ProductImageUploader productId={createdProductId} imageCount={0}/></div> : null}
  </div>;
}
