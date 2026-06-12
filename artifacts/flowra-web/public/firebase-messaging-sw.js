/* eslint-disable no-undef */

function getAppBaseUrl() {
  return self.registration.scope || `${self.location.origin}/`;
}

function getPayloadLink(payload) {
  const data = payload?.data || {};
  return (
    data.url ||
    data.link ||
    data.click_action ||
    payload?.fcmOptions?.link ||
    payload?.fcm_options?.link ||
    payload?.notification?.click_action ||
    null
  );
}

function getNotificationTargetUrl(notification) {
  const explicitUrl = notification?.data?.url;
  const fcmPayload = notification?.data?.FCM_MSG;
  const rawUrl = explicitUrl || getPayloadLink(fcmPayload) || getAppBaseUrl();
  const targetUrl = new URL(rawUrl, getAppBaseUrl());

  if (targetUrl.origin !== self.location.origin) {
    return getAppBaseUrl();
  }

  return targetUrl.href;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = getNotificationTargetUrl(event.notification);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }

        const sameOriginClient = clientList.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (sameOriginClient && "focus" in sameOriginClient) {
          if ("navigate" in sameOriginClient) {
            return sameOriginClient
              .navigate(targetUrl)
              .then((client) => client?.focus());
          }
          return sameOriginClient.focus();
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }

        return undefined;
      }),
  );
});

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

async function initializeFirebaseMessaging() {
  const configUrl = new URL("firebase-config.json", getAppBaseUrl());
  const response = await fetch(configUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load Firebase config: ${response.status}`);
  }

  const firebaseConfig = await response.json();
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw.js] Received background message:", payload);

    const data = payload.data || {};
    const notification = payload.notification || {};
    const hasNotificationPayload = Boolean(
      notification.title || notification.body || notification.icon,
    );

    if (hasNotificationPayload) {
      return;
    }

    const title = data.title || "Flowra";
    const body = data.body || data.message || "";
    const appBaseUrl = getAppBaseUrl();
    const icon = data.icon || new URL("favicon.svg", appBaseUrl).href;
    const badge = data.badge || new URL("favicon.svg", appBaseUrl).href;
    const url = getPayloadLink(payload) || appBaseUrl;

    return self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
    });
  });
}

initializeFirebaseMessaging().catch((error) => {
  console.error("[firebase-messaging-sw.js] Firebase Messaging setup failed:", error);
});
