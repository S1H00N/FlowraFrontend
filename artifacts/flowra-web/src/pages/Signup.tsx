import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { signupSchema, type SignupFormValues } from "@/lib/schemas";
import { Sparkles } from "lucide-react";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = useCallback(
    async (values: SignupFormValues) => {
      try {
        await signup(values);
        navigate("/", { replace: true });
      } catch {
        /* toast handled globally */
      }
    },
    [signup, navigate],
  );

  const inputClass = (hasError: boolean) =>
    `mt-1 w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm outline-none transition focus:ring-2 ${
      hasError
        ? "border-red-400 focus:border-red-500 focus:ring-red-100"
        : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-100"
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">Flowra</p>
            <p className="text-xs text-slate-500">Personal productivity</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            회원가입
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Flowra에서 오늘의 실행 흐름을 정리해 보세요.
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="mt-6 space-y-4"
          >
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="name"
              >
                이름
              </label>
              <input
                id="name"
                type="text"
                {...register("name")}
                aria-invalid={!!errors.name}
                className={inputClass(!!errors.name)}
                placeholder="홍길동"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>

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
                className={inputClass(!!errors.email)}
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
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
                autoComplete="new-password"
                {...register("password")}
                aria-invalid={!!errors.password}
                className={inputClass(!!errors.password)}
                placeholder="영문+숫자 포함 8자 이상"
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
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isSubmitting ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            이미 계정이 있으신가요?{" "}
            <Link
              to="/login"
              className="font-medium text-emerald-700 hover:underline"
            >
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
