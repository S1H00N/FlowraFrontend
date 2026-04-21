import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { signupSchema, type SignupFormValues } from "@/lib/schemas";

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
        navigate("/login", { replace: true });
      } catch {
        /* toast handled globally */
      }
    },
    [signup, navigate],
  );

  const inputClass = (hasError: boolean) =>
    `mt-1 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
      hasError
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">회원가입</h1>
        <p className="mt-1 text-sm text-slate-500">
          Flowra 계정을 새로 만드세요.
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
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
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
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
          >
            {isSubmitting ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{" "}
          <Link
            to="/login"
            className="font-medium text-slate-900 hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
