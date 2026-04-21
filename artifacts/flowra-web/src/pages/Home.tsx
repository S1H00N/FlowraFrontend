import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import type { ApiResponse } from "@/types";

type HealthData = Record<string, unknown>;

export default function Home() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<ApiResponse<HealthData> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setStatus("loading");
    setError(null);
    setResponse(null);
    try {
      const res = await apiClient.get<ApiResponse<HealthData>>("/categories");
      setResponse(res.data);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStatus("error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("API Base URL:", import.meta.env.VITE_API_BASE_URL);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-bold">Flowra Web</h1>
        <p className="mt-2 text-slate-600">
          React + Vite + TypeScript + Tailwind + Axios 기본 골격
        </p>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">API Base URL</div>
          <code className="mt-1 block break-all text-sm text-slate-800">
            {import.meta.env.VITE_API_BASE_URL}
          </code>

          <button
            type="button"
            onClick={handleTest}
            disabled={status === "loading"}
            className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60"
          >
            {status === "loading" ? "요청 중..." : "GET /categories 테스트"}
          </button>

          {status === "success" && response && (
            <pre className="mt-4 max-h-72 overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-100">
              {JSON.stringify(response, null, 2)}
            </pre>
          )}

          {status === "error" && (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              요청 실패: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
