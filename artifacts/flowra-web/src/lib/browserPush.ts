import {
  deleteToken,
  getToken,
  onMessage,
  type MessagePayload,
  type Unsubscribe,
} from "firebase/messaging";
import {
  getFirebaseMessaging,
  getFirebasePushConfigState,
  getFirebaseVapidKeyCandidates,
  isFirebaseMessagingAvailable,
} from "@/lib/firebase";

const BROWSER_PUSH_TOKEN_KEY = "flowra_browser_push_token";
const BROWSER_PUSH_ENABLED_KEY = "flowra_browser_push_enabled";
const BROWSER_PUSH_STATE_CHANGE_EVENT = "flowra-browser-push-state-change";

export type BrowserPushPermission = NotificationPermission | "unsupported";

export interface BrowserPushSupportResult {
  supported: boolean;
  reason?: string;
  missingEnv?: string[];
}

function hasWindow() {
  return typeof window !== "undefined";
}

function getServiceWorkerUrl() {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}firebase-messaging-sw.js`;
}

function getServiceWorkerScope() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function readLocalStorage(key: string) {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing modes can block storage; push still works for this session.
  }
}

function removeLocalStorage(key: string) {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup errors.
  }
}

function emitBrowserPushStateChange() {
  if (!hasWindow()) return;
  window.dispatchEvent(new Event(BROWSER_PUSH_STATE_CHANGE_EVENT));
}

export function subscribeBrowserPushStateChange(listener: () => void) {
  if (!hasWindow()) return () => {};

  window.addEventListener(BROWSER_PUSH_STATE_CHANGE_EVENT, listener);
  return () => window.removeEventListener(BROWSER_PUSH_STATE_CHANGE_EVENT, listener);
}

export function getStoredBrowserPushToken() {
  return readLocalStorage(BROWSER_PUSH_TOKEN_KEY);
}

export function getBrowserPushEnabledPreference() {
  const preference = readLocalStorage(BROWSER_PUSH_ENABLED_KEY);
  if (preference === "true") return true;
  if (preference === "false") return false;

  return getStoredBrowserPushToken() !== null;
}

export function setBrowserPushEnabledPreference(enabled: boolean) {
  writeLocalStorage(BROWSER_PUSH_ENABLED_KEY, String(enabled));
  emitBrowserPushStateChange();
}

export function setStoredBrowserPushToken(token: string) {
  writeLocalStorage(BROWSER_PUSH_TOKEN_KEY, token);
  writeLocalStorage(BROWSER_PUSH_ENABLED_KEY, "true");
  emitBrowserPushStateChange();
}

export function clearStoredBrowserPushToken(options?: {
  keepEnabledPreference?: boolean;
}) {
  removeLocalStorage(BROWSER_PUSH_TOKEN_KEY);
  if (!options?.keepEnabledPreference) {
    writeLocalStorage(BROWSER_PUSH_ENABLED_KEY, "false");
  }
  emitBrowserPushStateChange();
}

export function readBrowserPushPermission(): BrowserPushPermission {
  if (!hasWindow() || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function checkBasicBrowserPushSupport(): BrowserPushSupportResult {
  if (!hasWindow()) {
    return { supported: false, reason: "브라우저 환경에서만 사용할 수 있습니다." };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: "브라우저 알림은 HTTPS 또는 localhost에서만 사용할 수 있습니다.",
    };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "이 브라우저는 알림 권한을 지원하지 않습니다." };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "이 브라우저는 서비스 워커를 지원하지 않습니다." };
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "이 브라우저는 Push API를 지원하지 않습니다." };
  }

  const configState = getFirebasePushConfigState();
  if (!configState.configured) {
    return {
      supported: false,
      reason: "Firebase 메시징 환경 변수가 설정되지 않았습니다.",
      missingEnv: configState.missingKeys,
    };
  }
  if (!getValidFirebaseVapidPublicKey()) {
    return {
      supported: false,
      reason:
        "Firebase VAPID 공개키가 올바르지 않습니다. Firebase Console의 Web Push certificates에서 키 쌍의 공개키를 다시 복사해 주세요.",
    };
  }

  return { supported: true };
}

function isValidVapidPublicKey(value: string) {
  if (!hasWindow() || /\s/.test(value)) return false;

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = window.atob(padded);
    return decoded.length === 65 && decoded.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

function getValidFirebaseVapidPublicKey() {
  return getFirebaseVapidKeyCandidates().find(isValidVapidPublicKey) ?? null;
}

export async function checkBrowserPushSupport(): Promise<BrowserPushSupportResult> {
  const basicSupport = checkBasicBrowserPushSupport();
  if (!basicSupport.supported) return basicSupport;

  if (!(await isFirebaseMessagingAvailable())) {
    return { supported: false, reason: "이 브라우저는 Firebase 메시징을 지원하지 않습니다." };
  }

  return { supported: true };
}

export async function registerBrowserPushServiceWorker() {
  const registration = await navigator.serviceWorker.register(
    getServiceWorkerUrl(),
    { scope: getServiceWorkerScope() },
  );
  await navigator.serviceWorker.ready;
  return registration;
}

export async function requestBrowserNotificationPermission() {
  const support = checkBasicBrowserPushSupport();
  if (!support.supported) {
    throw new Error(support.reason || "브라우저 알림을 사용할 수 없습니다.");
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission === "denied") {
    throw new Error("브라우저 알림 권한이 차단되어 있습니다.");
  }
  if (permission !== "granted") {
    throw new Error("브라우저 알림 권한이 허용되지 않았습니다.");
  }

  emitBrowserPushStateChange();
  return permission;
}

export async function requestBrowserPushToken() {
  await requestBrowserNotificationPermission();

  if (!(await isFirebaseMessagingAvailable())) {
    throw new Error("이 브라우저는 Firebase 메시징을 지원하지 않습니다.");
  }

  const vapidKey = getValidFirebaseVapidPublicKey();
  if (!vapidKey) {
    throw new Error(
      "Firebase VAPID 공개키가 올바르지 않습니다. Firebase Console의 Web Push certificates에서 키 쌍의 공개키를 다시 복사해 주세요.",
    );
  }

  const messaging = await getFirebaseMessaging();
  const serviceWorkerRegistration = await registerBrowserPushServiceWorker();
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });

  if (!token) {
    throw new Error("FCM 등록 토큰을 발급받지 못했습니다.");
  }

  return token;
}

export async function deleteCurrentBrowserPushToken(options?: {
  keepEnabledPreference?: boolean;
}) {
  const messaging = await getFirebaseMessaging();
  await deleteToken(messaging);
  clearStoredBrowserPushToken(options);
}

export async function listenForegroundPush(
  onReceive: (payload: MessagePayload) => void,
): Promise<Unsubscribe | null> {
  const support = await checkBrowserPushSupport();
  if (!support.supported || readBrowserPushPermission() !== "granted") {
    return null;
  }

  const messaging = await getFirebaseMessaging();
  return onMessage(messaging, onReceive);
}

function getAppBaseUrl() {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(base, window.location.origin).href;
}

function getPayloadLink(payload: MessagePayload) {
  const data = payload.data ?? {};
  const notification = payload.notification as
    | { click_action?: string }
    | undefined;

  return (
    data.url ||
    data.link ||
    data.click_action ||
    payload.fcmOptions?.link ||
    notification?.click_action ||
    null
  );
}

function getNotificationTargetUrl(payload: MessagePayload) {
  const appBaseUrl = getAppBaseUrl();
  const rawUrl = getPayloadLink(payload) || appBaseUrl;
  const targetUrl = new URL(rawUrl, appBaseUrl);

  if (targetUrl.origin !== window.location.origin) {
    return appBaseUrl;
  }

  return targetUrl.href;
}

async function getBrowserPushServiceWorkerRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration(
    getServiceWorkerScope(),
  );
  return existingRegistration ?? registerBrowserPushServiceWorker();
}

export async function showForegroundPushNotification(payload: MessagePayload) {
  if (!hasWindow() || readBrowserPushPermission() !== "granted") return;

  const { title, body } = getPushNotificationText(payload);
  const data = payload.data ?? {};
  const notification = payload.notification as
    | { icon?: string; image?: string }
    | undefined;
  const appBaseUrl = getAppBaseUrl();
  const registration = await getBrowserPushServiceWorkerRegistration();

  await registration.showNotification(title, {
    body,
    icon:
      data.icon ||
      notification?.icon ||
      notification?.image ||
      new URL("favicon.svg", appBaseUrl).href,
    badge: data.badge || new URL("favicon.svg", appBaseUrl).href,
    data: { url: getNotificationTargetUrl(payload) },
  });
}

export function getBrowserDeviceName() {
  if (!hasWindow()) return "Web browser";

  const userAgent = navigator.userAgent;
  const browserName = /Edg\//.test(userAgent)
    ? "Microsoft Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Web browser";

  return navigator.platform ? `${browserName} on ${navigator.platform}` : browserName;
}

export function getBrowserPushAppVersion() {
  const version = import.meta.env.VITE_APP_VERSION;
  return typeof version === "string" && version.trim() ? version.trim() : null;
}

export function getPushNotificationText(payload: MessagePayload) {
  const data = payload.data ?? {};
  const title = payload.notification?.title ?? data.title ?? "Flowra";
  const body = payload.notification?.body ?? data.body ?? data.message ?? "";
  return { title, body };
}
