import { NextResponse } from "next/server";
import { confirmPayUFields } from "@/lib/payments/confirm-payu";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fields = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")) as Record<string, string>;
    const result = await confirmPayUFields(fields);
    return NextResponse.json({ received: true, paid: result.paid });
  } catch {
    return NextResponse.json({ error: "PayU notification could not be verified." }, { status: 400 });
  }
}
