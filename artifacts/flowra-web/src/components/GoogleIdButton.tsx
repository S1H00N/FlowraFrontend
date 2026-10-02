import { useEffect, useId, useRef, useState } from "react";
import { googleOAuthClientId, renderGoogleIdButton } from "@/lib/googleIdentity";

export default function GoogleIdButton({
  onCredential,
  disabled = false,
}: {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const isDisabled = useRef(disabled);
  callback.current = onCredential;
  isDisabled.current = disabled;
  const state = useId();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!googleOAuthClientId || !element.current) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    setError(null);
    renderGoogleIdButton(element.current, state, (idToken) => {
      if (active && !isDisabled.current) callback.current(idToken);
    }).then((dispose) => {
      if (active) cleanup = dispose;
      else dispose();
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Google 로그인을 불러오지 못했습니다.");
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [attempt, state]);

  if (!googleOAuthClientId) {
    return (
      <p className="text-center text-xs text-slate-500">
        Google 로그인은 현재 준비 중입니다.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={element}
        aria-label="Google 계정으로 계속하기"
        aria-disabled={disabled}
        className={disabled ? "pointer-events-none opacity-60" : "min-h-10"}
      />
      {error && (
        <div className="mt-2 text-xs text-red-600" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-1 underline">
            다시 불러오기
          </button>
        </div>
      )}
    </div>
  );
}
