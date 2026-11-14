import type { Metadata } from "next";
import Link from "next/link";
import { ContactSupportForm } from "@/components/contact-support-form";
import { SupportContactDetails } from "@/components/support-contact-details";

export const metadata: Metadata = { title: "Contact BlitzKart" };

export default function ContactPage() {
  return <div className="wrap contact-page">
    <header className="contact-page-heading"><span className="section-kicker">BLITZKART SUPPORT</span><h1 className="page-title">How can we help?</h1><p className="muted">Send a message about an order, payment, delivery, or anything else you need help with.</p></header>
    <ContactSupportForm/>
    <SupportContactDetails/>
    <p className="contact-track-link">Already placed an order? <Link href="/account/orders">View your orders and tracking</Link></p>
  </div>;
}
