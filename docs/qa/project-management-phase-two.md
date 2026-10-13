# 프로젝트 관리 2차 구현 기록

> 이 문서는 당시 구현 기록입니다. 새 [기업 프로젝트 공통 계약](../../devdocs/api-reference/company-projects.md) 반영 후의 지원 범위와 검증은 [2026-10-13 변경 반영](api-contract-update.md)을 참고하세요.

기준일: 2026-10-12. 프로젝트 상세의 업무 트리와 상세 패널을 기존 일반 사용자 API 및 디자인 시스템 위에 추가했다. 현재 문서로 계약을 확인할 수 있는 조회·취소를 연결했다. Phase·Work Item 생성·수정은 요청 DTO 원본을 확인하지 못해 준비 중 상태이며, 이번 단계의 전체 CRUD 목표는 아직 완료되지 않았다.

## A. 구현 상태

| 기능          | 상태 및 동작                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로젝트 상세 | 상단 프로젝트명·상태·소속·계획 기간을 유지하고 개요·업무 목록 탭을 제공한다. 기존 프로젝트 기본 정보 수정은 유지한다.                                                                               |
| 계층형 업무   | Work Item ID와 부모 관계로 행을 구성한다. Phase는 별도 그룹이며 같은 숫자의 Phase/Work Item ID도 다른 리소스로 처리한다. 단계 없는 프로젝트에는 Phase 추가를 표시하지 않는다.                       |
| 트리 탐색     | 업무 선택, 키보드 조작, 들여쓰기, 개별 펼치기·접기와 현재 로드한 업무의 전체 펼치기·접기를 지원한다.                                                                                                |
| 부분 조회     | 상세 응답의 `detail_policy`는 불투명한 정책 정보로 취급한다. 필요한 직계 자식만 기존 children API로 `depth=1` 조회하고 요청·행을 중복하지 않는다. 실패와 재시도를 표시한다.                         |
| 필터          | 업무명·상태·우선순위·Phase 필터를 제공한다. 현재 불러온 범위의 결과임을 안내하며 전체 프로젝트 검색 API를 추가하지 않는다.                                                                          |
| 업무 상세     | 선택한 업무의 경로·설명·상태·우선순위·계획 기간·서버 진행률·하위 업무를 표시한다. 닫기·Escape 및 좁은 화면의 대화상자 배치를 지원한다.                                                              |
| 담당자·의존성 | 권한이 있는 응답에 이미 포함된 정보만 읽기 전용으로 표시한다. 멤버·Assignment·의존성 쓰기는 추가하지 않는다.                                                                                        |
| 취소          | owner/manager 권한을 확인한 사용자에게 Phase/Work Item 취소를 제공한다. 확인창에서 취소 상태 변경이며 영구 삭제되지 않음을 설명하고 서버를 다시 조회한다. 서버 403·오류를 성공으로 처리하지 않는다. |
| 생성·수정     | 확인된 POST/PATCH 경로는 있으나 문서가 요청 DTO를 외부 백엔드 소스로만 참조한다. 지원 필드를 추측해 전송하지 않으며 추가·수정 동작은 준비 중으로 제한한다.                                          |
| 깊이          | 프로젝트 D1, 최상위 Work Item D2, Phase는 깊이에서 제외한다. 부모 경로가 모두 조회된 경우 UI 깊이를 계산한다. 백엔드 `depth_level` 시작값·변환 계약과 최대 깊이 생성 검증은 미확인이다.             |

## B. 변경 파일

저장소 루트 기준이다.

| 파일                                                                       | 역할                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `artifacts/flowra-web/src/pages/ProjectDetail.tsx`                         | 간결한 헤더, 개요·업무 탭, 프로젝트별 업무 화면 연결               |
| `artifacts/flowra-web/src/pages/Projects.tsx`                              | 검색 debounce가 최신 상태·회사 필터를 덮어쓰는 기존 경쟁 조건 수정 |
| `artifacts/flowra-web/src/components/projects/ProjectWorkManager.tsx`      | Phase 그룹, 트리 테이블, 필터, 상세 패널, 권한별 취소              |
| `artifacts/flowra-web/src/components/projects/ProjectWorkManager.css`      | 테이블 스크롤과 상세 패널의 밝은·어두운 테마, 모바일 배치          |
| `artifacts/flowra-web/src/components/projects/ProjectWorkPresentation.tsx` | 상태·우선순위·서버 진행률 표시                                     |
| `artifacts/flowra-web/src/hooks/useProjectWorkTree.ts`                     | 조회된 업무 정규화, lazy children 쿼리와 펼침 상태                 |
| `artifacts/flowra-web/src/lib/projectWorkTree.ts`                          | 부모 관계, 안정적인 정렬, 누락된 부모·순환 처리, UI 깊이 계산      |
| `artifacts/flowra-web/src/api/companyProjects.ts`                          | 상세·children 응답 검증, Phase/Work Item 취소 서비스               |
| `artifacts/flowra-web/src/hooks/useCompanyProjects.ts`                     | 취소 mutation과 기존 프로젝트·관련 화면 재조회                     |
| `artifacts/flowra-web/src/types/companyProject.ts`                         | Phase·업무 취소 응답 타입                                          |
| `artifacts/flowra-web/tests/project-work-tree.test.mjs`                    | 정규화·부모 관계·정렬·누락·순환·UI 깊이 검증                       |
| `artifacts/flowra-web/tests/e2e/project-work-items.spec.ts`                | 허구의 API로 트리·패널·취소·오류·권한·테마·모바일 검증             |
| `docs/qa/project-management-phase-two.md`                                  | 구현 범위와 미확인 계약, 검증 및 다음 단계 인수인계                |
| `docs/README.md`                                                           | 프로젝트 2차 구현 기록과 제한 범위 안내                            |

