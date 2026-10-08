# 홈 작업 상태와 Quick Add UX 수정

2026-10-07 기준 후속 수정이다. 홈 구조와 기존 디자인 시스템을 유지하며, 재계획 모달의 레이아웃은 변경하지 않았다. 요청의 목록 기준과 예시가 달랐던 부분은 사용자 확인에 따라 **미래 일정이 있는 지연 작업의 행을 유지하고 일정 보기를 제공하되 일괄 재계획에서는 제외**한다.

2026-10-08 추가 수정: 일괄 재계획의 빠른 설정 아래 작업별 설정은 기본으로 접는다. 작업명·마감·설정 요약을 보여주고, 필요한 행을 펼쳐 편집한다. 날짜는 단일/일괄 모두 `오늘 / 날짜 선택`으로 간소화하고, 기본 시작 시간은 모달을 열 때의 현재 시각을 분 단위로 채운다. 현재 분은 제출할 수 있으며 이전 분은 저장 전 차단한다. 일괄 저장은 제출 시 전체 시간을 검증해 저장 도중 분이 바뀌어도 나머지 작업을 처리한다. 입력값은 접기와 단계 이동 후에도 유지하고 저장 오류가 있는 행은 자동으로 펼쳐 안내한다. AI 데일리 브리핑은 요약과 추천 두 문장만 표시한다.

## 수정한 파일

`artifacts/flowra-web/` 기준:

