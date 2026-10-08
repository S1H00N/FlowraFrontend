# 프로젝트 관리 1차 구현 기록

기준일: 2026-10-08. 이번 범위는 프로젝트 목록, 생성, 기본 상세, 기본 정보 수정과 상태 관리다. 업무 트리 CRUD, 간트, 배정, 업무량 및 관리자 대시보드는 포함하지 않는다.

## A. 기존 코드 분석 결과

- 웹은 `artifacts/flowra-web`의 React 19·TypeScript·Vite 7 앱이다. React Router 7로 페이지를 연결하고 TanStack Query 5로 서버 데이터와 mutation을 관리한다. 별도 라이브러리를 추가하지 않았다.
- 기존 프로젝트 타입, 일반 사용자 API 서비스, 목록·상세·생성·수정 훅은 이미 있었다. 프로젝트 업무는 홈/할 일/캘린더에 일부 연결되어 있었지만 프로젝트 관리 전용 페이지와 탐색 메뉴는 없었다. 이 기존 기능들은 유지한다.
- `index.css`의 `--flowra-*` CSS 변수와 Tailwind 의미 토큰을 사용한다. 밝은 테마는 slate 배경·흰색 표면·violet 강조색, 어두운 테마는 동일 변수의 dark 값이다. 상태는 기존 accent/muted/amber/rose 스타일로 표시한다. 기존 간격, 둥근 모서리, 얕은 그림자와 focus/disabled 처리를 따른다.
- `AppShell`, `Button`, `Input`, `Textarea`, `CustomSelect`, Radix `Dialog`, `CompactDateInput`, `FloatingPanelPortalProvider`, `FullSpinner`, `EmptyState`, `ErrorState`와 mutation toast를 재사용한다. 폼 내 날짜/선택기 포털은 모달 focus scope 안에 둔다.
- `api/client.ts`의 일반 사용자 Bearer 인증, 요청 ID, 401 refresh queue, 동일 세션 재시도, 변경된 인증 세션의 응답 차단을 그대로 사용한다. 프로젝트 기능에서 기업 관리자 토큰이나 별도의 인증 클라이언트를 사용하지 않는다.
- 회사 선택은 기존 `useCompanyMemberships` 데이터를 이용한다. 프로젝트 관리의 회사 선택값은 URL `company_id`에 둔다. 회사 role을 프로젝트 role로 해석하지 않는다.

### 확인한 문서와 불일치

- [일반 API 명세](../backend-specs/api_general.md), [일반 라우트](../../devdocs/api-reference/routes-general.md), [생성 이후 관리](../../devdocs/api-reference/feature-lifecycle.md), [디버깅 가이드](../../devdocs/api-reference/debugging-guide.md), [오류 색인](../../devdocs/api-reference/error-index.md)을 확인했다.
- 일반 API 명세에는 프로젝트 PATCH 설명이 없지만, F01 문서·일반 라우트·기존 서비스 및 테스트에서 사용자 PATCH와 `data.project`를 확인했다.
- 백엔드 DTO/controller/service 원본은 이 저장소에 없다. 목록 wire 응답의 정식 배열 필드는 문서에 명시되지 않았다. 새 응답 alias를 만들지 않고 기존 클라이언트의 정규화를 재사용하며, 인식하지 못한 응답은 오류로 처리한다.
- 멤버 row의 `status`는 기존 타입에서 선택 필드다. 관리 전용 GET이 성공하고 본인 회사 구성원 ID와 owner/manager role이 맞는 경우에만 수정 버튼을 표시한다. status가 있으면 `active`만 인정하며, 생략된 경우에는 F01의 서버 권한 검사를 근거로 판단한다.
- 프로젝트 summary 필드 의미, 상태 전이표, 동일 시작/종료일 허용 여부는 확인되지 않았다. 이 항목들은 임의로 규칙을 만들지 않고 서버 검증 또는 추가 명세를 기다린다.

## B. 구현 완료 기능

