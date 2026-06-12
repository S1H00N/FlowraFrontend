import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Bot,
  CalendarPlus,
  CheckCircle2,
  CheckSquare2,
  FileText,
  History,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import CategorySelect from "@/components/CategorySelect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAiChatMessages,
  useAiChatSessions,
  useApplyAiChatMessageAction,
  useCreateAiChatSession,
  useSendAiChatMessage,
} from "@/hooks/useAiChat";
import {
  formatAiSuggestedActionDateTime,
  getAiSuggestedActionCategoryType,
  getAiSuggestedActionChatMeta,
  getAiSuggestedActionLabel,
  getAiSuggestedActionReviewMeta,
} from "@/lib/aiSuggestedActions";
import { cn } from "@/lib/utils";
import {
  type AiChatMessage,
  type AiChatSession,
  type AiSuggestedAction,
} from "@/types";

const PANEL_ID = "flowra-ai-chat-panel";
const SESSION_LIST_LIMIT = 30;

function getActionIcon(action: AiSuggestedAction) {
  if (action.type === "create_schedule") return CalendarPlus;
  if (action.type === "create_task") return CheckSquare2;
  return FileText;
}

function createSessionTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "새 AI 대화";
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function getSessionTitle(session: AiChatSession) {
  return session.title?.trim() || "새 AI 대화";
}

function getSessionPreview(session: AiChatSession) {
  const content = session.messages?.[0]?.content?.replace(/\s+/g, " ").trim();
  if (content) {
    return content.length > 64 ? `${content.slice(0, 64)}...` : content;
  }

  const count = session._count?.messages ?? 0;
  return count > 0 ? `${count}개 메시지` : "아직 메시지가 없습니다.";
}

function formatSessionTime(session: AiChatSession) {
  return (
    formatAiSuggestedActionDateTime(
      session.last_message_at ?? session.updated_at ?? session.created_at,
    ) ?? ""
  );
}

function isMessageFromUser(message: AiChatMessage) {
  return message.role === "user";
}

function getMessageActionState(message: AiChatMessage, actionIndex: number) {
  return message.action_states?.find(
    (state) => state.action_index === actionIndex,
  );
}

function isActionApplied(
  message: AiChatMessage,
  actionIndex: number,
  locallyApplied: boolean,
): boolean {
  if (locallyApplied) return true;
  if (getMessageActionState(message, actionIndex)?.applied) return true;
  if (message.applied_action_indexes?.includes(actionIndex)) return true;
  if (message.action_status === "applied") return true;
  return (
    message.applied_actions?.some(
      (action) => action.action_index === actionIndex,
    ) ?? false
  );
}

function isActionAvailable(message: AiChatMessage, actionIndex: number) {
  if (isActionApplied(message, actionIndex, false)) return false;
  const state = getMessageActionState(message, actionIndex);
  if (state?.applicable === false) return false;
  if (Array.isArray(message.remaining_action_indexes)) {
    return message.remaining_action_indexes.includes(actionIndex);
  }
  return true;
}

function EmptyChatState({
  isLoading,
  hasSession,
}: {
  isLoading: boolean;
  hasSession: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">
        {isLoading
          ? "대화를 불러오는 중..."
          : hasSession
            ? "아직 메시지가 없습니다."
            : "무엇을 정리할까요?"}
      </p>
      {!isLoading && (
        <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">
          일정, 할 일, 메모를 자연스럽게 적으면 Flowra AI가 이어서 정리합니다.
        </p>
      )}
    </div>
  );
}

