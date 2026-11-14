import { NextResponse } from "next/server";
import { confirmPayUFields } from "@/lib/payments/confirm-payu";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fields = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")) as Record<string, string>;
    const result = await confirmPayUFields(fields);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const destination = new URL("/checkout/confirmed", siteUrl);
    destination.searchParams.set("order_id", result.orderId);
    if (!result.paid) destination.searchParams.set("payment", "pending");
    return NextResponse.redirect(destination, 303);
  } catch {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const destination = new URL("/checkout?payment=unverified", siteUrl);
    return NextResponse.redirect(destination, 303);
  }
}
