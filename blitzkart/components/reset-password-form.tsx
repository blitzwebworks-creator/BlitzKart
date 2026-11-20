"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RecoveryState = "checking" | "valid" | "invalid";
const recoveryKey = "blitzkart-password-recovery-user";

export function ResetPasswordForm() {
  const router = useRouter();
  const [recovery, setRecovery] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    let recoveryUserId: string | null = null;
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try { supabase = createSupabaseBrowserClient(); }
    catch { setRecovery("invalid"); return; }
    const timeout = window.setTimeout(() => { if (active) setRecovery(recoveryUserId ? "valid" : "invalid"); }, 3500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        recoveryUserId = session.user.id;
        sessionStorage.setItem(recoveryKey, session.user.id);
        setRecovery("valid"); setError("");
        return;
      }
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(recoveryKey);
        recoveryUserId = null;
        setRecovery("invalid");
        return;
      }
      if (event === "INITIAL_SESSION" && session?.user) {
        const markedUser = sessionStorage.getItem(recoveryKey);
        if (markedUser && markedUser === session.user.id) {
          recoveryUserId = session.user.id;
          setRecovery("valid");
        } else {
          sessionStorage.removeItem(recoveryKey);
          setRecovery("invalid");
        }
      }
    });
    return () => { active = false; window.clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (recovery !== "valid") { setError("Open the password reset link from your email again."); return; }
    if (password.length < 10) { setError("Choose a password with at least 10 characters."); return; }
    if (password !== confirmPassword) { setError("The password fields do not match."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const marker = sessionStorage.getItem(recoveryKey);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || marker !== session.user.id) throw new Error("Your password reset link is invalid or has expired. Request a new link.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      sessionStorage.removeItem(recoveryKey);
      setSuccess(true);
      void supabase.auth.signOut();
      window.setTimeout(() => router.replace("/login?message=Your+password+was+updated.+Sign+in+with+your+new+password."), 1400);
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes("invalid or has expired") ? reason.message : "Your password couldn’t be updated. Request a fresh recovery link and try again.");
    } finally { setBusy(false); }
  }

  return <section className="form-card recovery-card">
    <span className="recovery-icon"><LockKeyhole size={23}/></span>
    <span className="section-kicker">SECURE ACCOUNT ACCESS</span>
    <h1>Set a new password</h1>
    {success ? <div className="notice recovery-alert" role="status"><Check size={18}/><span>Your password has been updated. Taking you to sign in…</span></div>
      : recovery === "checking" ? <p className="muted recovery-checking"><LoaderCircle size={16} className="spin"/> Verifying your secure reset link…</p>
        : recovery === "invalid" ? <><p className="muted">This reset link is missing, expired or already used. Open the latest email link in the same browser where you requested it, or request a fresh link.</p><Link className="btn recovery-submit" href="/forgot-password">Request a new link</Link></>
          : <form onSubmit={submit}>
            <p className="muted">Use at least 10 characters. You’ll be signed out after the password is changed.</p>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={128} required/></label>
            <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} maxLength={128} required/></label>
            <button className="btn recovery-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <ShieldCheck size={17}/>} {busy ? "Updating password…" : "Update password"}</button>
          </form>}
    {recovery !== "invalid" ? <Link className="recovery-back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link> : null}
  </section>;
}
