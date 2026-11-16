import Link from "next/link";
import { Bell, PackageSearch } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { markCustomerNotificationReadAction } from "@/lib/actions/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/datetime";

export default async function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Order notifications become available after Supabase is configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Fnotifications");
  const { data: notifications, error } = await supabase.from("customer_notifications")
    .select("id,order_id,order_number,notification_type,title,message,created_at,read_at")
    .eq("customer_id",user.id).order("created_at",{ascending:false}).limit(100);
  return <AccountLayout active="notifications"><div className="account-notifications-page">
    <header className="account-subpage-heading"><div><span className="section-kicker">ORDER UPDATES</span><h1>Notifications</h1><p>Payment and fulfilment updates recorded for your orders.</p></div><span className="account-heading-icon"><Bell size={20}/></span></header>
    {query.message ? <p className="notice account-message" role="status">{query.message}</p> : null}
    {query.error ? <p className="error account-message" role="alert">{query.error}</p> : null}
    {error ? <p className="error">Notifications could not be loaded. Apply migration 0007 and try again.</p> : notifications?.length ? <div className="customer-notification-list">{notifications.map((notification) => <article className={`customer-notification${notification.read_at ? " is-read" : " is-unread"}`} key={notification.id}><span className="customer-notification-icon"><PackageSearch size={19}/></span><div className="customer-notification-copy"><div><strong>{notification.title}</strong><time>{formatDateTime(notification.created_at)}</time></div><p>{notification.message}</p><div className="customer-notification-actions"><Link href={notification.order_id ? `/account/orders/${notification.order_id}` : "/account/orders"}>Order {notification.order_number}</Link>{notification.read_at ? <span className="status">Read</span> : <form action={markCustomerNotificationReadAction}><input type="hidden" name="notification_id" value={notification.id}/><button className="btn btn-outline btn-small">Mark read</button></form>}</div></div></article>)}</div> : <div className="account-section-empty"><strong>No order notifications yet</strong><span>Updates will appear here when payment or order status changes are recorded.</span><Link href="/account/orders">View my orders</Link></div>}
  </div></AccountLayout>;
}
