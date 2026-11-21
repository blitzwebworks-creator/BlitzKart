"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RazorpayCheckoutResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  prefill: { name: string; email: string; contact: string }; theme: { color: string };
  handler: (result: RazorpayCheckoutResult) => void; modal: { ondismiss: () => void };
};
type RazorpayInstance = { open: () => void; on: (event: string, callback: (result: { error?: { description?: string } }) => void) => void };
type RazorpayWindow = Window & { Razorpay?: new (options: RazorpayOptions) => RazorpayInstance };
type PaymentSession = { orderId: string; orderNumber: string; keyId: string; razorpayOrderId: string; amount: number; currency: string; customer: { name: string; email: string; phone: string } };

function loadRazorpay() {
  const browser = window as RazorpayWindow;
  if (browser.Razorpay) return Promise.resolve(browser.Razorpay);
  return new Promise<NonNullable<RazorpayWindow["Razorpay"]>>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    const script = existing ?? document.createElement("script");
    const finish = () => browser.Razorpay ? resolve(browser.Razorpay) : reject(new Error("Razorpay Checkout did not load. Check your connection and try again."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load. Try again.")), { once: true });
    if (!existing) { script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; script.dataset.razorpayCheckout = "true"; document.body.appendChild(script); }
  });
}

export function AdminOrderPaymentButton({ orderId, disabled = false }: { orderId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function pay() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/orders/start-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
      const session = await response.json() as PaymentSession & { error?: string };
      if (!response.ok) throw new Error(session.error || "Payment could not be started.");
      const Razorpay = await loadRazorpay();
      const checkout = new Razorpay({
        key: session.keyId, order_id: session.razorpayOrderId, amount: session.amount, currency: session.currency,
        name: "BlitzKart", description: `Order ${session.orderNumber}`,
        prefill: { name: session.customer.name, email: session.customer.email, contact: session.customer.phone },
        theme: { color: "#ffd21f" },
        handler: async (payment) => {
          setError("");
          try {
            const verified = await fetch("/api/payments/razorpay/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: session.orderId, ...payment }) });
            if (!verified.ok) throw new Error("Razorpay is checking your payment. Refresh this order in a moment to see its verified status.");
            setMessage("Payment confirmed by Razorpay."); router.refresh();
          } catch (reason) { setError(reason instanceof Error ? reason.message : "Payment confirmation is still being checked."); router.refresh(); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", ({ error: failure }) => { setError(failure?.description || "Payment was not completed. You can try again."); setBusy(false); });
      checkout.open();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payment could not be started."); setBusy(false); }
  }

  return <div className="admin-order-payment"><button className="btn" type="button" onClick={pay} disabled={disabled || busy}>{busy ? "Opening secure payment…" : "Pay securely with Razorpay"}</button>{error ? <p className="error" role="alert">{error}</p> : null}{message ? <p className="notice" role="status">{message}</p> : null}</div>;
}
