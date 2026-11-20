import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms & Conditions", description: "Read the terms that apply when using BlitzKart." };

export default function TermsPage() {
  return <PolicyPage policy="terms"/>;
}
