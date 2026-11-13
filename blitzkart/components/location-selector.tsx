"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, MapPin } from "lucide-react";

type Location = { postal_code: string; city: string; delivery_charge: number };

export function LocationSelector() {
  const [location, setLocation] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  const [postal, setPostal] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("blitzkart-location");
      if (saved) {
        const parsed = JSON.parse(saved) as Location;
        if (parsed.city !== "New Delhi" || !/^110\d{3}$/.test(parsed.postal_code)) { localStorage.removeItem("blitzkart-location"); return; }
        setLocation(parsed);
        setPostal(parsed.postal_code);
      }
    } catch { localStorage.removeItem("blitzkart-location"); }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/delivery-availability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postal_code: postal.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check this PIN code.");
      if (!data.available) {
        setLocation(null);
        localStorage.removeItem("blitzkart-location");
        setMessage("We currently deliver only to New Delhi PIN codes configured for service.");
        return;
      }
      const value: Location = { postal_code: data.postal_code, city: data.city, delivery_charge: Number(data.delivery_charge) };
      setLocation(value);
      localStorage.setItem("blitzkart-location", JSON.stringify(value));
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check this PIN code.");
    } finally { setBusy(false); }
  }

  return <div className="location">
    <MapPin className="location-mobile-pin" size={17} aria-hidden="true"/>
    <span>DELIVER TO</span>
    <strong>{location ? `${location.city} · ${location.postal_code}` : "Choose your location"}</strong>
    <button className="location-trigger" type="button" aria-label={location ? "Change delivery location" : "Check delivery availability"} onClick={() => { setOpen((value) => !value); setMessage(""); }} aria-expanded={open} aria-controls="location-form">
      <ChevronDown size={16}/><span className="location-trigger-label">{location ? "Change location" : "Check availability"}</span>
    </button>
    {open ? <form className="location-popover" id="location-form" onSubmit={submit} data-navigation-feedback="false">
      <label htmlFor="location-pin">Enter your six-digit Delhi PIN code</label>
      <div><input id="location-pin" value={postal} onChange={(event) => setPostal(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="110[0-9]{3}" maxLength={6} autoComplete="postal-code" required/><button className="btn btn-small" disabled={busy}>{busy ? <><LoaderCircle size={14} className="spin"/> Checking</> : "Check"}</button></div>
      {message ? <small role="status">{message}</small> : null}
    </form> : null}
  </div>;
}
