"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, MapPin } from "lucide-react";

type Location = { postal_code: string; city: string; locality: string; delivery_charge: number; estimated_delivery_minutes: number | null };
type Lookup = { known?: boolean; available?: boolean; postal_code?: string; locality?: string; locality_options?: string[]; district?: string; state?: string; delivery_charge?: number; minimum_order_amount?: number; estimated_delivery_minutes?: number | null; error?: string };

export function LocationSelector() {
  const [location, setLocation] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  const [postal, setPostal] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [locality, setLocality] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("blitzkart-location");
      if (saved) {
        const parsed = JSON.parse(saved) as Location;
        if (parsed.city !== "New Delhi" || !/^\d{6}$/.test(parsed.postal_code) || typeof parsed.locality !== "string") { localStorage.removeItem("blitzkart-location"); return; }
        setLocation(parsed);
        setPostal(parsed.postal_code);
      }
    } catch { localStorage.removeItem("blitzkart-location"); }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLookup(null);
    setBusy(true);
    try {
      const response = await fetch("/api/delivery-availability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postal_code: postal.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check this PIN code.");
      const result = data as Lookup;
      setLookup(result);
      if (!result.known) {
        setLocation(null);
        localStorage.removeItem("blitzkart-location");
        setMessage(result.error || "Sorry! BlitzKart is not available in your area yet.");
        return;
      }
      setLocality(result.locality_options?.includes(locality) ? locality : result.locality || "");
      if (!result.available) {
        setLocation(null);
        localStorage.removeItem("blitzkart-location");
        setMessage(result.error || "Sorry! BlitzKart is not available in your area yet.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check this PIN code.");
    } finally { setBusy(false); }
  }

  function confirmLocation() {
    if (!lookup?.available || !lookup.postal_code || !locality) return;
    const value: Location = { postal_code: lookup.postal_code, city: "New Delhi", locality, delivery_charge: Number(lookup.delivery_charge), estimated_delivery_minutes: lookup.estimated_delivery_minutes ?? null };
    setLocation(value);
    localStorage.setItem("blitzkart-location", JSON.stringify(value));
    setOpen(false);
    setMessage("");
    setLookup(null);
  }

  return <div className="location">
    <MapPin className="location-mobile-pin" size={17} aria-hidden="true"/>
    <span>DELIVER TO</span>
    <strong>{location ? `${location.locality} · ${location.postal_code}` : "Choose your location"}</strong>
    <button className="location-trigger" type="button" aria-label={location ? "Change delivery location" : "Check delivery availability"} onClick={() => { setOpen((value) => !value); setMessage(""); }} aria-expanded={open} aria-controls="location-form">
      <ChevronDown size={16}/><span className="location-trigger-label">{location ? "Change location" : "Check availability"}</span>
    </button>
    {open ? <div className="location-popover" id="location-form" data-navigation-feedback="false">
      <form onSubmit={submit}><label htmlFor="location-pin">Enter your six-digit PIN code</label>
        <div><input id="location-pin" value={postal} onChange={(event) => { setPostal(event.target.value.replace(/\D/g, "").slice(0, 6)); setLookup(null); setMessage(""); }} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" required/><button className="btn btn-small" disabled={busy}>{busy ? <><LoaderCircle size={14} className="spin"/> Checking</> : "Check"}</button></div>
      </form>
      {lookup?.known ? <div className="location-lookup-result"><p><strong>{lookup.district}, {lookup.state}</strong><span>{lookup.available ? "Delivery is available for this PIN code." : "Sorry! BlitzKart is not available in your area yet."}</span></p>
        {lookup.locality_options && lookup.locality_options.length > 1 ? <label className="field"><span>Select postal locality</span><select value={locality} onChange={(event) => setLocality(event.target.value)}>{lookup.locality_options.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : <p className="location-locality">{lookup.locality}</p>}
        {lookup.available ? <><p className="location-charge">Delivery fee: ₹{Number(lookup.delivery_charge).toFixed(2)}{lookup.estimated_delivery_minutes ? ` · Estimated ${lookup.estimated_delivery_minutes} minutes` : " · Delivery estimate not configured"}{lookup.minimum_order_amount ? ` · Minimum order ₹${Number(lookup.minimum_order_amount).toFixed(2)}` : ""}</p><button className="btn btn-small" type="button" onClick={confirmLocation}>Confirm location</button></> : null}
      </div> : null}
      {message ? <small className="location-message" role="status">{message}</small> : null}
    </div> : null}
  </div>;
}
