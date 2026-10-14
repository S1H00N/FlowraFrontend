import { useEffect, useState } from "react";
import { toDateKey } from "@/components/CompactDateTimeInputs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { projectSchedule, type ScheduleSource } from "@/lib/projectSchedule";

/** Follow the existing project date inputs and Home's browser-local calendar. */
export function useProjectToday() {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setToday(toDateKey(now));
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, next.getTime() - now.getTime() + 50);
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

export function ProjectScheduleLabel({ source, today, compact = false }: {
  source: ScheduleSource; today: string; compact?: boolean;
}) {
  const schedule = projectSchedule(source, today);
  if (compact && !["delayed", "due", "upcoming", "starting", "invalid"].includes(schedule.kind)) return null;
  const tone = schedule.kind === "delayed" || schedule.kind === "invalid"
    ? "text-destructive" : schedule.kind === "due"
      ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground";
  return <span className={`project-schedule-label block text-xs ${tone}`} aria-label={`일정: ${schedule.label}`}>{schedule.label}</span>;
}

export function ProjectPeriodWarning({ messages, onCancel, onConfirm }: {
  messages: string[] | null; onCancel: () => void; onConfirm: () => void;
}) {
  return <Dialog open={messages !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="max-h-[80dvh] overflow-y-auto border-border bg-background text-foreground">
      <DialogHeader>
        <DialogTitle>상위 일정 범위를 벗어났습니다</DialogTitle>
        <DialogDescription className="whitespace-pre-line break-words text-muted-foreground">
          {messages?.join("\n")}{"\n"}날짜는 자동으로 변경되지 않습니다. 그대로 저장할 수 있습니다.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>날짜 수정</Button>
        <Button onClick={onConfirm}>그대로 저장</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