| 기능          | 구현 내용                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로젝트 메인 | 기존 사이드바/모바일 탐색에 프로젝트 추가. `/projects`에서 회사 선택, 이름·설명 검색, 6개 상태 필터, 날짜와 설명 목록을 제공한다.                                                                                     |
| 조회 현황     | 현재 응답으로 조회된 프로젝트 수, 진행 중, 완료, 일시중지·보관 수를 표시한다. `현재 조회 결과 기준`을 명시하며 회사 전체 통계로 표시하지 않는다.                                                                      |
| 생성          | 활성 멤버십과 소속 부서 확인, 프로젝트명·설명·계획 기간·공개 범위·생성 상태·운영 방식 폼. 상태 `draft/active`, 범위 `department_tree/members`, 운영 방식 `phased/phase_less`만 전송한다. 기본 운영 방식은 `phased`다. |
| 생성 정책     | 회사 ID는 선택한 실제 멤버십 값. origin 부서는 서버의 본인 부서 정책을 사용하며 임의 ID나 owner를 전송하지 않는다. 부서 생성 정책은 서버 검증을 최종 기준으로 따른다.                                                 |
| 생성 완료     | 실제 응답 프로젝트 ID를 검사한 뒤 폼을 닫고 기존 목록 캐시를 갱신한다. 회사 선택은 유지하고 검색·상태 필터를 초기화해 새 프로젝트를 확인할 수 있게 한다. 폼 내 중복 제출과 mutation 자동 재시도를 막는다.             |
| 결과 유실     | 생성 실패에도 목록을 갱신한다. 네트워크·5xx·잘못된 성공 응답처럼 결과가 불명확하면 같은 폼의 재제출을 잠그고 `목록에서 확인`을 안내한다.                                                                              |
| 기본 상세     | `/projects/:companyProjectId`에서 실제 상세 GET. 프로젝트 이름·설명·상태·회사/부서·계획 날짜·공개 범위·운영 방식을 표시한다. 해당 회사 멤버십과 URL 회사 문맥을 확인한다.                                             |
| 수정·보관     | 프로젝트 멤버 GET으로 권한을 확인한 사용자에게만 수정 동작을 제공한다. 변경한 이름·설명·상태·공개 범위·계획 날짜만 PATCH하며 nullable 삭제는 `null`로 보낸다. 보관/취소 시 확인한다. 보관은 `status: archived`다.     |
| 폼 보호       | 필수값·실제 날짜·종료일이 시작일보다 앞서는 경우 검증, 요청 중 닫기와 이동 차단, 미저장 취소/ESC/바깥 클릭 확인, 내부 링크/브라우저 Back 확인, reload/탭 종료 경고.                                                   |
| 오류·접근     | 최초 로딩, 비어 있는 목록, 검색 결과 없음, 활성 멤버십 없음, 400/401/403/404 및 기타 서버/네트워크 오류, 재조회. 오류 응답을 정상 빈 목록으로 바꾸지 않는다.                                                          |
| 회사 문맥     | 회사별 query key를 사용하고 회사 전환 중 이전 회사 데이터를 유지하지 않는다. 변경된 회사/프로젝트로 기존 수정 폼을 자동으로 넘기지 않는다.                                                                            |
| 반응형        | 모바일 목록의 정보 배치, 모달 스크롤, 긴 이름·설명의 줄바꿈, 키보드 접근과 다크 테마 지원.                                                                                                                            |

연동한 기존 API:

- `GET /api/v1/company-memberships`
- `GET /api/v1/company-projects` — 실제 회사·검색·상태 query
- `POST /api/v1/company-projects`
- `GET /api/v1/company-projects/:company_project_id`
- `PATCH /api/v1/company-projects/:company_project_id`
- `GET /api/v1/company-projects/:company_project_id/members` — 수정 권한 확인용; 배정/멤버 관리 UI는 구현하지 않음

사용 흐름은 프로젝트 메뉴 → 회사/필터 선택 → 생성 또는 목록 항목 클릭 → 기본 개요 확인 → 권한이 있으면 기본 정보/상태 수정 → 서버 데이터 재조회다. 프로젝트 DELETE와 구현되지 않은 탭/샘플 데이터를 추가하지 않았다.

## C. 수정 및 생성한 파일

경로는 저장소 루트 기준이다.

