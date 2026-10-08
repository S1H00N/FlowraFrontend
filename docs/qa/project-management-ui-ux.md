# 프로젝트 관리 1차 UI/UX 개선

## 변경 범위

기존 프로젝트 관리 구현 위에서 필터 배치, 생성·수정 모달의 간격과 스크롤, 날짜 초기화, 드롭다운 표시와 생성 제한 오류 안내를 개선했다. 기존 작업 트리의 프로젝트 API·인증·권한·조회·상태 계산 로직과 다른 페이지의 디자인은 유지했다. 2차 트리 테이블·간트 차트·담당자 관리 기능은 추가하지 않았다.

## 분석과 구현

- 프로젝트 필터는 두 `CustomSelect`의 기본 전체 너비와 검색창의 flex 너비가 경쟁하고 있었다. 공통 `Input`·`CustomSelect`를 유지하며 회사/검색/상태를 `1:1.8:1` 비율의 grid로, 새로고침을 40px 고정 너비로 배치했다. 높이는 모두 40px, 간격은 12px이다. 실제 본문 너비에 따른 container query로 검색창과 드롭다운을 줄바꿈하며 320px 화면에서도 검색 문구와 아이콘이 겹치지 않는다.
- 글로벌 헤더는 프로젝트 메뉴의 위치와 설명을, 본문 제목은 관리 영역과 생성 동작을 담당한다. 제목과 우측 생성 버튼을 유지하고 본문의 반복 설명을 제거했다.
- 통계의 계산식과 기존 카드 스타일은 유지했다. 내부 여백, 항목 간격, 숫자 행 높이와 숫자 폭 정렬을 조정했다.
- 모달은 기존 Radix `Dialog`와 `FloatingPanelPortalProvider`를 재사용했다. 최대 높이는 `min(90dvh, 760px)`이며 제목과 버튼은 고정하고 폼만 필요할 때 스크롤한다. 모바일에서 하단 버튼을 가로로 배치하고, 생성 결과 확인 버튼까지 표시되는 경우에는 줄바꿈을 허용한다. 날짜 및 공개 범위/생성 상태의 2열 배치는 모바일에서 1열로 바뀐다.
- 기존 `CompactDateInput`에는 내부 초기화 기능이 없었다. 선택적 `clearLabel` 속성을 추가해 프로젝트 폼에서만 활성화했다. 선택값이 있을 때만 입력창 내부의 X를 표시하며, 클릭·키보드 실행 시 해당 날짜를 초기화하고 포커스를 복원한다. pointer/click 전파와 포커스 복원으로 캘린더가 열리지 않게 처리했다. 캘린더 선택과 입력 표시 형식·높이·테두리는 그대로 유지한다.
- `CompactDateInput`의 기존 사용처인 홈 재계획, 할 일, 일정 연결 업무는 새 속성을 사용하지 않으므로 기존 동작을 유지한다.
- `CustomSelect`의 기본 원형은 아이콘/색상이 없는 옵션에 표시하는 장식이었다. `showFallbackMarker`, `matchTriggerWidth`, `wrapDescriptions`를 선택적으로 적용해 프로젝트 폼에서만 장식을 제거하고 설명을 줄바꿈한다. 선택 체크와 보라색 강조는 유지하며, 메뉴가 입력 필드 너비에 맞고 아래 공간이 부족하면 위로 열린다. 실측 메뉴 높이와 resize/scroll에 따라 위치를 갱신한다. 다른 화면에서는 기본값을 유지한다.
- 공통 `getErrorMessage`에 확인된 `COMPANY_PROJECT_CREATE_DISABLED` 코드만 한국어 제목·본문으로 매핑했다. 기존 토스트와 폼 인라인 오류에 적용되며 다른 403·미확인 코드·코드 없는 서버 메시지는 기존대로 처리한다. 실패 시 폼 입력을 유지하고 생성 권한을 추측해 추가로 버튼을 비활성화하지 않는다.
- 생성 요청의 빈 날짜는 기존 API 정규화에 따라 필드가 생략된다. 수정 요청의 날짜 삭제는 기존대로 `null`을 전송한다. 날짜 역전 검사와 `phase_mode` 값·요청 계약은 유지한다.

## 수정 파일

