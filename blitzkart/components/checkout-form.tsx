"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle, LockKeyhole, MapPin, PackageCheck, Plus, ShieldCheck, Tag } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { money } from "@/lib/types";
import { DELHI_STATE, NEW_DELHI_CITY } from "@/lib/india";

type Provider = "razorpay" | "payu";
type AddressForm = {
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  landmark: string;
};
export type CheckoutSavedAddress = Omit<AddressForm, "address_line2" | "landmark"> & {
  id: string;
  address_line2: string | null;
  landmark: string | null;
  is_default: boolean;
};
type Quote = {
  items: { product_id: string; name: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  discount: number;
  delivery_charge: number;
  total: number;
  coupon_code: string | null;
  coupon_error: string | null;
};
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

function blankAddress(fullName: string, phone: string, postalCode = ""): AddressForm {
  return { recipient_name: fullName, phone, address_line1: "", address_line2: "", locality: "", city: NEW_DELHI_CITY, state: DELHI_STATE, postal_code: postalCode, landmark: "" };
}

function addressFromSaved(address: CheckoutSavedAddress): AddressForm {
  return {
    recipient_name: address.recipient_name,
    phone: address.phone,
    address_line1: address.address_line1,
    address_line2: address.address_line2 ?? "",
    locality: address.locality,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    landmark: address.landmark ?? "",
  };
}

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

export function CheckoutForm({
  email, fullName, phone, addresses, addressLoadError, razorpaySetupHint, enabledProviders,
}: {
  email: string;
  fullName: string;
  phone: string;
  addresses: CheckoutSavedAddress[];
  addressLoadError: boolean;
  razorpaySetupHint: string;
  enabledProviders: Provider[];
}) {
  const { lines, clear } = useCart();
  const router = useRouter();
  const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(defaultAddress?.id ?? null);
  const [address, setAddress] = useState<AddressForm>(() => defaultAddress ? addressFromSaved(defaultAddress) : blankAddress(fullName, phone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [provider, setProvider] = useState<Provider>(enabledProviders[0] || "razorpay");

  const quoteLines = useMemo(() => lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })), [lines]);

  useEffect(() => {
    if (!address.postal_code) {
      try {
        const saved = localStorage.getItem("blitzkart-location");
        const value = saved ? JSON.parse(saved) as { postal_code?: string; city?: string } : null;
        if (value?.city === NEW_DELHI_CITY && value.postal_code && /^110\d{3}$/.test(value.postal_code)) {
          setAddress((current) => current.postal_code ? current : { ...current, postal_code: value.postal_code! });
        }
      } catch { localStorage.removeItem("blitzkart-location"); }
    }
  }, [address.postal_code]);

  useEffect(() => {
    const postalCode = address.postal_code.trim();
    if (!lines.length || !/^110\d{3}$/.test(postalCode)) {
      setQuote(null);
      setQuoteState("idle");
      setQuoteError("");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setQuoteState("loading");
      setQuoteError("");
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ lines: quoteLines, postal_code: postalCode, coupon_code: appliedCoupon }),
        });
        const result = await response.json() as Quote & { error?: string };
        if (!response.ok) throw new Error(result.error || "Checkout totals could not be calculated.");
        setQuote(result);
        setQuoteState("ready");
      } catch (reason) {
        if (controller.signal.aborted) return;
        setQuote(null);
        setQuoteError(reason instanceof Error ? reason.message : "Checkout totals could not be calculated.");
        setQuoteState("error");
      }
    }, 180);

    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [address.postal_code, appliedCoupon, quoteLines, quoteRefresh]);

  function selectSavedAddress(saved: CheckoutSavedAddress) {
    setSelectedAddressId(saved.id);
    setAddress(addressFromSaved(saved));
    setQuote(null);
    setQuoteState("idle");
    setError("");
  }

  function startNewAddress() {
    setSelectedAddressId(null);
    setAddress((current) => blankAddress(fullName || current.recipient_name, phone || current.phone, current.postal_code));
    setError("");
  }

  function updateAddress(field: keyof AddressForm, value: string) {
    setSelectedAddressId(null);
    setAddress((current) => ({ ...current, [field]: value }));
    if (field === "postal_code") { setQuote(null); setQuoteState("idle"); setQuoteError(""); }
  }

  function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) { setAppliedCoupon(""); setQuote(null); setQuoteState("idle"); setQuoteRefresh((value) => value + 1); return; }
    setAppliedCoupon(code);
    setQuote(null);
    setQuoteState("idle");
    setQuoteRefresh((value) => value + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!lines.length) { setError("Your cart is empty."); return; }
    if (!enabledProviders.includes(provider)) { setError("This payment option is not configured yet."); return; }
    if (!quote || quoteState !== "ready" || quote.coupon_error) { setError(quote?.coupon_error || quoteError || "Check the delivery PIN and order total before continuing."); return; }

    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_provider: provider,
          lines: quoteLines,
          address,
          saved_address_id: selectedAddressId,
          coupon_code: appliedCoupon,
          expected_total: quote.total,
        }),
      });
      const result = await response.json() as CheckoutResult & { error?: string };
      if (!response.ok) {
        if (response.status === 409) { setQuote(null); setQuoteState("idle"); setQuoteRefresh((value) => value + 1); }
        throw new Error(result.error || "Checkout could not be started.");
      }
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
            router.replace(`/checkout/confirmed?order_id=${encodeURIComponent(result.orderId)}${verify.ok ? "" : "&payment=pending"}`);
          } catch {
            clear(); router.replace(`/checkout/confirmed?order_id=${encodeURIComponent(result.orderId)}&payment=pending`);
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

  const quotedItems = new Map<string, Quote["items"][number]>((quote?.items ?? []).map((item) => [item.product_id, item] as const));
  const canPay = quoteState === "ready" && Boolean(quote) && !quote?.coupon_error && enabledProviders.length > 0 && !busy;

  return <div className="wrap checkout-page">
    <div className="checkout-heading"><div><span className="section-kicker">ALMOST THERE</span><h1>Checkout</h1><p>Choose a saved address or enter a New Delhi delivery address.</p></div><div className="checkout-steps" aria-label="Checkout steps"><span className="is-current"><i>1</i> Delivery</span><b aria-hidden="true"/><span><i>2</i> Payment</span></div></div>
    {error ? <div className="error checkout-error" role="alert">{error}</div> : null}
    <div className="checkout-layout">
      <form className="checkout-form panel" onSubmit={submit} data-navigation-feedback="false">
        <section className="checkout-form-section">
          <div className="checkout-section-title"><span className="checkout-section-icon"><MapPin size={19}/></span><div><h2>Delivery address</h2><p>Your saved details are ready to use at checkout.</p></div></div>
          {addressLoadError ? <p className="notice checkout-address-notice" role="status">Saved addresses couldn’t be loaded. You can enter the delivery address below.</p> : null}
          {addresses.length ? <div className="checkout-address-list" role="radiogroup" aria-label="Choose a saved delivery address">
            {addresses.map((saved) => <label className={`checkout-address-option${selectedAddressId === saved.id ? " is-selected" : ""}`} key={saved.id}>
              <input type="radio" name="saved_address_choice" checked={selectedAddressId === saved.id} onChange={() => selectSavedAddress(saved)}/>
              <span className="checkout-address-radio" aria-hidden="true">{selectedAddressId === saved.id ? <Check size={13}/> : null}</span>
              <span className="checkout-address-copy"><strong>{saved.recipient_name}{saved.is_default ? <em>Default</em> : null}</strong><small>{saved.phone}</small><span>{saved.address_line1}{saved.address_line2 ? `, ${saved.address_line2}` : ""}, {saved.locality}, {saved.city} · {saved.postal_code}</span>{saved.landmark ? <small>Landmark: {saved.landmark}</small> : null}</span>
            </label>)}
            <button type="button" className={`checkout-new-address${selectedAddressId === null ? " is-selected" : ""}`} onClick={startNewAddress}><Plus size={17}/><span>Enter a different address</span></button>
          </div> : null}
          <div className="form-grid checkout-fields">
            <Field name="recipient_name" label="Full name" autoComplete="name" value={address.recipient_name} onChange={(value) => updateAddress("recipient_name", value)} required/>
            <Field name="phone" label="Phone number · required for delivery" type="tel" autoComplete="tel" inputMode="tel" pattern="[+]91[ -]?[6-9][0-9]{9}|[6-9][0-9]{9}" maxLength={14} value={address.phone} onChange={(value) => updateAddress("phone", value)} required/>
            <Field name="address_line1" label="Flat, house no. and building" autoComplete="address-line1" value={address.address_line1} onChange={(value) => updateAddress("address_line1", value)} required/>
            <Field name="address_line2" label="Street and area (optional)" autoComplete="address-line2" value={address.address_line2} onChange={(value) => updateAddress("address_line2", value)}/>
            <Field name="locality" label="Locality" autoComplete="address-level3" value={address.locality} onChange={(value) => updateAddress("locality", value)} required/>
            <Field name="landmark" label="Landmark (optional)" value={address.landmark} onChange={(value) => updateAddress("landmark", value)}/>
            <Field name="city" label="City" autoComplete="address-level2" value={address.city} onChange={(value) => updateAddress("city", value)} readOnly required/>
            <Field name="state" label="State / UT" autoComplete="address-level1" value={address.state} onChange={(value) => updateAddress("state", value)} readOnly required/>
            <Field name="postal_code" label="Delhi PIN code" inputMode="numeric" pattern="110[0-9]{3}" maxLength={6} autoComplete="postal-code" value={address.postal_code} onChange={(value) => updateAddress("postal_code", value.replace(/\D/g, "").slice(0, 6))} required/>
          </div>
          <label className="field checkout-email"><span>Order updates will be sent to</span><input value={email} readOnly aria-label="Email for order updates"/></label>
          <div className="checkout-coupon-row">
            <label className="field checkout-coupon"><span>Coupon code <small>Optional</small></span><input value={couponInput} onChange={(event) => { setCouponInput(event.target.value.toUpperCase()); if (appliedCoupon) { setAppliedCoupon(""); setQuote(null); setQuoteState("idle"); } }} maxLength={64} autoCapitalize="characters" placeholder="Enter a coupon code"/></label>
            <button className="btn btn-outline checkout-coupon-button" type="button" onClick={applyCoupon} disabled={quoteState === "loading"}>{appliedCoupon && quote?.discount ? <><Check size={16}/> Applied</> : <><Tag size={16}/> Apply code</>}</button>
          </div>
          {quote?.coupon_error ? <p className="checkout-coupon-message is-error" role="alert">{quote.coupon_error}</p> : appliedCoupon && quote?.discount ? <p className="checkout-coupon-message"><Check size={14}/> {appliedCoupon} applied · you save {money(quote.discount)}</p> : null}
        </section>
        <section className="checkout-form-section checkout-payment-section">
          <div className="checkout-section-title"><span className="checkout-section-icon"><LockKeyhole size={19}/></span><div><h2>Secure payment</h2><p>Choose a payment provider; the final total is verified by BlitzKart before charging.</p></div></div>
          <div className="payment-provider-options">
            {enabledProviders.includes("razorpay") ? <label className={`payment-provider-option${provider === "razorpay" ? " is-selected" : ""}`}>
              <input type="radio" name="payment_provider" value="razorpay" checked={provider === "razorpay"} onChange={() => setProvider("razorpay")}/>
              <span className="payment-provider-mark payment-provider-razorpay">R</span>
              <span className="payment-provider-copy"><strong>Razorpay</strong><small>UPI, cards and netbanking</small></span>
              <span className="payment-provider-safe"><ShieldCheck size={16}/> Secure</span>
            </label> : <div className="payment-provider-option is-unavailable" aria-disabled="true">
              <span className="payment-provider-mark payment-provider-razorpay">R</span>
              <span className="payment-provider-copy"><strong>Razorpay</strong><small>{razorpaySetupHint}</small></span>
              <span className="payment-provider-status">Setup needed</span>
            </div>}
            {enabledProviders.includes("payu") ? <label className={`payment-provider-option${provider === "payu" ? " is-selected" : ""}`}>
              <input type="radio" name="payment_provider" value="payu" checked={provider === "payu"} onChange={() => setProvider("payu")}/>
              <span className="payment-provider-mark payment-provider-payu">P</span>
              <span className="payment-provider-copy"><strong>PayU</strong><small>UPI, cards and netbanking</small></span>
              <span className="payment-provider-safe"><ShieldCheck size={16}/> Secure</span>
            </label> : null}
          </div>
          {!enabledProviders.length ? <p className="notice">Online payment isn’t configured yet. Add a provider’s server credentials in Vercel to accept payments.</p> : null}
          <p className="checkout-payment-note">Your order is confirmed only after the provider verifies the captured payment. Payment status is checked separately from delivery status.</p>
        </section>
        <button className="btn checkout-pay-button" type="submit" disabled={!canPay} aria-busy={busy || quoteState === "loading"}>
          <span className="checkout-pay-icon">{busy || quoteState === "loading" ? <LoaderCircle size={20} className="spin" aria-hidden="true"/> : <LockKeyhole size={19} aria-hidden="true"/>}</span>
          <span className="checkout-pay-copy"><strong>{busy ? "Opening secure checkout…" : quoteState === "loading" ? "Updating your total…" : quote ? `Pay ${money(quote.total)}` : "Check delivery to continue"}</strong><small>{busy ? "Please keep this page open" : enabledProviders.length ? "Continue to secure payment" : "Payment provider not configured"}</small></span>
          {!busy && quoteState !== "loading" ? <ArrowRight size={19} aria-hidden="true"/> : null}
        </button>
        <p className="checkout-secure-note"><ShieldCheck size={15}/> Payment credentials stay on BlitzKart’s server.</p>
      </form>
      <aside className="checkout-summary panel" aria-live="polite">
        <div className="checkout-summary-heading"><div><span className="section-kicker">YOUR ORDER</span><h2>Order summary</h2></div><PackageCheck size={22}/></div>
        <div className="checkout-item-list">{lines.map(({ product, quantity }) => {
          const item = quotedItems.get(product.id);
          return <div className="checkout-item" key={product.id}><div className="checkout-item-image">{product.product_images?.[0] ? <img src={product.product_images[0].image_url} alt=""/> : <span>—</span>}<small>{quantity}</small></div><span>{item?.name ?? product.name}<small className="checkout-unit-price">{money(item?.unit_price ?? Number(product.selling_price))} each</small></span><strong>{money(item?.line_total ?? Number(product.selling_price) * quantity)}</strong></div>;
        })}</div>
        <div className="checkout-charge-list">
          <div><span>Items subtotal</span><strong>{quote ? money(quote.subtotal) : "—"}</strong></div>
          {quote?.discount ? <div className="checkout-discount-row"><span>Coupon discount</span><strong>−{money(quote.discount)}</strong></div> : appliedCoupon && quoteState === "loading" ? <div><span>Coupon</span><strong>Checking…</strong></div> : null}
          <div><span>Delivery charge</span><strong>{quote ? money(quote.delivery_charge) : quoteState === "loading" ? "Checking…" : "Add a valid PIN"}</strong></div>
        </div>
        <div className="checkout-summary-total"><span>Total to pay</span><strong>{quote ? money(quote.total) : "—"}</strong></div>
        {quoteError ? <p className="checkout-summary-note is-error" role="status">{quoteError}</p> : quoteState === "idle" ? <p className="checkout-summary-note">Enter or select a serviceable Delhi PIN code to see the current delivery charge and total.</p> : <p className="checkout-summary-note">Product prices include applicable taxes. Delivery and coupon savings come from current store records and are checked again before payment.</p>}
      </aside>
    </div>
  </div>;
}

function Field({ name, label, type = "text", autoComplete, inputMode, pattern, value, onChange, readOnly = false, maxLength, required = false }: {
  name: keyof AddressForm;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "numeric";
  pattern?: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  return <label className="field"><span>{label}{required ? <i aria-hidden="true"> *</i> : null}</span><input name={name} type={type} autoComplete={autoComplete} inputMode={inputMode} pattern={pattern} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} required={required} maxLength={maxLength ?? (name === "address_line1" ? 200 : 100)}/></label>;
}
