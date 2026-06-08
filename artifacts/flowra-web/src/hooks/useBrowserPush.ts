import { useEffect, useRef, useState } from "react";
import { registerPushDevice } from "@/api/pushDevices";
import { useAuth } from "@/contexts/AuthContext";
import {
  checkBrowserPushSupport,
  getBrowserDeviceName,
  getBrowserPushAppVersion,
  getBrowserPushEnabledPreference,
  getPushNotificationText,
  getStoredBrowserPushToken,
  listenForegroundPush,
  readBrowserPushPermission,
  requestBrowserPushToken,
  setStoredBrowserPushToken,
  showForegroundPushNotification,
  subscribeBrowserPushStateChange,
  type BrowserPushPermission,
  type BrowserPushSupportResult,
} from "@/lib/browserPush";
import { toast } from "@/lib/toast";

export function useBrowserPush() {
  const { isAuthenticated, user } = useAuth();
  const [permission, setPermission] = useState<BrowserPushPermission>(() =>
    readBrowserPushPermission(),
  );
  const [support, setSupport] = useState<BrowserPushSupportResult | null>(null);
  const autoRegistrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    void checkBrowserPushSupport().then((nextSupport) => {
      if (active) setSupport(nextSupport);
    });

    const syncPermission = () => setPermission(readBrowserPushPermission());

    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    const unsubscribeStateChange = subscribeBrowserPushStateChange(syncPermission);

    return () => {
      active = false;
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
      unsubscribeStateChange();
    };
  }, []);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !user ||
      !support?.supported ||
      permission !== "granted" ||
      !getBrowserPushEnabledPreference()
    ) {
      return;
    }

    const existingToken = getStoredBrowserPushToken();
    const registrationKey = `${user.user_id}:${existingToken ?? "new"}`;
    if (autoRegistrationKeyRef.current === registrationKey) return;
    autoRegistrationKeyRef.current = registrationKey;

    let cancelled = false;

    void (async () => {
      const token = existingToken ?? (await requestBrowserPushToken());
      const res = await registerPushDevice({
        provider: "fcm",
        platform: "web",
        device_token: token,
        device_name: getBrowserDeviceName(),
        app_version: getBrowserPushAppVersion() || "1.0.0",
      });

      if (!res.success) {
        throw new Error(res.message || "브라우저 알림 등록에 실패했습니다.");
      }

      if (!cancelled) {
        setStoredBrowserPushToken(token);
      }
    })().catch(() => {
      if (!cancelled) {
        autoRegistrationKeyRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, permission, support?.supported, user]);

  useEffect(() => {
    if (!isAuthenticated || !support?.supported || permission !== "granted") {
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    void listenForegroundPush((payload) => {
      const { title, body } = getPushNotificationText(payload);
      void showForegroundPushNotification(payload).catch(() => {
        // Keep the in-app toast even if the OS notification surface is unavailable.
      });
      toast.info(body ? `${title}: ${body}` : title, 6000);
    })
      .then((nextUnsubscribe) => {
        if (!mounted) {
          nextUnsubscribe?.();
          return;
        }
        unsubscribe = nextUnsubscribe;
      })
      .catch(() => {
        // Push setup is optional; the settings screen shows actionable errors.
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isAuthenticated, permission, support?.supported]);
}

export default useBrowserPush;