function AiChatActionCard({
  message,
  action,
  actionIndex,
  sessionId,
  applied,
  available,
  applying,
  onApply,
}: {
  message: AiChatMessage;
  action: AiSuggestedAction;
  actionIndex: number;
  sessionId: number | null;
  applied: boolean;
  available: boolean;
  applying: boolean;
  onApply: (input: {
    messageId: number;
    actionIndex: number;
    categoryId: number | "";
  }) => void;
}) {
  const [categoryId, setCategoryId] = useState<number | "">("");
  const Icon = getActionIcon(action);
  const meta = getAiSuggestedActionChatMeta(action);
  const categoryType = getAiSuggestedActionCategoryType(action);
  const reviewMeta = getAiSuggestedActionReviewMeta(action, {
    includeRelatedActionIndex: true,
  });
  const canApply = categoryType !== null && available;
  const disabled = applied || applying || !sessionId || !canApply;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 ring-1 ring-slate-200">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                canApply
                  ? "border-violet-100 bg-violet-50 text-violet-700"
                  : "border-amber-100 bg-amber-50 text-amber-700",
              )}
            >
              {getAiSuggestedActionLabel(action)}
            </span>
            {applied && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                적용됨
              </span>
            )}
          </div>
          <p className="mt-1 break-words text-sm font-semibold text-slate-900">
            {action.title || "제목 없음"}
          </p>
          {action.description && (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">
              {action.description}
            </p>
          )}
          {meta.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meta.map((item) => (
                <span
                  key={item}
                  className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {reviewMeta.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reviewMeta.map((item) => (
                <span
                  key={String(item)}
                  className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {action.review_reason && (
            <p className="mt-2 break-words text-xs leading-5 text-amber-700">
              확인 사유: {action.review_reason}
            </p>
          )}
          {action.source_text && (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">
              근거: {action.source_text}
            </p>
          )}
        </div>
      </div>

      {categoryType ? (
        <div className="mt-3 grid gap-2 min-[380px]:grid-cols-[1fr_auto]">
          <CategorySelect
            type={categoryType}
            value={categoryId}
            onChange={setCategoryId}
            includeNone
            disabled={disabled}
            className="min-h-9 py-1.5 text-xs shadow-none"
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onApply({
                messageId: message.message_id,
                actionIndex,
                categoryId,
              })
            }
            className="min-w-20"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : applied ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            {applied ? "완료" : "적용"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          날짜, 시간, 유형을 확정한 뒤 일정이나 할 일로 직접 등록하세요.
        </div>
      )}
    </div>
  );
}

function AiChatMessageBubble({
  message,
  sessionId,
  appliedKeys,
  applyingKey,
  onApply,
}: {
  message: AiChatMessage;
  sessionId: number | null;
  appliedKeys: Set<string>;
  applyingKey: string | null;
  onApply: (input: {
    messageId: number;
    actionIndex: number;
    categoryId: number | "";
  }) => void;
}) {
  const isUser = isMessageFromUser(message);
  const actions = !isUser ? (message.suggested_actions ?? []) : [];

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[86%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm",
          isUser
            ? "bg-violet-600 text-white"
            : "border border-slate-200 bg-white text-slate-700",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {actions.length > 0 && (
          <div className="mt-3 space-y-2">
            {actions.map((action, index) => {
              const key = `${message.message_id}:${index}`;
              const applied = isActionApplied(
                message,
                index,
                appliedKeys.has(key),
              );
              const available = isActionAvailable(message, index);

              return (
                <AiChatActionCard
                  key={key}
                  message={message}
                  action={action}
                  actionIndex={index}
                  sessionId={sessionId}
                  applied={applied}
                  available={available}
                  applying={applyingKey === key}
                  onApply={onApply}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AiChatSessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSelect,
}: {
  sessions: AiChatSession[];
  activeSessionId: number | null;
  isLoading: boolean;
  onSelect: (sessionId: number) => void;
}) {
  return (
    <aside className="max-h-56 overflow-y-auto border-b border-slate-200 bg-white px-2 py-2 min-[600px]:h-full min-[600px]:max-h-none min-[600px]:w-64 min-[600px]:shrink-0 min-[600px]:border-b-0 min-[600px]:border-r min-[600px]:py-3">
      <div className="hidden items-center justify-between gap-2 px-2 pb-2 min-[600px]:flex">
        <span className="text-xs font-semibold text-slate-500">대화 목록</span>
        {!isLoading && (
          <span className="text-[11px] font-medium text-slate-400">
            {sessions.length}개
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
          대화 목록을 불러오는 중...
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm font-medium text-slate-500">
          저장된 대화가 없습니다.
        </div>
      ) : (
        <div className="space-y-1">
          {sessions.map((session) => {
            const selected = session.session_id === activeSessionId;
            const timeLabel = formatSessionTime(session);

            return (
              <button
                key={session.session_id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(session.session_id)}
                className={cn(
                  "flex w-full min-w-0 flex-col rounded-lg px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
                  selected
                    ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                    : "text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {getSessionTitle(session)}
                  </span>
                  {timeLabel && (
                    <span className="shrink-0 text-[11px] font-medium text-slate-400">
                      {timeLabel}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "mt-0.5 line-clamp-1 text-xs leading-5",
                    selected ? "text-violet-700" : "text-slate-500",
                  )}
                >
                  {getSessionPreview(session)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

interface AiChatWidgetProps {
  buttonRightOffset?: string;
}

export default function AiChatWidget({
  buttonRightOffset = "0px",
}: AiChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [preferNewSession, setPreferNewSession] = useState(false);
  const [sessionListOpen, setSessionListOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(() => new Set());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const sessionsQuery = useAiChatSessions(
    { status: "active", limit: SESSION_LIST_LIMIT },
    open,
  );
  const messagesQuery = useAiChatMessages(activeSessionId, open);
  const createSessionMutation = useCreateAiChatSession();
  const sendMessageMutation = useSendAiChatMessage();
  const applyActionMutation = useApplyAiChatMessageAction();

  const sessions = sessionsQuery.data ?? [];
  const activeSession = useMemo(
    () => sessions.find((session) => session.session_id === activeSessionId),
    [activeSessionId, sessions],
  );
  const messages = messagesQuery.data ?? [];
  const busy = createSessionMutation.isPending || sendMessageMutation.isPending;
  const hasMessages = messages.length > 0 || pendingContent !== null;

  useEffect(() => {
    if (!open || activeSessionId || preferNewSession) return;
    const session = sessionsQuery.data?.[0];
    if (session) setActiveSessionId(session.session_id);
  }, [activeSessionId, open, preferNewSession, sessionsQuery.data]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, open, pendingContent]);

  const handleNewSession = () => {
    setActiveSessionId(null);
    setPreferNewSession(true);
    if (window.matchMedia("(max-width: 599px)").matches) {
      setSessionListOpen(false);
    } else {
      setSessionListOpen(true);
    }
    setDraft("");
    setPendingContent(null);
    setAppliedKeys(new Set());
  };

  const handleSelectSession = (sessionId: number) => {
    setActiveSessionId(sessionId);
    setPreferNewSession(false);
    if (window.matchMedia("(max-width: 599px)").matches) {
      setSessionListOpen(false);
    }
    setDraft("");
    setPendingContent(null);
    setAppliedKeys(new Set());
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    setDraft("");
    setPendingContent(content);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const session = await createSessionMutation.mutateAsync({
          title: createSessionTitle(content),
        });
        sessionId = session.session_id;
        setActiveSessionId(sessionId);
        setPreferNewSession(false);
        if (window.matchMedia("(max-width: 599px)").matches) {
          setSessionListOpen(false);
        }
      }

      await sendMessageMutation.mutateAsync({
        sessionId,
        payload: { content },
      });
    } catch {
      setDraft(content);
    } finally {
      setPendingContent(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSubmit();
  };

  const handleApply = async ({
    messageId,
    actionIndex,
    categoryId,
  }: {
    messageId: number;
    actionIndex: number;
    categoryId: number | "";
  }) => {
    const key = `${messageId}:${actionIndex}`;
    setApplyingKey(key);

    try {
      const response = await applyActionMutation.mutateAsync({
        messageId,
        sessionId: activeSessionId ?? undefined,
        payload: {
          apply_type: "action",
          action_index: actionIndex,
          category_id: categoryId || undefined,
        },
      });
      setAppliedKeys((current) => {
        const next = new Set(current);
        const appliedIndexes = response.applied_action_indexes ??
          response.action_states
            ?.filter((state) => state.applied)
            .map((state) => state.action_index) ?? [actionIndex];

        appliedIndexes.forEach((index) => next.add(`${messageId}:${index}`));
        return next;
      });
    } finally {
      setApplyingKey(null);
    }
  };

  const pendingMessage = useMemo<AiChatMessage | null>(() => {
    if (!pendingContent) return null;
    return {
      message_id: -1,
      role: "user",
      content: pendingContent,
    };
  }, [pendingContent]);
  const offsetStyle = {
    "--flowra-ai-chat-button-offset": buttonRightOffset,
  } as CSSProperties;
  const panelStyle = {
    "--flowra-ai-chat-button-offset": buttonRightOffset,
    "--flowra-ai-chat-panel-width": sessionListOpen
      ? "min(760px, calc(100vw - 2rem - var(--flowra-ai-chat-button-offset, 0px)))"
      : "min(420px, calc(100vw - 2rem - var(--flowra-ai-chat-button-offset, 0px)))",
  } as CSSProperties;

  return (
    <TooltipProvider delayDuration={200}>
      {open && (
        <section
          id={PANEL_ID}
          aria-label="Flowra AI 채팅"
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] top-16 z-50 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 transition-[right,width] duration-200 min-[600px]:inset-auto min-[600px]:bottom-24 min-[600px]:right-[calc(1.5rem+var(--flowra-ai-chat-button-offset,0px))] min-[600px]:h-[min(72dvh,620px)] min-[600px]:w-[var(--flowra-ai-chat-panel-width)]"
          style={panelStyle}
        >
          <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-950">
                  Flowra AI
                </h2>
                <p className="truncate text-xs font-medium text-slate-500">
                  {activeSessionId
                    ? activeSession
                      ? getSessionTitle(activeSession)
                      : "대화 연결됨"
                    : "새 대화"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={
                      sessionListOpen ? "대화 목록 닫기" : "대화 목록 열기"
                    }
                    aria-pressed={sessionListOpen}
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
                      sessionListOpen && "bg-slate-100 text-slate-900",
                    )}
                    onClick={() => setSessionListOpen((value) => !value)}
                  >
                    <History className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">대화 목록</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="새 AI 대화"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                    onClick={handleNewSession}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">새 대화</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="AI 채팅 닫기"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">닫기</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <div className="min-h-0 flex flex-1 flex-col min-[600px]:flex-row">
            {sessionListOpen && (
              <AiChatSessionList
                sessions={sessions}
                activeSessionId={activeSessionId}
                isLoading={sessionsQuery.isLoading}
                onSelect={handleSelectSession}
              />
            )}

            <div className="min-h-0 flex flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8f5] px-4 py-4">
                {!hasMessages ? (
                  <EmptyChatState
                    isLoading={
                      sessionsQuery.isLoading ||
                      (activeSessionId !== null && messagesQuery.isLoading)
                    }
                    hasSession={activeSessionId !== null}
                  />
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <AiChatMessageBubble
                        key={message.message_id}
                        message={message}
                        sessionId={activeSessionId}
                        appliedKeys={appliedKeys}
                        applyingKey={applyingKey}
                        onApply={handleApply}
                      />
                    ))}
                    {pendingMessage && (
                      <AiChatMessageBubble
                        message={pendingMessage}
                        sessionId={activeSessionId}
                        appliedKeys={appliedKeys}
                        applyingKey={applyingKey}
                        onApply={handleApply}
                      />
                    )}
                    {busy && (
                      <div className="flex justify-start">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm">
                          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                          답변 생성 중...
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <form
                className="border-t border-slate-200 bg-white p-3"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={busy}
                    rows={2}
                    placeholder="AI에게 요청하기"
                    className="max-h-28 min-h-11 resize-none py-2.5 text-sm shadow-none"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!draft.trim() || busy}
                        aria-label="메시지 보내기"
                        className="h-11 w-11 shrink-0 rounded-lg"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">보내기</TooltipContent>
                  </Tooltip>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={open ? "AI 채팅 닫기" : "AI 채팅 열기"}
            aria-controls={PANEL_ID}
            aria-expanded={open}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-xl shadow-violet-900/25 transition-[background-color,box-shadow,right] duration-200 hover:bg-violet-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 min-[600px]:bottom-6 min-[600px]:right-[calc(1.5rem+var(--flowra-ai-chat-button-offset,0px))]"
            style={offsetStyle}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X className="h-6 w-6" />
            ) : (
              <MessageCircle className="h-6 w-6" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {open ? "AI 채팅 닫기" : "AI 채팅"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
