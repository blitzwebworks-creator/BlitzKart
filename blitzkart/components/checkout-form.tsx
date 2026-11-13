"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { money } from "@/lib/types";
import { DELHI_STATE, NEW_DELHI_CITY } from "@/lib/india";

type Provider = "razorpay" | "payu";
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  prefill: { name: string; email: string; contact: string }; theme: { color: string };
  handler: (result: RazorpayResult) => void; modal: { ondismiss: () => void };
};
type RazorpayInstance = { open: () => void; on: (event: string, callback: (result: { error?: { description?: string } }) => void) => void };
type RazorpayWindow = Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance };
type CheckoutResult = {
  provider: Provider; orderId: string; orderNumber: string; paymentUrl?: string; fields?: Record<string, string>;
  keyId?: string; razorpayOrderId?: string; amount?: number; currency?: string;
  customer?: { name: string; email: string; phone: string };
};

function loadRazorpay() {
  const browser = window as RazorpayWindow;
  if (browser.Razorpay) return Promise.resolve(browser.Razorpay);
  return new Promise<NonNullable<RazorpayWindow["Razorpay"]>>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    const script = existing ?? document.createElement("script");
    const finish = () => browser.Razorpay ? resolve(browser.Razorpay) : reject(new Error("Razorpay Checkout did not load. Check your connection and try again."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load. Try again.")), { once: true });
    if (!existing) { script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; script.dataset.razorpayCheckout = "true"; document.body.appendChild(script); }
  });
}

export function CheckoutForm({ email, phone, enabledProviders }: { email: string; phone: string; enabledProviders: Provider[] }) {
  const { lines, clear } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [provider, setProvider] = useState<Provider>(enabledProviders[0] || "razorpay");
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
    event.preventDefault(); setError("");
    if (!lines.length) { setError("Your cart is empty."); return; }
    if (!enabledProviders.includes(provider)) { setError("This payment option is not configured yet."); return; }
    const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_provider: provider,
          lines: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })),
          address: Object.fromEntries(["recipient_name", "phone", "address_line1", "address_line2", "locality", "city", "state", "postal_code", "landmark"].map((key) => [key, String(form.get(key) ?? "").trim()])),
          coupon_code: String(form.get("coupon_code") ?? "").trim(),
        }),
      });
      const result = await response.json() as CheckoutResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Checkout could not be started.");
      if (result.provider === "payu") {
        if (!result.paymentUrl || !result.fields) throw new Error("PayU did not return a checkout session.");
        clear();
        const payuForm = document.createElement("form");
        payuForm.method = "POST"; payuForm.action = result.paymentUrl; payuForm.style.display = "none";
        Object.entries(result.fields).forEach(([name, value]) => {
          const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; payuForm.appendChild(input);
        });
        document.body.appendChild(payuForm); payuForm.submit();
        return;
      }
      if (!result.keyId || !result.razorpayOrderId || !result.amount || !result.currency || !result.customer) throw new Error("Razorpay did not return a complete checkout session.");
      const Razorpay = await loadRazorpay();
      const checkout = new Razorpay({
        key: result.keyId, order_id: result.razorpayOrderId, amount: result.amount, currency: result.currency,
        name: "BlitzKart", description: `Order ${result.orderNumber}`,
        prefill: { name: result.customer.name, email: result.customer.email, contact: result.customer.phone },
        theme: { color: "#ffd21f" },
        handler: async (payment) => {
          try {
            const verify = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: result.orderId, ...payment }) });
            clear();
            if (!verify.ok) { router.replace(`/checkout/confirmed?order_id=${encodeURIComponent(result.orderId)}`); return; }
            router.replace(`/checkout/confirmed?order_id=${encodeURIComponent(result.orderId)}`);
          } catch {
            clear(); router.replace(`/checkout/confirmed?order_id=${encodeURIComponent(result.orderId)}`);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", ({ error: failure }) => { setError(failure?.description || "Payment was not completed. You can try again."); setBusy(false); });
      checkout.open();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setBusy(false);
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
          <div className="checkout-section-title"><span className="checkout-section-icon"><LockKeyhole size={18}/></span><div><h2>Payment method</h2><p>Choose a configured provider. The payable total is checked on the server.</p></div></div>
          {enabledProviders.length ? <div className="payment-provider-options">
            {(["razorpay", "payu"] as Provider[]).filter((option) => enabledProviders.includes(option)).map((option) => <label key={option} className={`payment-provider-option${provider === option ? " is-selected" : ""}`}>
              <input type="radio" name="payment_provider" value={option} checked={provider === option} onChange={() => setProvider(option)}/>
              <span className={`payment-provider-mark payment-provider-${option}`}>{option === "razorpay" ? "R" : "P"}</span>
              <span><strong>{option === "razorpay" ? "Razorpay" : "PayU"}</strong><small>Secure checkout · UPI, cards and more</small></span>
              <ShieldCheck size={19}/>
            </label>)}
          </div> : <p className="notice">Online checkout is not configured yet. Add Razorpay or PayU server credentials in Vercel to accept orders.</p>}
          <p className="checkout-payment-note">BlitzKart confirms payment only after the selected provider verifies the captured transaction. Your order and payment status stay separate.</p>
        </section>
        <button className="btn checkout-pay-button" type="submit" disabled={busy || !enabledProviders.length} aria-busy={busy}>{busy ? <><LoaderCircle size={17} className="spin" aria-hidden="true"/>Connecting securely…</> : <>Pay {money(total)} <LockKeyhole size={16}/></>}</button>
        <p className="checkout-secure-note"><ShieldCheck size={14}/> Payment credentials stay on BlitzKart’s server.</p>
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