| 파일                                          | 변경                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pages/Home.tsx`                          | 오늘 작업·밀린 행의 중복 제거, 유효한 실행 일정 기반 오늘 필터, 예정 표시와 재계획 집계         |
| `src/lib/homeTasks.ts`                        | 공통 계획 상태와 일정 날짜 판정                                                                 |
| `src/lib/homeTaskPlanLabel.ts`                | 예정·진행 중·지난 일정의 사용자용 날짜/시간 문구                                                |
| `src/hooks/useHomeTaskPlans.ts`               | 기존 일정 상세 API와 캐시를 공유해 행·오늘 목록·일괄 대상에 동일 상태 제공, 시작/종료 경계 갱신 |
| `src/hooks/useTaskReschedule.ts`              | 저장 직전 최신 Task·일정 확인, 과거 계획 교체 허용, 최신 상세 캐시 반영                         |
| `src/components/home/OverdueTasks.tsx`        | 지난 일정 재계획과 유효한 일정 보기, 공통 판정 기반 일괄 후보                                   |
| `src/components/home/BulkRescheduleModal.tsx` | 전달된 실제 재계획 후보를 선택; 과거 일정 ID가 있다는 이유로 비활성화하지 않음                  |
| `src/components/home/TodayTasks.tsx`          | 작은 빈 상태, 기존 접힌 Quick Add 재사용, 오늘 계획의 예정 시간·일정 보기                       |
| `src/components/home/TodaySchedule.tsx`       | 작은 빈 상태와 일정 추가, 캘린더 보기 유지                                                      |
| `src/components/home/DailyBriefing.tsx`       | 미배정 표현 제거, 실제 재계획 대상 여부에 맞춘 추천 문장 제공                                     |
| `tests/home-tasks.test.mjs`                   | 일정 상태·날짜 경계·저장 보호·재시도 단위 검증                                                  |
| `tests/e2e/home-reschedule.spec.ts`           | A~G와 실제 저장·일괄 대상·빈 상태·반응형 브라우저 검증                                          |

기존 `TaskForm.tsx`는 수정하지 않고 compact 모드의 접힌 상태, 클릭으로 열기, ESC/X 취소와 포커스 복귀를 재사용했다. Sidebar, Calendar, Task 페이지는 이번 수정 대상에 포함하지 않았다.

## 재계획 판정

| Task / Schedule 상태                                               | 판정        | 동작                                      |
| ------------------------------------------------------------------ | ----------- | ----------------------------------------- |
| Task 완료                                                          | `completed` | 홈 미완료 목록에서 제외                   |
| 일정 연결 없음                                                     | `unplanned` | 지연 작업이면 재계획 가능                 |
| 시작 전인 유효한 일정                                              | `planned`   | 예정 날짜/시간과 일정 보기                |
| 시작했고 명시된 종료 전                                            | `active`    | 진행 중 표시, 기존 계획 유지              |
| 종료했거나 과거 날짜에 시작한 종료 미지정 일정                     | `past`      | 미완료 작업 재계획 가능, 지난 일정 표시   |
| 일정 완료 + Task 미완료                                            | `past`      | Task 완료를 추정하지 않고 재계획 허용     |
| 조회 실패·잘못된 날짜·시간대 없는 시각·오늘 시작 후 종료 시간 없음 | `unknown`   | 시간 확인 안내, 재계획/일괄 후보에서 제외 |

시간 비교는 실제 현재 시각과 홈 시간대로 수행한다. 정확히 시작 시각이면 진행 중이고, 정확히 종료 시각이면 지난 계획이다. 자정을 걸친 일정은 명시된 종료 전까지 진행 중이다. `all_day`는 날짜 기준으로 처리하며, 날짜만 있는 종일 값은 UTC 자정으로 바꾸지 않는다. 오늘 시작 후 종료가 없는 시간 지정 일정에는 임의의 소요 시간을 적용하지 않는다.

저장 직전 기존 `GET /tasks/:id`와 `GET /schedules/:id`를 다시 확인한다. 완료된 Task, 변경된 일정 연결, 미래로 이동한 같은 일정, 진행 중/불명확한 일정은 새 일정 생성 전에 차단한다. 과거 계획만 새 Schedule을 생성해 기존 Task의 `schedule_id`를 갱신한다. 원래 마감, 상태, Task 개수와 이전 Schedule은 유지한다. 생성 후 연결 실패 시 같은 Schedule 재사용 및 PATCH 응답 유실 복구를 유지한다.

## 오늘 작업과 일괄 대상

오늘 할 일은 미완료이며 **오늘 마감이거나 오늘 예정된 유효한 일정/현재 진행 중인 일정에 연결된 작업**이다. 종료된 오늘 일정만 연결된 과거 마감 작업은 오늘 목록에서 제외해 밀린 목록으로 돌린다. 오늘 목록의 Task ID는 밀린 목록에서 제거한다. 통계의 지연 수는 원래 마감이 지난 전체 미완료 Task를 센다.

일괄 재계획에는 밀린 목록 중 `unplanned` 또는 `past`만 전달한다. 미래·오늘 예정·진행 중·완료·상태 불명확한 작업은 제외한다. 이미 계획된 미래 작업의 행은 사용자 선택에 따라 밀린 목록에서 유지한다.

## UI

두 카드의 `min-h-80`을 제거하고 헤더·내용·버튼·푸터의 기존 간격으로 높이를 결정한다. 데스크톱 grid의 동일 높이 배치를 유지하며 최대 4개와 나머지 개수도 유지한다.

- 오늘 일정 없음: “오늘 예정된 일정이 없어요.” + 일정 추가, 캘린더에서 보기.
- 오늘 할 일 없음: “오늘 예정된 할 일이 없어요.” + 할 일 추가. 클릭 전 입력 폼은 없다.
- 기존 Quick Add는 클릭 시 열리고 ESC/X 취소 시 접히며 입력값을 초기화한다.
- 예정 계획: “오늘 18:00 예정”, “10월 8일 14:00 예정”. 지난 계획: “지난 일정 · 9월 22일 09:00”.
- 브리핑은 “밀린 작업을 다시 계획해 보세요.”를 사용하고, 실제 재계획 대상이 없으면 예정 작업을 처리하도록 안내한다. 상태 요약과 추천 두 문장만 표시하며, “전체 브리핑 보기”와 “밀린 작업 재계획” 버튼은 제공하지 않는다.

## API와 필드

새 endpoint는 필요하지 않으며 추가하지 않았다. 기존 Task의 `status`, `due_datetime`, `schedule_id`와 Schedule 상세의 `start_datetime`, `end_datetime`, `all_day`, `is_completed`로 구현했다.

시작한 시간 지정 일정의 `end_datetime`이 없으면 아직 진행 중인지 이미 종료했는지 확정할 수 없다. 정확한 판정을 위해 종료 시각 또는 서버가 명시한 실행 상태가 필요하다. 시각에는 UTC/offset이 포함되어야 한다. 현재 연결 ID만으로 최초 계획과 재계획 이력은 구분할 수 없어 “재계획 완료”를 추정하지 않는다. 상세 조회를 줄이려면 Task/Home 응답에 같은 일정 요약 필드를 포함할 수 있다.

## 검증

- TypeScript: workspace 라이브러리·프론트·API 서버 검사 통과. 최종 프론트와 E2E TypeScript 재검사도 통과.
- lint: 프로젝트에 lint 스크립트/설정이 없어 실행할 수 없음. 변경 소스/테스트 12개의 Prettier 검사, diff 공백 검사, 변경 소스/테스트/문서 14개의 UTF-8·BOM·한글 검사 통과.
- build: `pnpm.cmd build --configLoader runner` production 빌드 통과. Windows sandbox의 기본 설정 bundler가 상위 폴더 접근 권한 오류를 내므로 기존 Vite runner 옵션을 사용했다.
- 단위/회귀: `pnpm.cmd test:api` 92개 통과, 실패/건너뜀 0개. 공통 계획 상태와 저장 보호 테스트 15개 포함.
- 브라우저: 홈 21개 시나리오 × 데스크톱/모바일 = **42개 통과**, 실패·건너뜀·재시도 통과 0개. 화면 증거 추가 후 빈 상태/상태 매트릭스 4회도 통과.
- 빈 카드 실측: 1280px와 390px 모두 두 카드 **219px**로 일치. 기존 최소 320px의 약 **68%**이며, 고정 카드 높이 없이 기존 간격과 내용으로 결정된다.
- 390/768/1280px 배치, 가로 넘침, 4개 표시 제한, 남은 개수, 기존 모달/날짜 입력, 완료·중복 생성 방지·마감 보존을 확인했다. 실제 계정 데이터는 쓰지 않았으며 기존 QA fixture로 검증했다.

| 요청 케이스                   | 확인 결과                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| A: 지연 + 일정 없음           | 밀린 행에 재계획, 일괄 후보 포함                                                      |
| B: 지연 + 내일 일정           | 밀린 행에 예정 시각과 일정 보기, 일괄 제외                                            |
| C: 지연 + 오늘 미래 시간 일정 | 오늘 할 일에 예정 시각과 일정 보기, 밀린 행 중복 없음                                 |
| D: 지연 + 과거 일정 + 미완료  | 지난 일정과 재계획, 일괄 포함; 실제 새 일정 저장 후 원래 마감·Task·이전 Schedule 유지 |
| E: 완료 Task                  | 오늘/밀린 미완료 목록에서 제외                                                        |
| F: 오늘 Task 없음             | 작은 빈 상태, 입력 폼 없음                                                            |
| G: 할 일 추가 클릭            | 기존 Quick Add 펼침, ESC/X 취소로 접기·입력 초기화·포커스 복귀                        |

검증 기록과 화면:

- [42개 브라우저 결과](../../artifacts/flowra-web/playwright-report-home-task-plans/results.json)
- [4개 화면 증거 검증 및 높이 측정](../../artifacts/flowra-web/playwright-report-home-task-plans-evidence/results.json)
- [데스크톱 빈 상태](../../artifacts/flowra-web/test-results-home-task-plans-evidence/home-reschedule-empty-pane-6f680-n-Escape-or-the-cancel-icon-desktop/home-empty-1280.png)
- [모바일 빈 상태](../../artifacts/flowra-web/test-results-home-task-plans-evidence/home-reschedule-empty-pane-6f680-n-Escape-or-the-cancel-icon-desktop/home-empty-390.png)
- [작업 상태 A~G](../../artifacts/flowra-web/test-results-home-task-plans-evidence/home-reschedule-home-disti-c751e-asks-without-duplicate-rows-desktop/home-task-plans-a-g.png)
- [일괄 재계획 후보](../../artifacts/flowra-web/test-results-home-task-plans-evidence/home-reschedule-home-disti-c751e-asks-without-duplicate-rows-desktop/home-task-plans-a-g-bulk.png)

## 2026-10-08 추가 수정 검증

- 프런트 및 E2E TypeScript 검사, QA 모드 production 빌드 통과.
- 홈 작업 단위 테스트 15개, 데스크톱/모바일 브라우저 테스트 58개 통과. 실패·건너뜀·재시도 없음.
- 현재 분 기본값과 모달 재오픈 시 갱신, 일괄 저장 중 분 변경, 기본 접힘과 설정 요약, 접힌 상태의 전체 적용, 개별 편집과 값 보존, 지난 분 저장 차단과 오류 행 자동 펼침·포커스, 브리핑 버튼 제거를 확인했다.
- 390/1280px의 접힌 일괄 설정 화면을 확인하고, 기존 마감 보존·부분 실패 재시도·중복 일정 생성 방지를 재검증했다.
- 변경 소스/테스트의 Prettier 검사 및 변경 8개 파일의 UTF-8·BOM·한글 검사 통과.

[브라우저 결과](../../artifacts/flowra-web/playwright-report-reschedule-refinement/results.json), [데스크톱 접힌 설정](../../artifacts/flowra-web/test-results-reschedule-refinement/home-reschedule-bulk-setti-f14f9-sible-on-mobile-and-desktop-desktop/home-bulk-collapsed-1280.png), [모바일 접힌 설정](../../artifacts/flowra-web/test-results-reschedule-refinement/home-reschedule-bulk-setti-f14f9-sible-on-mobile-and-desktop-desktop/home-bulk-collapsed-390.png)
