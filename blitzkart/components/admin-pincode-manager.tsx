"use client";

import { useMemo, useState } from "react";
import { bulkUpdateDeliveryPincodesAction, importDeliveryPincodeSettingsAction, updateDeliveryPincodeAction } from "@/lib/actions/admin";
import { Check, Download, Search, Upload, Zap, Truck } from "lucide-react";

export type DeliveryPincode = {
  id: string; postal_code: string; locality: string; district: string; state: string;
  locality_aliases: string[]; delivery_charge: number; minimum_order_amount: number;
  estimated_delivery_minutes: number | null; is_active: boolean; is_directory_verified: boolean;
  blitz_enabled: boolean; standard_enabled: boolean; blitz_price: number; standard_price: number;
  blitz_eta: string; standard_eta: string; updated_at: string;
};

function csvEscape(value: string | number | boolean) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function AdminPincodeManager({ pincodes }: { pincodes: DeliveryPincode[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return pincodes.filter((pin) => {
      const matchesFilter = filter === "all" || (filter === "serviceable" ? pin.is_active && (pin.blitz_enabled || pin.standard_enabled)
        : filter === "disabled" ? !pin.is_active || (!pin.blitz_enabled && !pin.standard_enabled)
          : filter === "blitz" ? pin.is_active && pin.blitz_enabled
            : filter === "standard" ? pin.is_active && pin.standard_enabled : false);
      return matchesFilter && (!query || `${pin.postal_code} ${pin.locality} ${pin.locality_aliases.join(" ")}`.toLocaleLowerCase().includes(query));
    });
  }, [filter, pincodes, search]);
  const allVisibleSelected = visible.length > 0 && visible.every((pin) => selected.includes(pin.id));
  const blitzCount = pincodes.filter((pin) => pin.is_active && pin.blitz_enabled).length;
  const standardCount = pincodes.filter((pin) => pin.is_active && pin.standard_enabled).length;
  const unavailableCount = pincodes.filter((pin) => !pin.is_active || (!pin.blitz_enabled && !pin.standard_enabled)).length;

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleVisible() {
    setSelected((current) => allVisibleSelected ? current.filter((id) => !visible.some((pin) => pin.id === id)) : [...new Set([...current, ...visible.map((pin) => pin.id)])]);
  }
  function exportCsv() {
    const fields = ["postal_code", "is_active", "blitz_enabled", "standard_enabled", "blitz_price", "standard_price", "blitz_eta", "standard_eta", "minimum_order_amount"] as const;
    const rows = [fields.join(","), ...pincodes.map((pin) => fields.map((field) => csvEscape(pin[field])).join(","))];
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "blitzkart-delivery-settings.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <section className="pincode-manager panel">
    <header className="pincode-manager-heading"><div><span className="section-kicker">VERIFIED DELHI DIRECTORY</span><h2>{pincodes.length} assigned PIN codes</h2><p>Each delivery method is controlled independently. Disabled codes and methods stay unavailable at checkout.</p></div></header>
    <div className="delivery-zone-metrics" aria-label="Current delivery configuration"><span><Zap size={17}/><strong>{blitzCount}</strong><small>Blitz-enabled</small></span><span><Truck size={18}/><strong>{standardCount}</strong><small>Standard-enabled</small></span><span><span className="delivery-metric-dot"/><strong>{unavailableCount}</strong><small>Unavailable</small></span></div>
    <div className="pincode-tools">
      <label className="pincode-search"><Search size={17}/><span className="sr-only">Search by PIN or locality</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PIN code or locality"/></label>
      <label className="field pincode-status-filter"><span className="sr-only">Filter delivery mode availability</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All PIN codes</option><option value="serviceable">Any delivery enabled</option><option value="blitz">Blitz enabled</option><option value="standard">Standard enabled</option><option value="disabled">Unavailable</option></select></label>
      <button type="button" className="btn btn-outline btn-small" onClick={toggleVisible}>{allVisibleSelected ? "Clear visible" : "Select visible"}</button>
      <form action={bulkUpdateDeliveryPincodesAction} className="pincode-bulk-form">
        {selected.map((id) => <input type="hidden" name="pincode_id" value={id} key={id}/>)}
        <select name="delivery_field" aria-label="Delivery setting to bulk update" defaultValue="blitz_enabled"><option value="blitz_enabled">Blitz Delivery</option><option value="standard_enabled">Standard Delivery</option><option value="is_active">PIN serviceability</option></select>
        <select name="enabled" aria-label="Bulk delivery availability action" defaultValue="true"><option value="true">Enable selected</option><option value="false">Disable selected</option></select>
        <button className="btn btn-small" disabled={!selected.length}>Apply to {selected.length}</button>
      </form>
      <button type="button" className="btn btn-outline btn-small" onClick={exportCsv}><Download size={15}/> Export CSV</button>
      <form action={importDeliveryPincodeSettingsAction} className="pincode-import-form"><label className="btn btn-outline btn-small"><Upload size={15}/> Import settings<input type="file" name="pincode_csv" accept=".csv,text/csv" required/></label><button className="btn btn-outline btn-small">Upload CSV</button></form>
    </div>
    <p className="muted pincode-directory-note">CSV imports update verified PIN settings only. They cannot create postal records or enable unverified PINs. Configure each method’s fee and estimate before turning it on.</p>
    {visible.length ? <div className="table-wrap pincode-table-wrap"><table className="pincode-table pincode-dual-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible PIN codes" checked={allVisibleSelected} onChange={toggleVisible}/></th><th>PIN / postal area</th><th>Locality aliases</th><th>Blitz Delivery</th><th>Standard Delivery</th><th>Minimum order</th><th>PIN active</th><th></th></tr></thead><tbody>{visible.map((pin) => <tr key={`${pin.id}-${pin.updated_at}`}>
      <td><input type="checkbox" aria-label={`Select ${pin.postal_code}`} checked={selected.includes(pin.id)} onChange={() => toggleSelected(pin.id)}/></td>
      <td><strong>{pin.postal_code}</strong><small>{pin.locality}</small><small>{pin.district}, {pin.state}</small></td>
      <td colSpan={6}><form action={updateDeliveryPincodeAction} className="pincode-row-form pincode-dual-row-form">
        <input type="hidden" name="pincode_id" value={pin.id}/><input type="hidden" name="delivery_charge" value={pin.delivery_charge}/>
        <label className="sr-only" htmlFor={`aliases-${pin.id}`}>Aliases for {pin.postal_code}</label><input id={`aliases-${pin.id}`} name="locality_aliases" defaultValue={pin.locality_aliases.join(", ")} placeholder="Postal locality aliases"/>
        <div className="pincode-delivery-method-fields">
          <label className="pincode-method-switch"><input type="checkbox" name="blitz_enabled" defaultChecked={pin.blitz_enabled}/><span><Zap size={14}/> Blitz</span></label>
          <label className="pincode-money-field"><span>₹</span><input name="blitz_price" type="number" min="0" step="0.01" defaultValue={pin.blitz_price} required aria-label={`${pin.postal_code} Blitz delivery charge`}/></label>
          <input name="blitz_eta" maxLength={80} defaultValue={pin.blitz_eta} aria-label={`${pin.postal_code} Blitz delivery estimate`} placeholder="Same Day"/>
        </div>
        <div className="pincode-delivery-method-fields">
          <label className="pincode-method-switch"><input type="checkbox" name="standard_enabled" defaultChecked={pin.standard_enabled}/><span><Truck size={14}/> Standard</span></label>
          <label className="pincode-money-field"><span>₹</span><input name="standard_price" type="number" min="0" step="0.01" defaultValue={pin.standard_price} required aria-label={`${pin.postal_code} Standard delivery charge`}/></label>
          <input name="standard_eta" maxLength={80} defaultValue={pin.standard_eta} aria-label={`${pin.postal_code} Standard delivery estimate`} placeholder="2–4 Days"/>
        </div>
        <label className="pincode-money-field"><span>₹</span><input name="minimum_order_amount" type="number" min="0" step="0.01" defaultValue={pin.minimum_order_amount} required aria-label={`${pin.postal_code} minimum order amount`}/></label>
        <label className="pincode-service-toggle"><input type="checkbox" name="is_active" defaultChecked={pin.is_active}/><span>{pin.is_active ? "Active" : "Disabled"}</span></label>
        <button className="btn btn-outline btn-small" aria-label={`Save ${pin.postal_code}`}><Check size={15}/> Save</button>
      </form></td>
    </tr>)}</tbody></table></div> : <div className="account-section-empty"><strong>No matching PIN codes</strong><span>Try a different PIN code, locality or delivery availability filter.</span></div>}
  </section>;
}
