# 할 일 리스트: 선택 모드와 일정–할 일 계층

기존 `/tasks` 화면에 적용한 구현 안내입니다. 사이드바, 날짜 필터, 검색, 정렬, 일정 생성 패널, 인라인 할 일 편집과 기존 API는 유지합니다.

## 1. 화면 구조

- 기본 툴바: 전체 / 오늘 / 미완료 / 완료됨 + 정렬. 항상 보이던 `선택` 버튼 제거.
- 일정: 기존 날짜 그룹 안의 독립 카드. 시간과 점 마커는 유지하지만 일정 사이 세로선은 제거.
- 카드 정보: 제목, 날짜, 시작/종료 시간, 소요 시간, 태그, 공개 범위, 더보기, `할 일 완료/전체` 요약.
- 연결된 할 일: 일정 아래 들여쓰기와 가지 연결선으로 표현. 작은 글씨와 부드러운 배경으로 위계를 낮춤. 연결은 `schedule_id` 기준이며 반복 패턴을 관계로 사용하지 않음.
- 기본적으로 일정의 미완료 할 일을 최대 3개 표시. 나머지는 `+ n개 더 보기`, 완료 항목은 별도의 펼치기 버튼 제공. 일정 제목으로 전체 하위 영역 접기 가능.
- 연결된 할 일이 없는 일정은 기본적으로 접어 빈 영역을 줄이고, 제목을 누르면 추가 영역 표시.
- 독립 할 일: 별도 목록이며 트리 연결선 없음.

## 2. 인터랙션

1. 마우스 hover 또는 키보드 포커스가 카드에 들어오면 오른쪽 선택 체크 표시. 터치 기기는 작은 체크를 항상 제공해 hover 없이 접근 가능.
2. 하나를 선택하면 즉시 상단 액션 바 표시. `n개 선택됨`, 전체 선택, 완료 처리, 완료 해제, 삭제, 닫기 제공.
3. 선택된 일정은 테두리와 배경, 할 일은 배경과 체크로 구분. 선택 모드에서는 선택 체크를 고정 표시.
4. Shift+클릭은 마지막 기준점부터 화면의 목록 순서대로 범위를 추가 선택. Ctrl/Cmd+클릭은 카드 제목 또는 빈 영역에서 개별 선택 토글. 체크박스의 기본 클릭도 추가 선택 방식.
5. ESC / 닫기 / 마지막 체크 해제로 조회 상태 복귀. ESC는 열린 메뉴, 편집기, 다이얼로그가 먼저 처리. 명시적으로 닫을 때 시작 체크로 포커스 복원.
6. 전체 선택은 현재 필터 결과에서 **펼쳐진 항목 전체**가 대상. 스크롤 밖 항목은 포함하지만 `더 보기` 뒤의 항목, 접힌 완료 그룹과 일정의 자식은 제외. 부모 선택이 자식 선택이나 완료로 전파되지는 않음.
7. 일괄 완료는 명시적으로 선택한 일정/할 일만 변경. 회사 일정이 포함되면 기존 API 정책에 맞춰 완료 액션을 비활성화하고 이유 표시.
8. 삭제는 확인 후 기존 삭제 API 사용. 회사 일정은 기존 삭제 요청 경로 유지. 처리 중에는 목록을 비활성화해 중복 조작 방지. 부분 실패는 실패한 ID만 남겨 재시도.

왼쪽의 할 일 완료 체크와 오른쪽의 항목 선택 체크는 서로 다른 동작입니다. 접근 가능한 이름도 각각 `제목 완료`, `제목 선택`으로 구분합니다.

## 3. 컴포넌트 경계

```text
Tasks.tsx                         데이터 조회, 날짜/검색/정렬, 일괄 작업
├─ 기존 toolbar                  필터와 정렬 유지
├─ SelectionActionBar            선택 개수와 액션, 처리 상태
├─ ScheduleCard                  독립 일정 카드와 진행 요약
│  └─ TaskList                    연결 할 일 미리보기/펼치기, 트리
│     └─ TaskItem                 완료 체크, 선택 체크, 편집/메뉴
└─ IndependentTasksSection
   └─ TaskList                   트리 없이 같은 행 재사용

useListSelection                 선택 Set, 범위/추가 선택, 전체 선택, 포커스 복원
```

