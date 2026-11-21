import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Return & Exchange Policy", description: "Review BlitzKart's return and exchange request information." };

export default function ReturnExchangePolicyPage() {
  return <PolicyPage policy="returns"/>;
}
