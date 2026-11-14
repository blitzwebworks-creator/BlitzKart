"use client";

import { useMemo, useState } from "react";
import { bulkUpdateDeliveryPincodesAction, updateDeliveryPincodeAction } from "@/lib/actions/admin";
import { Check, Search } from "lucide-react";

export type DeliveryPincode = {
  id: string;
  postal_code: string;
  locality: string;
  district: string;
  state: string;
  locality_aliases: string[];
  delivery_charge: number;
  minimum_order_amount: number;
  estimated_delivery_minutes: number | null;
  is_active: boolean;
  is_directory_verified: boolean;
};

export function AdminPincodeManager({ pincodes }: { pincodes: DeliveryPincode[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return pincodes.filter((pin) => (filter === "all" || String(pin.is_active) === filter)
      && (!query || `${pin.postal_code} ${pin.locality} ${pin.locality_aliases.join(" ")}`.toLocaleLowerCase().includes(query)));
  }, [filter, pincodes, search]);
  const allVisibleSelected = visible.length > 0 && visible.every((pin) => selected.includes(pin.id));

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleVisible() {
    setSelected((current) => allVisibleSelected
      ? current.filter((id) => !visible.some((pin) => pin.id === id))
      : [...new Set([...current, ...visible.map((pin) => pin.id)])]);
  }

  return <section className="pincode-manager panel">
    <header className="pincode-manager-heading"><div><span className="section-kicker">VERIFIED DIRECTORY</span><h2>{pincodes.length} Delhi PIN codes</h2><p>Each code starts disabled. Enable only areas that BlitzKart can currently serve.</p></div><span className="pincode-count"><strong>{pincodes.filter((pin) => pin.is_active).length}</strong><small>Serviceable</small></span></header>
    <div className="pincode-tools">
      <label className="pincode-search"><Search size={17}/><span className="sr-only">Search by PIN or locality</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PIN code or locality"/></label>
      <label className="field pincode-status-filter"><span className="sr-only">Filter serviceability</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All PIN codes</option><option value="true">Serviceable</option><option value="false">Not serviceable</option></select></label>
      <button type="button" className="btn btn-outline btn-small" onClick={toggleVisible}>{allVisibleSelected ? "Clear visible" : "Select visible"}</button>
      <form action={bulkUpdateDeliveryPincodesAction} className="pincode-bulk-form">
        {selected.map((id) => <input type="hidden" name="pincode_id" value={id} key={id}/>)}
        <select name="is_active" aria-label="Bulk serviceability action" defaultValue="true"><option value="true">Enable selected</option><option value="false">Disable selected</option></select>
        <button className="btn btn-small" disabled={!selected.length}>Apply to {selected.length}</button>
      </form>
    </div>
    <p className="muted pincode-directory-note">Search uses the primary locality and the aliases entered for that postal PIN. Delivery estimates are shown only when an administrator has configured them.</p>
    {visible.length ? <div className="table-wrap pincode-table-wrap"><table className="pincode-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible PIN codes" checked={allVisibleSelected} onChange={toggleVisible}/></th><th>PIN / Postal area</th><th>Aliases · comma separated</th><th>Delivery fee</th><th>Minimum order</th><th>Estimate · mins</th><th>Service</th><th></th></tr></thead><tbody>{visible.map((pin) => <tr key={pin.id}>
      <td><input type="checkbox" aria-label={`Select ${pin.postal_code}`} checked={selected.includes(pin.id)} onChange={() => toggleSelected(pin.id)}/></td>
      <td><strong>{pin.postal_code}</strong><small>{pin.locality}</small><small>{pin.district}, {pin.state}</small></td>
      <td colSpan={6}><form action={updateDeliveryPincodeAction} className="pincode-row-form">
        <input type="hidden" name="pincode_id" value={pin.id}/>
        <label className="sr-only" htmlFor={`aliases-${pin.id}`}>Aliases for {pin.postal_code}</label><input id={`aliases-${pin.id}`} name="locality_aliases" defaultValue={pin.locality_aliases.join(", ")} placeholder="Add locality aliases"/>
        <label className="pincode-money-field"><span>₹</span><input name="delivery_charge" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={pin.delivery_charge} required aria-label="Delivery charge in rupees"/></label>
        <label className="pincode-money-field"><span>₹</span><input name="minimum_order_amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={pin.minimum_order_amount} required aria-label="Minimum order amount in rupees"/></label>
        <input name="estimated_delivery_minutes" type="number" min="1" max="10080" step="1" defaultValue={pin.estimated_delivery_minutes ?? ""} placeholder="Not set" aria-label="Estimated delivery minutes"/>
        <label className="pincode-service-toggle"><input type="checkbox" name="is_active" defaultChecked={pin.is_active}/><span>{pin.is_active ? "Serviceable" : "Disabled"}</span></label>
        <button className="btn btn-outline btn-small" aria-label={`Save ${pin.postal_code}`}><Check size={15}/> Save</button>
      </form></td>
    </tr>)}</tbody></table></div> : <div className="account-section-empty"><strong>No matching PIN codes</strong><span>Try a different PIN code, locality or serviceability filter.</span></div>}
  </section>;
}
