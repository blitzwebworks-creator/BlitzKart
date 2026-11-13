import Link from "next/link";
import { ClipboardList, LifeBuoy, LogOut, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";

const links = [
  { id: "profile", label: "Profile", href: "/account", icon: UserRound },
  { id: "orders", label: "My orders", href: "/account/orders", icon: ClipboardList },
  { id: "addresses", label: "Addresses", href: "/account/addresses", icon: MapPin },
  { id: "support", label: "Help & support", href: "/account/support", icon: LifeBuoy },
  { id: "privacy", label: "Privacy policy", href: "/privacy", icon: ShieldCheck },
] as const;

export function AccountLayout({ active, children }: { active: (typeof links)[number]["id"]; children: React.ReactNode }) {
  return <div className="wrap customer-account-layout">
    <aside className="customer-account-sidebar">
      <h2>My account</h2>
      <nav aria-label="Account navigation">{links.map(({ id, label, href, icon: Icon }) => <Link className={active === id ? "is-current" : ""} aria-current={active === id ? "page" : undefined} href={href} key={id}><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <form action={signOutAction} className="account-signout"><button type="submit"><LogOut size={17}/><span>Sign out</span></button></form>
    </aside>
    <section className="customer-account-content">{children}</section>
  </div>;
}
