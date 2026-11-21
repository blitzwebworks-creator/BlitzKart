"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAdminReturnAction } from "@/lib/actions/admin";
import { money } from "@/lib/types";

type ReturnItem = { id: string; name: string; sku: string; quantity: number; remaining_quantity: number; unit_price: number; line_total: number };
type Lookup = { order: { id: string; order_number: string; status: string; payment_status: string }; customer: { id: string; email: string; name: string }; items: ReturnItem[] };
const statuses = ["return_requested","return_approved","return_pickup_scheduled","item_received","refund_initiated","refunded","return_rejected"];

export function AdminCreateReturnForm() {
  const router = useRouter();
  const [orderReference, setOrderReference] = useState("");
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("return_requested");
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function findOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLookupBusy(true); setError(""); setSuccess(""); setLookup(null); setQuantities({});
    try {
      const response = await fetch("/api/admin/returns/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_reference: orderReference, email }) });
      const result = await response.json() as Lookup & { error?: string };
      if (!response.ok) throw new Error(result.error || "Order lookup failed.");
      setLookup(result); setQuantities(Object.fromEntries(result.items.map((item) => [item.id, 0])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Order lookup failed. Try again."); }
    finally { setLookupBusy(false); }
  }

  async function createReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    if (!lookup) { setError("Verify the order and customer before creating a return."); setBusy(false); return; }
    const selected = lookup.items.filter((item) => (quantities[item.id] ?? 0) > 0).map((item) => ({ order_item_id: item.id, quantity: quantities[item.id] }));
    if (!selected.length) { setError("Select a quantity for at least one product."); setBusy(false); return; }
    const form = new FormData(event.currentTarget);
    form.set("order_id", lookup.order.id); form.set("customer_email", lookup.customer.email); form.set("items", JSON.stringify(selected));
    try {
      const returnId = await createAdminReturnAction(form);
      setSuccess(`Return created${returnId ? ". The customer can see it in My Orders." : "."}`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Return could not be created."); }
    finally { setBusy(false); }
  }

  return <details className="panel admin-create-record">
    <summary className="admin-create-record-summary"><span><strong>+ Create Return</strong><small>Verify an order against the customer’s registered email before selecting return items.</small></span></summary>
    <form onSubmit={findOrder} className="form-grid admin-create-lookup">
      <label className="field"><span>Order ID or order number</span><input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} required maxLength={100} placeholder="BK-…"/></label>
      <label className="field"><span>Customer email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} placeholder="customer@example.com"/></label>
      <button className="btn btn-outline" type="submit" disabled={lookupBusy}>{lookupBusy ? "Verifying…" : "Verify order"}</button>
    </form>
    {lookup ? <>
      <div className="notice admin-create-customer"><strong>{lookup.order.order_number}</strong> · {lookup.customer.name} · {lookup.customer.email} · {lookup.order.status.replaceAll("_", " ")} · payment {lookup.order.payment_status.replaceAll("_", " ")}</div>
      <form onSubmit={createReturn} className="admin-create-order-form">
        <input type="hidden" name="reason" value={reason === "Other" ? customReason : reason}/>
        <div className="admin-create-lines"><h3>Select products and quantities</h3>
          {lookup.items.map((item) => <div className="form-grid admin-create-product-line" key={item.id}>
            <div className="field"><span>{item.name} · {item.sku}</span><small>Purchased {item.quantity} · remaining returnable {item.remaining_quantity} · {money(item.unit_price)} each</small></div>
            <label className="field"><span>Quantity to return</span><input type="number" min="0" max={item.remaining_quantity} value={quantities[item.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))}/></label>
          </div>)}
        </div>
        <div className="form-grid">
          <label className="field"><span>Return reason</span><select value={reason} onChange={(event) => setReason(event.target.value)} required><option value="">Choose a reason</option><option value="Damaged product">Damaged product</option><option value="Defective product">Defective product</option><option value="Wrong product delivered">Wrong product delivered</option><option value="Product differs from description">Product differs from description</option><option value="Customer requested return">Customer requested return</option><option value="Other">Other</option></select></label>
          {reason === "Other" ? <label className="field"><span>Reason details</span><input value={customReason} onChange={(event) => setCustomReason(event.target.value)} minLength={3} maxLength={120} required/></label> : null}
          <label className="field"><span>Initial return status</span><select name="initial_status" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label className="field admin-create-wide"><span>Admin notes <small>Optional · internal</small></span><textarea name="admin_notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2}/></label>
        </div>
        <p className="muted">Changing a return status never sends a payment refund. Refunds must be initiated and verified through the Razorpay refund workflow.</p>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating return…" : "Create return"}</button>
      </form>
    </> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}{success ? <p className="notice" role="status">{success}</p> : null}
  </details>;
}
