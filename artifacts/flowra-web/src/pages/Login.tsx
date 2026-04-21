import { useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { loginSchema, type LoginFormValues } from "@/lib/schemas";

interface LocationState {
  from?: { pathname: string };
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname || "/";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = useCallback(
    async (values: LoginFormValues) => {
      try {
        await login(values);
        navigate(from, { replace: true });
      } catch {
        /* toast handled globally */
      }
    },
    [login, navigate, from],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">로그인</h1>
        <p className="mt-1 text-sm text-slate-500">
          Flowra 계정으로 로그인하세요.
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-6 space-y-4"
        >
          <div>
            <label
              className="block text-sm font-medium text-slate-700"
              htmlFor="email"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              aria-invalid={!!errors.email}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                errors.email
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
              }`}
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label
              className="block text-sm font-medium text-slate-700"
              htmlFor="password"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
              aria-invalid={!!errors.password}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                errors.password
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
              }`}
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          계정이 없으신가요?{" "}
          <Link
            to="/signup"
            className="font-medium text-slate-900 hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
