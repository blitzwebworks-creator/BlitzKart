import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Shipping & Delivery Policy", description: "Review BlitzKart delivery availability, charges and delivery estimates." };

export default function ShippingDeliveryPolicyPage() {
  return <PolicyPage policy="shipping"/>;
}
