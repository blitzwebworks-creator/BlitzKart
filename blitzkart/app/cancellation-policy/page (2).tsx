import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Cancellation Policy", description: "Review how BlitzKart handles order cancellation requests." };

export default function CancellationPolicyPage() {
  return <PolicyPage policy="cancellation"/>;
}