기존 `TaskList`, `TaskItem`을 `LinkedTaskList`, `LinkedTaskItem` 역할로 재사용했습니다. `schedule` prop 유무로 계층 스타일을 적용합니다. 툴바는 현재 페이지에 유지했으며 다른 페이지에서도 같은 필터 조합이 필요해지면 `TaskListToolbar`로 추출할 수 있습니다.

## 4. 상태 관리

| 상태 | 위치 | 의미 |
| --- | --- | --- |
| `selectedScheduleIds: Set<number>` | 선택 훅 | 선택 일정 ID |
| `selectedTaskIds: Set<number>` | 선택 훅 | 선택 할 일 ID |
| `selectionMode` | 파생 값 | 두 Set의 크기 합이 0보다 큰지 |
| `anchor: SelectionKey \| null` | 훅 ref | Shift 범위 기준점 |
| `scheduleExpansion: Map<number, boolean>` | 페이지 | 사용자의 명시적 펼침/접기. 기본은 연결된 할 일이 있는 일정만 펼침 |
| `showAll`, `showCompleted` | 각 TaskList | 미리보기 확장, 완료 그룹 확장 |
| `bulkPending`, `bulkLock` | 페이지 state/ref | 렌더링 비활성화와 중복 호출 차단 |
| 일정/할 일 데이터 | 기존 React Query | API 데이터와 캐시 갱신 |

선택 여부를 데이터 객체에 저장하지 않습니다. Set 갱신은 새 Set을 반환합니다. 일정 ID와 할 일 ID가 같아도 `schedule:201`, `task:201`로 구분합니다. 검색/필터/일정 접기로 대상에서 빠진 선택은 정리합니다. 일괄 작업 중에는 정리를 잠시 보류해 낙관적 캐시 갱신이 실행 중인 선택을 지우지 않게 합니다.

범위와 전체 선택은 현재 DOM의 렌더링 순서를 사용합니다. 나중에 가상 목록이나 드래그 선택을 추가할 때는 `visibleKeys()`를 목록 모델의 정렬된 ID 공급자로 교체하고 선택 훅에 범위 ID를 넘기는 방식으로 확장할 수 있습니다. 현재 드래그 선택은 구현하지 않았습니다.

## 5. 실제 JSX 연결

구현 파일: `artifacts/flowra-web/src/pages/Tasks.tsx`, `src/hooks/useListSelection.ts`, `src/components/tasks/SelectionActionBar.tsx`.

```tsx
const root = useRef<HTMLDivElement>(null);
const selection = useListSelection(root);

return (
  <div
    ref={root}
    data-selection-mode={selection.selectionMode}
    onClickCapture={selection.onSelectionClickCapture}
  >
    {selection.selectionMode && (
      <SelectionActionBar
        count={selection.count}
        busy={bulkPending}
        canComplete={canCompleteSelection}
        onSelectAll={selection.selectAllVisible}
        onComplete={(completed) => void completeSelection(completed)}
        onDelete={() => void deleteSelection()}
        onClose={selection.clearSelection}
      />
    )}
    {/* 기존 그룹과 ScheduleCard 렌더링 유지 */}
  </div>
);
```

액션 바는 Tailwind의 `flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2`를 사용합니다. 카드와 트리는 기존 테마 변수 기반 CSS를 확장해 다크 모드와 프로젝트 디자인을 유지합니다.

## 6. 핵심 구현 예시

선택 상태는 따로 boolean을 동기화하지 않고 선택 개수에서 계산합니다.

```tsx
const selectionMode = selectedTaskIds.size + selectedScheduleIds.size > 0;

setSelectedTaskIds((current) => {
  const next = new Set(current);
  if (!next.delete(taskId)) next.add(taskId);
  return next;
});

// ScheduleCard: 반복 여부와 무관하게 독립적인 선택 대상
<article data-selection-key={`schedule:${schedule.schedule_id}`}>
  {/* 일정 메타 정보 */}
  <TaskList
    schedule={schedule}
    tasks={linkedTasks}
    selectionMode={selectionMode}
    selectedTaskIds={selectedTaskIds}
    onToggleTaskSelection={toggleTaskSelection}
  />
</article>
```

Tailwind만으로 같은 부모–자식 가지를 구현하는 최소 예시입니다. 아래 예시는 표시할 할 일이 결정된 뒤 사용하며, 실제 구현은 숨겨진 행과 펼치기 컨트롤을 포함하므로 `TaskBoardCards.css`에서 마지막 **보이는 행**을 계산합니다.

