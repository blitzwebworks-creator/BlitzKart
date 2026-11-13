import Link from "next/link";
import { ArrowRight, Home, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { AddressEditor, type CustomerAddress } from "@/components/address-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Faddresses");
  const { data: addresses, error } = await supabase.from("addresses").select("id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default").eq("customer_id", user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false });

  return <AccountLayout active="addresses">
    <div className="account-addresses-page">
      <header className="account-subpage-heading"><div><span className="section-kicker">YOUR ACCOUNT</span><h1>Saved addresses</h1><p>Delivery details you’ve saved to your account.</p></div><AddressEditor/></header>
      {query.message ? <p className="notice account-message">{query.message}</p> : null}
      {query.error ? <p className="error account-message" role="alert">{query.error}</p> : null}
      {error ? <div className="error">Saved addresses couldn’t be loaded.</div> : addresses?.length ? <div className="saved-address-list">{addresses.map((address) => <article className="saved-address-card" key={address.id}>
        <span className="saved-address-icon">{address.is_default ? <Home size={19}/> : <MapPin size={19}/>}</span>
        <div className="saved-address-copy"><div className="saved-address-heading"><strong>{address.recipient_name}</strong>{address.is_default ? <span className="default-address-pill">Default</span> : null}</div><p>{address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}<br/>{address.locality}, {address.city}, {address.state} – {address.postal_code}</p>{address.landmark ? <small>Landmark: {address.landmark}</small> : null}<small>{address.phone}</small></div>
        <AddressEditor address={address as CustomerAddress}/>
      </article>)}</div> : <div className="account-address-empty"><MapPin size={24}/><strong>No saved addresses yet</strong><p>Add a delivery address to make checkout easier next time.</p><Link className="btn btn-outline" href="/products">Browse products <ArrowRight size={15}/></Link></div>}
      <p className="addresses-footnote">Saved addresses are private to your account and used to make checkout easier.</p>
    </div>
  </AccountLayout>;
}
