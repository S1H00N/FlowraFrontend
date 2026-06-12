import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import * as authApi from "@/api/auth";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/schemas";
import { getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";

export default function ForgotPassword() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = useCallback(async (values: ForgotPasswordFormValues) => {
    try {
      await authApi.forgotPassword(values);
      setSentEmail(values.email);
    } catch (err) {
      toast.error(
        getErrorMessage(err, "비밀번호 재설정 메일 요청에 실패했습니다."),
      );
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">
              비밀번호 찾기
            </h1>
            <p className="text-sm text-slate-500">Flowra 계정 이메일</p>
          </div>
        </div>

        {sentEmail ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-800">
            <p className="font-medium">메일 요청이 접수되었습니다.</p>
            <p className="mt-1">
              {sentEmail} 주소로 재설정 링크를 확인해 주세요.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {isSubmitting ? "요청 중..." : "재설정 메일 받기"}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-violet-700 hover:underline"
        >
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
