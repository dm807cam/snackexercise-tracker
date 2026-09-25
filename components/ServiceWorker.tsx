"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which exists only to show nudges (see
 * public/sw.js). Harmless where there is no support — nothing else depends on
 * it being there.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
