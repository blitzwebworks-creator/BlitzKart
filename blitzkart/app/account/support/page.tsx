import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { SupportContactDetails } from "@/components/support-contact-details";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupportRequestAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/datetime";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Support messaging becomes available after Supabase is configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Fsupport");
  const [{ data: orders }, { data: requests, error }] = await Promise.all([
    supabase.from("orders").select("id,order_number").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("support_requests").select("id,subject,status,created_at").eq("customer_id", user.id).order("created_at", { ascending: false }),
  ]);
  return <AccountLayout active="support">
    <div className="account-support-page">
      <header className="account-subpage-heading"><div><span className="section-kicker">WE’RE HERE TO HELP</span><h1>Help & support</h1><p>Send a message about an order or ask a general question.</p></div><span className="account-heading-icon"><LifeBuoy size={20}/></span></header>
      {message ? <p className="notice account-message">{message}</p> : null}
      <div className="account-support-grid">
        <form className="account-card support-form" action={createSupportRequestAction}>
          <div className="account-card-heading"><div><h2>Contact support</h2><p>Your request stays connected to your account.</p></div></div>
          <label className="field"><span>Order <small>Optional</small></span><select name="order_id"><option value="">General question</option>{orders?.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></label>
          <label className="field"><span>Subject</span><input name="subject" required minLength={3} maxLength={120}/></label>
          <label className="field"><span>Message</span><textarea name="message" required minLength={10} maxLength={3000} rows={6}/></label>
          <button className="btn" type="submit">Send support request</button>
        </form>
        <section className="account-card support-history">
          <div className="account-card-heading"><div><h2>Your requests</h2><p>Messages you’ve sent to BlitzKart</p></div></div>
          {error ? <p className="muted account-section-empty">Support requests couldn’t be loaded.</p> : requests?.length ? <div className="support-request-list">{requests.map((request) => <article key={request.id}><strong>{request.subject}</strong><span className={`status status-${request.status}`}>{request.status.replaceAll("_", " ")}</span><small>{formatDate(request.created_at)}</small></article>)}</div> : <p className="muted account-section-empty">You haven’t sent a support request yet.</p>}
        </section>
      </div>
      <SupportContactDetails/>
      <p className="account-support-back"><Link href="/account/orders">View your orders and tracking</Link></p>
    </div>
  </AccountLayout>;
}
