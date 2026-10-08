import axios from "axios";
import { listTasks, updateTask } from "@/api/tasks";
import { toOffsetISOString } from "@/utils/dateUtils";
import type { Schedule } from "@/types";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function syncLinkedTaskDates(schedule: Schedule) {
  const start = new Date(schedule.start_datetime);
  const end = schedule.end_datetime ? new Date(schedule.end_datetime) : start;
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    localDateKey(start) !== localDateKey(end)
  ) return;

  const response = await listTasks({ schedule_id: schedule.schedule_id });
  if (!response.success) throw new Error(response.message || "연결된 할 일을 불러오지 못했습니다.");
  const tasks = response.data.tasks;

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      if (!task.due_datetime) return;
      const due = new Date(task.due_datetime);
      if (Number.isNaN(due.getTime()) || localDateKey(due) === localDateKey(start)) return;
      due.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
      const updated = await updateTask(task.task_id, {
        due_datetime: toOffsetISOString(due),
      });
      if (!updated.success) throw new Error(updated.message || "할 일 마감 날짜를 변경하지 못했습니다.");
    }),
  );
  const failure = results.find((result) => result.status === "rejected" && axios.isCancel(result.reason))
    ?? results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
