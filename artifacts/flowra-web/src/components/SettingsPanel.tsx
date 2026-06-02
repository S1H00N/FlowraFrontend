import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Settings2,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/useCategories";
import { useMe, useUpdateMe } from "@/hooks/useMe";
import {
  updateUserSettings,
  useUserSettings,
  type DefaultCalendarView,
  type UserTheme,
  type WeekStartDay,
} from "@/lib/userSettings";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPES,
  DEFAULT_CATEGORY_COLORS,
  type Category,
  type CategoryType,
} from "@/types";

interface SettingsPanelProps {
  compact?: boolean;
  className?: string;
}

type SettingsSection = "general" | "display" | "classification" | "account";

interface DraftCategory {
  name: string;
  color: string;
  type: CategoryType;
}

const settingsSections: Array<{
  key: SettingsSection;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "general", label: "일반", icon: Sun },
  { key: "display", label: "화면 표시", icon: Monitor },
  { key: "classification", label: "분류 관리", icon: SlidersHorizontal },
  { key: "account", label: "계정", icon: UserRound },
];

const hexPattern = /^#[0-9A-Fa-f]{6}$/;

const defaultCategoryDraft: DraftCategory = {
  name: "",
  color: DEFAULT_CATEGORY_COLORS[0],
  type: "task",
};

function getInitial(name: string) {
  return (name.trim().slice(0, 1) || "김").toUpperCase();
}

function notifyUnavailable(feature: string) {
  toast.info(`${feature} 기능은 API 연동이 준비되면 연결하겠습니다.`);
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      <p className="mt-1 text-sm font-medium text-slate-400">{description}</p>
    </div>
  );
}

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-slate-50/80 p-4">
      <p className="text-xs font-semibold text-slate-400">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChoiceButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
        selected
          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-slate-100 px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-xs font-medium text-slate-400">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
        className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200"
      />
    </div>
  );
}

