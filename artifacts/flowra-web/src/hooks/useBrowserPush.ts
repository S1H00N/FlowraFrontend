import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { registerPushDevice, unregisterPushDevice } from "@/api/pushDevices";
import { useAuth } from "@/contexts/AuthContext";
import { NOTIFICATIONS_QUERY_KEY } from "@/hooks/useNotifications";
import { pushInbox, PUSH_INBOX_CHANGED, saveReceivedPush } from "@/lib/pushInbox";
import { authStorage } from "@/lib/auth-storage";
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
  registerBrowserPushServiceWorker,
  setStoredBrowserPushToken,
  showForegroundPushNotification,
  subscribeBrowserPushStateChange,
  type BrowserPushPermission,
  type BrowserPushSupportResult,
} from "@/lib/browserPush";
import { toast } from "@/lib/toast";

export function useBrowserPush() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<BrowserPushPermission>(() =>
    readBrowserPushPermission(),
  );
  const [support, setSupport] = useState<BrowserPushSupportResult | null>(null);
  const [enabled, setEnabled] = useState(getBrowserPushEnabledPreference);
  const autoRegistrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Keep this binding after the tab closes so background receipts retain their owner.
    void pushInbox.setOwner(isAuthenticated && getBrowserPushEnabledPreference() && user ? user.user_id : null).catch(() => {});
  }, [enabled, isAuthenticated, user?.user_id]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshNotifications();
    };
    const onBackgroundPush = (event: MessageEvent) => {
      if (event.data?.type === "flowra-notifications-changed") {
        refreshNotifications();
      }
    };

    // Refresh even when push is disabled here or was received while the app was closed.
    window.addEventListener("focus", refreshNotifications);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onBackgroundPush);
    window.addEventListener(PUSH_INBOX_CHANGED, refreshNotifications);
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(PUSH_INBOX_CHANGED) : null;
    if (channel) channel.onmessage = refreshNotifications;
    return () => {
      window.removeEventListener("focus", refreshNotifications);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onBackgroundPush);
      window.removeEventListener(PUSH_INBOX_CHANGED, refreshNotifications);
      channel?.close();
    };
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    let active = true;

    void checkBrowserPushSupport().then((nextSupport) => {
      if (active) setSupport(nextSupport);
    });

    const syncPermission = () => {
      setPermission(readBrowserPushPermission());
      setEnabled(getBrowserPushEnabledPreference());
    };

    window.addEventListener("focus", syncPermission);
    window.addEventListener("storage", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    const unsubscribeStateChange = subscribeBrowserPushStateChange(syncPermission);

    return () => {
      active = false;
      window.removeEventListener("focus", syncPermission);
      window.removeEventListener("storage", syncPermission);
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
      !enabled
    ) {
      autoRegistrationKeyRef.current = null;
      return;
    }

    const existingToken = getStoredBrowserPushToken();
    const registrationKey = `${user.user_id}:${existingToken ?? "new"}`;
    if (autoRegistrationKeyRef.current === registrationKey) return;
    autoRegistrationKeyRef.current = registrationKey;

    let cancelled = false;

    void (async () => {
      if (existingToken) await registerBrowserPushServiceWorker();
      const token = existingToken ?? (await requestBrowserPushToken());
      if (cancelled || !getBrowserPushEnabledPreference()) return;
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

      // Disabling can finish while registration is in flight. Keep the server disabled too.
      if (!getBrowserPushEnabledPreference()) {
        await unregisterPushDevice({ device_token: token });
        return;
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
  }, [enabled, isAuthenticated, permission, support?.supported, user]);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !user || !support?.supported || permission !== "granted") {
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    void listenForegroundPush((payload) => {
      if (!mounted || !getBrowserPushEnabledPreference()) return;
      if (authStorage.getUser<{ user_id: number }>()?.user_id !== user.user_id) return;
      void saveReceivedPush(payload, user.user_id).catch(() => {
        toast.error("받은 알림을 수신함에 저장하지 못했습니다.");
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      });
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
  }, [enabled, isAuthenticated, permission, queryClient, support?.supported, user?.user_id]);
}

export default useBrowserPush;
