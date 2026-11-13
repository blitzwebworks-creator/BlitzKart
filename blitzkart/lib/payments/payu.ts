import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export type PayUFields = Record<string, string>;
type PayUConfig = { key: string; salt: string; environment: "live" | "test" };

function config(): PayUConfig {
  const key = process.env.PAYU_KEY;
  const salt = process.env.PAYU_SALT;
  const environment = process.env.PAYU_ENVIRONMENT || "live";
  if (!key || !salt) throw new Error("PayU server credentials are not configured.");
  if (environment !== "live" && environment !== "test") throw new Error("PAYU_ENVIRONMENT must be live or test.");
  return { key, salt, environment };
}

function sha512(value: string) { return createHash("sha512").update(value, "utf8").digest("hex"); }
function safeHashEqual(expectedHex: string, actualHex: string) {
  if (!/^[a-f0-9]{128}$/i.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, "hex"); const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function payuEnvironment() { return config().environment === "test" ? "sandbox" : "live"; }

export function createPayUCheckout(input: {
  orderId: string; amount: number; customerName: string; email: string; phone: string;
  address: { line1: string; line2: string; city: string; state: string; postalCode: string };
  callbackUrl: string;
}) {
  const { key, salt, environment } = config();
  const txnid = `BK${input.orderId.replaceAll("-", "").slice(0, 23)}`;
  const amount = input.amount.toFixed(2);
  const firstname = input.customerName.trim().split(/\s+/)[0].slice(0, 60) || "Customer";
  const fields: PayUFields = {
    key, txnid, amount, productinfo: `BlitzKart order ${input.orderId.slice(0, 8)}`,
    firstname, email: input.email, phone: input.phone,
    address1: input.address.line1.slice(0, 100), address2: input.address.line2.slice(0, 100),
    city: input.address.city.slice(0, 50), state: input.address.state.slice(0, 50), country: "India", zipcode: input.address.postalCode,
    surl: input.callbackUrl, furl: input.callbackUrl, curl: input.callbackUrl,
    udf1: input.orderId, udf2: "", udf3: "", udf4: "", udf5: "",
  };
  const requestHash = [fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1, fields.udf2, fields.udf3, fields.udf4, fields.udf5].join("|") + `||||||${salt}`;
  fields.hash = sha512(requestHash);
  return { txnid, amount, action: environment === "test" ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment", fields };
}

export function verifyPayUResponse(fields: PayUFields) {
  const { key, salt } = config();
  if (fields.key !== key || !fields.status || !fields.txnid || !fields.hash) return false;
  const reverse = [fields.status, fields.splitInfo || "", "", "", "", "", fields.udf5 || "", fields.udf4 || "", fields.udf3 || "", fields.udf2 || "", fields.udf1 || "", fields.email || "", fields.firstname || "", fields.productinfo || "", fields.amount || "", fields.txnid, fields.key].join("|");
  const regularHash = sha512(`${salt}|${reverse}`);
  if (safeHashEqual(regularHash, fields.hash)) return true;
  const additionalCharges = fields.additional_charges || fields.additionalCharges;
  if (additionalCharges) return safeHashEqual(sha512(`${additionalCharges}|${salt}|${reverse}`), fields.hash);
  return false;
}

export async function verifyPayUTransaction(txnid: string, expectedAmount: number) {
  const { key, salt, environment } = config();
  if (!/^[A-Za-z0-9_-]{1,25}$/.test(txnid)) throw new Error("Invalid PayU transaction reference.");
  const action = environment === "test" ? "https://test.payu.in/merchant/postservice.php?form=2" : "https://info.payu.in/merchant/postservice.php?form=2";
  const form = new URLSearchParams({ key, command: "verify_payment", var1: txnid, hash: sha512(`${key}|verify_payment|${txnid}|${salt}`) });
  const response = await fetch(action, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => null) as { status?: number | string; transaction_details?: Record<string, Record<string, unknown>> } | null;
  if (!response.ok || !result || ![1, "1"].includes(result.status ?? "")) return null;
  const detail = result.transaction_details?.[txnid] ?? Object.values(result.transaction_details ?? {})[0];
  if (!detail || String(detail.txnid ?? txnid) !== txnid || String(detail.status ?? "").toLowerCase() !== "success" || String(detail.unmappedstatus ?? "").toLowerCase() !== "captured") return null;
  const amount = Number(detail.amt ?? detail.amount ?? detail.transaction_amount);
  const paymentId = String(detail.mihpayid ?? detail.payuid ?? "");
  if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(expectedAmount * 100) || !paymentId) return null;
  return { paymentId, amount };
}
