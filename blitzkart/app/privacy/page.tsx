import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "Read how BlitzKart collects, uses and protects customer information." };

export default function PrivacyPage() {
  return <PolicyPage policy="privacy"/>;
}
