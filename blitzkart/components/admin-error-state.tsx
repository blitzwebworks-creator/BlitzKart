"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";

export function AdminErrorState({
  error,
  reset,
  title,
  description,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  useEffect(() => {
    console.error("Admin page failed to render", error);
  }, [error]);

  return <section className="panel admin-runtime-error" role="alert">
    <span className="admin-runtime-error-icon"><AlertTriangle size={22}/></span>
    <div>
      <h1 className="page-title">{title}</h1>
      <p className="muted">{description}</p>
      {error.digest ? <small className="muted">Reference: {error.digest}</small> : null}
      <div className="admin-runtime-error-actions">
        <button className="btn" type="button" onClick={() => reset()}><RotateCw size={16}/> Try again</button>
        <Link className="btn btn-outline" href={backHref}><ArrowLeft size={16}/> {backLabel}</Link>
      </div>
    </div>
  </section>;
}
