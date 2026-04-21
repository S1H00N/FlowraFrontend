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
    authStorage.clear();
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  // Register handler so axios interceptor can trigger logout on
  // refresh failure / unrecoverable auth errors.
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
      throw new Error(res.message || "로그인에 실패했습니다.");
    }
    const { user: u, tokens } = res.data;
    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new Error("로그인 응답에 토큰이 없습니다.");
    }
    authStorage.setTokens(tokens.access_token, tokens.refresh_token);
    authStorage.setUser(u);
    setUser(u);
  }, []);

  const signup = useCallback(async (payload: SignupRequest) => {
    const res = await authApi.signup(payload);
    if (!res.success) {
      throw new Error(res.message || "회원가입에 실패했습니다.");
    }
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
