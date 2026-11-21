import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminPushNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function isSafeAdminPath(path: string) {
  return path.startsWith("/admin/") && !path.startsWith("//") && !path.includes("\\");
}

export async function sendAdminPush(notification: AdminPushNotification) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:blitzkart2026@gmail.com";
  if (!publicKey || !privateKey) {
    console.warn("[BlitzKart] Web Push is not configured; admin push notification was skipped.");
    return;
  }

  try {
    setVapidDetails(subject, publicKey, privateKey);
    const admin = createSupabaseAdminClient();
    const { data: subscriptions, error } = await admin
      .from("web_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .eq("audience", "admin");
    if (error) {
      console.error("[BlitzKart] Admin push subscriptions could not be loaded.", { code: error.code });
      return;
    }
    const userIds = [...new Set((subscriptions ?? []).map((subscription) => subscription.user_id))];
    if (!userIds.length) return;
    const { data: activeAdmins, error: activeAdminsError } = await admin.from("admin_users")
      .select("user_id").eq("active", true).in("user_id", userIds);
    if (activeAdminsError) {
      console.error("[BlitzKart] Admin push recipients could not be verified.", { code: activeAdminsError.code });
      return;
    }
    const activeAdminIds = new Set((activeAdmins ?? []).map((item) => item.user_id));

    const payload = JSON.stringify({
      title: notification.title.slice(0, 100),
      body: notification.body.slice(0, 240),
      url: isSafeAdminPath(notification.url) ? notification.url : "/admin",
      tag: notification.tag.slice(0, 100),
    });
    await Promise.all((subscriptions ?? []).filter((subscription) => activeAdminIds.has(subscription.user_id)).map(async (subscription) => {
      try {
        await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await admin.from("web_push_subscriptions").delete().eq("id", subscription.id);
          if (deleteError) console.warn("[BlitzKart] Expired push subscription could not be removed.", { code: deleteError.code });
        } else {
          console.warn("[BlitzKart] An admin push notification could not be delivered.", { statusCode });
        }
      }
    }));
  } catch (error) {
    console.error("[BlitzKart] Admin push notification failed.", error instanceof Error ? error.message : "unknown error");
  }
}
