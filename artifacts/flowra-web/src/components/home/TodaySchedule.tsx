import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Clock3,
  MapPin,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCHEDULE_TYPE_LABELS,
  type HomeSchedule,
  type HomeOrganizationSchedule,
  type ScheduleType,
} from "@/types";

type DashboardSchedule = {
  key: string;
  title: string;
  scheduleType: ScheduleType;
  startDatetime: string;
  endDatetime?: string | null;
  allDay: boolean;
  location?: string | null;
  companyName?: string | null;
  link: string;
};

const scheduleTypeStyle: Record<ScheduleType, { dot: string; badge: string }> =
  {
    personal: {
      dot: "bg-violet-500",
      badge: "border-violet-200 bg-violet-50 text-violet-700",
    },
    meeting: {
      dot: "bg-blue-500",
      badge: "border-blue-200 bg-blue-50 text-blue-700",
    },
    fieldwork: {
      dot: "bg-emerald-500",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    deadline: {
      dot: "bg-rose-500",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
    },
    other: {
      dot: "bg-slate-400",
      badge: "border-slate-200 bg-slate-50 text-slate-600",
    },
  };

function formatScheduleTime(schedule: DashboardSchedule) {
  if (schedule.allDay) return "하루 종일";

  const start = new Date(schedule.startDatetime);
  if (Number.isNaN(start.getTime())) return "시간 미정";
  const startLabel = start.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!schedule.endDatetime) return startLabel;
  const end = new Date(schedule.endDatetime);
  if (Number.isNaN(end.getTime())) return startLabel;
  const endLabel = end.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startLabel} - ${endLabel}`;
}

function scheduleStartTime(schedule: DashboardSchedule) {
  const time = new Date(schedule.startDatetime).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function toDashboardSchedules(
  date: string,
  personalSchedules: HomeSchedule[],
  organizationSchedules: HomeOrganizationSchedule[],
) {
  const dateParam = encodeURIComponent(date);
  return [
    ...personalSchedules.map(
      (schedule): DashboardSchedule => ({
        key: `personal-${schedule.id}`,
        title: schedule.title,
        scheduleType: schedule.schedule_type,
        startDatetime: schedule.start_datetime,
        endDatetime: schedule.end_datetime,
        allDay: schedule.all_day,
        location: schedule.location,
        link:
          (schedule.schedule_id ?? schedule.id)
            ? `/schedules?date=${dateParam}&schedule_id=${schedule.schedule_id ?? schedule.id}`
            : `/schedules?date=${dateParam}`,
      }),
    ),
    ...organizationSchedules.map(
      (schedule): DashboardSchedule => ({
        key: `company-${schedule.company_id}-${schedule.id}`,
        title: schedule.title,
        scheduleType: schedule.schedule_type,
        startDatetime: schedule.start_datetime,
        endDatetime: schedule.end_datetime,
        allDay: schedule.all_day,
        location: schedule.location,
        companyName: schedule.company_name,
        link: `/schedules?date=${dateParam}`,
      }),
    ),
  ].sort((left, right) => {
    if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
    return scheduleStartTime(left) - scheduleStartTime(right);
  });
}

export default function TodaySchedulePanel({
  schedules,
  date,
}: {
  schedules: DashboardSchedule[];
  date: string;
}) {
  const visibleSchedules = schedules.slice(0, 4);
  const remainingCount = schedules.length - visibleSchedules.length;
  const calendarLink = `/schedules?date=${encodeURIComponent(date)}`;

  return (
    <section
      aria-label="오늘 일정"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">오늘 일정</h2>
            <p className="text-xs text-slate-400">총 {schedules.length}개</p>
          </div>
        </div>
      </div>

      {visibleSchedules.length > 0 ? (
        <div className="grid flex-1 content-start gap-2 p-3">
          {visibleSchedules.map((schedule) => {
            const style = scheduleTypeStyle[schedule.scheduleType];
            return (
              <Link
                key={schedule.key}
                to={schedule.link}
                className="group min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-violet-200 hover:bg-violet-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      style.dot,
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800 transition group-hover:text-violet-700">
                        {schedule.title}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          style.badge,
                        )}
                      >
                        {SCHEDULE_TYPE_LABELS[schedule.scheduleType]}
                      </span>
                    </div>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                        {formatScheduleTime(schedule)}
                      </span>
                      {schedule.location && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="max-w-40 truncate">
                            {schedule.location}
                          </span>
                        </span>
                      )}
                      {schedule.companyName && (
                        <span className="inline-flex min-w-0 items-center gap-1 text-blue-600">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-40 truncate">
                            {schedule.companyName}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center px-4 py-4 text-center">
          <p className="text-sm text-slate-500">오늘 예정된 일정이 없어요.</p>
          <Link
            to={`${calendarLink}&create=1`}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            일정 추가
          </Link>
        </div>
      )}
      <div className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        {remainingCount > 0 && (
          <Link
            to={calendarLink}
            className="rounded text-xs text-violet-600 hover:underline focus-visible:outline focus-visible:outline-2"
          >
            {remainingCount}개 더 있어요
          </Link>
        )}
        <Link
          to={calendarLink}
          className="ml-auto inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-violet-600 transition hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
        >
          캘린더에서 보기
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
