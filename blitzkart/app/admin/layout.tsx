import Link from "next/link";
import { ArrowUpRight, Zap } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { signOutAction } from "@/lib/actions/auth";
import { AdminNavigation } from "@/components/admin-navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-sidebar-brand" href="/admin"><span className="brand-mark"><Zap size={18} fill="currentColor"/></span><span><strong>BlitzKart</strong><small>ADMIN</small></span></Link>
      <AdminNavigation/>
      <div className="admin-sidebar-account"><span className="admin-avatar">{(user.email || "A").slice(0,1).toUpperCase()}</span><span><strong>{user.email || "Administrator"}</strong><small>Authorized admin</small></span></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><div><span className="admin-overline">Store operations</span><strong>Management workspace</strong></div><div className="admin-topbar-actions"><Link href="/" target="_blank" rel="noreferrer">View storefront <ArrowUpRight size={15}/></Link><form action={signOutAction}><button type="submit">Sign out</button></form></div></header>
      <main className="admin-content">{children}</main>
      <footer className="admin-footer">BlitzKart · Store administration</footer>
    </div>
  </div>;
}
