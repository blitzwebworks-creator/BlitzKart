import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupportRequestAction } from "@/lib/actions/admin";
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Support messaging becomes available after Supabase is configured.</div></div>;
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login?next=%2Faccount%2Fsupport");
  const [{data: orders},{data: requests}] = await Promise.all([
    supabase.from("orders").select("id,order_number").eq("customer_id",user.id).order("created_at",{ascending:false}).limit(100),
    supabase.from("support_requests").select("id,subject,status,created_at").eq("customer_id",user.id).order("created_at",{ascending:false}),
  ]);
  return <div className="wrap"><h1 className="page-title">Contact support</h1><p className="muted">Send a message to the BlitzKart team. Your request stays in your account and can be linked to an order.</p>{message ? <div className="notice">{message}</div> : null}<form className="form-card" action={createSupportRequestAction}><h2>New support request</h2><label className="field"><span>Order (optional)</span><select name="order_id"><option value="">General question</option>{orders?.map((o)=><option key={o.id} value={o.id}>{o.order_number}</option>)}</select></label><label className="field"><span>Subject</span><input name="subject" required minLength={3} maxLength={120}/></label><label className="field"><span>Message</span><textarea name="message" required minLength={10} maxLength={3000} rows={6}/></label><button className="btn">Send request</button></form><section className="section"><h2>Your requests</h2>{requests?.length ? <div className="table-wrap"><table><thead><tr><th>Subject</th><th>Created</th><th>Status</th></tr></thead><tbody>{requests.map((r)=><tr key={r.id}><td>{r.subject}</td><td>{new Date(r.created_at).toLocaleDateString("en-IN")}</td><td>{r.status.replaceAll("_"," ")}</td></tr>)}</tbody></table></div> : <p className="muted">You have no support requests yet.</p>}</section><p><Link href="/account/orders">View your orders and tracking</Link></p></div>;
}