function GeneralSection() {
  const settings = useUserSettings();

  const setTheme = (theme: UserTheme) => {
    if (theme !== "light") {
      notifyUnavailable("테마 전환");
      return;
    }
    updateUserSettings({ theme });
  };

  const setWeekStart = (weekStart: WeekStartDay) => {
    updateUserSettings({ weekStart });
  };

  const setDefaultView = (defaultCalendarView: DefaultCalendarView) => {
    updateUserSettings({ defaultCalendarView });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="일반"
        description="앱의 기본 동작을 설정합니다."
      />

      <SettingsCard title="테마">
        <div className="grid gap-2 sm:grid-cols-3">
          <ChoiceButton
            selected={settings.theme === "light"}
            onClick={() => setTheme("light")}
          >
            <Sun className="h-4 w-4 text-amber-500" />
            라이트
          </ChoiceButton>
          <ChoiceButton
            selected={settings.theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            <Moon className="h-4 w-4 text-slate-500" />
            다크
          </ChoiceButton>
          <ChoiceButton
            selected={settings.theme === "system"}
            onClick={() => setTheme("system")}
          >
            <Settings2 className="h-4 w-4 text-violet-500" />
            시스템
          </ChoiceButton>
        </div>
      </SettingsCard>

      <SettingsCard title="달력 시작 요일">
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceButton
            selected={settings.weekStart === "sunday"}
            onClick={() => setWeekStart("sunday")}
          >
            일요일
          </ChoiceButton>
          <ChoiceButton
            selected={settings.weekStart === "monday"}
            onClick={() => setWeekStart("monday")}
          >
            월요일
          </ChoiceButton>
        </div>
      </SettingsCard>

      <SettingsCard title="기본 뷰">
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceButton
            selected={settings.defaultCalendarView === "month"}
            onClick={() => setDefaultView("month")}
          >
            <CalendarDays className="h-4 w-4 text-blue-500" />
            월간
          </ChoiceButton>
          <ChoiceButton
            selected={settings.defaultCalendarView === "week"}
            onClick={() => setDefaultView("week")}
          >
            <CalendarDays className="h-4 w-4 text-orange-500" />
            주간
          </ChoiceButton>
        </div>
      </SettingsCard>
    </div>
  );
}

function DisplaySection() {
  const settings = useUserSettings();

  const updateToggle = (
    key:
      | "showHolidays"
      | "highlightWeekends"
      | "showLunarDates"
      | "highlightToday"
      | "showScheduleCountBadge",
    checked: boolean,
  ) => {
    if (key === "showLunarDates") {
      notifyUnavailable("음력 표시");
      return;
    }
    updateUserSettings({ [key]: checked });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="화면 표시"
        description="달력 화면에 표시할 정보를 선택합니다."
      />

      <section className="overflow-hidden rounded-lg bg-slate-50/80">
        <ToggleRow
          title="공휴일 표시"
          description="달력에 공휴일 이름과 공휴일 색상을 표시합니다."
          checked={settings.showHolidays}
          onCheckedChange={(checked) => updateToggle("showHolidays", checked)}
        />
        <ToggleRow
          title="주말 강조"
          description="토·일요일 배경을 연하게 강조합니다."
          checked={settings.highlightWeekends}
          onCheckedChange={(checked) =>
            updateToggle("highlightWeekends", checked)
          }
        />
        <ToggleRow
          title="음력 표시"
          description="날짜 옆에 음력 날짜를 함께 보여줍니다."
          checked={settings.showLunarDates}
          onCheckedChange={(checked) => updateToggle("showLunarDates", checked)}
        />
        <ToggleRow
          title="오늘 강조"
          description="오늘 날짜 셀을 색상으로 구분합니다."
          checked={settings.highlightToday}
          onCheckedChange={(checked) => updateToggle("highlightToday", checked)}
        />
        <ToggleRow
          title="일정 개수 뱃지"
          description="날짜 셀에 일정 개수를 숫자로 표시합니다."
          checked={settings.showScheduleCountBadge}
          onCheckedChange={(checked) =>
            updateToggle("showScheduleCountBadge", checked)
          }
        />
      </section>
    </div>
  );
}

function CategoryColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {DEFAULT_CATEGORY_COLORS.map((candidate) => {
        const selected = color.toLowerCase() === candidate.toLowerCase();
        return (
          <button
            key={candidate}
            type="button"
            onClick={() => onChange(candidate)}
            aria-label={`색상 ${candidate}`}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border-2 transition",
              selected
                ? "border-blue-400 ring-2 ring-blue-100"
                : "border-transparent hover:ring-2 hover:ring-slate-200",
            )}
            style={{ backgroundColor: candidate }}
          >
            {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
          </button>
        );
      })}
      <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-emerald-400 hover:text-emerald-600">
        <Plus className="h-4 w-4" />
        <input
          type="color"
          value={hexPattern.test(color) ? color : DEFAULT_CATEGORY_COLORS[0]}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="사용자 지정 색상"
        />
      </label>
    </div>
  );
}

