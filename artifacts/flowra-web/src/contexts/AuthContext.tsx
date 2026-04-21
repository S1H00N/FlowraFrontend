import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authStorage } from "@/lib/auth-storage";
import * as authApi from "@/api/auth";
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

  const login = useCallback(async (payload: LoginRequest) => {
    const res = await authApi.login(payload);
    if (!res.success) {
      throw new Error(res.message || "로그인에 실패했습니다.");
    }
    const { access_token, refresh_token, user: u } = res.data;
    authStorage.setTokens(access_token, refresh_token);
    authStorage.setUser(u);
    setUser(u);
  }, []);

  const signup = useCallback(async (payload: SignupRequest) => {
    const res = await authApi.signup(payload);
    if (!res.success) {
      throw new Error(res.message || "회원가입에 실패했습니다.");
    }
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setUser(null);
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
