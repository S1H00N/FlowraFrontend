# 홈 화면 개선 및 재계획

후속 UX 및 데이터 판정의 최신 규칙과 검증은 [홈 작업 상태와 Quick Add UX 수정](home-task-plan-status.md)을 따른다. 아래는 최초 홈 개선 단계의 기록이며, 일정 ID만으로 재계획을 제외하거나 카드 최소 높이를 320px로 유지하던 부분은 후속 수정으로 대체되었다.

## 분석한 기존 구조

- React/TypeScript, Tailwind, React Router, Axios `apiClient`, TanStack Query 구조를 유지한다. 상단 브리핑, 통계 4개, 오늘 일정/오늘 할 일 2열, 밀린 작업과 프로젝트 업무 섹션을 유지한다.
- `GET /home/today`에는 조회 날짜/시간대, 브리핑, 오늘 개인·조직 일정, 오늘 마감 할 일, 프로젝트 업무, 연속 완료 기록이 있다. `due_today_tasks`는 오늘 마감 작업만 포함하므로 전체 지연 작업이나 오늘 일정에 연결된 모든 Task를 이 배열만으로 계산할 수 없다.
- `GET /tasks`는 로컬 API 명세상 페이지 제한 없는 `tasks` 배열과 상태 필터를 제공한다. `todo,in_progress,postponed`를 조회해 전체 미완료와 지연 작업을 계산한다.
- Task의 마감은 `due_datetime`, 연결 일정은 단일 `schedule_id`다. 상태는 `todo`, `in_progress`, `done`, `postponed`다. Schedule 상세의 `start_datetime`, `end_datetime`, `all_day`, `is_completed`로 연결 일정의 날짜·시간·상태를 확인한다.
- 지연은 홈 응답의 날짜/시간대에서 **오늘보다 이전 날짜가 마감인 미완료 Task**다. 오늘 마감 시간이 이미 지났어도 오늘 마감 작업으로 분류한다. 완료·마감 없음·잘못된 날짜는 지연 계산에서 제외하고, 일수는 DST에 영향받지 않는 달력 날짜 차이로 계산한다.
- `in_progress` 상태 자체는 오늘 수행한다는 근거가 아니다. 과거 Schedule이나 `schedule_type`·카테고리 이름을 근거로 지연 Task 또는 재계획 이력을 추정하지 않는다.

## 수정한 파일

아래 `src/`와 `tests/`는 `artifacts/flowra-web/` 기준이다. API DTO와 기존 service/hook 계약을 재사용한다.