| 파일                                                                 | 변경 내용                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `artifacts/flowra-web/src/pages/Projects.tsx`                        | 반복 설명 제거, 필터 높이·새로고침 크기 지정                                              |
| `artifacts/flowra-web/src/pages/Projects.css`                        | 필터 비율·반응형 배치, 검색 아이콘 간격, 통계 정렬                                        |
| `artifacts/flowra-web/src/components/projects/ProjectFormDialog.tsx` | 모달 크기·내부 스크롤·버튼 배치, 내부 X 적용, 드롭다운 옵션과 운영 방식 설명, 오류 줄바꿈 |
| `artifacts/flowra-web/src/components/CompactDateTimeInputs.tsx`      | 선택적으로 활성화하는 내부 날짜 X 및 이벤트·포커스 처리                                   |
| `artifacts/flowra-web/src/components/ui/CustomSelect.tsx`            | 프로젝트 폼용 선택적 장식 제거·너비 일치·상하 배치·설명 줄바꿈                            |
| `artifacts/flowra-web/src/lib/error.ts`                              | 생성 제한 오류 코드의 한국어 메시지                                                       |
| `artifacts/flowra-web/tests/e2e/projects.spec.ts`                    | 날짜·오류·반응형·스크롤·키보드·테마 브라우저 검증                                         |
| `artifacts/flowra-web/tests/project-error.test.mjs`                  | 코드 매핑 범위 및 원본 진단 정보 보존 검증                                                |
| `docs/qa/project-management-ui-ux.md`                                | 변경 범위 및 검증 기록                                                                    |

## 검증

- `pnpm.cmd run typecheck`: 라이브러리·웹·기존 API 서버 타입 검사 통과.
- `pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck`: 브라우저 테스트 타입 검사 통과.
- `pnpm.cmd --filter @workspace/flowra-web run test:api`: 101개 통과, 실패 0개.
- `pnpm.cmd --filter @workspace/flowra-web run build`: production 빌드 통과. Windows 샌드박스의 esbuild 상위 폴더 탐색 제한이 있어 같은 명령을 승인된 일반 권한으로 실행했다.
- 프로젝트 Playwright 검증: 21개 시나리오를 desktop/mobile에서 검증해 총 42개 통과했다. 최초 40개 실행에서 38개가 통과했으며, 새 날짜 테스트 2개는 기존 생성 API가 빈 날짜를 생략하는 계약과 기대값이 달랐다. API 계약에 맞게 테스트 기대값과 가상 생성 응답을 수정한 뒤 날짜 2개를 재실행했고, 신규 라이트·다크 검증 2개도 통과했다.
- 기존 화면 회귀 검증: 홈 재계획의 날짜·드롭다운·Escape·포커스 복원, 주요 메뉴 이동/뒤로가기, 설정의 테마 적용/새로고침을 desktop/mobile에서 총 6개 통과했다.
- 날짜 X 표시와 입력창 내부 위치, 클릭/Enter에 의한 독립 초기화, 캘린더 미열림/재열림, 날짜 선택·POST 전송·PATCH `null`, 역전 날짜 검사를 확인했다.
- 생성 제한의 한국어 안내, 전체 폼 값 보존, 다른 403 코드의 원래 메시지, 실패 뒤 수동 재시도 및 기존 생성 성공 동작을 확인했다.
- 320px 필터/검색 문구 배치, 500px 높이 모달의 내부 스크롤·고정 제목/버튼, 폼 2열/1열 배치, 드롭다운 너비·위쪽 열기·체크·방향키/Enter/Escape를 확인했다.
- 라이트·다크 페이지/모달/드롭다운의 스크린샷 12장을 저장하고 주요 텍스트 색상과 배경을 확인했다. [최종 브라우저 보고서](../../artifacts/flowra-web/playwright-report-project-ui-ux-final/index.html)에 첨부되어 있다.
- 수정한 소스의 UTF-8 무BOM 인코딩과 한글, Prettier 및 diff 공백 오류를 확인했다.

브라우저 실행 명령:

```powershell
$env:QA_RESULTS_DIR = 'test-results-project-ui-ux'
$env:QA_REPORT_DIR = 'playwright-report-project-ui-ux'
pnpm.cmd --filter @workspace/flowra-web run test:e2e projects.spec.ts --project=desktop --project=mobile

$env:QA_RESULTS_DIR = 'test-results-project-ui-ux-final'
$env:QA_REPORT_DIR = 'playwright-report-project-ui-ux-final'
pnpm.cmd --filter @workspace/flowra-web run test:e2e projects.spec.ts home-reschedule.spec.ts shell.spec.ts --project=desktop --project=mobile --grep '날짜 입력 안|라이트·다크|today and custom date|주요 메뉴|프로필에서 설정'
```

브라우저 테스트는 가상 API를 사용한다. 실제 운영 서버의 부서 권한 설정이나 DB 저장 여부는 이 검증 범위에 포함되지 않는다.
