import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
export const metadata: Metadata = { title: "Sign in" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const { error, message, next } = await searchParams;
  return <div className="wrap"><form className="form-card" action={loginAction}><h1>Welcome back</h1><p className="muted">Sign in to view your BlitzKart account and orders.</p>{message ? <p className="notice" role="status">{message}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}<input type="hidden" name="next" value={next || "/account"}/><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required/></div><div className="field"><div className="login-password-label"><label htmlFor="password">Password</label></div><input id="password" name="password" type="password" autoComplete="current-password" required/></div><Link className="forgot-password-button" href="/forgot-password"><KeyRound size={16} aria-hidden="true"/> Forgot password?</Link><button className="btn" style={{ width: "100%" }}>Sign in</button><p className="muted">New to BlitzKart? <Link href="/register">Create an account</Link></p></form></div>;
}
