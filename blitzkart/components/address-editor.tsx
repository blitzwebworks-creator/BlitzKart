"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { createAddressAction, updateAddressAction } from "@/lib/actions/auth";

export type CustomerAddress = {
  id: string; recipient_name: string; phone: string; address_line1: string; address_line2: string | null;
  locality: string; city: string; state: string; postal_code: string; landmark: string | null; is_default: boolean;
};

export function AddressEditor({ address }: { address?: CustomerAddress }) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(address);
  return <div className={`address-editor${open ? " is-open" : ""}`}>
    <button className={editing ? "address-edit-button" : "btn"} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {open ? <X size={15}/> : editing ? <Pencil size={14}/> : <Plus size={16}/>}
      {open ? "Close" : editing ? "Edit address" : "Add an address"}
    </button>
    {open ? <form className="address-editor-form" action={address ? updateAddressAction : createAddressAction}>
      {address ? <input type="hidden" name="address_id" value={address.id}/> : null}
      <div className="address-editor-title"><strong>{editing ? "Update address details" : "Add a delivery address"}</strong><p>Use the address where you usually receive orders.</p></div>
      <div className="form-grid address-fields">
        <AddressField id={`${address?.id ?? "new"}-recipient`} name="recipient_name" label="Full name" defaultValue={address?.recipient_name} required autoComplete="name"/>
        <AddressField id={`${address?.id ?? "new"}-phone`} name="phone" label="Phone number" defaultValue={address?.phone} required type="tel" autoComplete="tel"/>
        <AddressField id={`${address?.id ?? "new"}-line1`} name="address_line1" label="Flat, house no. and building" defaultValue={address?.address_line1} required maxLength={200} autoComplete="address-line1"/>
        <AddressField id={`${address?.id ?? "new"}-line2`} name="address_line2" label="Street and area (optional)" defaultValue={address?.address_line2 ?? ""} maxLength={200} autoComplete="address-line2"/>
        <AddressField id={`${address?.id ?? "new"}-locality`} name="locality" label="Locality" defaultValue={address?.locality} required autoComplete="address-level3"/>
        <AddressField id={`${address?.id ?? "new"}-landmark`} name="landmark" label="Landmark (optional)" defaultValue={address?.landmark ?? ""} maxLength={100}/>
        <AddressField id={`${address?.id ?? "new"}-city`} name="city" label="City" defaultValue={address?.city} required autoComplete="address-level2"/>
        <AddressField id={`${address?.id ?? "new"}-state`} name="state" label="State" defaultValue={address?.state} required autoComplete="address-level1"/>
        <label className="field" htmlFor={`${address?.id ?? "new"}-postal`}><span>PIN code</span><input id={`${address?.id ?? "new"}-postal`} name="postal_code" defaultValue={address?.postal_code} required pattern="[0-9]{6}" inputMode="numeric" autoComplete="postal-code" maxLength={6}/></label>
      </div>
      <button className="btn address-save-button" type="submit">{editing ? "Save address" : "Add address"}</button>
    </form> : null}
  </div>;
}

function AddressField({ id, name, label, defaultValue, type = "text", required = false, maxLength = 100, autoComplete }: {
  id: string; name: string; label: string; defaultValue?: string | null; type?: string; required?: boolean; maxLength?: number; autoComplete?: string;
}) {
  return <label className="field" htmlFor={id}><span>{label}{required ? <i aria-hidden="true"> *</i> : null}</span><input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} maxLength={maxLength} autoComplete={autoComplete}/></label>;
}
