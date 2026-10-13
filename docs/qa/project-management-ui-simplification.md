# 프로젝트 관리 2차 생성·수정 UI 간소화

작업일: 2026-10-13. Phase와 Work Item 생성·수정 모달에 기본 설정과 접을 수 있는 상세 설정을 적용했다. 상세 설정을 접어도 입력 상태를 유지하고, 기존 부모·Phase 관계 및 수동 진행률의 `0`과 자동 계산의 `null` 의미를 보존한다. 계약 기준은 [기업 프로젝트 공통 API](../../devdocs/api-reference/company-projects.md)다.

## 변경 전후

| 영역 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 업무 기본 화면 | 실적 날짜·마감·진행률·WBS·정렬 순서를 모두 표시 | 업무명, 설명, 상태, 우선순위, 상위 업무, 단계, 계획 기간을 먼저 표시 |
| 업무 상세 설정 | 별도 구분 없이 모든 필드 노출 | 실적 기간, 마감 날짜·시간, 진행률 설정, WBS 코드, 정렬 순서를 `상세 설정 (선택)`에 배치 |
| 단계 기본 화면 | 계획·실적 날짜와 정렬 순서를 모두 표시 | 단계명, 설명, 상태, 계획 기간을 먼저 표시하고 실적 기간·정렬 순서를 상세 설정에 배치 |
| 상세 설정 초기 상태 | 접기 기능 없음 | 생성은 접힌 상태. 수정은 실적 날짜·마감·WBS·수동 진행률·0이 아닌 정렬 순서가 있으면 펼친 상태. 접혀 있어도 설정 존재·오류 표시 |
| 진행률 | 숫자 입력과 수정 전용 수동 해제 체크박스 | `자동 계산` / `수동 설정`을 구분하고 수동일 때만 0~100 정수 입력 표시 |
| 위치 지정 | 부모와 단계를 별도로 선택하며 새 자식의 단계는 미지정 | 새 하위 업무에 선택한 부모 이름과 부모 Phase를 기본 반영. 부모 변경과 Phase 변경은 각각 명시적으로 수행 |
| 날짜·선택 입력 | 브라우저 기본 date/datetime-local/select | 기존 Flowra 날짜·시간·드롭다운 컴포넌트 재사용 |
| 모달 구조 | 전체 모달이 스크롤되어 제목·저장 버튼도 이동 | 제목·Footer 고정, 본문만 스크롤. 화면 높이에 맞춘 최대 높이와 모바일 1열 배치 |

설명은 기본 2줄로 표시한다. 넓은 화면에서는 상태·우선순위, 상위 업무·단계, 시작일·종료일을 각각 2열로 배치하고 작은 화면에서는 1열로 표시한다. 단계 없는 프로젝트에서는 Phase 선택과 Phase 추가를 제공하지 않는 기존 동작을 유지한다.

## 수정 파일과 공통 컴포넌트

| 파일 | 작업 내용 |
| --- | --- |
| [ProjectWorkFormDialog.tsx](../../artifacts/flowra-web/src/components/projects/ProjectWorkFormDialog.tsx) | 기본·상세 영역, 입력 상태 유지, 진행률 모드, 하위 생성 Phase 기본값, 공통 입력, 날짜 검증, 고정 제목·Footer 구현 |
| [CompactDateTimeInputs.tsx](../../artifacts/flowra-web/src/components/CompactDateTimeInputs.tsx) | 시간 입력 형식이 맞지 않으면 해석을 중단해 안내 문구·잘못된 텍스트를 `Number("")`로 자정 00:00에 변환하던 동작 수정 |
| [project-work-items.spec.ts](../../artifacts/flowra-web/tests/e2e/project-work-items.spec.ts) | 새 공통 입력 조작과 하위 생성 기본값 반영. 접기·펼치기 보존, 기존 숨겨진 값, 부모·Phase ID, 수동 0%와 자동 해제, 상세 오류 등 회귀 검사 |
| [CustomSelect.tsx](../../artifacts/flowra-web/src/components/ui/CustomSelect.tsx) | 정지한 포인터 아래에 열린 메뉴에서도 방향키·Enter가 실제 포커스된 항목을 기준으로 동작하도록 수정 |
| [task-rows.spec.ts](../../artifacts/flowra-web/tests/e2e/task-rows.spec.ts) | 공통 시간 선택기의 option 역할에 맞춰 기존 검사 한 곳 갱신. 할 일 화면 코드는 변경하지 않음 |
| [project-management-ui-simplification.md](project-management-ui-simplification.md) | 변경 내용, API 보존 규칙 및 검증 결과 기록 |

공통 시간 메뉴에는 접근 가능한 이름과 각 선택 항목의 option 역할도 제공했다.

