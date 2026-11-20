import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "Read BlitzKart's privacy notice and learn how to make personal data requests." };

export default function PrivacyPage() {
  return <PolicyPage policy="privacy"/>;
}
