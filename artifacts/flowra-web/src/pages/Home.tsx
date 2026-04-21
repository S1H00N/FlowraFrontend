import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Flowra Web</h1>
            <p className="mt-2 text-slate-600">로그인된 보호 페이지입니다.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">현재 사용자</div>
          <div className="mt-2 text-base font-medium text-slate-900">
            {user?.name} <span className="text-slate-500">({user?.email})</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            login_type: {user?.login_type}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">API Base URL</div>
          <code className="mt-1 block break-all text-sm text-slate-800">
            {import.meta.env.VITE_API_BASE_URL}
          </code>
        </div>
      </div>
    </div>
  );
}
