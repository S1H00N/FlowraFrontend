import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authStorage } from "@/lib/auth-storage";
import * as authApi from "@/api/auth";
import { unregisterPushDevice } from "@/api/pushDevices";
import { setOnAuthFailure } from "@/api/client";
import {
  clearStoredBrowserPushToken,
  deleteCurrentBrowserPushToken,
  getStoredBrowserPushToken,
} from "@/lib/browserPush";
import type { LoginRequest, SignupRequest, SignupResponseData, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  signup: (payload: SignupRequest) => Promise<SignupResponseData>;
  verifyEmail: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(() => {
    const token = authStorage.getAccessToken();
    return token ? authStorage.getUser<User>() : null;
  });
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    const cached = authStorage.getUser<User>();
    if (token && cached) {
      setUser(cached);
    } else if (!token && cached) {
      authStorage.clear();
      setUser(null);
    }
    setIsInitializing(false);
  }, []);

  const logout = useCallback(async () => {
    const browserPushToken = getStoredBrowserPushToken();
    if (browserPushToken) {
      try {
        await unregisterPushDevice({ device_token: browserPushToken });
      } catch {
        // If the server unlink fails, invalidate the FCM token but keep the user's
        // browser-level notification preference for the next login.
        try {
          await deleteCurrentBrowserPushToken({ keepEnabledPreference: true });
        } catch {
          clearStoredBrowserPushToken({ keepEnabledPreference: true });
        }
      }
    }

    const refreshToken = authStorage.getRefreshToken();
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {
        // Local logout must still complete when the server token is already invalid.
      });
    }
    authStorage.clear();
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    setOnAuthFailure(() => {
      const browserPushToken = getStoredBrowserPushToken();
      if (browserPushToken) {
        void deleteCurrentBrowserPushToken({ keepEnabledPreference: true }).catch(() =>
          clearStoredBrowserPushToken({ keepEnabledPreference: true }),
        );
      } else {
        clearStoredBrowserPushToken({ keepEnabledPreference: true });
      }
      setUser(null);
      navigate("/login", { replace: true });
    });
    return () => setOnAuthFailure(null);
  }, [navigate]);

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
    setUser(nextUser);
  }, []);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user && !!authStorage.getAccessToken(),
      isInitializing,
      login,
      signup,
      verifyEmail,
      logout,
    }),
    [user, isInitializing, login, signup, verifyEmail, logout],
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
