import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const requiredFirebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const firebaseVapidEnvKeys = [
  "VITE_FIREBASE_VAPID_KEY",
  "VITE_FIREBASE_PUBLIC_VAPID_KEY",
] as const;

export interface FirebasePushConfigState {
  configured: boolean;
  missingKeys: string[];
  vapidKey: string | null;
}

function readEnv(key: string) {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function getFirebasePushConfigState(): FirebasePushConfigState {
  const vapidCandidates = getFirebaseVapidKeyCandidates();
  const missingKeys = [
    ...requiredFirebaseEnvKeys.filter((key) => !readEnv(key)),
    ...(vapidCandidates.length === 0 ? ["VITE_FIREBASE_VAPID_KEY"] : []),
  ];

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    vapidKey: vapidCandidates[0] ?? null,
  };
}

export function getFirebaseVapidKeyCandidates() {
  return firebaseVapidEnvKeys.reduce<string[]>((keys, envKey) => {
    const value = readEnv(envKey);
    if (value && !keys.includes(value)) keys.push(value);
    return keys;
  }, []);
}

function getFirebaseOptions(): FirebaseOptions {
  return {
    apiKey: readEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN") || undefined,
    projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET") || undefined,
    messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readEnv("VITE_FIREBASE_APP_ID"),
    measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID") || undefined,
  };
}

export async function isFirebaseMessagingAvailable() {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function getFirebaseMessaging(): Promise<Messaging> {
  const configState = getFirebasePushConfigState();
  if (!configState.configured) {
    throw new Error("Firebase 메시징 환경 변수가 설정되지 않았습니다.");
  }

  if (!(await isFirebaseMessagingAvailable())) {
    throw new Error("이 브라우저는 Firebase 메시징을 지원하지 않습니다.");
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseOptions());
  return getMessaging(app);
}
