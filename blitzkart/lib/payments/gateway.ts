import "server-only";

export type GatewayOrder = { order_id: string; client_order_id: string; amount: string; status: string; payment_url: string; expires_at?: string | null; environment?: string; test?: boolean };
function config() {
  const base = process.env.UPI_GATEWAY_URL?.replace(/\/$/, ""); const key = process.env.UPI_GATEWAY_API_KEY; const secret = process.env.UPI_GATEWAY_API_SECRET;
  if (!base || !key || !secret) throw new Error("UPI Gateway is not configured. Add its URL and merchant API credentials on the server.");
  let url: URL;
  try { url = new URL(base); } catch { throw new Error("UPI_GATEWAY_URL must be a valid HTTPS URL."); }
  const localDev = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localDev && url.protocol === "http:")) throw new Error("UPI Gateway credentials may only be sent over HTTPS (HTTP is allowed for localhost development).");
  if (url.username || url.password) throw new Error("UPI_GATEWAY_URL must not contain credentials.");
  return { base, key, secret };
}
async function gatewayRequest(path: string, init?: RequestInit) {
  const { base, key, secret } = config();
  return fetch(`${base}${path}`, { ...init, cache: "no-store", headers: { "X-Api-Key": key, "X-Api-Secret": secret, ...(init?.headers ?? {}) } });
}
export async function getGatewayOrder(orderId: string) {
  const response = await gatewayRequest(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`UPI Gateway status lookup returned ${response.status}.`);
  const payload = await response.json() as { success?: boolean; data?: GatewayOrder };
  return payload.data ?? null;
}
export async function createGatewayOrder(input: { orderId: string; amount: number; customerName: string; customerEmail: string; mobile: string; redirectUrl: string }) {
  const existing = await getGatewayOrder(input.orderId).catch((error) => { if (error instanceof Error && error.message.includes("returned 404")) return null; throw error; });
  if (existing) return existing;
  const redirectUrl = input.redirectUrl.startsWith("https://") ? input.redirectUrl : undefined;
  const response = await gatewayRequest("/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    amount: input.amount,
    client_order_id: input.orderId,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_mobile: input.mobile,
    note: `BlitzKart ${input.orderId.slice(0, 8)}`,
    ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
  }) });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; data?: GatewayOrder; message?: string; errors?: Record<string,string[]> };
  if (!response.ok || !payload.data) throw new Error(payload.message || Object.values(payload.errors ?? {}).flat().join(" ") || `UPI Gateway could not create a payment order (${response.status}).`);
  return payload.data;
}
