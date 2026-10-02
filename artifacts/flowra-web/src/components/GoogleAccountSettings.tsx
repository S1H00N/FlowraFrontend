import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import * as authApi from "@/api/auth";
import GoogleIdButton from "@/components/GoogleIdButton";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorCode, getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";
import type { GoogleLinkTicketData } from "@/types";

export default function GoogleAccountSettings() {
  const { user } = useAuth();
  const accounts = useQuery({
    queryKey: ["auth-google-accounts", user?.user_id],
    enabled: !!user,
    queryFn: async () => (await authApi.getLinkedGoogleAccounts()).data,
    retry: false,
  });
  const linkedGoogle = accounts.data?.find((account) => account.provider === "google");
  const linkedAt = linkedGoogle?.linked_at ?? linkedGoogle?.created_at;
  const [pending, setPending] = useState<GoogleLinkTicketData | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPending(null);
    setPassword("");
    setError(null);
  }, [user?.user_id]);

  useEffect(() => {
    if (!pending) return;
    const expiresIn = Date.parse(pending.expires_at) - Date.now();
    const expire = () => {
      setPending(null);
      setPassword("");
      setError("Google 연결 단계가 만료되었습니다. Google 계정을 다시 선택해 주세요.");
    };
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, expiresIn);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const handleError = (err: unknown) => {
    setError(getErrorMessage(err, "Google 계정 연결에 실패했습니다."));
    setPassword("");
    if (["INVALID_GOOGLE_LINK_TICKET", "GOOGLE_ACCOUNT_ALREADY_LINKED", "GOOGLE_ACCOUNT_CONFLICT"].includes(getErrorCode(err) ?? "")) {
      setPending(null);
    }
  };

  const prepare = async (idToken: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.prepareGoogleLink(idToken);
      if (!res.success) throw new Error(res.message || "Google linking failed.");
      setPending(res.data);
    } catch (err) {
      handleError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const link = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending || busyRef.current) return;
    if (!password) {
      setError("현재 Flowra 계정의 비밀번호를 입력하세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.linkGoogleToSession({ link_ticket: pending.link_ticket, password });
      if (!res.success) throw new Error(res.message || "Google linking failed.");
      setPending(null);
      toast.success("Google 계정이 연결되었습니다.");
      await accounts.refetch();
    } catch (err) {
      handleError(err);
    } finally {
      setPassword("");
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg bg-slate-50/80 p-5 dark:bg-slate-900/70" aria-label="Google 계정 연결">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Google 계정 연결</h3>
      {accounts.isPending ? (
        <p className="mt-3 text-sm text-slate-500" role="status">연결된 계정을 확인하고 있습니다.</p>
      ) : accounts.isError ? (
        <div className="mt-3 text-sm text-red-600" role="alert">
          <p>{getErrorMessage(accounts.error, "연결된 Google 계정을 불러오지 못했습니다.")}</p>
          <button type="button" className="mt-2 text-xs underline" onClick={() => void accounts.refetch()}>다시 확인</button>
        </div>
      ) : linkedGoogle ? (
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">
          <p>Google 계정이 연결되어 있습니다.</p>
          {linkedAt && <p className="mt-1 text-xs">연결 시각: {new Date(linkedAt).toLocaleString("ko-KR")}</p>}
        </div>
      ) : pending ? (
        <form onSubmit={link} className="mt-4 space-y-3" aria-label="현재 계정에 Google 연결">
          <p className="break-all text-sm text-slate-600">연결할 Google 계정: {pending.google_profile?.email ?? "선택한 Google 계정"}</p>
          <p className="text-xs leading-5 text-slate-500">현재 로그인한 {user?.email} 계정의 비밀번호로 연결을 확인해 주세요.</p>
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            현재 Flowra 비밀번호
            <input type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">{busy ? "연결 중..." : "Google 계정 연결 확인"}</button>
            <button type="button" disabled={busy} onClick={() => { setPending(null); setPassword(""); setError(null); }} className="text-xs text-slate-500 underline">취소</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-500">Google 계정을 선택하고 Flowra 비밀번호를 확인하면 Google로 로그인할 수 있습니다.</p>
          <GoogleIdButton disabled={busy} onCredential={(idToken) => void prepare(idToken)} />
          {busy && <p className="text-xs text-slate-500" role="status">Google 계정을 확인하고 있습니다.</p>}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <p className="mt-4 text-xs leading-5 text-slate-500">비밀번호를 재설정하면 Google 연결이 해제됩니다. 새 비밀번호로 로그인한 뒤 다시 연결해 주세요.</p>
    </section>
  );
}
