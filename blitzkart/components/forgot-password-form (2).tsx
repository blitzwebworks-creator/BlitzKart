"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const recoveryUrl = "https://www.blitzkart.store/reset-password";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryUrl });
      if (requestError) throw requestError;
      setSent(true);
    } catch {
      setError("We couldn’t send a recovery link right now. Check the address and try again.");
    } finally { setBusy(false); }
  }

  return <section className="form-card recovery-card">
    <span className="recovery-icon"><Mail size={23}/></span>
    <span className="section-kicker">ACCOUNT RECOVERY</span>
    <h1>Forgot your password?</h1>
    <p className="muted">Enter the email you use for BlitzKart. We’ll send a secure reset link if an account matches.</p>
    {sent ? <div className="notice recovery-alert" role="status"><ShieldCheck size={18}/><span>If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.</span></div> : <form onSubmit={submit}>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254}/></label>
      <button className="btn recovery-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Mail size={17}/>} {busy ? "Sending link…" : "Send reset link"}</button>
    </form>}
    <Link className="recovery-back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
  </section>;
}
