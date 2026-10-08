export default function DailyBriefing({
  scheduleCount,
  incompleteCount,
  overdueCount,
  replanCount,
}: {
  scheduleCount: number;
  incompleteCount: number | null;
  overdueCount: number | null;
  replanCount?: number | null;
}) {
  const actionableCount =
    replanCount === undefined ? overdueCount : replanCount;
  const scheduleSummary = scheduleCount
    ? `오늘 일정이 ${scheduleCount}개 있고`
    : "오늘 일정은 없고";
  const summary =
    incompleteCount === null
      ? scheduleCount
        ? `오늘 예정된 일정이 ${scheduleCount}개 있어요.`
        : "오늘은 예정된 일정이 없어요."
      : incompleteCount === 0
        ? scheduleCount
          ? `오늘 일정이 ${scheduleCount}개 있고, 미완료 작업은 없어요.`
          : "오늘 예정된 일정과 미완료 작업이 없어요."
        : `${scheduleSummary}, 미완료 작업이 ${incompleteCount}개 있어요.`;
  const recommendation =
    overdueCount === null
      ? "작업 목록을 확인하면 오늘의 우선순위를 정하기 좋아요."
      : overdueCount > 0
        ? `${overdueCount === incompleteCount ? "미완료 작업이 모두 지연되어 있어요." : `그중 ${overdueCount}개가 지연되어 있어요.`} ${actionableCount === null ? "작업 목록에서 일정을 확인해 보세요." : actionableCount > 0 ? "밀린 작업을 다시 계획해 보세요." : "예정된 작업부터 차근차근 처리해 보세요."}`
        : incompleteCount === 0
          ? "여유 있게 하루를 시작하고, 필요한 일정이나 할 일을 추가해 보세요."
          : "오늘 예정된 작업부터 차근차근 처리해 보세요.";
  return (
    <section
      aria-label="AI 데일리 브리핑"
      className="rounded-2xl bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 px-5 py-4 text-white shadow-sm dark:border dark:border-violet-400/15 dark:from-[#282336] dark:via-[#262337] dark:to-[#202637]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          AI 데일리 브리핑
        </h2>
      </div>
      <p className="mt-2 text-sm font-medium">{summary}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/85">
        {recommendation}
      </p>
    </section>
  );
}
