import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/types";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "이메일을 입력하세요.")
    .email("올바른 이메일 형식이 아닙니다."),
  password: z.string().min(1, "비밀번호를 입력하세요."),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력하세요.")
    .max(30, "이름은 30자 이하여야 합니다."),
  email: z
    .string()
    .min(1, "이메일을 입력하세요.")
    .email("올바른 이메일 형식이 아닙니다."),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다.")
    .regex(/[A-Za-z]/, "영문을 포함해야 합니다.")
    .regex(/\d/, "숫자를 포함해야 합니다."),
});
export type SignupFormValues = z.infer<typeof signupSchema>;

export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력하세요.")
    .max(200, "제목은 200자 이하여야 합니다."),
  priority: z.enum(TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]),
  status: z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]]),
  category_id: z
    .union([z.number().int().positive(), z.literal("")])
    .optional(),
  due_datetime: z.string().optional().or(z.literal("")),
});
export type TaskFormValues = z.infer<typeof taskSchema>;

export const memoSchema = z.object({
  raw_text: z
    .string()
    .trim()
    .min(1, "메모 내용을 입력하세요.")
    .max(5000, "메모는 5000자 이하여야 합니다."),
  memo_type: z.enum(["quick", "meeting", "general"]),
  category_id: z
    .union([z.number().int().positive(), z.literal("")])
    .optional(),
  auto_parse: z.boolean().optional(),
});
export type MemoFormValues = z.infer<typeof memoSchema>;
