"use client";

import { useState, type FormEvent } from "react";
import { Check, MapPin } from "lucide-react";
import { money } from "@/lib/types";

type CheckResult = { available?: boolean; postal_code?: string; city?: string; delivery_charge?: number; product_delivery_charge?: number; error?: string };

export function ProductDeliveryChecker({ productId }: { productId: string }) {
  const [postalCode, setPostalCode] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/delivery-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postal_code: postalCode.trim(), product_id: productId }),
      });
      const body = await response.json() as CheckResult;
      setResult(response.ok ? body : { error: body.error || "Delivery availability could not be checked." });
    } catch {
      setResult({ error: "Delivery availability could not be checked. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return <section className="product-delivery-checker" aria-label="Check delivery availability">
    <div className="product-delivery-checker-title"><span><MapPin size={18}/></span><div><strong>Check delivery</strong><small>Availability and charge from your PIN code</small></div></div>
    <form onSubmit={check} className="product-pin-form">
      <label className="sr-only" htmlFor="product-delivery-pin">Six-digit PIN code</label>
      <input id="product-delivery-pin" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} minLength={6} required disabled={loading} value={postalCode} onChange={(event) => { setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setResult(null); }} placeholder="Enter 6-digit PIN code"/>
      <button type="submit" disabled={loading || postalCode.length !== 6}>{loading ? "Checking…" : "Check"}</button>
    </form>
    {result?.available ? <p className="product-pin-result is-available"><Check size={15}/> Available in {result.city} · {money(result.delivery_charge)} PIN delivery{result.product_delivery_charge ? ` + ${money(result.product_delivery_charge)} for this product per item` : ""}</p> : result?.error ? <p className="product-pin-result is-error" role="alert">{result.error}</p> : result && <p className="product-pin-result is-error" role="status">This PIN code is not currently serviceable.</p>}
  </section>;
}
