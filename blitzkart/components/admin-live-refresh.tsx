"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, ClipboardList, MessageCircle, Radio, RadioTower, ShoppingBag, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

type AdminNotification = {
  id: string;
  notification_type: "order_received" | "customer_request" | "support_request";
  title: string;
  message: string;
  target_path: string;
  created_at: string;
  read_at: string | null;
};
function notificationIcon(type: AdminNotification["notification_type"]) {
  if (type === "order_received") return <ShoppingBag size={17}/>;
  if (type === "customer_request") return <ClipboardList size={17}/>;
  return <MessageCircle size={17}/>;
}

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminLiveRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<AdminNotification | null>(null);
  const [loadError, setLoadError] = useState(false);
  const notificationCenterRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const seenIds = useRef(new Set<string>());
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const unreadCount = notifications.reduce((count, notification) => count + (notification.read_at ? 0 : 1), 0);

  useEffect(() => {
    let active = true;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let adminChannel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | undefined;
    let notificationChannel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | undefined;

    const refresh = () => {
      if (!active) return;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => { if (active) router.refresh(); }, 350);
    };

    const notifyBrowser = async (notification: AdminNotification) => {
      if (!("Notification" in window) || window.Notification.permission !== "granted") return;
      try {
        // When this browser has a push subscription, the service worker delivers the
        // system alert (including on mobile). Avoid showing a duplicate local alert.
        const registration = await navigator.serviceWorker?.getRegistration("/");
        if (await registration?.pushManager.getSubscription()) return;
        const browserNotification = new window.Notification(notification.title, {
          body: notification.message,
          icon: "/icon.png",
          tag: `blitzkart-admin-${notification.id}`,
          data: { targetPath: notification.target_path },
        });
        browserNotification.onclick = () => {
          window.focus();
          const path = notification.target_path.startsWith("/admin/") ? notification.target_path : "/admin";
          window.location.assign(path);
          browserNotification.close();
        };
      } catch (error) { console.warn("BlitzKart browser notification could not be shown.", error); }
    };

    const receiveNotification = (notification: AdminNotification) => {
      if (!active || !notification?.id || seenIds.current.has(notification.id)) return;
      seenIds.current.add(notification.id);
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 40));
      setToast(notification);
      void notifyBrowser(notification);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => { if (active) setToast(null); }, 9_000);
      refresh();
    };

    const loadNotifications = async (alertNew: boolean) => {
      if (!supabase) return;
      const { data, error } = await supabase.from("admin_notifications")
        .select("id,notification_type,title,message,target_path,created_at,read_at")
        .order("created_at", { ascending: false }).limit(40);
      if (!active) return;
      if (error) { setLoadError(true); return; }
      setLoadError(false);
      const rows = (data ?? []) as AdminNotification[];
      const fresh = rows.filter((item) => !seenIds.current.has(item.id));
      if (alertNew) fresh.reverse().forEach(receiveNotification);
      rows.forEach((item) => seenIds.current.add(item.id));
      setNotifications((current) => {
        const byId = new Map<string, AdminNotification>();
        for (const item of [...current, ...rows]) byId.set(item.id, item);
        return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 40);
      });
    };

    try {
      supabase = createSupabaseBrowserClient();
      supabaseRef.current = supabase;
      adminChannel = supabase.channel("blitzkart-admin-live-refresh")
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_live_events" }, refresh)
        .subscribe((status) => { if (active) setConnected(status === "SUBSCRIBED"); });
      notificationChannel = supabase.channel("blitzkart-admin-notifications")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (payload) => {
          receiveNotification(payload.new as AdminNotification);
        })
        .subscribe();
      void loadNotifications(false);
    } catch (error) {
      console.warn("BlitzKart admin live updates are unavailable.", error);
      setConnected(false);
      setLoadError(true);
    }

    // Realtime is low-latency; polling recovers both page data and notifications after disconnects.
    const fallback = window.setInterval(() => {
      if (active) { router.refresh(); void loadNotifications(true); }
    }, 30_000);
    const visible = () => {
      if (document.visibilityState === "visible") { router.refresh(); void loadNotifications(true); }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", visible);
      if (supabase && adminChannel) void supabase.removeChannel(adminChannel);
      if (supabase && notificationChannel) void supabase.removeChannel(notificationChannel);
      supabaseRef.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationCenterRef.current?.contains(event.target)) setPanelOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setPanelOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  async function markRead(notification: AdminNotification) {
    if (notification.read_at) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
    const supabase = supabaseRef.current;
    if (supabase) {
      const { error } = await supabase.from("admin_notifications").update({ read_at: readAt }).eq("id", notification.id);
      if (error) console.warn("BlitzKart notification could not be marked as read.", error);
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((item) => !item.read_at);
    if (!unread.length) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    const supabase = supabaseRef.current;
    if (supabase) {
      const { error } = await supabase.from("admin_notifications").update({ read_at: readAt }).in("id", unread.map((item) => item.id));
      if (error) console.warn("BlitzKart notifications could not be marked as read.", error);
    }
  }

  return <>
    <span className={`admin-live-status${connected ? " is-live" : " is-fallback"}`} title={connected ? "Database changes refresh this dashboard automatically" : "Automatic refresh checks every 30 seconds"}>
      {connected ? <RadioTower size={14} aria-hidden="true"/> : <Radio size={14} aria-hidden="true"/>}{connected ? "Live updates" : "Auto refresh"}
    </span>
    <div className="admin-notification-center" ref={notificationCenterRef}>
      <button className={`admin-notification-toggle${unreadCount ? " has-unread" : ""}`} type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
        {unreadCount ? <BellRing size={18}/> : <Bell size={18}/>}
        {unreadCount ? <span className="admin-notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {panelOpen ? <section className="admin-notification-panel" aria-label="Admin notifications">
        <div className="admin-notification-panel-heading"><div><strong>Notifications</strong><small>{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</small></div><div>{unreadCount ? <button type="button" className="admin-mark-read-all" onClick={markAllRead}><CheckCheck size={15}/> Mark all read</button> : null}<button type="button" className="admin-notification-close" aria-label="Close notifications" onClick={() => setPanelOpen(false)}><X size={17}/></button></div></div>
        <PushNotificationToggle/>
        {loadError ? <p className="admin-notification-empty is-error">Notifications are unavailable. Apply migration 0013_admin_order_notifications.sql.</p> : notifications.length ? <ul className="admin-notification-list">{notifications.map((notification) => <li key={notification.id} className={!notification.read_at ? "is-unread" : ""}>
          <Link href={notification.target_path.startsWith("/admin/") ? notification.target_path : "/admin"} onClick={() => { void markRead(notification); setPanelOpen(false); }}>
            <span className={`admin-notification-icon is-${notification.notification_type}`}>{notificationIcon(notification.notification_type)}</span>
            <span className="admin-notification-copy"><strong>{notification.title}</strong><span>{notification.message}</span><time dateTime={notification.created_at}>{notificationTime(notification.created_at)}</time></span>
            {!notification.read_at ? <i className="admin-notification-unread-dot" aria-label="Unread"/> : null}
          </Link>
        </li>)}</ul> : <p className="admin-notification-empty">No new orders or customer requests yet.</p>}
      </section> : null}
    </div>
    {toast ? <div className="admin-notification-toast" role="status" aria-live="polite">
      <span className={`admin-notification-icon is-${toast.notification_type}`}>{notificationIcon(toast.notification_type)}</span>
      <span><strong>{toast.title}</strong><small>{toast.message}</small></span>
      <Link href={toast.target_path.startsWith("/admin/") ? toast.target_path : "/admin"} onClick={() => { void markRead(toast); setToast(null); }}>Open</Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16}/></button>
    </div> : null}
  </>;
}