[CompactDateInput과 CompactTimeInput](../../artifacts/flowra-web/src/components/CompactDateTimeInputs.tsx), [CustomSelect](../../artifacts/flowra-web/src/components/ui/CustomSelect.tsx), [FloatingPanelPortalProvider](../../artifacts/flowra-web/src/components/ui/FloatingPanelPortal.tsx), 기존 `Input`, `Textarea`, `Button`, `Dialog`를 재사용했다. 새 UI 라이브러리를 추가하지 않았다. 드롭다운은 기존 선택 표시·키보드 조작·스크롤·공간에 따른 펼침 방향을 사용하며 모달 본문 경계를 전달한다. FloatingPanelPortalProvider를 통해 달력과 메뉴를 모달의 포커스·포인터 범위 안에 배치한다.

[project-spec-contract.test.mjs](../../artifacts/flowra-web/tests/project-spec-contract.test.mjs)와 [project-work-tree.test.mjs](../../artifacts/flowra-web/tests/project-work-tree.test.mjs)는 API·트리 동작을 검사하며 기존 폼의 JSX 구조를 강제하지 않는다. API와 트리 계약을 변경하지 않아 기존 검사를 그대로 유지한다.

## 데이터와 API 보존

상세 영역 표시 여부와 입력 상태를 분리했다. 영역을 접거나 다시 펼쳐도 같은 draft를 유지한다. 수정에서는 실제 변경한 필드만 PATCH에 넣으므로 접힌 WBS, 실적 날짜, 정렬 순서, 부모·Phase ID를 초기값이나 `null`로 덮어쓰지 않는다. 사용자가 값을 지운 경우에만 해당 필드의 명시적인 `null`을 전달한다. 저장 실패 후에도 입력을 유지하며 상세 설정 오류가 있으면 영역을 펼치고 오류 표시를 남긴다.

| 경우 | 요청과 결과 |
| --- | --- |
| 자동 진행률로 새 업무 생성 | `progress_percent` 생략. 기존 서버 기본값·자동 계산 정책 사용 |
| 수동 진행률로 새 업무 생성 | 입력한 `progress_percent` 전송. 0%는 명시적인 `0`이며 자동 계산과 구분 |
| 기존 자동 업무를 수동 0%로 변경 | 표시 숫자가 기존 숫자와 같더라도 모드 전환에 따라 `progress_percent: 0` PATCH |
| 기존 수동 0% 조회 | `progress_override_percent != null`로 수동 여부를 판정하므로 0을 자동으로 해석하지 않음 |
| 기존 수동 업무를 자동으로 변경 | `progress_override_percent: null` PATCH. 프런트엔드에서 새 진행률을 계산하거나 `progress_percent: 0`을 덧붙이지 않음 |
| 기존 진행률 모드·숫자를 그대로 저장 | 진행률 관련 필드 생략 |
| 유효 배정 없이 override 해제 | 서버 계약에 따라 기존 저장 진행률 유지. 프런트엔드 계산 추가 없음 |
| 부모 변경 | `parent_work_item_id`만 변경. 기존 Phase를 자동 변경하지 않음 |
| Phase 변경 | 해당 업무의 `company_project_phase_id`만 변경. 자손 Phase는 자동 변경하지 않음 |

새 자식의 부모 Phase 반영은 모달에서 제공하는 수정 가능한 초기 선택값이다. 서버가 부모 Phase를 상속한다고 가정하지 않는다. 기존 수정에서는 부모와 다른 Phase도 정확하게 불러온다. 현재 부모·Phase가 선택 목록에 없어도 기존 ID를 유지하는 선택 항목을 제공한다. 부모를 Phase ID로 대체하거나 Phase를 계층 부모로 취급하지 않는다.

서버가 정한 `todo`, `medium`, 진행률 0, 정렬 순서 0 등 기존 기본값을 사용한다. 정렬 순서를 다른 단계 개수로 추측해 새로 계산하지 않으며 음수 정렬 순서도 기존 DTO대로 허용한다. API 경로·메서드·DTO·응답 구조·권한·취소 규칙·훅의 재조회 범위는 유지했다. 담당자 배정, 간트, 관리자 화면은 이번 작업에 포함하지 않는다.

## 깊이 정책

요청 문서의 “프로젝트를 포함해 최대 5단계” 문구와 현재 계약의 “Work Item depth 최대 5”는 단위가 다르다. 기존 계약과 검증 로직을 변경하지 말라는 지시에 따라 [기존 깊이 변환](../../artifacts/flowra-web/src/lib/projectWorkTree.ts)을 유지했다. 프로젝트는 화면 D1, 최상위 업무는 D2이며 서버 업무 depth 1~5는 화면 D2~D6이다. Phase는 깊이에 포함되지 않는다.