| 파일                                                                   | 변경과 이유                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `artifacts/flowra-web/src/App.tsx`                                     | 보호된 목록·상세 lazy route 추가. 기존 로그인 경계를 유지한다.                                                    |
| `artifacts/flowra-web/src/components/AppShell.tsx`                     | 프로젝트 탐색 추가, 상세 URL에서 프로젝트 헤더와 선택 상태 유지.                                                  |
| `artifacts/flowra-web/src/api/companyProjects.ts`                      | 기존 API 재사용. 식별 불가능한 목록/잘못된 핵심 필드·상세 ID·생성/수정 응답 ID를 오류로 처리한다.                 |
| `artifacts/flowra-web/src/hooks/useCompanyProjects.ts`                 | 멤버 권한 조회, 회사 전환 시 이전 목록 차단 옵션, 생성 결과 유실에도 관련 캐시 갱신.                              |
| `artifacts/flowra-web/src/pages/Projects.tsx`                          | 회사 선택·실제 API 검색/상태 필터·조회 현황·목록·생성/수정 진입·상태 처리.                                        |
| `artifacts/flowra-web/src/pages/ProjectDetail.tsx`                     | 실제 ID 기반 기본 상세와 수정 진입. 향후 상세 기능이 이 ID와 기존 훅을 재사용할 수 있다.                          |
| `artifacts/flowra-web/src/pages/Projects.css`                          | 기존 표면/텍스트/테두리 토큰을 쓰는 간결한 목록과 반응형 상세 레이아웃.                                           |
| `artifacts/flowra-web/src/components/projects/ProjectPresentation.tsx` | 공통 상태/공개 범위 표시, 날짜 표시, 활성 멤버십 판단, 권한별 수정 동작과 오류 표시.                              |
| `artifacts/flowra-web/src/components/projects/ProjectFormDialog.tsx`   | 공통 생성·수정 폼, 실제 DTO 전송, 검증, 중복/결과 유실·미저장 변경 처리.                                          |
| `artifacts/flowra-web/src/lib/projectNavigationGuard.ts`               | 라우터가 폼을 해제하기 전에 실행되도록 history 보호를 앱 시작 시 등록한다. 폼이 없는 경우 탐색에 개입하지 않는다. |
| `artifacts/flowra-web/tests/company-contract.test.mjs`                 | 프로젝트 query/날짜/응답 ID·손상 응답·회사 전환·실패 캐시 갱신 계약 검증 추가.                                    |
| `artifacts/flowra-web/tests/e2e/projects.spec.ts`                      | 허구의 API fixture로 프로젝트 흐름과 오류/권한/모바일 동작 검증. 제품에서는 mock을 사용하지 않는다.               |
| `artifacts/flowra-web/tests/e2e/shell.spec.ts`                         | 프로젝트 메뉴 추가에 맞춰 탐색 수 5→6 수정. 기존 셸 회귀를 유지한다.                                              |
| `docs/qa/project-management-phase-one.md`                              | 분석, 변경 범위, 검증과 백엔드/2차 인수인계 기록.                                                                 |

## D. 백엔드 추가 지원 요청

새 API 경로·메서드·DTO를 제안하거나 가정하지 않는다. 아래는 기존 응답/문서에서 추가 확인이 필요한 기능이다.

| 우선순위 | 필요 사항                                          | 이유와 현재 부족한 부분                                                                                                                            | 영향 화면               |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| P1       | 목록·멤버 응답의 정식 스키마와 운영 배포 버전 확인 | 목록의 원본 배열 필드와 멤버 status 필수 여부가 문서에 명시되지 않아 기존 정규화와 서버 관리 GET에 의존한다.                                       | 목록·권한별 수정        |
| P1       | 생성 가능 여부와 부서 정책 확인 정보               | 멤버십 응답에는 프로젝트 생성 정책/부서장 정보가 확정되지 않았다. 현재 생성 요청의 서버 403으로 정책을 안내한다.                                   | 생성 버튼·폼            |
| P1       | 상태 전이와 계획 날짜 검증 규칙 명세               | 6개 상태는 확인됐으나 완료/보관 후 전이표와 동일 계획 시작/종료일 허용 여부는 미확인이다.                                                          | 수정·보관·날짜 폼       |
| P2       | 목록/상세의 본인 프로젝트 관리 권한 정보           | 현재 각 프로젝트의 멤버 GET으로 owner/manager를 확인한다. 목록이 커지면 권한 확인 호출을 줄일 근거가 필요하다.                                     | 목록·상세 수정 진입     |
| P2       | summary/진행률의 집계 의미와 조회 범위             | 상세 업무 배열은 부분 응답일 수 있고 summary 구조는 불명확하다. 완료율/업무 수·지연 수를 아직 표시하지 않는다.                                     | 프로젝트 현황·향후 개요 |
| P2       | 목록의 전체 조회/페이지 정책                       | 현재 조회 결과만 집계한다. 전체 회사 통계 또는 추가 페이지 UI에는 조회 범위를 보장하는 계약이 필요하다.                                            | 메인 현황·대량 목록     |
| P2       | 생성 결과 유실 후 중복 방지 지원                   | 현재 범용 idempotency 지원이 없어 사용자가 목록을 먼저 확인해야 한다. 클라이언트가 같은 폼의 재제출은 막지만 서버 전체 중복 방지는 보장할 수 없다. | 생성                    |

## E. 테스트 결과

실제 인증 API는 사용하지 않았다. 프로젝트 17개 시나리오와 기존 셸 7개 시나리오를 데스크톱·모바일에서 검증한 고유 48개 경우는 수정 및 재검증을 포함해 모두 통과했다.

