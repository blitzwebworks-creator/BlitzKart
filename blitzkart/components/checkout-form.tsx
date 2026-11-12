"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { money } from "@/lib/types";
import { DELHI_STATE, NEW_DELHI_CITY } from "@/lib/india";

export function CheckoutForm({ email, phone }: { email: string; phone: string }) {
  const { lines, clear } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const total = lines.reduce((sum, line) => sum + Number(line.product.selling_price) * line.quantity, 0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("blitzkart-location");
      if (saved) {
        const value = JSON.parse(saved) as { postal_code?: string; city?: string };
        if (value.city === "New Delhi" && value.postal_code && /^110\d{3}$/.test(value.postal_code)) setPostalCode(value.postal_code);
      }
    } catch { localStorage.removeItem("blitzkart-location"); }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!lines.length) { setError("Your cart is empty."); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
          address: Object.fromEntries(["recipient_name", "phone", "address_line1", "address_line2", "locality", "city", "state", "postal_code", "landmark"].map((key) => [key, String(form.get(key) ?? "").trim()])),
          coupon_code: String(form.get("coupon_code") ?? "").trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout could not be started.");
      clear();
      window.location.assign(result.paymentUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout could not be started.");
      setBusy(false);
    }
  }

  if (!lines.length) return <div className="wrap"><h1 className="page-title">Checkout</h1><div className="empty"><strong>Your cart is empty</strong><span>Add products before checkout.</span><p><button className="btn btn-outline btn-small" onClick={() => router.push("/products")}>Browse products</button></p></div></div>;

  return <div className="wrap checkout-page">
    <div className="checkout-heading"><div><span className="section-kicker">ALMOST THERE</span><h1>Checkout</h1><p>We deliver to active New Delhi PIN codes.</p></div><div className="checkout-steps" aria-label="Checkout steps"><span className="is-current"><i>1</i> Delivery</span><b aria-hidden="true"/><span><i>2</i> Payment</span></div></div>
    {error ? <div className="error checkout-error" role="alert">{error}</div> : null}
    <div className="checkout-layout">
      <form className="checkout-form panel" onSubmit={submit} data-navigation-feedback="false">
        <section className="checkout-form-section">
          <div className="checkout-section-title"><span className="checkout-section-icon"><MapPin size={18}/></span><div><h2>Delivery address</h2><p>Enter the address where you’d like this order delivered.</p></div></div>
          <div className="form-grid checkout-fields">
            <Field name="recipient_name" label="Full name" autoComplete="name" required/>
            <Field name="phone" label="Phone number · required for delivery" type="tel" autoComplete="tel" inputMode="tel" pattern="[+]91[ -]?[6-9][0-9]{9}|[6-9][0-9]{9}" maxLength={14} defaultValue={phone} required/>
            <Field name="address_line1" label="Flat, house no. and building" autoComplete="address-line1" required/>
            <Field name="address_line2" label="Street and area (optional)" autoComplete="address-line2"/>
            <Field name="locality" label="Locality" autoComplete="address-level3" required/>
            <Field name="landmark" label="Landmark (optional)"/>
            <Field name="city" label="City" autoComplete="address-level2" defaultValue={NEW_DELHI_CITY} readOnly required/>
            <Field name="state" label="State / UT" autoComplete="address-level1" defaultValue={DELHI_STATE} readOnly required/>
            <label className="field"><span>Delhi PIN code</span><input name="postal_code" value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="110[0-9]{3}" maxLength={6} autoComplete="postal-code" required/></label>
          </div>
          <label className="field checkout-email"><span>Order updates will be sent to</span><input value={email} readOnly aria-label="Email for order updates"/></label>
          <label className="field checkout-coupon"><span>Coupon code <small>Optional</small></span><input name="coupon_code" maxLength={64} autoCapitalize="characters" placeholder="Enter a valid code"/></label>
        </section>
        <section className="checkout-form-section checkout-payment-section">
          <div className="checkout-section-title"><span className="checkout-section-icon"><LockKeyhole size={18}/></span><div><h2>Payment</h2><p>Pay securely through the BlitzKart UPI Gateway.</p></div></div>
          <div className="checkout-payment-option"><span className="checkout-radio"/><span className="upi-mark">UPI</span><span><strong>UPI Gateway</strong><small>Payment status is confirmed directly by the gateway.</small></span><ShieldCheck size={19}/></div>
          <p className="checkout-payment-note">Your order will be confirmed only after the gateway verifies payment. The final payable amount, including any configured delivery charge and valid coupon, is shown before you pay.</p>
        </section>
        <button className="btn checkout-pay-button" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><LoaderCircle size={17} className="spin" aria-hidden="true"/>Connecting to payment…</> : <>Continue to secure payment <LockKeyhole size={16}/></>}</button>
        <p className="checkout-secure-note"><ShieldCheck size={14}/> Your payment is handled securely by UPI Gateway.</p>
      </form>
      <aside className="checkout-summary panel">
        <div className="checkout-summary-heading"><div><span className="section-kicker">YOUR ORDER</span><h2>Order summary</h2></div><PackageCheck size={21}/></div>
        <div className="checkout-item-list">{lines.map(({ product, quantity }) => <div className="checkout-item" key={product.id}><div className="checkout-item-image">{product.product_images?.[0] ? <img src={product.product_images[0].image_url} alt=""/> : <span>—</span>}<small>{quantity}</small></div><span>{product.name}</span><strong>{money(Number(product.selling_price) * quantity)}</strong></div>)}</div>
        <div className="checkout-summary-total"><span>Items subtotal</span><strong>{money(total)}</strong></div>
        <p className="checkout-summary-note">Delivery charge and any valid coupon are checked from current store settings at checkout.</p>
      </aside>
    </div>
  </div>;
}

function Field({ name, label, type = "text", autoComplete, inputMode, pattern, defaultValue, readOnly = false, maxLength, required = false }: { name: string; label: string; type?: string; autoComplete?: string; inputMode?: "text" | "tel" | "numeric"; pattern?: string; defaultValue?: string; readOnly?: boolean; maxLength?: number; required?: boolean }) {
  return <label className="field"><span>{label}{required ? <i aria-hidden="true"> *</i> : null}</span><input name={name} type={type} autoComplete={autoComplete} inputMode={inputMode} pattern={pattern} defaultValue={defaultValue} readOnly={readOnly} required={required} maxLength={maxLength ?? (name === "address_line1" ? 200 : 100)}/></label>;
}
