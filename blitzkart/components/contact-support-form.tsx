"use client";

import { useState, type FormEvent } from "react";

type FormState = { type: "success" | "error"; message: string } | null;

export function ContactSupportForm() {
  const [state, setState] = useState<FormState>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setState(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data.entries())),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        setState({ type: "error", message: body.error || "Your request could not be sent. Please try again." });
        return;
      }
      form.reset();
      setState({ type: "success", message: "Your message has been received. The support team will review it." });
    } catch {
      setState({ type: "error", message: "Your request could not be sent. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="panel contact-support-form" onSubmit={submit}>
    <h2>Send a support request</h2>
    <p className="muted">You can contact us without signing in. Include your order number in the message if your question is about an order.</p>
    <div className="form-grid">
      <label className="field"><span>Your name</span><input name="name" autoComplete="name" required minLength={2} maxLength={100}/></label>
      <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <label className="field"><span>Phone <small>Optional</small></span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20}/></label>
      <label className="field"><span>Subject</span><input name="subject" required minLength={3} maxLength={120}/></label>
      <label className="field" style={{ gridColumn: "1/-1" }}><span>How can we help?</span><textarea name="message" required minLength={10} maxLength={3000} rows={6}/></label>
    </div>
    <label className="contact-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off"/></label>
    {state ? <p className={state.type === "success" ? "notice" : "error"} role={state.type === "success" ? "status" : "alert"}>{state.message}</p> : null}
    <button className="btn" type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send request"}</button>
  </form>;
}
