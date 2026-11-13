import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { signOutAction } from "@/lib/actions/auth";
import { AdminNavigation } from "@/components/admin-navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-sidebar-brand" href="/admin" aria-label="BlitzKart admin dashboard"><Image className="admin-brand-logo" src="/blitzkart-logo.png" alt="BlitzKart" width={2172} height={724} sizes="160px"/><small>ADMIN</small></Link>
      <AdminNavigation/>
      <div className="admin-sidebar-account"><span className="admin-avatar">{(user.email || "A").slice(0,1).toUpperCase()}</span><span><strong>{user.email || "Administrator"}</strong><small>Authorized admin</small></span></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><div><span className="admin-overline">Store operations</span><strong>Management workspace</strong></div><div className="admin-topbar-actions"><Link href="/" target="_blank" rel="noreferrer">View storefront <ArrowUpRight size={15}/></Link><form action={signOutAction}><button type="submit">Sign out</button></form></div></header>
      <section className="admin-content" aria-label="Admin content">{children}</section>
      <footer className="admin-footer">BlitzKart · Store administration</footer>
    </div>
  </div>;
}
