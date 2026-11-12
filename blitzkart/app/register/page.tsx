import Link from "next/link";
import type { Metadata } from "next";
import { registerAction } from "@/lib/actions/auth";
export const metadata: Metadata = { title: "Create an account" };
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div className="wrap"><form className="form-card" action={registerAction}><h1>Create your account</h1><p className="muted">Your account lets you manage addresses and track orders.</p>{error ? <p className="error">{error}</p> : null}<div className="field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" autoComplete="name" maxLength={100} required/></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required/></div><div className="field"><label htmlFor="password">Password (at least 10 characters)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required/></div><button className="btn" style={{ width: "100%" }}>Create account</button><p className="muted">Already registered? <Link href="/login">Sign in</Link></p></form></div>;
}
