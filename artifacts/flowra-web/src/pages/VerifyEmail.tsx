import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/error";

type VerifyState = "checking" | "success" | "error";

export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerifyState>("checking");
  const [message, setMessage] = useState("이메일 인증을 확인하고 있습니다.");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setMessage("인증 토큰이 없습니다.");
      return;
    }

    let active = true;
    verifyEmail(token)
      .then(() => {
        if (!active) return;
        setState("success");
        setMessage("이메일 인증이 완료되었습니다.");
        window.setTimeout(() => navigate("/", { replace: true }), 900);
      })
      .catch((err) => {
        if (!active) return;
        setState("error");
        setMessage(getErrorMessage(err, "이메일 인증에 실패했습니다."));
      });

    return () => {
      active = false;
    };
  }, [navigate, searchParams, verifyEmail]);

  const icon =
    state === "checking" ? (
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
    ) : state === "success" ? (
      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
    ) : (
      <XCircle className="h-6 w-6 text-red-600" />
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50">
          {icon}
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-950">
          이메일 인증
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {state === "error" && (
          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/signup"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              회원가입으로 이동
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              로그인으로 이동
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
