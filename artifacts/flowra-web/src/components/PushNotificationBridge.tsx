import { useBrowserPush } from "@/hooks/useBrowserPush";

export default function PushNotificationBridge() {
  useBrowserPush();

  return null;
}