| 파일                                                                                                                  | 변경 내용                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [src/pages/Home.tsx](../../artifacts/flowra-web/src/pages/Home.tsx)                                                   | 오늘 수행 Task 필터, 오늘/밀린 작업 목록 중복 제거, 전체 지연 통계 유지, 카드 높이와 브리핑 집계 |
| [src/lib/homeTasks.ts](../../artifacts/flowra-web/src/lib/homeTasks.ts)                                               | 홈 날짜·시간대 기준 오늘 Task 선택과 기존 지연 일수 계산                                              |
| [src/components/home/TodaySchedule.tsx](../../artifacts/flowra-web/src/components/home/TodaySchedule.tsx)             | 최대 4개 표시, 남은 개수와 캘린더 이동, 오늘 할 일 카드와 높이 균형                                   |
| [src/components/home/TodayTasks.tsx](../../artifacts/flowra-web/src/components/home/TodayTasks.tsx)                   | 최대 4개, 명확한 설명·빈 상태, 기존 빠른 추가·완료 기능과 전체 목록 이동                              |
| [src/components/TaskForm.tsx](../../artifacts/flowra-web/src/components/TaskForm.tsx)                                 | 선택적 `defaultDueDate` 지원으로 홈의 새 Task 기본 마감을 오늘 23:59로 설정                           |
| [src/components/home/OverdueTasks.tsx](../../artifacts/flowra-web/src/components/home/OverdueTasks.tsx)               | 행별 단일 액션, 연결 일정 상세·상태 표시, 일괄 버튼을 헤더로 이동, 이미 연결된 작업 제외              |
| [src/components/home/RescheduleModal.tsx](../../artifacts/flowra-web/src/components/home/RescheduleModal.tsx)         | 재계획 클릭 시 바로 여는 모달, 모달 내부 날짜 바로 선택, 기존 날짜·시간·소요 시간 UI 재사용           |
| [src/components/home/BulkRescheduleModal.tsx](../../artifacts/flowra-web/src/components/home/BulkRescheduleModal.tsx) | 일정 미연결 Task만 선택하는 기존 순차 계획 흐름                                                       |
| [src/components/home/DailyBriefing.tsx](../../artifacts/flowra-web/src/components/home/DailyBriefing.tsx)             | 중복 없는 상태 요약/추천 두 문장                            |
| [src/hooks/useTaskReschedule.ts](../../artifacts/flowra-web/src/hooks/useTaskReschedule.ts)                           | 이미 연결된 Task 저장 방어, 마감일 보존, 생성 후 연결 실패와 응답 유실 재시도                         |
| [tests/home-tasks.test.mjs](../../artifacts/flowra-web/tests/home-tasks.test.mjs)                                     | 오늘 필터·시간대 경계·외부 일정 ID·완료 제외·원본 배열 유지와 기존 DST 검증                           |
| [tests/e2e/home-reschedule.spec.ts](../../artifacts/flowra-web/tests/e2e/home-reschedule.spec.ts)                     | 홈 표시, 단일 재계획·기존 연결·일괄 선택, 마감 보존·실패 복구와 반응형 검증                           |

## 오늘 할 일 필터 기준

미완료 Task 가운데 다음 중 하나를 만족하는 작업만 오늘 할 일에 표시한다.

1. `due_datetime`을 홈의 `timezone`으로 해석한 달력 날짜가 홈의 `date`와 같다.
2. `schedule_id`가 `GET /home/today`의 오늘 **개인 일정** ID 목록에 포함된다. 홈 응답의 `schedule_id`가 있으면 사용하고, 없으면 명세의 `id`를 사용한다. 조직 일정 ID를 Task의 개인 일정 관계에 섞지 않는다.

오늘 연결 작업을 먼저, 그다음 오늘 마감 작업을 기존 우선순위·마감 순으로 보여준다. 오늘 일정에 연결되지 않은 과거 지연 작업, 이후 마감 작업, 마감 없는 작업, 진행 중 상태만 있는 작업은 제외한다. 오늘 마감이면 다른 날짜의 일정에 연결되어 있어도 포함한다.

오늘 일정에 연결된 지연 Task는 오늘 할 일에만 표시하고 밀린 작업 행에서는 제외한다. **통계의 지연 작업 수는 원래 마감이 지난 전체 미완료 Task를 그대로 센다.** 실행 계획을 추가했다고 지연 이력을 없애지 않는다. 목록 조회 실패를 지연 0개로 표시하지 않는다.

두 카드 모두 최대 4개만 렌더링하고 남은 개수와 기존 전체 목록 이동을 제공한다. 데스크톱은 2열을 늘려 맞추고 카드 최소 높이는 320px이다. 태블릿/모바일은 오늘 일정 → 오늘 할 일 → 밀린 작업의 1열이다. 오늘 Task가 없으면 “오늘 예정된 할 일이 없어요.”와 기존 할 일 추가를 표시한다. 홈 빠른 추가는 오늘 23:59를 기본 마감으로 사용하며, 다른 화면의 TaskForm은 이 선택적 기본값을 전달하지 않으면 기존 동작을 유지한다.

## 재계획 UX

