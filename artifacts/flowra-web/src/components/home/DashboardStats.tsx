import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardStats({
  scheduleCount,
  incompleteCount,
  overdueCount,
  streak,
  bestStreak,
}: {
  scheduleCount: number;
  incompleteCount: number | null;
  overdueCount: number | null;
  streak: number;
  bestStreak: number;
}) {
  const stats = [
    {
      label: "오늘 일정",
      value: scheduleCount,
      unit: "개",
      sub: "오늘 예정된 일정",
    },
    {
      label: "전체 미완료",
      value: incompleteCount,
      unit: "개",
      sub: "완료하지 않은 할 일",
    },
    {
      label: "지연된 작업",
      value: overdueCount,
      unit: "개",
      sub: overdueCount
        ? "다시 계획해 보세요"
        : overdueCount === null
          ? "조회 중 또는 확인 필요"
          : "밀린 작업이 없어요",
    },
    {
      label: "연속 완료",
      value: streak,
      unit: "일",
      sub: bestStreak ? `최고 ${bestStreak}일` : "완료 기록을 시작해보세요",
    },
  ];
  return (
    <section
      aria-label="오늘 요약"
      className="grid grid-cols-2 gap-3 xl:grid-cols-4"
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
            index === 2 && !!overdueCount && "border-amber-200 bg-amber-50/50",
          )}
        >
          <p className="text-xs text-slate-500">{stat.label}</p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-2xl font-bold tabular-nums text-violet-600",
              index === 2 &&
                (overdueCount ? "text-amber-700" : "text-slate-700"),
            )}
          >
            {stat.value ?? "—"}
            <span className="text-sm font-medium">
              {stat.value !== null && stat.unit}
            </span>
            {index === 3 && streak > 0 && (
              <Flame className="h-5 w-5 text-orange-500" />
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">{stat.sub}</p>
        </div>
      ))}
    </section>
  );
}
