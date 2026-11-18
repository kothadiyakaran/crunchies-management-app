/// <reference lib="webworker" />
// Service worker. Reproduces what vite-plugin-pwa's generateSW produced
// (precache, SPA fallback with /order/ excluded, immediate activation) and
// adds Web Push for the daily reminders.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/order\//] }));

type ReminderMessage = { title: string; body: string; url: string; tag: string };

self.addEventListener('push', (event) => {
  let msg: ReminderMessage;
  try {
    msg = event.data?.json() as ReminderMessage;
  } catch {
    return;
  }
  if (!msg?.title) return;
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: '/icons/icon-192.png',
      // Android paints the badge from its alpha channel only, so this is the
      // icon's "C" arc as a solid shape on transparency, not the colour icon.
      badge: '/icons/badge-96.png',
      data: { url: msg.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | null)?.url ?? '/today';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        // Focus first: Chrome only allows focus() shortly after the tap, and
        // navigate() can take longer than that on a slow connection.
        try {
          await existing.focus();
        } catch {
          await self.clients.openWindow(target);
          return;
        }
        try {
          await existing.navigate(target);
        } catch {
          // navigate() rejects for a window this worker doesn't control; the
          // app stays focused where it was.
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
