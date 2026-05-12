import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  LogIn,
  Mail,
  Sparkles,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  acceptCompanyInvite,
  getCompanyInvite,
} from "@/api/companyInvites";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";
import Spinner from "@/components/ui/Spinner";

function formatInviteDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CompanyInvite() {
  const { token = "" } = useParams();
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const inviteQuery = useQuery({
    queryKey: ["company-invite", token],
    queryFn: () => getCompanyInvite(token),
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptCompanyInvite(token),
    onSuccess: (res) => {
      toast.success(res.message || "회사 초대를 수락했습니다.");
    },
  });

  const invite = inviteQuery.data?.data;
  const accepted = acceptMutation.isSuccess;

  const handleAccept = async () => {
    if (!token) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location } });
      return;
    }

    try {
      await acceptMutation.mutateAsync();
    } catch (err) {
      toast.error(getErrorMessage(err, "초대 수락에 실패했습니다."));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">Flowra</p>
            <p className="text-xs text-slate-500">Company invite</p>
          </div>
        </Link>

        <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          {inviteQuery.isLoading || isInitializing ? (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
              <Spinner size="lg" />
              <p className="text-sm">초대 정보를 확인하는 중...</p>
            </div>
          ) : inviteQuery.isError || !invite ? (
            <div className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-slate-950">
                초대를 확인할 수 없습니다
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                초대 링크가 만료되었거나 올바르지 않을 수 있습니다.
              </p>
              <Link
                to="/"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                홈으로 이동
              </Link>
            </div>
          ) : accepted ? (
            <div className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-slate-950">
                초대를 수락했습니다
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                이제 {invite.company.name} 멤버로 Flowra를 사용할 수 있습니다.
              </p>
              <Link
                to="/"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
              >
                대시보드로 이동
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-slate-950">
                    회사 초대가 도착했습니다
                  </h1>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {invite.company.name}에서 Flowra 회사 멤버로 초대했습니다.
                  </p>
                </div>
              </div>

              <dl className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">회사</dt>
                    <dd className="truncate text-sm font-semibold text-slate-900">
                      {invite.company.name}
                    </dd>
                  </div>
                </div>
                {invite.department && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0">
                      <dt className="text-xs font-medium text-slate-500">부서</dt>
                      <dd className="truncate text-sm font-semibold text-slate-900">
                        {invite.department.name}
                      </dd>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">초대 이메일</dt>
                    <dd className="truncate text-sm font-semibold text-slate-900">
                      {invite.email}
                    </dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-slate-500">만료 시각</dt>
                    <dd className="truncate text-sm font-semibold text-slate-900">
                      {formatInviteDate(invite.expires_at)}
                    </dd>
                  </div>
                </div>
              </dl>

              <button
                type="button"
                onClick={handleAccept}
                disabled={acceptMutation.isPending}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {acceptMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="border-white/40 border-t-white" />
                    수락 중...
                  </>
                ) : isAuthenticated ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    초대 수락
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    로그인하고 수락
                  </>
                )}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
