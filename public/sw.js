/*
 * The service worker. It does two things and deliberately nothing else:
 * shows nudges, and opens the right page when one is tapped.
 *
 * No caching of pages. Every page here is somebody's private log, and a
 * shared phone or a signed-out browser must never be served one person's day
 * from a cache.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Time for a snack", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Time for a snack";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "snack",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/", snackId: data.snackId || null },
      actions: [
        { action: "start", title: "Start" },
        { action: "snooze", title: "In 30 min" },
      ],
    }),
  );
});

async function openOrFocus(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if ("focus" in client) {
      if ("navigate" in client) await client.navigate(url).catch(() => {});
      return client.focus();
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url } = event.notification.data || {};

  if (event.action === "snooze") {
    // Same-origin, with the session cookie: the server treats it like a tap
    // in the app, and the next reminder for this snack comes in 30 minutes.
    event.waitUntil(
      fetch("/api/nudges/snooze", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutes: 30 }),
      }).catch(() => {}),
    );
    return;
  }

  event.waitUntil(openOrFocus(url || "/"));
});