```tsx
function LinkedTaskPreview({ tasks, onComplete }: {
  tasks: Task[];
  onComplete: (id: number, completed: boolean) => void;
}) {
  return (
    <ul aria-label="연결된 할 일" className="ml-5 pl-5">
      {tasks.map((task, index) => (
        <li key={task.task_id} className="relative pb-1">
          <span aria-hidden="true"
            className={`pointer-events-none absolute -left-4 top-0 border-l border-[var(--flowra-border-strong)] ${
              index === tasks.length - 1 ? "h-1/2" : "h-full"
            }`} />
          <span aria-hidden="true"
            className="pointer-events-none absolute -left-4 top-1/2 w-3 border-t border-[var(--flowra-border-strong)]" />
          <label className="flex min-h-11 items-center gap-2 rounded-md bg-[var(--flowra-surface-soft)] px-3 text-sm">
            <input type="checkbox" checked={task.status === "done"}
              aria-label={`${task.title} 완료`}
              onChange={(event) => onComplete(task.task_id, event.target.checked)} />
            <span className={task.status === "done" ? "line-through opacity-60" : ""}>
              {task.title}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
```

## 7. 접근성

- 선택과 완료 체크에 서로 다른 이름 제공. 체크 상태는 Checkbox의 `aria-checked`로 전달.
- 시각적으로 숨긴 선택 체크를 `display: none` 처리하지 않아 Tab과 Space로 진입 가능. `focus-within`에서 표시.
- 터치에서는 hover에 의존하지 않고 선택 체크 제공. 버튼 영역은 기본 44px, 선택 체크 자체는 32px.
- 색상 외에 테두리와 체크 모양으로 선택 상태 표현. 완료는 체크와 취소선으로 표현.
- 액션 바는 `role="group"`, 선택 개수는 `role="status"`. 일반 버튼의 Tab 탐색을 사용하므로 별도의 toolbar 방향키 규약을 요구하지 않음.
- 펼침 컨트롤에 `aria-expanded`, `aria-controls`. 트리는 장식용 CSS 선과 실제 `ul/li` 계층으로 표현. 복잡한 tree 위젯 역할을 부여하지 않음.
- 처리 중 `aria-busy`, 목록 `inert`, 액션 비활성화. 에러는 기존 toast/alert로 안내.
- ESC가 메뉴·패널·편집기와 충돌하지 않게 우선순위 처리. 닫을 때 포커스 복원.
- 기존 테마 변수와 reduced-motion 지원 유지.

## 8. 제거·수정·추가

| 구분 | 변경 |
| --- | --- |
| 제거 | 기본 툴바의 선택 버튼, 별도 selectionMode state, 일정 사이 `::before` 연결선, 삭제 전용 선택 문구 |
| 수정 | ScheduleCard의 hover 선택, TaskItem의 선택/완료 분리, 선택 카드 강조, 3개 미리보기, 일괄 작업 연결 |
| 추가 | SelectionActionBar, useListSelection, 부모 내부 CSS 트리, Shift/Ctrl/Cmd 선택, ESC와 포커스 복원, 브라우저 회귀 테스트 |
| 유지 | 날짜 그룹, 검색/정렬/필터, 일정 메타 정보, 더보기, 회사 일정 정책, 기존 API와 편집 패널 |

검증 명령:

```powershell
pnpm.cmd --filter @workspace/flowra-web typecheck
# artifacts/flowra-web에서 실행
pnpm.cmd exec playwright test tests/e2e/tasks-selection.spec.ts tests/e2e/tasks-design.spec.ts tests/e2e/task-rows.spec.ts
```

브라우저 검증은 모의 API를 사용합니다. 실제 운영 데이터에는 변경 요청을 보내지 않습니다.

최종 검증 결과: 앱 및 E2E TypeScript 검사 통과. 위 3개 파일의 Playwright 테스트는 51개 통과, 9개는 데스크톱에서 별도로 실행하는 반응형 검사이므로 모바일 프로젝트에서 의도적으로 제외됐습니다. 선택/범위 선택/ESC, 완료·해제·삭제, 부분 실패 재시도, 기존 편집·패널 동작, 320~1440px 배치와 다크 모드를 확인했습니다.
