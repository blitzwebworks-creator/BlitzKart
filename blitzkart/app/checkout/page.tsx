import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Checkout" };

type SavedAddress = {
  id: string;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  landmark: string | null;
  is_default: boolean;
};

export default async function CheckoutPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><h1 className="page-title">Checkout</h1><div className="notice">Connect Supabase before placing orders.</div></div>;
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="wrap"><div className="form-card"><h1>Sign in to continue</h1><p className="muted">Your account keeps your orders and delivery updates together.</p><Link className="btn" href="/login?next=%2Fcheckout">Sign in</Link></div></div>;
  const [profileResult, addressResult] = await Promise.all([
    supabase.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle(),
    supabase.from("addresses").select("id,recipient_name,phone,address_line1,address_line2,locality,city,state,postal_code,landmark,is_default").eq("customer_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const profile = profileResult.data;
  const enabledProviders = [
    ...(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET ? ["razorpay" as const] : []),
    ...(process.env.PAYU_KEY && process.env.PAYU_SALT && user.email ? ["payu" as const] : []),
  ];
  const razorpaySetupHint = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET
    ? "Add the Razorpay key ID and secret in Vercel to enable."
    : !process.env.RAZORPAY_WEBHOOK_SECRET
      ? "Add the Razorpay webhook secret in Vercel to enable reliable payment updates."
      : "Razorpay is temporarily unavailable.";
  return <CheckoutForm
    email={user.email ?? ""}
    fullName={profile?.full_name || String(user.user_metadata?.full_name ?? "")}
    phone={profile?.phone ?? ""}
    addresses={(addressResult.data ?? []) as SavedAddress[]}
    addressLoadError={Boolean(addressResult.error)}
    razorpaySetupHint={enabledProviders.includes("razorpay") ? "" : razorpaySetupHint}
    enabledProviders={enabledProviders}
  />;
}
