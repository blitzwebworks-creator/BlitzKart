import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Refund Policy", description: "Review BlitzKart's refund eligibility and processing information." };

export default function RefundPolicyPage() {
  return <PolicyPage policy="refund"/>;
}
