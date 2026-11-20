"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";

const navigationEvent = "blitzkart:navigation-start";

export function announceNavigationStart() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(navigationEvent));
}

type OverlayState = "hidden" | "visible" | "leaving";

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>("hidden");
  const pending = useRef(false);
  const previousRoute = useRef<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    revealTimer.current = null;
    safetyTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    pending.current = false;
    setActive(false);
    setOverlay((current) => current === "visible" ? "leaving" : "hidden");
  }, [clearTimers]);

  const begin = useCallback(() => {
    clearTimers();
    pending.current = true;
    setActive(true);
    revealTimer.current = setTimeout(() => {
      if (pending.current) setOverlay("visible");
    }, 380);
    safetyTimer.current = setTimeout(finish, 18000);
  }, [clearTimers, finish]);

  useEffect(() => {
    if (previousRoute.current === null) {
      previousRoute.current = routeKey;
      return;
    }
    if (previousRoute.current !== routeKey) {
      previousRoute.current = routeKey;
      finish();
    }
  }, [finish, routeKey]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      if (destination.pathname === current.pathname && destination.search === current.search) return;
      begin();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.navigationFeedback === "false") return;
      const destination = new URL(form.action || window.location.href, window.location.href);
      if (destination.origin === window.location.origin) begin();
    };
    const onAnnounced = () => begin();
    const onPopState = () => begin();
    const onPageHide = () => finish();

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener(navigationEvent, onAnnounced);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener(navigationEvent, onAnnounced);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pagehide", onPageHide);
      clearTimers();
    };
  }, [begin, clearTimers, finish]);

  return <>
    <div className={`navigation-progress${active ? " is-active" : ""}`} aria-hidden="true"><span /></div>
    {overlay !== "hidden" && <div className={`navigation-loader navigation-loader-${overlay}`} role="status" aria-live="polite" aria-label="Loading BlitzKart" onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && overlay === "leaving") setOverlay("hidden");
    }}>
      <div className="navigation-loader-card">
        <div className="navigation-loader-brand"><span className="brand-mark"><Zap size={19} fill="currentColor" /></span><strong>BlitzKart</strong></div>
        <span className="navigation-loader-ring" aria-hidden="true" />
        <strong>Getting things ready</strong>
        <span className="muted">Just a moment…</span>
      </div>
    </div>}
  </>;
}
