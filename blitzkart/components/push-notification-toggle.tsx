"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle } from "lucide-react";

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

type DeviceState = "checking" | "unsupported" | "enabled" | "disabled" | "denied" | "error";

export function PushNotificationToggle() {
  const [state, setState] = useState<DeviceState>("checking");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isIOSInstallNeeded, setIsIOSInstallNeeded] = useState(false);

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsIOSInstallNeeded(ios && !installed);
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setState("denied"); return; }
    let active = true;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (!active) return;
      if (subscription && Notification.permission === "granted") {
        const response = await fetch("/api/push/subscribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience: "admin", subscription: subscription.toJSON() }),
        });
        if (!active) return;
        setState(response.ok ? "enabled" : "error");
      } else setState("disabled");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && state === "enabled") {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience: "admin", endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("This device could not be removed from notifications.");
        await subscription.unsubscribe();
        setState("disabled");
        setMessage("Notifications are off on this device.");
        return;
      }

      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
      const keyData = await keyResponse.json() as { publicKey?: string; error?: string };
      if (!keyResponse.ok || !keyData.publicKey) throw new Error(keyData.error || "Push notifications are not configured yet.");
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "disabled");
          setMessage(permission === "denied" ? "Allow notifications in this browser’s site settings, then try again." : "Notification permission was not granted.");
          return;
        }
      }
      subscription = subscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(keyData.publicKey) as BufferSource,
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: "admin", subscription: subscription.toJSON() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error(result.error || "This device could not be registered for notifications.");
      }
      setState("enabled");
      setMessage("This device will receive new order and customer request alerts.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Notifications could not be enabled. Please try again.");
    } finally { setPending(false); }
  }

  const label = state === "enabled" ? "Turn off notifications on this device" : "Enable notifications on this device";
  return <div className="admin-push-device">
    <div className="admin-push-device-copy">
      <span className={`admin-push-device-icon${state === "enabled" ? " is-enabled" : ""}`}>{state === "enabled" ? <Check size={16}/> : <Bell size={16}/>}</span>
      <span><strong>{state === "enabled" ? "Device notifications are on" : "Get alerts on this device"}</strong><small>Orders, returns, account requests and support messages</small></span>
    </div>
    {state === "unsupported" ? <p className="admin-push-device-note">This browser does not support push notifications. Try an up-to-date browser.</p> : state === "denied" ? <p className="admin-push-device-note">Notifications are blocked in browser settings. Allow them for BlitzKart, then reload this page.</p> : isIOSInstallNeeded ? <p className="admin-push-device-note">On iPhone or iPad, add BlitzKart to your Home Screen and open it there to enable notifications.</p> : null}
    {state !== "unsupported" && state !== "denied" ? <button type="button" onClick={toggle} disabled={pending || state === "checking"} aria-label={label}>
      {pending || state === "checking" ? <LoaderCircle size={14} className="admin-push-spinner"/> : state === "enabled" ? <BellOff size={14}/> : <Bell size={14}/>}{pending ? "Saving…" : state === "checking" ? "Checking…" : state === "enabled" ? "Turn off" : "Enable on this device"}
    </button> : null}
    {message ? <p className={`admin-push-device-note${state === "error" ? " is-error" : ""}`} role="status">{message}</p> : null}
  </div>;
}
