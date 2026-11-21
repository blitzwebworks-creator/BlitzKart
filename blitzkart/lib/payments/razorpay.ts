import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

type RazorpayOrder = { id?: string; amount?: number; currency?: string; status?: string };
type RazorpayPayment = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; captured?: boolean };
export type RazorpayRefund = { id: string; paymentId: string; amountPaise: number; currency: "INR"; status: "pending" | "processed" | "failed"; receipt: string | null; failureReason: string | null };

export class RazorpayApiError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); this.name = "RazorpayApiError"; }
  get definitiveRejection() { return this.statusCode >= 400 && this.statusCode < 500 && this.statusCode !== 409 && !/duplicate receipt|already used|operation is in progress/i.test(this.message); }
}

function config() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const environment = process.env.RAZORPAY_ENVIRONMENT || "live";
  if (!keyId || !keySecret) throw new Error("Razorpay server credentials are not configured.");
  if (!["live", "test"].includes(environment)) throw new Error("RAZORPAY_ENVIRONMENT must be live or test.");
  if (!new RegExp(`^rzp_${environment}_`).test(keyId)) throw new Error("Razorpay key ID does not match RAZORPAY_ENVIRONMENT.");
  return { keyId, keySecret, environment };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { keyId, keySecret } = config();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${auth}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { description?: string } };
  if (!response.ok) throw new RazorpayApiError(response.status, payload.error?.description || `Razorpay request failed (${response.status}).`);
  return payload;
}

export function razorpayEnvironment() { return config().environment === "test" ? "sandbox" : "live"; }
export function razorpayKeyId() { return config().keyId; }

export async function createRazorpayOrder(input: { orderId: string; orderNumber: string; amount: number }) {
  const amountPaise = Math.round(input.amount * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) throw new Error("Razorpay requires a payable order total of at least ₹1.");
  const result = await request<RazorpayOrder>("/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: input.orderNumber.slice(0, 40), notes: { blitzkart_order_id: input.orderId } }),
  });
  if (!result.id || result.amount !== amountPaise || result.currency !== "INR" || result.status !== "created") throw new Error("Razorpay returned an invalid payment order.");
  return { id: result.id, amount: amountPaise, currency: "INR" as const };
}

export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const { keySecret } = config();
  if (!/^[a-zA-Z0-9_]+$/.test(orderId) || !/^pay_[a-zA-Z0-9]+$/.test(paymentId) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export async function getCapturedRazorpayPayment(input: { orderId: string; paymentId?: string | null; amount: number }) {
  const expectedPaise = Math.round(input.amount * 100);
  let payment: RazorpayPayment | undefined;
  if (input.paymentId) {
    payment = await request<RazorpayPayment>(`/payments/${encodeURIComponent(input.paymentId)}`);
  } else {
    const result = await request<{ items?: RazorpayPayment[] }>(`/orders/${encodeURIComponent(input.orderId)}/payments`);
    payment = result.items?.find((candidate) => candidate.order_id === input.orderId && (candidate.captured || candidate.status === "captured"));
  }
  if (!payment || payment.order_id !== input.orderId || payment.currency !== "INR" || typeof payment.amount !== "number" || payment.amount !== expectedPaise) return null;
  if (payment.status === "authorized" && payment.id) {
    const captured = await request<RazorpayPayment>(`/payments/${encodeURIComponent(payment.id)}/capture`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: expectedPaise, currency: "INR" }),
    });
    payment = captured;
  }
  if (!payment.id || payment.order_id !== input.orderId || payment.currency !== "INR" || typeof payment.amount !== "number" || payment.amount !== expectedPaise || !(payment.captured || payment.status === "captured")) return null;
  return { paymentId: payment.id, amount: payment.amount / 100 };
}

type RazorpayRefundEntity = {
  id?: string; payment_id?: string; amount?: number; currency?: string | null; status?: string;
  receipt?: string | null; notes?: Record<string,string> | null; error_reason?: string | null; error_description?: string | null;
};

function normalizeRefund(refund: RazorpayRefundEntity, expected: { paymentId: string; amountPaise: number; receipt?: string }) {
  if (!refund.id || refund.payment_id !== expected.paymentId || refund.amount !== expected.amountPaise || (refund.currency && refund.currency !== "INR")) {
    throw new Error("Razorpay refund details did not match the requested payment and amount.");
  }
  if (!(refund.status === "pending" || refund.status === "processed" || refund.status === "failed")) throw new Error("Razorpay returned an unsupported refund status.");
  if (expected.receipt && refund.receipt && refund.receipt !== expected.receipt) throw new Error("Razorpay refund receipt did not match this order.");
  return {
    id: refund.id, paymentId: refund.payment_id, amountPaise: refund.amount, currency: "INR" as const,
    status: refund.status, receipt: refund.receipt ?? null,
    failureReason: [refund.error_reason, refund.error_description].filter(Boolean).join(": ").slice(0, 500) || null,
  } satisfies RazorpayRefund;
}

export async function fetchRazorpayRefund(refundId: string, expected: { paymentId: string; amountPaise: number; receipt?: string }) {
  const refund = await request<RazorpayRefundEntity>(`/refunds/${encodeURIComponent(refundId)}`);
  return normalizeRefund(refund, expected);
}

export async function findRazorpayRefundByReceipt(paymentId: string, amountPaise: number, receipt: string) {
  const result = await request<{ items?: RazorpayRefundEntity[] }>(`/payments/${encodeURIComponent(paymentId)}/refunds`);
  const match = result.items?.find((refund) => refund.receipt === receipt || refund.notes?.blitzkart_refund_id === receipt);
  return match ? normalizeRefund(match, { paymentId, amountPaise, receipt }) : null;
}

export async function createRazorpayRefund(input: { paymentId: string; amountPaise: number; receipt: string; orderId: string; orderNumber: string }) {
  if (!/^pay_[a-zA-Z0-9]+$/.test(input.paymentId) || !Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100 || input.receipt.length > 40) {
    throw new Error("Razorpay refund request is invalid.");
  }
  const payment = await request<RazorpayPayment>(`/payments/${encodeURIComponent(input.paymentId)}`);
  if (payment.id !== input.paymentId || payment.currency !== "INR" || payment.amount !== input.amountPaise || !(payment.captured || payment.status === "captured")) {
    throw new Error("Razorpay does not show a captured payment matching this order total.");
  }
  const refund = await request<RazorpayRefundEntity>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Refund-Idempotency": input.receipt },
    body: JSON.stringify({ amount: input.amountPaise, speed: "normal", receipt: input.receipt, notes: { blitzkart_order_id: input.orderId, blitzkart_order_number: input.orderNumber, blitzkart_refund_id: input.receipt } }),
  });
  return normalizeRefund(refund, { paymentId: input.paymentId, amountPaise: input.amountPaise, receipt: input.receipt });
}
