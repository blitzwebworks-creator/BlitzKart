import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";

export function SupportContactDetails() {
  return <aside className="support-contact-details" aria-label="BlitzKart contact information">
    <h2>Contact BlitzKart</h2>
    <p>For help with your order, contact the support team using the details below.</p>
    <div><Phone size={17}/><a href="tel:+917678563252">+91 7678563252</a></div>
    <div><Phone size={17}/><a href="tel:+918506006599">+91 8506006599</a></div>
    <div><Mail size={17}/><a href="mailto:blitzkart2026@gmail.com">blitzkart2026@gmail.com</a></div>
    <Link className="btn btn-outline support-whatsapp-link" href="https://wa.me/918506006599?text=Hello%20BlitzKart%2C%20I%20need%20help%20with%20a%20return%20or%20exchange." target="_blank" rel="noreferrer"><MessageCircle size={17}/> Returns & exchanges on WhatsApp</Link>
    <small>WhatsApp return and exchange messages go to +91 8506006599.</small>
  </aside>;
}
