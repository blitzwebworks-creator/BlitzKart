import Link from "next/link";
import { ArrowRight, ClipboardList, LifeBuoy, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { ProfileEditor } from "@/components/profile-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/types";

type Query = { message?: string; error?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Your account</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");
  const [{ data: profile, error: profileError }, { data: addresses, error: addressError, count: addressCount }, { data: orders, error: orderError }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,created_at").eq("id", user.id).maybeSingle(),
    supabase.from("addresses").select("id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default", { count: "exact" }).eq("customer_id", user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false }).limit(2),
    supabase.from("orders").select("id,order_number,status,payment_status,payment_environment,total,created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(3),
  ]);
  const fullName = profileError ? "" : profile?.full_name?.trim() || "";
  const addressSummary = addressError ? "Address list unavailable" : addressCount === null ? "Address count unavailable" : `${addressCount} saved ${addressCount === 1 ? "address" : "addresses"}`;
  const displayName = fullName || user.email || "Your profile";
  const initials = displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part: string) => part[0].toUpperCase()).join("") || "B";

  return <AccountLayout active="profile">
    <div className="account-profile-page">
      {query.message ? <p className="notice account-message">{query.message}</p> : null}
      {query.error ? <p className="error account-message" role="alert">{query.error}</p> : null}
      <header className="account-profile-banner">
        <div className="account-avatar" aria-hidden="true">{initials}</div>
        <div className="account-profile-identity"><span className="section-kicker">CUSTOMER PROFILE</span><h1>{displayName}</h1><div className="account-contact-line"><span>{user.email || "Email not provided"}</span>{!profileError && profile?.phone ? <><i aria-hidden="true">·</i><span>{profile.phone}</span></> : null}</div></div>
        {!profileError ? <ProfileEditor fullName={fullName} phone={profile?.phone || ""}/> : null}
      </header>

      {profileError ? <p className="error account-message">Personal information couldn’t be loaded.</p> : null}
      <div className="account-profile-grid">
        <section className="account-card personal-information">
          <div className="account-card-heading"><div><h2>Personal information</h2><p>Your account details</p></div><UserRound size={19}/></div>
          <dl className="personal-information-list">
            <div><dt>Full name</dt><dd>{profileError ? <span className="muted">Couldn’t load</span> : fullName || <span className="muted">Not provided</span>}</dd></div>
            <div><dt>Email</dt><dd>{user.email || <span className="muted">Not provided</span>}{user.email ? <span className={`verification-pill${user.email_confirmed_at ? " is-verified" : ""}`}>{user.email_confirmed_at ? "Verified" : "Not verified"}</span> : null}</dd></div>
            <div><dt>Phone</dt><dd>{profileError ? <span className="muted">Couldn’t load</span> : profile?.phone || <span className="muted">Not provided</span>}</dd></div>
          </dl>
        </section>

        <section className="account-card account-quick-actions">
          <div className="account-card-heading"><div><h2>Quick actions</h2><p>Shortcuts to your account</p></div><ArrowRight size={19}/></div>
          <div className="account-action-grid">
            <Link href="/account/orders"><span className="account-action-icon"><ClipboardList size={19}/></span><span><strong>My orders</strong><small>Track payments and delivery</small></span><ArrowRight size={15}/></Link>
            <Link href="/account/addresses"><span className="account-action-icon"><MapPin size={19}/></span><span><strong>Saved addresses</strong><small>{addressSummary}</small></span><ArrowRight size={15}/></Link>
            <Link href="/account/support"><span className="account-action-icon"><LifeBuoy size={19}/></span><span><strong>Help & support</strong><small>Get help with an order</small></span><ArrowRight size={15}/></Link>
            <Link href="/privacy"><span className="account-action-icon"><ShieldCheck size={19}/></span><span><strong>Privacy policy</strong><small>Read how account data is used</small></span><ArrowRight size={15}/></Link>
          </div>
        </section>

        <section className="account-card account-addresses-card">
          <div className="account-card-heading"><div><h2>Saved addresses</h2><p>Delivery locations saved during checkout</p></div><Link href="/account/addresses">View all <ArrowRight size={14}/></Link></div>
          {addressError ? <p className="muted account-section-empty">Saved addresses couldn’t be loaded.</p> : addresses?.length ? <div className="account-address-list">{addresses.map((address) => <article className="account-address-item" key={address.id}><span className="account-address-icon"><MapPin size={18}/></span><div><div className="account-address-title"><strong>{address.recipient_name}</strong>{address.is_default ? <span className="default-address-pill">Default</span> : null}</div><p>{address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}, {address.locality}, {address.city}, {address.state} – {address.postal_code}</p><small>{address.phone}</small></div></article>)}</div> : <div className="account-section-empty"><strong>No saved addresses yet</strong><span>Addresses are saved to your account when you check out.</span><Link href="/products">Shop products <ArrowRight size={14}/></Link></div>}
        </section>

        <section className="account-card account-recent-orders">
          <div className="account-card-heading"><div><h2>Recent orders</h2><p>Your latest orders and their status</p></div><Link href="/account/orders">All orders <ArrowRight size={14}/></Link></div>
          {orderError ? <p className="muted account-section-empty">Order history couldn’t be loaded.</p> : orders?.length ? <div className="account-recent-order-list">{orders.map((order) => <Link className="account-recent-order" href={`/account/orders/${order.id}`} key={order.id}><span className="recent-order-icon"><ClipboardList size={18}/></span><span className="recent-order-main"><strong>{order.order_number}{order.payment_environment === "sandbox" ? <small className="status status-pending">Test</small> : null}</strong><small>{new Date(order.created_at).toLocaleDateString("en-IN")}</small></span><span className="recent-order-total"><strong>{money(order.total)}</strong><small className={`status status-${order.status}`}>{order.status.replaceAll("_", " ")}</small></span><ArrowRight size={16}/></Link>)}</div> : <div className="account-section-empty"><strong>No orders yet</strong><span>Your order history will appear here after checkout.</span><Link href="/products">Browse products <ArrowRight size={14}/></Link></div>}
        </section>
      </div>
    </div>
  </AccountLayout>;
}
