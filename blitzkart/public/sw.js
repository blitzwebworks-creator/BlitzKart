/* BlitzKart admin web-push worker. Keep this file at the site root for scope /. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "BlitzKart admin alert";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "A new order or customer request needs attention.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: typeof payload.tag === "string" ? payload.tag : "blitzkart-admin",
    data: { url: typeof payload.url === "string" ? payload.url : "/admin" },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedPath = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/admin";
  let target = new URL("/admin", self.location.origin);
  try {
    const parsed = new URL(requestedPath, self.location.origin);
    if (parsed.origin === self.location.origin && parsed.pathname.startsWith("/admin/")) target = parsed;
  } catch { /* keep the safe admin fallback */ }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        if ("navigate" in client) void client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  }));
});