function CategoryForm({
  draft,
  mode,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: DraftCategory;
  mode: "create" | "edit";
  pending: boolean;
  onChange: (patch: Partial<DraftCategory>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/20 p-4">
      <div className="grid gap-3">
        <input
          type="text"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="카테고리 이름"
          className="h-11 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />

        <div className="flex flex-wrap gap-2">
          {CATEGORY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ type })}
              className={cn(
                "h-8 rounded-lg border px-3 text-xs font-semibold transition",
                draft.type === type
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
            >
              {CATEGORY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <CategoryColorPicker
          color={draft.color}
          onChange={(color) => onChange({ color })}
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="h-10 rounded-lg bg-blue-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-60"
          >
            {pending ? "저장 중..." : mode === "create" ? "추가" : "저장"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
  deleting,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="group flex min-h-14 items-center gap-3 rounded-lg bg-slate-50/80 px-4 py-3">
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-semibold text-slate-900">
          {category.name}
        </p>
      </button>
      <span className="shrink-0 text-xs font-medium text-slate-400">
        {CATEGORY_TYPE_LABELS[category.type]}
      </span>
      {category.is_default && (
        <span className="hidden shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 sm:inline-flex">
          기본
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-900"
        >
          편집
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`${category.name} 삭제`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function ClassificationSection() {
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftCategory>(defaultCategoryDraft);
  const categoriesQuery = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const categories = categoriesQuery.data ?? [];

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) =>
        a.name.localeCompare(b.name, "ko-KR", { sensitivity: "base" }),
      ),
    [categories],
  );

  const resetForm = () => {
    setMode("create");
    setEditingId(null);
    setDraft(defaultCategoryDraft);
  };

  const startCreate = () => {
    setMode("create");
    setEditingId(null);
    setDraft({ ...defaultCategoryDraft, color: DEFAULT_CATEGORY_COLORS[1] });
  };

  const startEdit = (category: Category) => {
    setMode("edit");
    setEditingId(category.category_id);
    setDraft({
      name: category.name,
      color: category.color,
      type: category.type,
    });
  };

  const submit = async () => {
    const name = draft.name.trim();
    const color = draft.color.trim();
    if (!name) {
      toast.error("카테고리 이름을 입력하세요.");
      return;
    }
    if (!hexPattern.test(color)) {
      toast.error("HEX 색상값을 확인하세요.");
      return;
    }

    try {
      if (mode === "edit" && editingId !== null) {
        await updateMutation.mutateAsync({
          categoryId: editingId,
          payload: { name, color },
        });
      } else {
        await createMutation.mutateAsync({
          name,
          color,
          type: draft.type,
        });
      }
      resetForm();
    } catch {
      /* mutation cache handles toast */
    }
  };

  const remove = async (category: Category) => {
    const message = category.is_default
      ? "기본 카테고리입니다. 정말 삭제하시겠습니까?"
      : "정말 삭제하시겠습니까?";
    if (!confirm(message)) return;

    try {
      await deleteMutation.mutateAsync(category.category_id);
      if (editingId === category.category_id) resetForm();
    } catch {
      /* mutation cache handles toast */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          title="분류 관리"
          description="일정과 할 일에 사용할 카테고리를 관리합니다."
        />
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
        >
          <Plus className="h-4 w-4" />
          새 카테고리
        </button>
      </div>

      <CategoryForm
        draft={draft}
        mode={mode}
        pending={createMutation.isPending || updateMutation.isPending}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSubmit={submit}
        onCancel={resetForm}
      />

      {categoriesQuery.isLoading ? (
        <FullSpinner message="카테고리를 불러오는 중..." />
      ) : categoriesQuery.isError ? (
        <ErrorState
          compact
          title="카테고리를 불러오지 못했습니다"
          message={(categoriesQuery.error as Error).message}
          onRetry={() => categoriesQuery.refetch()}
          retrying={categoriesQuery.isFetching}
        />
      ) : sortedCategories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            아직 카테고리가 없습니다.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            새 카테고리를 추가해 분류를 시작하세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedCategories.map((category) => (
            <CategoryRow
              key={category.category_id}
              category={category}
              onEdit={() => startEdit(category)}
              onDelete={() => remove(category)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountAction({
  icon: Icon,
  title,
  description,
  danger = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50"
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          danger ? "text-red-400" : "text-slate-400",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-semibold",
            danger ? "text-red-500" : "text-slate-950",
          )}
        >
          {title}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-400">
          {description}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </button>
  );
}

function AccountSection() {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const updateMeMutation = useUpdateMe();
  const user = meQuery.data ?? cachedUser;
  const displayName = user?.name ?? "김민준";
  const displayEmail = user?.email ?? "minjun@example.com";
  const profileImageUrl = user?.profile_image_url ?? null;
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [imageDraft, setImageDraft] = useState(profileImageUrl ?? "");
  const [timezoneDraft, setTimezoneDraft] = useState(user?.timezone ?? "");

  useEffect(() => {
    if (editing) return;
    setNameDraft(displayName);
    setImageDraft(profileImageUrl ?? "");
    setTimezoneDraft(user?.timezone ?? "");
  }, [displayName, editing, profileImageUrl, user?.timezone]);

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      toast.error("이름을 입력하세요.");
      return;
    }

    try {
      await updateMeMutation.mutateAsync({
        name,
        profile_image_url: imageDraft.trim() ? imageDraft.trim() : null,
        timezone: timezoneDraft.trim() || undefined,
      });
      setEditing(false);
    } catch {
      /* mutation cache handles toast */
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="계정"
        description="프로필 정보와 계정을 관리합니다."
      />

      <section className="rounded-lg bg-slate-50/80 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-14 w-14 rounded-lg">
              {profileImageUrl && (
                <AvatarImage src={profileImageUrl} alt={displayName} />
              )}
              <AvatarFallback className="rounded-lg bg-emerald-500 text-xl font-semibold text-white">
                {getInitial(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">
                {displayName}
              </p>
              <p className="mt-1 truncate text-sm font-medium text-slate-400">
                {displayEmail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {editing ? "닫기" : "편집"}
          </button>
        </div>

        {editing && (
          <form
            onSubmit={submitProfile}
            className="mt-5 grid gap-3 border-t border-slate-200 pt-4"
          >
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-500">이름</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-500">
                프로필 이미지 URL
              </span>
              <input
                type="url"
                value={imageDraft}
                onChange={(event) => setImageDraft(event.target.value)}
                placeholder="https://example.com/image.png"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-500">
                시간대
              </span>
              <input
                type="text"
                value={timezoneDraft}
                onChange={(event) => setTimezoneDraft(event.target.value)}
                placeholder="Asia/Seoul"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={updateMeMutation.isPending}
                className="h-9 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
              >
                {updateMeMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-lg bg-slate-50/80">
        <AccountAction
          icon={Bell}
          title="알림 설정"
          description="일정 알림 및 리마인더"
          onClick={() => notifyUnavailable("알림 설정")}
        />
        <AccountAction
          icon={Download}
          title="데이터 내보내기"
          description="일정 데이터를 .ics 파일로 저장"
          onClick={() => notifyUnavailable("데이터 내보내기")}
        />
        <AccountAction
          icon={Trash2}
          title="데이터 초기화"
          description="모든 데이터를 삭제합니다"
          danger
          onClick={() => notifyUnavailable("데이터 초기화")}
        />
      </section>

      <button
        type="button"
        onClick={logout}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-500 transition hover:bg-red-100"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
    </div>
  );
}

export function SettingsPanel({
  compact = false,
  className,
}: SettingsPanelProps) {
  const { user: cachedUser } = useAuth();
  const meQuery = useMe();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("general");
  const user = meQuery.data ?? cachedUser;
  const displayName = user?.name ?? "김민준";
  const profileImageUrl = user?.profile_image_url ?? null;

  const content = {
    general: <GeneralSection />,
    display: <DisplaySection />,
    classification: <ClassificationSection />,
    account: <AccountSection />,
  } satisfies Record<SettingsSection, ReactNode>;

  return (
    <div
      className={cn(
        "flex min-h-0 overflow-hidden bg-white text-slate-900",
        compact
          ? "h-full"
          : "min-h-[680px] rounded-lg border border-slate-200 shadow-sm",
        className,
      )}
    >
      <aside className="hidden w-[200px] shrink-0 flex-col border-r border-slate-100 bg-slate-50/70 sm:flex">
        <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Settings2 className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-slate-950">설정</span>
        </div>

        <nav className="flex-1 space-y-2 px-3 py-4">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const selected = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition",
                  selected
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-white hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3">
          <div className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-100/80 p-3">
            <Avatar className="h-8 w-8 rounded-lg">
              {profileImageUrl && (
                <AvatarImage src={profileImageUrl} alt={displayName} />
              )}
              <AvatarFallback className="rounded-lg bg-emerald-500 text-sm font-semibold text-white">
                {getInitial(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-950">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                무료 플랜
              </p>
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[64px] items-center overflow-x-auto border-b border-slate-100 px-4 sm:hidden">
          <div className="flex gap-2">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const selected = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold",
                    selected
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-500 hover:bg-slate-50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden h-[60px] shrink-0 border-b border-slate-100 sm:block" />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-[560px]">{content[activeSection]}</div>
        </div>
      </section>
    </div>
  );
}
