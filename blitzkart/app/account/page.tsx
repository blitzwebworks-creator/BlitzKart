import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/lib/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function AccountPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Your account</h1><div className="notice">Supabase is not configured.</div></div>;
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login?next=%2Faccount");
  const { data: profile } = await supabase.from("profiles").select("full_name,phone,created_at").eq("id", user.id).maybeSingle();
  return <div className="wrap"><h1 className="page-title">Your account</h1><div className="split"><section className="panel"><h2>Account details</h2><p><strong>Name:</strong> {profile?.full_name || "Not provided"}</p><p><strong>Email:</strong> {user.email}</p><p><strong>Phone:</strong> {profile?.phone || "Not provided"}</p></section><section className="panel"><h2>Orders & tracking</h2><p className="muted">View payment status, order progress and delivery tracking for your orders.</p><Link className="btn btn-outline" href="/account/orders">View order history</Link></section></div><form action={signOutAction} style={{ marginTop: 17 }}><button className="btn btn-outline">Sign out</button></form></div>;
}
