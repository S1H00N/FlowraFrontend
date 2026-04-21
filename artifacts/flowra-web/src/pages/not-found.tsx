import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef5fb_100%)] px-4">
      <div className="w-full max-w-lg rounded-[32px] border border-white/70 bg-white/85 p-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
          404 Page Not Found
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          요청한 페이지를 찾을 수 없습니다.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
