"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { money } from "@/lib/types";
import { LoaderCircle } from "lucide-react";

export function CheckoutForm({ email }: { email: string }) {
  const { lines, clear } = useCart(); const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [postalCode,setPostalCode]=useState("");
  useEffect(()=>{try{const saved=localStorage.getItem("blitzkart-location");if(saved){const value=JSON.parse(saved) as {postal_code?:string};if(value.postal_code)setPostalCode(value.postal_code);}}catch{localStorage.removeItem("blitzkart-location");}},[]);
  const total = lines.reduce((sum, line) => sum + Number(line.product.selling_price) * line.quantity, 0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); if (!lines.length) { setError("Your cart is empty."); return; }
    const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        lines: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
        address: Object.fromEntries(["recipient_name","phone","address_line1","address_line2","locality","city","state","postal_code","landmark"].map((key) => [key, String(form.get(key) ?? "").trim()])),
        coupon_code: String(form.get("coupon_code") ?? "").trim(),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout could not be started.");
      clear(); window.location.assign(result.paymentUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setBusy(false); }
  }
  if (!lines.length) return <div className="wrap"><h1 className="page-title">Checkout</h1><div className="empty"><strong>Your cart is empty</strong><span>Add products before checkout.</span><p><button className="btn btn-outline btn-small" onClick={() => router.push("/products")}>Browse products</button></p></div></div>;
  return <div className="wrap"><h1 className="page-title">Checkout</h1><p className="muted">Payment is securely processed by UPI Gateway. Your order is not confirmed until the gateway verifies payment.</p>{error ? <div className="error" role="alert">{error}</div> : null}<div className="split" style={{ marginTop: 18 }}><form className="panel" onSubmit={submit} data-navigation-feedback="false"><h2>Delivery address</h2><div className="form-grid"><Field name="recipient_name" label="Recipient name" required/><Field name="phone" label="Phone number" required/><Field name="address_line1" label="Address line 1" required/><Field name="address_line2" label="Address line 2"/><Field name="locality" label="Area / locality" required/><Field name="city" label="City" required/><Field name="state" label="State" required/><label className="field"><span>PIN code *</span><input name="postal_code" value={postalCode} onChange={(event)=>setPostalCode(event.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label><Field name="landmark" label="Landmark"/></div><div className="field"><label>Email for order updates</label><input value={email} readOnly/></div><div className="field"><label htmlFor="coupon_code">Coupon code (optional)</label><input id="coupon_code" name="coupon_code" maxLength={64} autoCapitalize="characters"/></div><div className="notice">Payment status remains pending until verified by UPI Gateway. The server applies any valid coupon and configured delivery charge before sending the final amount to the gateway.</div><button className="btn checkout-pay-button" style={{ marginTop: 16, width: "100%" }} disabled={busy} aria-busy={busy}>{busy ? <><LoaderCircle size={17} className="spin" aria-hidden="true"/>Opening UPI Gateway…</> : "Pay securely with UPI Gateway"}</button></form><aside className="panel"><h2>Items ({lines.reduce((sum, line) => sum + line.quantity, 0)})</h2>{lines.map(({ product, quantity }) => <p key={product.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{product.name} × {quantity}</span><strong>{money(Number(product.selling_price) * quantity)}</strong></p>)}<hr style={{ border: 0, borderTop: "1px solid var(--line)" }}/><p style={{ display: "flex", justifyContent: "space-between" }}><span>Items subtotal</span><strong>{money(total)}</strong></p><p className="muted">A delivery zone and any valid coupon are checked from live database records. The final amount is shown by the payment gateway before payment.</p></aside></div></div>;
}
function Field({ name, label, required = false }: { name: string; label: string; required?: boolean }) { return <div className="field"><label htmlFor={name}>{label}{required ? " *" : ""}</label><input id={name} name={name} required={required} maxLength={name === "address_line1" ? 200 : 100}/></div>; }
