"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { updateCheckoutFeeAction } from "@/lib/actions/admin";
import { money } from "@/lib/types";
import type { CheckoutFeeSettings } from "@/lib/checkout-fees";

const feeDefinitions = [
  { key: "packaging", title: "Packaging fee", description: "Packaging and order materials." },
  { key: "platform", title: "Platform fee", description: "Helps maintain the BlitzKart shopping platform." },
  { key: "handling", title: "Handling fee", description: "Order preparation and processing." },
] as const;

type Settings = CheckoutFeeSettings;

export function CheckoutFeeSettingsPanel({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const update = (key: "packaging" | "platform" | "handling", field: "enabled" | "amount", value: boolean | number) => {
    setSettings((current) => ({ ...current, [`${key}_${field}`]: value }));
  };
  const totalFees = (settings.packaging_enabled ? settings.packaging_amount : 0)
    + (settings.platform_enabled ? settings.platform_amount : 0)
    + (settings.handling_enabled ? settings.handling_amount : 0);

  return <>
    <div className="checkout-fee-settings-grid">
      {feeDefinitions.map(({ key, title, description }) => {
        const enabledKey = `${key}_enabled` as const;
        const amountKey = `${key}_amount` as const;
        return <form action={updateCheckoutFeeAction} className="panel checkout-fee-card" key={key}>
          <input type="hidden" name="fee_type" value={key}/>
          <div className="checkout-fee-card-heading"><span className="checkout-fee-icon"><ReceiptText size={20}/></span><div><h2>{title}</h2><p>{description}</p></div></div>
          <label className="checkout-fee-toggle"><input name="enabled" type="checkbox" checked={settings[enabledKey]} onChange={(event) => update(key, "enabled", event.target.checked)}/><span><strong>{settings[enabledKey] ? "Enabled for new checkouts" : "Disabled"}</strong><small>Existing orders keep their saved fee values.</small></span></label>
          <label className="field"><span>Amount per order (₹)</span><input name="amount" type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" required value={settings[amountKey]} onChange={(event) => update(key, "amount", event.currentTarget.value === "" ? 0 : Number(event.currentTarget.value))}/></label>
          <button className="btn">Save {title.toLowerCase()}</button>
        </form>;
      })}
    </div>
    <section className="panel checkout-fee-preview" aria-live="polite">
      <div><span className="section-kicker">LIVE CONFIGURATION PREVIEW</span><h2>Checkout fee breakdown</h2><p>These values will appear as separate lines in new checkout quotes. Disabled and zero-value fees display as FREE.</p></div>
      <div className="checkout-fee-preview-lines">
        {feeDefinitions.map(({ key, title }) => {
          const amount = settings[`${key}_enabled` as const] ? settings[`${key}_amount` as const] : 0;
          return <div key={key}><span>{title}</span><strong>{amount > 0 ? money(amount) : "FREE"}</strong></div>;
        })}
        <div className="checkout-fee-preview-total"><span>Fees from these settings</span><strong>{totalFees > 0 ? money(totalFees) : "FREE"}</strong></div>
      </div>
      <small>Item subtotal, coupons, product-specific charges, and the selected PIN code’s delivery charge are calculated from the order and current store records.</small>
    </section>
  </>;
}