서버 depth 5에서 하위 추가를 제한하고 이유를 표시한다. 부모 선택은 확인 가능한 기존 깊이를 사용하며 자기 자신·자손을 제외한다. 부모 이동 시 subtree 전체 깊이 검사는 기존 서버가 담당한다. 제품 전체 깊이를 5로 줄이는 별도 정책 변경은 적용하지 않았다.

## 날짜·시간 처리

계획·실적 날짜는 기존 `YYYY-MM-DD` 또는 `null`을 사용하고 날짜 전용 값을 UTC 변환하지 않는다. 마감은 Flowra 날짜 선택기와 시간 선택기로 나누어 표시하되 기존 `due_datetime` 한 필드로 저장한다. 날짜와 시간을 모두 입력하거나 둘 다 비워야 하며 한쪽만 남아 있으면 상세 설정을 펼쳐 검증 오류를 표시한다. 임의의 오전 9시·자정 등 기본 시간을 저장하지 않는다.

날짜 입력의 X는 해당 날짜만 지운다. 마감 날짜 X도 시간을 함께 지우지 않으며, 시간은 별도 X로 지울 수 있다. 마감 전체를 삭제하려면 날짜와 시간 모두 지운 뒤 저장하고 `due_datetime: null`을 전달한다. X 클릭은 선택기를 열지 않고 입력의 다른 부분을 클릭하면 기존 선택기를 연다.

마감 시간은 기존 브라우저 로컬 시간 표시와 UTC `Z` 전송 방식을 유지한다. 수정하지 않은 마감은 PATCH에서 생략해 UI가 표시하지 않는 원본 초·밀리초를 보존한다. 새로운 마감 또는 사용자가 변경한 마감만 기존 방식으로 UTC 변환한다. 계획·실적 종료일은 시작일과 같거나 이후여야 한다.

## 검증 결과

아래는 이번 작업에서 직접 실행한 결과다. 브라우저 사례 수는 데스크톱·모바일을 포함하고 재실행 중복은 제외한다.

| 검사 | 결과 |
| --- | --- |
| TypeScript 타입 검사 | 전체 워크스페이스 통과. 공통 입력 수정 후 웹 타입 검사도 통과 |
| 기존 API·도메인 테스트 | 141/141 통과 |
| E2E TypeScript 검사 | 통과 |
| 프로덕션 빌드 | 최종 변경으로 통과 |
| Phase·Work Item Desktop/Mobile 브라우저 검사 | 70개 사례 최종 통과: 1차 66개와 추가 마감·모달 검사 4개 |
| 프로젝트 기본 관리 회귀 | 48개 사례 최종 통과. 최초 정적 자산 로딩 실패 2건은 코드 변경 없이 대상 재실행에서 통과 |
| 공통 시간 선택기 사용 화면 회귀 | 기존 할 일 마감 수정·시간 제거 검사 4개 통과 |
| 날짜 X, 드롭다운 위치·키보드, Footer·본문 스크롤, 밝은·어두운 테마 | 데스크톱·모바일 및 높이 560px에서 통과. 키보드 문제 수정 후 새 모달·기존 프로젝트 드롭다운 검사 10/10 통과 |
| 운영 서버 실제 API 쓰기·새로고침 영속성 | 미실행 |

브라우저 사례는 총 122개다. 추가 검사 중 모바일 키보드 이동이 포인터 hover 항목을 기준으로 동작하는 문제를 발견해 공통 드롭다운에서 수정했다. 해당 검사와 기존 프로젝트 드롭다운 회귀를 재실행해 통과했고, 밝은·어두운 모달 화면도 캡처로 확인했다. [최종 드롭다운 브라우저 보고서](../../artifacts/flowra-web/playwright-report-simplification-keyboard/index.html)는 로컬 검사 산출물이다.

실행한 주요 명령은 `pnpm.cmd typecheck`, `pnpm.cmd --filter @workspace/flowra-web test:api`, `pnpm.cmd --filter @workspace/flowra-web test:e2e:typecheck`, `pnpm.cmd --filter @workspace/flowra-web build`, `pnpm.cmd --filter @workspace/flowra-web exec playwright test`다. E2E는 `project-work-items.spec.ts`, `projects.spec.ts` 및 공통 시간 입력에 관련된 `task-rows.spec.ts` 두 사례를 사용했다.

브라우저 회귀 검사는 모의 API의 요청 본문과 재조회 결과를 확인한다. 운영 DB, 서버 transaction, 배정 집계, 권한 scope의 실제 동작은 이 검사만으로 확인하지 않는다. 현재 최대 깊이 변환의 제품 문구 차이와 마감 날짜·시간을 모두 지워야 삭제되는 UX는 위에 명시했다.
