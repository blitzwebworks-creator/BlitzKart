"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/types";
type Result = { orderNumber: string; status: string; paymentStatus: string; paymentEnvironment: "live" | "sandbox"; total: number; createdAt: string };
export function PaymentReturn({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState(""); const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const check = async (attempt: number) => {
      try {
        const response = await fetch("/api/payments/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Payment status could not be checked.");
        if (!active) return; setResult(data); setError("");
        if (data.paymentStatus === "paid" || attempt >= 9) { setChecking(false); return; }
        timer = setTimeout(() => void check(attempt + 1), 2500);
      } catch (reason) { if (!active) return; setError(reason instanceof Error ? reason.message : "Payment status could not be checked."); setChecking(false); }
    };
    void check(0); return () => { active = false; clearTimeout(timer); };
  }, [orderId]);
  return <div className="form-card" style={{ maxWidth: 640 }}>
    {result?.paymentStatus === "paid" ? <>{result.paymentEnvironment === "sandbox" ? <><div className="status status-pending">Sandbox test only</div><h1 style={{ marginTop: 12 }}>Test payment confirmed.</h1><p>No real payment was made. This test order is isolated from live revenue reporting.</p></> : <><div className="status status-paid">Payment received</div><h1 style={{ marginTop: 12 }}>We received your payment.</h1><p>Your order <strong>{result.orderNumber}</strong> is confirmed. BlitzKart will prepare your items and send delivery updates soon.</p><p><strong>Paid: {money(result.total)}</strong></p></>}<Link className="btn" href={`/account/orders/${orderId}`}>{result.paymentEnvironment === "sandbox" ? "View test order" : "Track your order"}</Link></> : <><h1>{checking ? "Confirming your payment" : "Payment not confirmed yet"}</h1><p className="muted">{checking ? "We are checking the gateway directly. This page will show confirmation only after the gateway verifies payment." : error || "The gateway has not confirmed payment. If you completed the UPI transfer, wait a moment and refresh this page."}</p>{result ? <p>Order {result.orderNumber} · Payment status: <span className="status">{result.paymentStatus}</span></p> : null}<button className="btn btn-outline" onClick={() => { setChecking(true); setError(""); window.location.reload(); }}>Check again</button>{result ? <p><Link href={`/account/orders/${orderId}`}>Open order details</Link></p> : null}</>}
  </div>;
}
