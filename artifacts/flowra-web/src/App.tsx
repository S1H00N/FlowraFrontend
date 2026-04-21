import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Toaster from "@/components/ui/Toaster";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Tasks from "@/pages/Tasks";
import Schedules from "@/pages/Schedules";
import Memos from "@/pages/Memos";
import NotFound from "@/pages/not-found";

interface MutationMeta {
  successMessage?: string;
  errorMessage?: string;
  suppressErrorToast?: boolean;
  suppressSuccessToast?: boolean;
}

const queryClient = new QueryClient({
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <Toaster />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
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
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
