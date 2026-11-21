type OrderAlert = {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  total: number;
  postalCode: string;
};

const GRAPH_VERSION = "v27.0";

/** Best-effort admin alert. A WhatsApp outage must never interrupt checkout. */
export async function sendAdminWhatsAppOrderAlert(order: OrderAlert) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const recipient = process.env.WHATSAPP_ADMIN_PHONE?.replace(/\D/g, "");
  const templateName = process.env.WHATSAPP_ORDER_TEMPLATE?.trim();
  const language = process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE?.trim() || "en_US";

  if (!accessToken || !phoneNumberId || !recipient || !templateName) return false;
  if (!/^\d{8,15}$/.test(recipient) || !/^\d+$/.test(phoneNumberId) || !/^[a-zA-Z0-9_]{1,512}$/.test(templateName)) {
    console.error("[BlitzKart] WhatsApp order alert configuration is invalid.");
    return false;
  }

  const total = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(order.total);
  const parameters = [
    order.orderNumber,
    order.customerName,
    order.customerPhone,
    total,
    "Payment pending",
    order.postalCode,
  ].map((text) => ({ type: "text", text: String(text).slice(0, 1000) }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [{ type: "body", parameters }],
        },
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: { code?: number } } | null;
      console.error("[BlitzKart] WhatsApp order alert was rejected by Meta.", { status: response.status, code: result?.error?.code });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[BlitzKart] WhatsApp order alert could not be sent.", { timeout: error instanceof Error && error.name === "AbortError" });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