- `pnpm.cmd run typecheck`: 라이브러리·웹·로컬 API 서버 전체 통과.
- `pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck`: 통과.
- `pnpm.cmd --filter @workspace/flowra-web run test:api`: 97개 통과, 실패 0개.
- `pnpm.cmd --filter @workspace/flowra-web run build`: production 빌드 통과. Windows 샌드박스의 esbuild 상위 디렉터리 탐색 권한 오류 때문에 동일 명령을 승인된 일반 실행으로 재검증했다.
- 프로젝트 및 기존 셸 Playwright 첫 전체 실행: 42/48 통과. 실패 6개 중 2개는 탐색 테스트의 회사 일정 fixture 누락, 4개는 미저장/저장 대기 폼의 브라우저 Back 처리 결함이었다. fixture를 보강하고 history 보호를 BrowserRouter보다 먼저 등록하도록 수정했다.
- `pnpm.cmd --filter @workspace/flowra-web run test:e2e projects.spec.ts --project=desktop --project=mobile --grep '미저장 상세 수정|저장 응답을 기다리는|프로젝트 메뉴와 헤더'`: 실패했던 6개를 재검증해 6/6 통과.
- `pnpm.cmd --filter @workspace/flowra-web run test:e2e projects.spec.ts shell.spec.ts --project=desktop --project=mobile --grep '생성 폼을 검증|변경한 폼을 취소|생성 network|생성 503|주요 메뉴를 클릭'`: 최종 변경 관련 10/10 통과. 생성 후 검색/상태 초기화, 중복 방지, 응답 유실, 취소, 기존 페이지 왕복을 확인했다.
- 별도 ESLint 검사 스크립트/설정은 이 저장소에 없다. 기존 TypeScript와 API/브라우저 검사 명령을 사용했다.
- 최초 브라우저 시도에서 날짜를 빈 문자열로 지우는 테스트가 기존 날짜 선택기 UX와 맞지 않았다. 실제 날짜 지우기 버튼을 사용하는 테스트로 수정했다.
- 최종적으로 남은 실패 테스트는 없다. 프로젝트 목록·검색·회사 전환·생성·상세·수정·보관·새로고침·권한·빈 상태·손상/실패 응답·재조회·긴 텍스트·모바일·미저장/저장 대기 보호를 확인했다. 기존 셸 테스트는 홈·할 일·캘린더·메모·공지 탐색과 설정/다크 테마/AI 패널 동작을 확인한다.
- 실제 사용자 토큰을 이용한 운영 API 응답, 실제 부서 정책과 프로젝트 권한, 실제 상태 전이·동일 날짜 허용, 서버 DB 저장은 검증하지 않았다. 모의 API에서 요청과 재조회 동작을 검증한 결과를 운영 인증 검증 성공으로 표현하지 않는다.

## F. 다음 단계 인수인계

- 2차는 `companyProjectId` 상세 route와 기존 `companyProjects.ts` 서비스/`useCompanyProjects.ts` 캐시 키를 재사용한다. 현재 개요 아래에 실제 구현한 상세 섹션을 추가할 수 있다. 구현되지 않은 탭을 먼저 노출하지 않는다.
- 기존 phase/work item/children/gantt/assignment 타입과 조회 서비스는 남아 있다. 다만 이번 1차에서 해당 CRUD·간트·배정 UI를 확장하지 않았다.
- 상세 `work_items` 배열이 모든 하위 업무라는 가정을 하지 않는다. 트리 테이블은 `detail_policy`와 기존 children 조회 정책을 확인한 뒤 단계적으로 가져와야 한다.
- 회사 구성원 ID, 프로젝트 멤버 ID, 사용자 ID를 구별하고 프로젝트 owner/manager를 회사 관리자 역할과 혼용하지 않는다. 멤버 관리나 업무 담당자 식별 정보에는 별도의 서버 권한 범위가 적용된다.
- 계획 날짜는 계속 `YYYY-MM-DD`, nullable 필드 삭제는 `null`로 전송한다. 상태 전이·날짜 최종 검증은 서버에 맡긴다.
- 폼 이탈 보호는 직접 링크, 브라우저 history와 document unload에 적용된다. 인증 세션 종료와 프로그램의 강제 route 이동을 가로채지 않는다. 향후 앱 라우터를 변경할 때 이 history 보호도 함께 검토해야 한다.
- 다음 개발 전 D의 P1 계약 확인과 실제 인증 환경 검증을 우선한다. summary 의미가 확정되기 전에는 부분 업무 배열로 통계/완료율을 계산하지 않는다.
