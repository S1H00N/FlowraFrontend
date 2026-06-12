import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import * as authApi from "@/api/auth";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/schemas";
import { getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", new_password_confirm: "" },
  });

  const onSubmit = useCallback(
    async (values: ResetPasswordFormValues) => {
      if (!token) {
        toast.error("비밀번호 재설정 토큰이 없습니다.");
        return;
      }
      try {
        await authApi.resetPassword({ token, ...values });
        setDone(true);
      } catch (err) {
        toast.error(getErrorMessage(err, "비밀번호 변경에 실패했습니다."));
      }
    },
    [token],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">
              비밀번호 재설정
            </h1>
            <p className="text-sm text-slate-500">새 비밀번호를 입력하세요.</p>
          </div>
        </div>

        {done ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-800">
            <p className="font-medium">비밀번호가 변경되었습니다.</p>
            <p className="mt-1">새 비밀번호로 다시 로그인해 주세요.</p>
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
                htmlFor="new_password"
              >
                새 비밀번호
              </label>
              <input
                id="new_password"
                type="password"
                autoComplete="new-password"
                {...register("new_password")}
                aria-invalid={!!errors.new_password}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              {errors.new_password && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.new_password.message}
                </p>
              )}
            </div>
            <div>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="new_password_confirm"
              >
                새 비밀번호 확인
              </label>
              <input
                id="new_password_confirm"
                type="password"
                autoComplete="new-password"
                {...register("new_password_confirm")}
                aria-invalid={!!errors.new_password_confirm}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              {errors.new_password_confirm && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.new_password_confirm.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !token}
              className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {isSubmitting ? "변경 중..." : "비밀번호 변경"}
            </button>
            {!token && (
              <p className="text-xs text-red-600">
                재설정 링크가 올바르지 않습니다.
              </p>
            )}
          </form>
        )}

        <Link
          to="/login"
          className="mt-6 block text-center text-sm font-medium text-violet-700 hover:underline"
        >
          로그인으로 이동
        </Link>
      </div>
    </div>
  );
}
