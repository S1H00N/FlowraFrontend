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
import { setOnAuthFailure } from "@/api/client";
import type { LoginRequest, SignupRequest, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  signup: (payload: SignupRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(() => authStorage.getUser<User>());
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    const cached = authStorage.getUser<User>();
    if (token && cached) {
      setUser(cached);
    }
    setIsInitializing(false);
  }, []);

  const logout = useCallback(() => {
    const refreshToken = authStorage.getRefreshToken();
    if (refreshToken) {
      void authApi.logout(refreshToken).catch(() => {
        // Local logout must still complete when the server token is already invalid.
      });
    }
    authStorage.clear();
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
      navigate("/login", { replace: true });
    });
    return () => setOnAuthFailure(null);
  }, [navigate]);

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await authApi.login(payload);
    if (!res.success) {
      throw new Error(res.message || "Login failed.");
    }
    const { user: nextUser, access_token, refresh_token } = res.data;
    if (!access_token || !refresh_token) {
      throw new Error("Login response does not include tokens.");
    }
    authStorage.setTokens(access_token, refresh_token);
    authStorage.setUser(nextUser);
    setUser(nextUser);
  }, []);

  const signup = useCallback(async (payload: SignupRequest) => {
    const res = await authApi.signup(payload);
    if (!res.success) {
      throw new Error(res.message || "Signup failed.");
    }

    const loginRes = await authApi.login({
      email: payload.email,
      password: payload.password,
    });
    if (!loginRes.success) {
      authStorage.setUser(res.data);
      setUser(res.data);
      return;
    }

    const { user: nextUser, access_token, refresh_token } = loginRes.data;
    if (access_token && refresh_token) {
      authStorage.setTokens(access_token, refresh_token);
    }
    authStorage.setUser(nextUser);
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isInitializing,
      login,
      signup,
      logout,
    }),
    [user, isInitializing, login, signup, logout],
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
