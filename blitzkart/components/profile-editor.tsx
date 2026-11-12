"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateProfileAction } from "@/lib/actions/auth";

export function ProfileEditor({ fullName, phone }: { fullName: string; phone: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn btn-outline profile-edit-toggle" type="button" onClick={() => setOpen(true)}><Pencil size={15}/> Edit profile</button>;
  return <div className="profile-edit-panel">
    <div className="profile-edit-heading"><strong>Edit profile</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close profile editor"><X size={17}/></button></div>
    <form action={updateProfileAction}>
      <label className="field"><span>Full name</span><input name="full_name" defaultValue={fullName} autoComplete="name" maxLength={100} required/></label>
      <label className="field"><span>Phone number <small>Optional</small></span><input name="phone" defaultValue={phone} type="tel" autoComplete="tel" maxLength={30}/></label>
      <button className="btn" type="submit">Save changes</button>
    </form>
  </div>;
}
