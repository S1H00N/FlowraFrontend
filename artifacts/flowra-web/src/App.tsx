import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PushNotificationBridge from "@/components/PushNotificationBridge";
import Toaster from "@/components/ui/Toaster";
import { FullSpinner } from "@/components/ui/Spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error";
import { useApplyUserTheme } from "@/lib/userSettings";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Schedules = lazy(() => import("@/pages/Schedules"));
const Memos = lazy(() => import("@/pages/Memos"));
const Settings = lazy(() => import("@/pages/Settings"));
const CompanyInvite = lazy(() => import("@/pages/CompanyInvite"));
const NotFound = lazy(() => import("@/pages/not-found"));

interface MutationMeta {
  successMessage?: string;
  errorMessage?: string;
  suppressErrorToast?: boolean;
  suppressSuccessToast?: boolean;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const meta = mutation.options.meta as MutationMeta | undefined;
      if (meta?.suppressSuccessToast) return;
      if (meta?.successMessage) toast.success(meta.successMessage);
    },
    onError: (err, _vars, _ctx, mutation) => {
      const meta = mutation.options.meta as MutationMeta | undefined;
      if (meta?.suppressErrorToast) return;
      const fallback = meta?.errorMessage ?? "요청에 실패했습니다.";
      toast.error(getErrorMessage(err, fallback));
    },
  }),
});

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function PageFallback() {
  return <FullSpinner message="불러오는 중..." />;
}

function ThemeSync() {
  useApplyUserTheme();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <Toaster />
          <PushNotificationBridge />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/verify-email/:token" element={<VerifyEmail />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
              <Route
                path="/auth/verify-email/:token"
                element={<VerifyEmail />}
              />
              <Route
                path="/api/v1/auth/verify-email"
                element={<VerifyEmail />}
              />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/company-invites/:token" element={<CompanyInvite />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute>
                    <Tasks />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/schedules"
                element={
                  <ProtectedRoute>
                    <Schedules />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/memos"
                element={
                  <ProtectedRoute>
                    <Memos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/categories"
                element={
                  <ProtectedRoute>
                    <Navigate to="/settings" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
