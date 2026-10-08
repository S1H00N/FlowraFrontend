import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authStorage } from "@/lib/auth-storage";
import * as authApi from "@/api/auth";
import { unregisterPushDevice } from "@/api/pushDevices";
import { setOnAuthFailure } from "@/api/client";
import { pushInbox } from "@/lib/pushInbox";
import {
  clearStoredBrowserPushToken,
  deleteCurrentBrowserPushToken,
  getStoredBrowserPushToken,
} from "@/lib/browserPush";
import type {
  GoogleLinkWithPasswordRequest,
  GooglePrepareResponseData,
  GoogleSignupRequest,
  GoogleSignupResponseData,
  LoginRequest,
  SignupRequest,
  SignupResponseData,
  User,
} from "@/types";

interface AuthContextValue {
  user: User | null;
  sessionEpoch: number;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  signup: (payload: SignupRequest) => Promise<SignupResponseData>;
  verifyEmail: (token: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<GooglePrepareResponseData>;
  linkGoogleWithPassword: (payload: GoogleLinkWithPasswordRequest) => Promise<void>;
  signupWithGoogle: (payload: GoogleSignupRequest) => Promise<GoogleSignupResponseData>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => {
    const token = authStorage.getAccessToken();
    return { user: token ? authStorage.getUser<User>() : null, epoch: 0 };
  });
  const { user, epoch: sessionEpoch } = session;
  const sessionEpochRef = useRef(sessionEpoch);
  useLayoutEffect(() => {
    sessionEpochRef.current = sessionEpoch;
  }, [sessionEpoch]);
  const setSessionUser = useCallback((nextUser: User | null, newLogin = false) => {
    setSession((current) => ({
      user: nextUser,
      epoch: current.epoch + (newLogin || current.user?.user_id !== nextUser?.user_id ? 1 : 0),
    }));
  }, []);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    const cached = authStorage.getUser<User>();
    if (token && cached) {
      setSessionUser(cached);
    } else if (!token && cached) {
      authStorage.clear();
      setSessionUser(null);
    }
    setIsInitializing(false);
  }, [setSessionUser]);

  const logout = useCallback(async () => {
    const ownerId = authStorage.getUser<User>()?.user_id ?? null;
    const logoutEpoch = sessionEpoch;
    const browserPushToken = getStoredBrowserPushToken();
    const refreshToken = authStorage.getRefreshToken();
    const ownsCurrentSession = () => sessionEpochRef.current === logoutEpoch &&
      (authStorage.getUser<User>()?.user_id ?? null) === ownerId;
    if (!ownsCurrentSession()) return;

    await pushInbox.setOwner(null).catch(() => {});
    if (!ownsCurrentSession()) return;
    if (browserPushToken) {
      try {
        await unregisterPushDevice({ device_token: browserPushToken });
      } catch {
        if (!ownsCurrentSession()) return;
        // If the server unlink fails, invalidate the FCM token but keep the user's
        // browser-level notification preference for the next login.
        try {
          await deleteCurrentBrowserPushToken({ keepEnabledPreference: true });
        } catch {
          if (!ownsCurrentSession()) return;
          clearStoredBrowserPushToken({ keepEnabledPreference: true });
        }
      }
    }
    if (!ownsCurrentSession()) return;

    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {
        // Local logout must still complete when the server token is already invalid.
      });
    }
    // Another tab can sign in while server logout is pending. Only finish the
    // local cleanup for the session that started this operation.
    if (!ownsCurrentSession()) return;
    authStorage.clear();
    setSessionUser(null);
    navigate("/login", { replace: true });
  }, [navigate, sessionEpoch, setSessionUser]);

  useEffect(() => {
    setOnAuthFailure(() => {
      void pushInbox.setOwner(null).catch(() => {});
      const browserPushToken = getStoredBrowserPushToken();
      if (browserPushToken) {
        void deleteCurrentBrowserPushToken({ keepEnabledPreference: true }).catch(() =>
          clearStoredBrowserPushToken({ keepEnabledPreference: true }),
        );
      } else {
        clearStoredBrowserPushToken({ keepEnabledPreference: true });
      }
      setSessionUser(null);
      navigate("/login", { replace: true });
    });
    return () => setOnAuthFailure(null);
  }, [navigate, setSessionUser]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key === null || event.key === "auth_user" || event.key === "access_token") {
        setSessionUser(authStorage.getAccessToken() ? authStorage.getUser<User>() : null);
      }
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [setSessionUser]);

  const persistLogin = useCallback((data: {
    user: User;
    access_token?: string;
    refresh_token?: string;
  }) => {
    const { user: nextUser, access_token, refresh_token } = data;
    if (!access_token || !refresh_token) {
      throw new Error("Auth response does not include tokens.");
    }
    authStorage.setTokens(access_token, refresh_token);
    authStorage.setUser(nextUser);
    setSessionUser(nextUser, true);
  }, [setSessionUser]);

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await authApi.login(payload);
    if (!res.success) {
      throw new Error(res.message || "Login failed.");
    }
    persistLogin(res.data);
  }, [persistLogin]);

  const signup = useCallback(async (payload: SignupRequest) => {
    const res = await authApi.signup(payload);
    if (!res.success) {
      throw new Error(res.message || "Signup failed.");
    }
    return res.data;
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const res = await authApi.verifyEmail({ token });
    if (!res.success) {
      throw new Error(res.message || "Email verification failed.");
    }
    persistLogin(res.data);
  }, [persistLogin]);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const res = await authApi.prepareGoogleLogin(idToken);
    if (!res.success) throw new Error(res.message || "Google login failed.");
    if (res.data.next_action === "signed_in") persistLogin(res.data);
    return res.data;
  }, [persistLogin]);

  const linkGoogleWithPassword = useCallback(async (payload: GoogleLinkWithPasswordRequest) => {
    const res = await authApi.linkGoogleWithPassword(payload);
    if (!res.success) throw new Error(res.message || "Google linking failed.");
    persistLogin(res.data);
  }, [persistLogin]);

  const signupWithGoogle = useCallback(async (payload: GoogleSignupRequest) => {
    const res = await authApi.signupWithGoogle(payload);
    if (!res.success) throw new Error(res.message || "Google signup failed.");
    if (!("requires_email_verification" in res.data && res.data.requires_email_verification)) {
      persistLogin(res.data);
    }
    return res.data;
  }, [persistLogin]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionEpoch,
      isAuthenticated: !!user && !!authStorage.getAccessToken(),
      isInitializing,
      login,
      signup,
      verifyEmail,
      signInWithGoogle,
      linkGoogleWithPassword,
      signupWithGoogle,
      logout,
    }),
    [user, sessionEpoch, isInitializing, login, signup, verifyEmail, signInWithGoogle, linkGoogleWithPassword, signupWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
