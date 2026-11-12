import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Checkout" };
export default async function CheckoutPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Checkout</h1><div className="notice">Connect Supabase before placing orders.</div></div>;
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="wrap"><div className="form-card"><h1>Sign in to continue</h1><p className="muted">Your account keeps your orders and delivery updates together.</p><Link className="btn" href="/login?next=%2Fcheckout">Sign in</Link></div></div>;
  return <CheckoutForm email={user.email ?? ""}/>;
}