- 기존 행의 `[오늘 계획] [내일] [날짜 선택]`을 `[재계획]` 하나로 줄였다. 클릭하면 “다시 계획” 모달을 바로 연다.
- 날짜는 오늘을 기본으로 하며 모달 안에서 `[오늘] [날짜 선택]`과 기존 `CompactDateInput`으로 바꾼다. 시작 시간은 모달을 열 때의 현재 시각을 분 단위로 채우고 기존 `CompactTimeInput`으로 수정한다. 현재 분의 시작은 저장할 수 있고 이전 분은 차단한다. 소요 시간은 기존 `CustomSelect`에서 선택하며 시작 시간과 합산해 종료 예상을 표시한다. 자정을 넘기면 종료 날짜도 표시한다.
- 저장은 Schedule 생성 후 기존 Task를 해당 일정에 연결한다. Task를 복제하지 않고 `due_datetime`·상태·제목 등 다른 Task 필드를 저장 요청에 넣지 않는다.
- 일정이 이미 연결된 행은 `[일정 보기]`만 제공한다. `useSchedule`로 기존 상세 API를 조회해 홈 시간대 기준 “내일 14:00 예정”처럼 표시하고, 조회 실패는 명시적으로 표시한다. 과거 일정·완료 일정은 해당 상태를 보여준다.
- `schedule_id`는 현재 연결을 증명하지만 최초 연결인지 재계획 결과인지는 증명하지 못한다. 이력이 없는 기존 데이터에 “재계획됨”을 추정하지 않고 “예정”을 사용한다. 새로고침 뒤에도 현재 연결·상세 조회로 같은 상태를 확인한다.
- “한 번에 재계획”을 밀린 작업 헤더로 옮겼다. 모바일에서는 헤더 안에서 줄바꿈한다. 일괄 선택에는 일정 미연결 작업만 전달하고 모두 연결되어 있으면 버튼을 비활성화한다.
- 일괄 선택 자체는 API를 호출하지 않는다. 작업 선택 후 일정 설정 단계에서 빠른 설정을 전체 적용할 수 있다. 그 아래 작업별 설정은 기본으로 접고 작업명·마감·설정 요약을 표시한다. 각 행을 펼쳐 수정하며 접거나 단계 이동 후에도 입력값을 유지한다. 저장은 선택한 작업을 순서대로 처리하고, 실패한 작업은 자동으로 펼쳐 오류에 포커스를 둔다. 앞서 저장한 결과는 유지하고 재시도에서 제외한다.
- 저장 중 중복 제출·닫기를 막고 기존 Dialog의 Escape·포커스 복귀를 유지한다. 생성 성공 후 연결 실패는 생성한 Schedule을 현재 홈 화면 메모리에 보존해 같은 Schedule에 연결을 다시 시도한다. PATCH 응답 유실 후 서버 Task가 이미 그 일정에 연결되어 있으면 추가 POST/PATCH 없이 결과를 확인한다.
- 저장 직전 Task를 다시 조회해 완료·연결 변경·이미 존재하는 연결을 확인한다. 이미 연결된 Task는 새 Schedule 생성 전에 거절하고 Task/Home 목록을 갱신한다.

## AI 데일리 브리핑

첫 문장은 오늘 일정과 전체 미완료 상태를 요약한다. 둘째 문장은 지연 작업이 있으면 연결 일정 확인과 미배정 작업 계획을 추천하고, 없으면 오늘 작업 처리나 필요한 일정 추가를 안내한다. 같은 숫자를 두 문장에서 반복하지 않는다. 이는 조회한 실제 집계를 조합한 문구이며 새로운 AI 요청을 만들지 않는다. 브리핑에는 이 두 문장만 표시하고, “전체 브리핑 보기”와 “밀린 작업 재계획” 버튼은 표시하지 않는다.

지연 작업이 있으면 “밀린 작업 재계획” 액션을 유지한다. 클릭하면 기존 밀린 작업 섹션으로 이동하며, 지연 작업이 모두 오늘 할 일에 포함되어 그 섹션이 없으면 오늘 할 일 카드로 이동한다. 별도 재계획 기능을 중복 생성하지 않는다.

## 기존 API로 구현한 부분

모든 API 경로는 기존 `apiClient`의 `/api/v1` 기준이다. 서비스 코드에 새 endpoint나 mock 데이터를 추가하지 않았다. 브라우저 테스트의 기존 API fixture만 검증에 사용한다.