## C. 사용한 기존 API

모든 경로는 일반 사용자 `/api/v1` 아래다. 기업 관리자 API를 사용하지 않는다.

| 메서드·경로                                                                   | 목적                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /company-memberships`                                                    | 기존 활성 회사 문맥 확인                                            |
| `GET /company-projects/:company_project_id`                                   | 프로젝트·Phase·초기 업무·서버 요약의 기본 진입점                    |
| `GET /company-projects/:company_project_id/members`                           | 기존 owner/manager 관리 권한 확인. 구성원 관리 화면은 추가하지 않음 |
| `GET /company-projects/:company_project_id/work-items/:work_item_id/children` | 필요한 직계 하위 업무 조회, `depth=1`                               |
| `DELETE /company-projects/:company_project_id/phases/:phase_id`               | Phase 취소 상태 변경, `data.phase` 응답                             |
| `DELETE /company-projects/:company_project_id/work-items/:work_item_id`       | Work Item 취소 상태 변경, `data.work_item` 응답                     |

기존 프로젝트 목록·생성·기본 정보 PATCH도 유지한다. 이번 업무 화면에서는 생성·수정 DTO를 확인하지 못한 Phase/Work Item POST/PATCH, Assignment 및 멤버 변경 API를 호출하지 않는다.

## D. 백엔드 확인 및 지원 요청

[일반 API 명세](../backend-specs/api_general.md), [생성 이후 관리 계약](../../devdocs/api-reference/feature-lifecycle.md), [라우트](../../devdocs/api-reference/routes-general.md), [디버깅 가이드](../../devdocs/api-reference/debugging-guide.md), [오류 색인](../../devdocs/api-reference/error-index.md)을 확인했다. 아래 항목은 신규 URL이나 DTO를 제안하는 것이 아니라 기존 계약의 원본·운영 동작 확인 요청이다.

| 중요도 | 필요한 확인                                  | 이유 및 UI 영향                                                                                                                                                                              |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | Phase/Work Item create/update DTO 원본       | F01이 참조하는 `src/modules/company-projects/company-projects.dto.ts`는 현재 저장소에 없다. 필수 필드·허용 필드·nullable 규칙·부모/Phase 연결을 확인해야 추가·수정 폼을 실제 연결할 수 있다. |
| P1     | `depth_level` 시작값 및 부모 생성·변경 검증  | 서버 최대 5와 프로젝트 포함 UI 최대 5의 변환을 확정해야 한다. 확인 전에는 생성 깊이·부모 변경을 추측하지 않는다.                                                                             |
| P1     | 단계 없는 프로젝트의 Work Item 생성 규칙     | 명시적인 Phase 추가 금지는 하위 Work Item 금지와 다르다. 실제 Work Item 부모·Phase DTO와 검증 규칙이 필요하다.                                                                               |
| P1     | 취소가 관련 하위 업무에 미치는 영향          | 문서로 물리 삭제가 아닌 취소 상태임은 확인했다. 하위 업무 취소·요약·진행률 변경 범위는 서버 결과를 따른다. 영향 범위를 추측해 미리 변경하지 않는다.                                          |
| P2     | `detail_policy` 및 children 정식 응답 스키마 | 상위 일부 깊이만 조회될 수 있으나 상세 정책 필드가 정의되지 않았다. 현재는 부분 조회 가능성을 보수적으로 처리한다.                                                                           |
| P2     | 프로젝트 `summary` 정식 필드·의미            | 현재 상세 API의 summary는 불투명한 응답이다. 임의 전체 업무 수·진행률을 계산하지 않으며, 서버 요약을 개요에 정확히 연결하려면 필드 의미를 확인해야 한다.                                     |
| P2     | 수정 가능한 진행률과 상태 전이 규칙          | `progress_percent`는 서버 표시값, `progress_override_percent`는 수동 설정으로 구별한다. 수정 DTO와 전이 검증 확인 후 편집을 연결해야 한다.                                                   |

## E. 테스트 결과

가상 API 검증은 실제 서버 검증과 분리한다. 가상 fixture는 운영 API 또는 실제 프로젝트에 연결하지 않는다.

| 검사                                     | 결과                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| E2E TypeScript                           | 성공: `node ../../node_modules/typescript/bin/tsc -p tests/e2e/tsconfig.json`                                              |
| 업무 Playwright desktop/mobile           | 성공: 13개 시나리오 × 2개 화면 = 26개 경로 검증. 전체 실행의 모바일 취소 메뉴 1건을 수정하고 관련 6개를 재검증해 모두 성공 |
| 기존 프로젝트 Playwright 회귀            | 성공: 24개 시나리오 × 2개 화면 = 48/48. 기존 검색·상태·회사 필터 경쟁 조건 수정도 포함                                     |
| 앱 API·그래프 단위 검사                  | 성공: 106/106, 그래프 5/5 포함                                                                                             |
| 앱 TypeScript                            | 성공: 최종 메뉴 수정 후 `pnpm.cmd --filter @workspace/flowra-web run typecheck`                                            |
| 프로덕션 빌드                            | 성공: 최종 메뉴 수정 포함 2,535개 모듈, QA runner 로더 13.16초                                                             |
| 실제 API 연동·쓰기                       | 미실행: 실제 계정·접속 정보 및 요청 DTO 원본을 제공받지 못함                                                               |
| Phase/Work Item 생성·수정·최대 깊이 생성 | 미실행: DTO·서버 깊이 변환 규칙 미확인                                                                                     |
| ESLint                                   | 현재 프로젝트에 기존 ESLint 설정·스크립트 없음                                                                             |

E2E는 단계 없는 프로젝트, 키보드 선택·패널 전환·닫기, 직계 children 요청·캐시·중복 방지, 조회 실패·재시도, 현재 로드 범위 필터, Phase/Work Item 취소와 새로고침, 서버 403, 손상된 자식 응답, lazy 자식 취소 후 동기화, 프로젝트 이동 중 지연 응답 격리, 밝은·어두운 테마 및 화면 너비를 검사한다. 실제 POST/PATCH를 통과시키는 임의 DTO fixture를 작성하지 않았다.

2026-10-12 전체 74개 실행은 73개 성공·1개 실패였다. 가로·세로 스크롤한 행의 모바일 취소 메뉴가 화면 밖에 열리는 문제를 수정한 뒤 취소·403·자식 업무 동기화 6개를 두 화면에서 다시 실행해 6/6 성공했다. 미해결 브라우저 실패는 없다. 전체 결과는 [74개 실행 보고서](../../artifacts/flowra-web/playwright-report/project-phase-two-release/index.html), 최종 수정 결과는 [취소 흐름 재검증 보고서](../../artifacts/flowra-web/playwright-report/project-phase-two-cancel-final/index.html)에 기록했다.

브라우저 검증 과정에서 테이블의 넓은 내용이 실제 모바일 layout viewport를 390px에서 846px로 늘리는 현상을 확인했다. 테이블 스크롤 영역에 `contain: inline-size layout paint`를 적용해 페이지 뷰포트와 포인터 좌표를 정상화하면서 940px 테이블의 내부 가로 스크롤을 유지했다. 업무·단계 메뉴는 해당 컴포넌트에서만 non-modal 동작과 화면 충돌 여백을 설정해 스크롤 잠금으로 행 위치가 이동하지 않도록 했다. 검색 debounce는 최신 URL 필터와 병합해 상태·회사 선택을 지우지 않도록 수정했다.

최종 검증은 `dist/qa-phase-two-release` 프로덕션 빌드를 확인된 빈 4177 포트에서 미리 보는 임시 구성을 사용했다. 테스트에 CSS를 주입하거나 Phase·테이블을 숨기지 않았다. 요청 기록·화면·추적 자료는 해당 `playwright-report`와 `test-results` 하위에 남겼으며, 임시 QA 설정 파일은 검증 후 제거했다. 기존 4175 포트의 알 수 없는 서비스는 중지하지 않았다. Windows sandbox의 esbuild 부모 경로 접근 제한은 승인된 빌드·가상 API 검증 실행으로 처리했다.

## F. 다음 단계 인수인계

3차 담당자 배정은 현재 Work Item ID 기준 트리·선택 패널·프로젝트 쿼리 갱신을 재사용할 수 있다. 현재 담당자는 응답 식별 정보만 표시하며, 신규 배정·변경은 연결하지 않는다. 멤버 관리와 Assignment 권한·DTO를 확인한 뒤 해당 영역만 확장한다.

4차 간트는 같은 Work Item 부모·Phase·정렬·계획 날짜·서버 진행률을 재사용할 수 있다. 전체 프로젝트를 항상 한 번에 로드하거나 현재 클라이언트 필터를 전역 검색으로 해석하지 않는다. 아직 이번 단계의 Phase/Work Item 생성·수정 계약 확인과 실제 API 검증이 남아 있으므로, 그 연결을 완료한 뒤 전체 업무 CRUD 완성으로 보고해야 한다.
