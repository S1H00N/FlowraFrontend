import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import GoogleIdButton from "@/components/GoogleIdButton";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorCode, getErrorMessage } from "@/lib/error";
import { loginSchema, signupSchema } from "@/lib/schemas";
import type { GooglePrepareResponseData } from "@/types";

type PendingGoogleLogin = Exclude<GooglePrepareResponseData, { next_action: "signed_in" }>;

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export default function GoogleAuthFlow({
  onSignedIn,
  disabled = false,
  requestLock,
  onBusyChange,
}: {
  onSignedIn: () => void;
  disabled?: boolean;
  requestLock: RefObject<boolean>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { signInWithGoogle, linkGoogleWithPassword, signupWithGoogle } = useAuth();
  // Google ID tokens are forwarded directly; one-use tickets only live in this component.
  const [pending, setPending] = useState<PendingGoogleLogin | null>(null);
  const [mode, setMode] = useState<"link" | "signup">("link");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<{ email: string; expiresAt?: string } | null>(null);
  const controlsDisabled = busy || disabled;

  useEffect(() => {
    if (!pending) return;
    const expiresIn = Date.parse(pending.expires_at) - Date.now();
    const expire = () => {
      setPending(null);
      setPassword("");
      setError("Google 로그인 단계가 만료되었습니다. Google 계정을 다시 선택해 주세요.");
    };
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, expiresIn);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const handleError = (err: unknown) => {
    setError(getErrorMessage(err, "Google 인증에 실패했습니다."));
    if (["INVALID_GOOGLE_LINK_TICKET", "GOOGLE_ACCOUNT_CONFLICT", "GOOGLE_ACCOUNT_ALREADY_LINKED", "GOOGLE_VERIFICATION_EMAIL_FAILED"].includes(getErrorCode(err) ?? "")) {
      setPending(null);
    }
    setPassword("");
  };

  const prepare = async (idToken: string) => {
    if (busyRef.current || disabled || requestLock.current) return;
    busyRef.current = true;
    requestLock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setPassword("");
    try {
      const result = await signInWithGoogle(idToken);
      if (result.next_action === "signed_in") {
        onSignedIn();
      } else {
        setPending(result);
        setMode(result.next_action === "signup" ? "signup" : "link");
        setName(result.google_profile.name ?? "");
        // The user explicitly chooses the target account, even when the emails match.
        setEmail("");
      }
    } catch (err) {
      handleError(err);
    } finally {
      busyRef.current = false;
      requestLock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending || busyRef.current || disabled || requestLock.current) return;
    const validation = mode === "link"
      ? loginSchema.safeParse({ email, password })
      : signupSchema.pick({ name: true, password: true }).safeParse({ name, password });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "입력 내용을 확인해 주세요.");
      return;
    }
    busyRef.current = true;
    requestLock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      if (mode === "link") {
        await linkGoogleWithPassword({ link_ticket: pending.link_ticket, email, password });
        setPending(null);
        onSignedIn();
      } else {
        const result = await signupWithGoogle({
          link_ticket: pending.link_ticket,
          name: name.trim(),
          password,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if ("requires_email_verification" in result && result.requires_email_verification) {
          setVerification({ email: pending.google_profile.email, expiresAt: result.verification_expires_at });
        } else {
          onSignedIn();
        }
        setPending(null);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setPassword("");
      busyRef.current = false;
      requestLock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  if (verification) {
    return (
      <div className="mt-6 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800" role="status">
        <p className="font-medium">인증 메일을 보냈습니다.</p>
        <p className="mt-2">{verification.email} 주소의 인증 링크를 확인하면 회원가입이 완료됩니다.</p>
        {verification.expiresAt && <p className="mt-2 text-xs">링크 만료: {new Date(verification.expiresAt).toLocaleString("ko-KR")}</p>}
        <button type="button" className="mt-3 text-xs underline" onClick={() => { setVerification(null); setError(null); }}>
          Google 계정 다시 선택
        </button>
        {error && <p className="mt-2 text-red-600" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <section className="mt-6 border-t border-slate-200 pt-5" aria-label="Google 로그인">
      {!pending ? (
        <>
          <GoogleIdButton onCredential={(idToken) => void prepare(idToken)} disabled={controlsDisabled} />
          {busy && <p className="mt-2 text-xs text-slate-500" role="status">Google 계정을 확인하고 있습니다.</p>}
        </>
      ) : (
        <div className="space-y-3">
          <p className="break-all text-sm font-medium text-slate-700">Google 계정: {pending.google_profile.email}</p>
          {pending.existing_account && (
            <p className="text-xs leading-5 text-slate-500">
              {pending.existing_account.name}님의 기존 Flowra 계정이 있습니다.
              {pending.existing_account.masked_email ?? pending.existing_account.email_masked ?? ""}
              {" "}연결할 계정의 이메일과 비밀번호를 직접 입력해 주세요.
            </p>
          )}
          <div className="flex gap-2 text-xs">
            <button type="button" disabled={controlsDisabled} onClick={() => { setMode("link"); setPassword(""); setError(null); }} className={mode === "link" ? "font-semibold text-violet-700" : "text-slate-500 underline"}>기존 계정 연결</button>
            {pending.next_action === "signup" && (
              <button type="button" disabled={controlsDisabled} onClick={() => { setMode("signup"); setPassword(""); setError(null); }} className={mode === "signup" ? "font-semibold text-violet-700" : "text-slate-500 underline"}>새 계정 만들기</button>
            )}
          </div>
          <form onSubmit={submit} noValidate className="space-y-3" aria-label={mode === "link" ? "Google 기존 계정 연결" : "Google 회원가입"}>
            {mode === "link" ? (
              <label className="block text-sm text-slate-700">
                Flowra 이메일
                <input type="email" value={email} disabled={controlsDisabled} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={inputClass} />
              </label>
            ) : (
              <label className="block text-sm text-slate-700">
                표시 이름
                <input type="text" value={name} disabled={controlsDisabled} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClass} />
              </label>
            )}
            <label className="block text-sm text-slate-700">
              Flowra 비밀번호
              <input type="password" value={password} disabled={controlsDisabled} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "link" ? "current-password" : "new-password"} className={inputClass} />
            </label>
            {mode === "signup" && <p className="text-xs leading-5 text-slate-500">Flowra 비밀번호를 설정하면 이메일 로그인과 계정 복구에도 사용할 수 있습니다.</p>}
            <button type="submit" disabled={controlsDisabled} className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
              {busy ? "처리 중..." : mode === "link" ? "계정 연결 후 로그인" : "Google 계정으로 가입"}
            </button>
            <button type="button" disabled={controlsDisabled} className="text-xs text-slate-500 underline" onClick={() => { setPending(null); setPassword(""); setError(null); }}>Google 계정 다시 선택</button>
          </form>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
    </section>
  );
}
