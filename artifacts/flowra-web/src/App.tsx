import { Fragment, lazy, Suspense, useLayoutEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import PushNotificationBridge from "@/components/PushNotificationBridge";
import Toaster from "@/components/ui/Toaster";
import { FullSpinner } from "@/components/ui/Spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error";
import { useApplyUserTheme } from "@/lib/userSettings";
import { installProjectHistoryGuard } from "@/lib/projectNavigationGuard";

installProjectHistoryGuard();

const Home = lazy(() => import("@/pages/Home"));
const Notices = lazy(() => import("@/pages/Notices"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Schedules = lazy(() => import("@/pages/Schedules"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Memos = lazy(() => import("@/pages/Memos"));
const Settings = lazy(() => import("@/pages/Settings"));
const CompanyInvite = lazy(() => import("@/pages/CompanyInvite"));
const NotFound = lazy(() => import("@/pages/not-found"));

function normalizeLeadingPathSlashes() {
  const normalizedPath = window.location.pathname.replace(/^\/{2,}/, "/");
  if (normalizedPath === window.location.pathname) return;

  window.history.replaceState(
    window.history.state,
    "",
    `${normalizedPath}${window.location.search}${window.location.hash}`,
  );
}

normalizeLeadingPathSlashes();

interface MutationMeta {
  successMessage?: string;
  errorMessage?: string;
  suppressErrorToast?: boolean;
  suppressSuccessToast?: boolean;
}

function createQueryClient() {
  const mutationCache = new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      // A cleared session may still finish a mutation. Its notifications belong
      // to that old session, just like its query-cache callbacks.
      if (!mutationCache.getAll().some((cached) => cached.mutationId === mutation.mutationId)) return;
      const meta = mutation.options.meta as MutationMeta | undefined;
      if (meta?.suppressSuccessToast) return;
      if (meta?.successMessage) toast.success(meta.successMessage);
    },
    onError: (err, _vars, _ctx, mutation) => {
      if (!mutationCache.getAll().some((cached) => cached.mutationId === mutation.mutationId)) return;
      const meta = mutation.options.meta as MutationMeta | undefined;
      if (meta?.suppressErrorToast) return;
      const fallback = meta?.errorMessage ?? "요청에 실패했습니다.";
      toast.error(getErrorMessage(err, fallback));
    },
  });
  return new QueryClient({
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
    mutationCache,
  });
}

function SessionQueryProvider({ children }: { children: ReactNode }) {
  const { sessionEpoch } = useAuth();
  const [session, setSession] = useState(() => ({
    epoch: sessionEpoch,
    client: createQueryClient(),
  }));
  if (session.epoch !== sessionEpoch) {
    // React retries this render before rendering children, so the new session's
    // pages always receive a fresh client while public auth pages stay mounted.
    setSession({ epoch: sessionEpoch, client: createQueryClient() });
  }
  useLayoutEffect(() => () => session.client.clear(), [session.client]);
  return <QueryClientProvider client={session.client}>{children}</QueryClientProvider>;
}

function SessionBoundary({ children }: { children: ReactNode }) {
  const { sessionEpoch } = useAuth();
  return <Fragment key={sessionEpoch}>{children}</Fragment>;
}

function SessionProtectedRoute({ children }: { children: ReactNode }) {
  return <SessionBoundary><ProtectedRoute>{children}</ProtectedRoute></SessionBoundary>;
}

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
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <SessionQueryProvider>
          <ThemeSync />
          <Toaster />
          <SessionBoundary><PushNotificationBridge /></SessionBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/notices" element={<SessionProtectedRoute><Notices /></SessionProtectedRoute>} />
              <Route path="/notifications" element={<SessionProtectedRoute><Notifications /></SessionProtectedRoute>} />
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
              <Route path="/company-invites/:token" element={<SessionBoundary><CompanyInvite /></SessionBoundary>} />
              <Route
                path="/"
                element={
                  <SessionProtectedRoute>
                    <Home />
                  </SessionProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <SessionProtectedRoute>
                    <Tasks />
                  </SessionProtectedRoute>
                }
              />
              <Route
                path="/schedules"
                element={
                  <SessionProtectedRoute>
                    <Schedules />
                  </SessionProtectedRoute>
                }
              />
              <Route
                path="/projects"
                element={<SessionProtectedRoute><Projects /></SessionProtectedRoute>}
              />
              <Route
                path="/projects/:companyProjectId"
                element={<SessionProtectedRoute><ProjectDetail /></SessionProtectedRoute>}
              />
              <Route
                path="/memos"
                element={
                  <SessionProtectedRoute>
                    <Memos />
                  </SessionProtectedRoute>
                }
              />
              <Route
                path="/categories"
                element={
                  <SessionProtectedRoute>
                    <Navigate to="/settings" replace />
                  </SessionProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <SessionProtectedRoute>
                    <Settings />
                  </SessionProtectedRoute>
                }
              />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </Suspense>
        </SessionQueryProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