| API/기존 기능                                  | 사용                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /home/today?date=…&timezone=…`            | 오늘 개인·조직 일정, 조회 날짜·시간대, 서버 브리핑, 연속 완료, 프로젝트 업무                   |
| `GET /tasks?status=todo,in_progress,postponed` | 전체 미완료, 오늘 수행 Task와 원래 마감 기준 지연 집계                                         |
| `GET /schedules/:schedule_id`                  | 연결 일정의 날짜·시간·종일·완료 상태와 일정 보기 경로                                          |
| `GET /tasks/:task_id`                          | 저장 직전 완료·연결 변경 확인과 PATCH 응답 유실 후 연결 성공 확인                              |
| `POST /schedules`                              | 확인한 시작/종료, 개인 유형, 비공개 일정 생성                                                  |
| `PATCH /tasks/:task_id`                        | `{ schedule_id }`만 보내 기존 Task를 연결한다. 기존 정규화가 ID를 numeric string으로 전송한다. |
| 기존 TaskForm / 완료 hook                      | 기존 Task 생성·완료 API와 Query 캐시 갱신                                                      |

## 추가 API 또는 response 필드가 필요한 부분

현재의 오늘 Task 판단과 연결 일정 상태는 기존 API로 구현할 수 있다. 아래는 아직 적용하지 않은 백엔드 계약 보완 제안이며, 서비스 코드에서 존재하지 않는 endpoint나 필드를 사용하지 않는다.

| 필요한 정보/보장                | 명시적인 계약 보완 제안                                                                                                                                                                                        | 현재 한계                                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 홈의 오늘 작업과 연결 일정 요약 | 홈 응답에 `today_tasks` 및 `task_id`, `due_datetime`, `schedule_id`, `today_reason: "due_today" \| "scheduled_today"`, `linked_schedule: { schedule_id, start_datetime, end_datetime, all_day, is_completed }` | 현재는 전체 Task와 오늘 개인 일정 ID를 조합하고, 밀린 작업의 연결 일정은 상세를 추가 조회한다.                                                                                          |
| 실제 재계획 이력                | Task/연결 응답에 서버가 기록한 `rescheduled_at`, `original_schedule_id` 또는 `link_reason: "initial" \| "rescheduled"`                                                                                         | 단일 현재 `schedule_id`만으로 최초 계획과 재계획을 구분하거나 이전 실행 계획 이력을 복원할 수 없다.                                                                                     |
| 원자적 생성·연결과 멱등 재시도  | 한 트랜잭션의 생성·연결 계약, `start_datetime`, `end_datetime`, `expected_schedule_id`, `expected_updated_at`, `Idempotency-Key`; 응답 `{ task, schedule }`, 같은 키의 재시도는 최초 결과 반환                 | 별도 POST/PATCH는 생성 성공 후 연결 실패로 미연결 Schedule을 남길 수 있다. 페이지 이동·새로고침 또는 POST 성공 응답 자체의 유실 후 복구는 현재 화면 메모리만으로 완전히 보장할 수 없다. |
| 동시 변경 방지                  | Task 연결 갱신에 기대 버전/연결 ID를 조건으로 검사하고 충돌 시 409를 반환하는 서버 계약                                                                                                                        | 저장 직전 GET과 PATCH 사이에 다른 창·세션이 연결을 바꾸는 경합까지 현재 API로 차단할 수 없다.                                                                                           |

Task의 마감과 실행 일정 날짜를 구분하는 정책도 서버·프론트 전체에서 합의해야 한다. 현재 `useUpdateSchedule`의 `syncLinkedTaskDates`는 **기존 캘린더 일정의 날짜를 수정할 때 연결 Task의 마감 날짜도 이동시킨다.** 이번 홈 재계획 저장은 이 경로를 호출하지 않으며 해당 기존 캘린더 동작을 수정하지 않았다. 이후 캘린더 편집까지 원래 마감일을 계속 보존하려면 이 정책을 별도 작업으로 변경해야 한다. Schedule 자체의 작업형/이벤트형 목적은 현재 `schedule_type`이나 카테고리에서 임의 추정하지 않는다.

Sidebar·Navigation·Calendar·Tasks 페이지 전체 디자인, 색상 체계, 기존 API 구조는 이번 변경 범위에 포함하지 않는다.

## 검증

- 프론트 TypeScript(`pnpm.cmd typecheck`)와 E2E TypeScript(`pnpm.cmd test:e2e:typecheck`) 검사 통과.
- API 계약·날짜 계산 등 기존 단위/회귀 테스트(`pnpm.cmd test:api`) **82개 통과**, 실패 0개. 오늘 필터·시간대 경계·DST·기존 인증 및 날짜 동기화 검증을 포함한다.
- 홈 브라우저 검증은 **16개 시나리오 × 데스크톱/모바일 = 32개 고유 케이스 통과**. 기본 14개 시나리오의 28건 실행이 통과했고, 저장 직전 외부 연결 변경과 연결 일정 조회 실패 2개 시나리오를 양쪽 환경에서 추가 확인했다. 최종 브리핑·반응형 2개 시나리오도 양쪽에서 다시 확인하여 실행 횟수는 총 36건이다. 실패·건너뜀·재시도 통과는 없다.
- QA 환경의 Vite production build 통과. Windows sandbox에서는 기본 config bundler가 상위 디렉터리 접근 권한 때문에 실패하여 기존 Vite의 `--configLoader runner`로 빌드했다. 자동 서버 시작 확인 timeout·종료 지연도 발생해 검증용 서버와 테스트 실행을 분리하고 최종 8건을 통과시켰다. 임시 설정은 최종 소스에 남기지 않는다.
- 390/768/1280px에서 화면 가로 넘침, 1열/2열 배치, 데스크톱 카드 높이 일치, 최대 4개 표시, 남은 개수와 전체 보기, 모달·날짜 팝업 화면 경계, 채팅 버튼과 밀린 작업 액션의 수평 간격을 확인했다. 밀린 작업은 데스크톱/태블릿에서 오른쪽 여유 공간을 두며 모바일 헤더 버튼은 왼쪽 아래로 배치한다.
- 프로젝트에 lint 스크립트/설정이 없어 lint 명령은 실행할 수 없다. 홈 컴포넌트·hook·helper·테스트·문서의 Prettier 검사, 변경 diff의 공백 검사, 수정 파일의 UTF-8/BOM 및 한글 깨짐 검사를 통과했다. TaskForm은 요청에 필요한 기본 날짜 처리만 수정했다.
- 기존 할 일 추가·완료, 일괄 계획의 중도 취소, 마감일 보존, 연결 실패 후 같은 Schedule 재사용, PATCH 응답 유실 복구, 기존 연결을 덮어쓰지 않는 저장 방어를 검증했다. Sidebar·Navigation·Calendar·Tasks 페이지 전체는 수정하지 않았다. 실제 계정 데이터를 쓰는 live 테스트는 실행하지 않았으며, 가상 데이터는 기존 브라우저 테스트 fixture 안에서만 사용했다.

검증 결과와 화면:

- [기본 홈 28건 결과](../../artifacts/flowra-web/playwright-report-home-ux/results.json)
- [최종 추가·재검증 8건 결과](../../artifacts/flowra-web/playwright-report-home-ux-final-direct/results.json)
- [데스크톱 홈](../../artifacts/flowra-web/test-results-home-ux-final-direct/home-reschedule-home-panel-0c91f-t-mobile-tablet-and-desktop-desktop/home-1280.png)
- [모바일 홈](../../artifacts/flowra-web/test-results-home-ux-final-direct/home-reschedule-home-panel-0c91f-t-mobile-tablet-and-desktop-desktop/home-390.png)
- [모바일 재계획·날짜 선택](../../artifacts/flowra-web/test-results-home-ux-final-direct/home-reschedule-home-panel-0c91f-t-mobile-tablet-and-desktop-desktop/home-plan-mobile.png)
