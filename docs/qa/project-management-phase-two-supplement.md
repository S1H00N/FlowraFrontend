# 프로젝트 관리 2차 보완 결과

> 이 문서는 새 공통 계약이 제공되기 전의 보완 기록입니다. 생성·수정의 현재 지원 범위와 검증 결과는 [2026-10-13 변경 반영](api-contract-update.md)을 참고하세요.

기준일: 2026-10-12. Phase·Work Item 생성·수정 요청 DTO 원본을 재검색했지만 확보하지 못했다. 따라서 이번 작업은 사용자가 지정한 중단 조건에 따라 기존 기능의 오류·안내·테스트 보완까지 수행한다. Phase·Work Item CRUD 전체가 완료된 상태가 아니다. [기존 2차 보고서](project-management-phase-two.md)는 이전 작업의 기록이며, 이번 변경과 최종 검증은 이 문서에서 구분한다.

## 1. 실제로 구현한 기능

- 업무·단계 추가/수정의 준비 중 상태에 “서버의 생성·수정 규칙 확인이 필요해 추가·수정 기능을 준비 중입니다.”라는 이유를 화면과 접근성 설명으로 연결했다. 단계 없는 프로젝트에는 단계 추가를 제공하지 않는다.
- `0개 불러옴` 대신 `표시할 업무가 없습니다.`, 업무가 있을 때는 `불러온 업무 N개`를 표시한다. 빈 상태 및 현재 불러온 업무만 검색·필터링한다는 안내를 유지한다.
- 선택한 하위 업무가 취소 후 재조회 중 잠시 트리에서 빠져도 상세 패널의 선택 문맥을 유지한다. 패널 안에서 재조회 중·실패·재시도·현재 결과에서 찾을 수 없음 상태를 표시한다.
- 재조회 실패 또는 서버 응답에서 업무가 사라진 경우, 이전 설명·상태·기간·변경 메뉴를 남겨 최신 정보처럼 표시하지 않는다. 제목·경로는 선택한 업무를 설명하는 문맥으로만 유지한다.
- 접힌 부모의 상세 패널에서 선택한 하위 업무도 패널 안에서 실패한 조회를 재시도할 수 있다. 복구 후 제목으로 포커스를 복원하고, 사라진 업무의 패널을 닫으면 조회 가능한 부모 또는 업무 검색으로 포커스를 복원한다. 모바일 패널의 포커스·배경 접근 제한을 함께 유지한다.
- 기존 트리 테이블, 하위 업무 조회, 필터, 읽기 상세, Phase·Work Item 취소와 서버 재조회 동작을 유지한다. Flowra의 보라색 테마와 기존 레이아웃을 사용하며 전체 리디자인을 하지 않았다.

## 2. 아직 구현하지 못한 기능

| 기능 | 상태·이유 |
| --- | --- |
| Phase 생성·기본 정보 수정 | 요청 DTO 미확인으로 준비 중 유지 |
| 최상위·하위 Work Item 생성 | 요청 DTO 및 부모·Phase 연결 정책 미확인 |
| 제목·설명·상태·우선순위·계획 기간 편집 | 조회 필드는 존재하지만 수정 DTO와 정책 미확인 |
| 진행률 수정 | 자동 집계 및 수동 override 설정·해제 정책 미확인 |
| 생성·수정 후 트리·패널·요약 동기화 | 실제 생성·수정 자체가 미연결이므로 검증하지 않음 |
| 최대 깊이 생성 제한 | 서버 depth 시작값과 프로젝트·Phase 포함 여부 미확인 |
| 실제 서버 연동 검증 | 요청 DTO와 실제 서버 검증용 계정·접속 정보 미확보 |

등록 가능한 기능이 확정되지 않아 빈 상태에도 동작하는 생성 버튼을 추가하지 않았다. 임의 POST/PATCH, 임시 저장, 가짜 성공 처리를 구현하지 않았다. 담당자 배정과 간트 차트는 이번 범위에 포함하지 않는다.

## 3. 사용한 기존 API

모두 일반 사용자 `/api/v1` 아래의 기존 경로다. 이번 보완에서 신규 경로·메서드·DTO를 추가하거나 기업 관리자 API를 호출하지 않았다.

| 메서드·경로 | 목적 |
| --- | --- |
| `GET /company-memberships` | 기존 활성 회사 문맥 확인 |
| `GET /company-projects` | 기존 프로젝트 목록과 갱신 |
| `GET /company-projects/:company_project_id` | 프로젝트·Phase·초기 업무·서버 요약 조회 및 갱신 |
| `GET /company-projects/:company_project_id/members` | 기존 owner/manager 관리 권한 확인 |
| `GET /company-projects/:company_project_id/work-items/:work_item_id/children` | `depth=1` 직계 자식 조회 및 실패 시 재시도 |
| `DELETE /company-projects/:company_project_id/phases/:phase_id` | Phase 취소, `data.phase` 응답 |
| `DELETE /company-projects/:company_project_id/work-items/:work_item_id` | Work Item 취소, `data.work_item` 응답 |
| `POST /company-projects` | 기존 프로젝트 생성 기능 유지 및 회귀 검증 대상 |
| `PATCH /company-projects/:company_project_id` | 기존 프로젝트 기본 정보 수정 유지 및 회귀 검증 대상 |

기존 취소 mutation의 조회 무효화와 서버 재조회를 재사용한다. 취소가 하위 업무·진행률·요약에 미치는 결과를 클라이언트에서 추측하지 않는다. Phase·Work Item 생성·수정 POST/PATCH는 경로 존재만 확인했으며 호출하지 않는다.

## 4. 확인한 DTO 계약 및 출처

상세 검색 범위와 출처는 [계약 감사](project-phase-two-contract-audit.md)에 기록했다. 현재 저장소·숨김/무시 파일명·인접 폴더·연결 GitHub에서 원본을 재검색했으나 접근 가능한 백엔드 저장소와 네 요청 schema를 확보하지 못했다.

| 확인 사항 | 출처와 한계 |
| --- | --- |
| Phase 생성·수정 경로 | [일반 사용자 라우트 126–127행](../../devdocs/api-reference/routes-general.md#L126), 원본 DTO 141·153행 참조만 존재 |
| Work Item 생성·수정 경로 | [일반 사용자 라우트 129–130행](../../devdocs/api-reference/routes-general.md#L129), 원본 DTO 169·191행 참조만 존재 |
| 관리 권한·응답 키·취소 의미 | [F01](../../devdocs/api-reference/feature-lifecycle.md#L7): 활성 owner/manager, `phase`/`work_item`, 물리 삭제가 아닌 취소 |
| 기존 프로젝트 생성 DTO | [일반 API 명세 1674–1708행](../backend-specs/api_general.md#L1674): 프로젝트 생성 body·권한·`phase_less` 정책 |
| 기존 프로젝트 수정 DTO | [F01 28행](../../devdocs/api-reference/feature-lifecycle.md#L28): 프로젝트 PATCH 필드 목록 명시 |
| Work Item 조회 필드 | [일반 API 명세 1758–1775행](../backend-specs/api_general.md#L1758): 부모·Phase·depth·상태·우선순위·계획일·진행률·override 응답 필드 |
| 서버 깊이 제한 메시지 | [오류 색인 1457–1462행](../../devdocs/api-reference/error-index.md#L1457): Work Item depth 최대 5 오류, 시작값과 계산식은 미확인 |

프로젝트 생성·수정 계약과 Work Item 조회 객체는 서로 다른 계약이다. 조회 객체의 필드명을 Work Item 쓰기 body로 옮기거나, 본인 Assignment 수정 규칙을 Work Item 편집에 적용하지 않았다. 로컬 `lib/api-spec/openapi.yaml`은 `/api/healthz` 전용으로 운영 프로젝트 계약이 아니다.

현재 UI 깊이는 프로젝트 D1, 최상위 업무 D2이며 Phase는 그룹으로 처리한다. 부모가 null/생략된 업무는 화면상 최상위로, 지정된 부모가 아직 조회되지 않았거나 순환하는 업무는 깊이를 확정하지 않은 상태로 표시한다. 서버의 “Work Item depth 최대 5”가 제품의 “프로젝트 포함 최대 5단계”와 같은 단위인지는 확인되지 않았다. 조건부로 서버 최상위 depth가 1이라면 서버 5가 UI 6에 대응할 수 있으나, 원본 확인 전에는 충돌이 확정됐다고 보고하지 않고 계산식·제한을 변경하지 않는다.

## 5. 이번 수정 파일

기존 작업에서 이미 변경된 API·타입·훅·페이지 파일을 이번 변경으로 중복 보고하지 않는다.

| 파일 | 이번 변경 |
| --- | --- |
| `artifacts/flowra-web/src/components/projects/ProjectWorkManager.tsx` | 준비 중 이유·개수 문구·상세 패널 선택 유지와 조회 상태·재시도·포커스 복원 |
| `artifacts/flowra-web/src/components/projects/ProjectWorkManager.css` | 준비 중 안내의 여백 조정 |
| `artifacts/flowra-web/tests/e2e/project-work-items.spec.ts` | 미확인 쓰기 방지·빈 상태·패널 재조회 실패·사라진 선택·모바일 포커스 회귀 검증 |
| `docs/README.md` | 이번 계약 감사와 보완 결과 문서 안내 |
| `docs/qa/project-phase-two-contract-audit.md` | DTO 검색 근거·확인/미확인 계약·백엔드 요청 |
| `docs/qa/project-management-phase-two-supplement.md` | 이번 보완 범위·검증·인수인계 |

## 6. 테스트 결과와 실패 원인

현재 저장소에서 사용자가 언급한 “12개 중 4개 실패”와 정확히 일치하는 실행 보고서를 찾지 못했다. 따라서 그 네 실패를 locator 문제 또는 UI 문제로 임의 분류하지 않는다.

기존 보고서는 업무 13개 시나리오 × Desktop/Mobile 2개 화면인 26건을 기록한다. 이전 전체 74건 실행 기록은 73건 성공·모바일 취소 메뉴 1건 실패였고, 수정 후 관련 6건의 재실행이 성공한 기록이다. 이는 전체 74건을 최종 수정 후 다시 실행해 통과했다는 뜻이 아니다. 이번 최종 전체 실행은 아래 표에서 별도로 기록한다.

이번에는 기존 업무 26건과 별도로 신규 재조회 실패 시나리오 1개가 수정 전 Desktop/Mobile 2건 모두 실패하는 것을 재현했다. 확인된 실제 UI 문제는 접힌 부모를 통해 선택한 자식의 재조회 실패 시 패널이 사라져 재시도 경로를 잃는 동작이다. locator만 바꿔 성공 처리하지 않고 패널 상태 처리를 수정했다. 수정 후에는 서버 응답에서 선택한 업무가 사라지는 회귀 시나리오도 추가했으며, 이전 설명·상태를 최신 정보처럼 남기지 않는지 검증한다. 재시도와 사라진 업무 시나리오의 최종 Desktop/Mobile 재실행 4건은 모두 성공했다.

| 검사 | 이번 결과 |
| --- | --- |
| 앱 API·그래프 단위 검사 | 초기 실행 106/106 성공 |
| 앱 TypeScript | 최종 검사 성공, exit 0 |
| E2E TypeScript | 마지막 포커스 assertion 포함 최종 검사 성공, exit 0 |
| 상세 패널 신규 회귀 E2E | 재시도·사라진 선택 2개 시나리오 × Desktop/Mobile, 4/4 성공 |
| Desktop 전체 E2E | 206건 실행: 195 성공·2 시간 초과·9 건너뜀. 시간 초과 2건을 동일 빌드로 재실행해 2/2 성공. 단일 전체 실행의 206/206 성공으로 보고하지 않음 |
| Mobile 프로젝트·업무 E2E | 전체 관련 41건 재실행 41/41 성공, 5.1분. Mobile 전체 앱 E2E는 아님 |
| 기존 프로젝트 생성·수정 회귀 | Desktop 24/24, Mobile 24/24 성공. 생성·기본 정보 수정·보관·날짜 초기화·권한·오류·새로고침·테마·모달 검증 포함 |
| 프로덕션 빌드 | 성공, 2,535개 모듈, 21.09초 |
| 실제 서버 조회·쓰기 | 미실행. 실제 서버 검증용 계정·접속 정보 및 생성·수정 DTO 미확보 |
| Phase·Work Item 생성·수정 및 생성 깊이 검증 | 미실행. 기능을 추측해 구현하거나 성공하는 임의 DTO fixture를 만들지 않음 |

E2E의 모의 API 데이터는 테스트 fixture다. 실제 서버 데이터나 서버 검증 결과로 취급하지 않는다. 최종 실행에서 트리·패널·검색·필터, children 조회·오류·재시도, Phase·Work Item 취소와 데이터 동기화, 권한 오류, 기존 프로젝트 생성·수정을 함께 검증했다. 업무 17개 시나리오는 Desktop 17/17, Mobile 17/17 성공이다. Desktop Google 인증 9개는 기존 테스트의 `QA_GOOGLE_OAUTH_CLIENT_ID` 조건에 의해 건너뛰었고, 이번 QA 빌드에는 Google OAuth 설정을 제공하지 않았다.

최초 전체 검증 도중 Desktop·Mobile에서 실행 정지가 관찰되었다. Mobile 첫 실행은 39개 성공·2개 시간 초과였으며, 보고서 총 실행 시간은 12.8시간이다. [중단된 Mobile 실행](../../artifacts/flowra-web/playwright-report/project-supplement-mobile-final/index.html)은 원본 추적 자료와 함께 보존한다. 시간 초과를 피하려고 locator를 느슨하게 하거나 테스트 제한 시간을 늘리지 않았고, 동일한 프로덕션 빌드로 Mobile 41개를 다시 실행해 모두 성공했다.

| 시간 초과 항목 | 추적 자료에서 확인한 실제 지점 |
| --- | --- |
| Mobile 단계 없는 프로젝트 탐색 | 선택·자식 전환·Escape·재선택을 통과한 뒤 진단용 `attachLayout()`의 locator 개수 수집 중 전체 45초 제한 초과 |
| Mobile 선택한 자식 누락 | 정상 식별된 자식 버튼의 스크롤 처리에서 약 42분 38초 정지. 취소·누락 상태 검증에 도달하지 못함 |
| Desktop 계정 격리 | B 사용자 화면 확인 후 이중 `requestAnimationFrame` 대기에서 약 42분 37초 정지 |
| Desktop AI 적용 | 정상 식별된 AI 채팅 버튼의 클릭 수행 중 15.8초 시간 초과 |

계정 격리와 Mobile 자식 선택은 2026-10-12 11:29:09 UTC에 127ms 차이로 정지하기 시작했다. 동일 빌드의 정상 재실행에서는 Desktop AI 적용 4.1초, 계정 격리 5.6초, Mobile 탐색 12.5초, 자식 누락 5.6초로 성공했다. 공통 실행 환경·브라우저 중단을 의심할 수 있는 근거와 재실행 성공을 함께 기록하며, 확인하지 못한 운영 서버 동작까지 정상이라고 확장하지 않는다. 중단된 Mobile 실행의 종료 시 멈춘 QA 브라우저·worker는 현재 부모 관계와 Playwright 임시 프로필을 확인한 뒤 이번 실행 소유 프로세스만 정리하여 부모 runner가 보고서를 기록하도록 했다.

검증 자료:

- [Desktop 전체 206건](../../artifacts/flowra-web/playwright-report/project-supplement-desktop-final/index.html), [Desktop 시간 초과 2건 재검증](../../artifacts/flowra-web/playwright-report/project-supplement-desktop-recheck/index.html)
- [Mobile 프로젝트·업무 41건 최종 실행](../../artifacts/flowra-web/playwright-report/project-supplement-mobile-clean/index.html)
- [신규 패널 회귀 4건](../../artifacts/flowra-web/playwright-report/project-supplement-retry-final/index.html), [수정 전 재조회 실패 재현](../../artifacts/flowra-web/playwright-report/project-supplement-retry-baseline/index.html)

최종 검증은 `dist/qa-supplement-final` 프로덕션 빌드를 빈 4185 포트에서 미리 보는 임시 설정으로 수행했다. 이 빌드는 `VITE_API_BASE_URL=http://qa-api.invalid/api/v1`을 사용하며 실제 서버로 테스트 데이터를 전송하지 않는다. Windows의 자동 서버 종료 지연을 피하기 위해 QA preview를 별도 실행하고, 테스트에는 기존 설정을 상속한 임시 구성에서 `webServer: undefined`를 사용했다. 보고서·추적 자료와 QA 빌드는 남기고, 검증 후 임시 설정과 이 작업이 실행한 preview를 정리했다. 기존 4175 포트의 서비스는 종료하지 않았다.

## 7. 백엔드에 필요한 추가 정보

1. 배포 버전에 맞는 `company-projects.dto.ts`의 Phase create/update, Work Item create/update schema 및 의존 enum·refinement 원본. 필수/선택·nullable·길이·범위·PATCH 누락과 null의 의미가 필요하다.
2. `parent_work_item_id`, `company_project_phase_id`의 생성·수정·상속 정책과 `phased`/`phase_less` 실제 요청 예시. 프로젝트 간 연결 검증과 부모 변경 시 자손 처리도 필요하다.
3. `depth_level` 최상위 시작값, 프로젝트·Phase 포함 여부, 최대 깊이 계산식과 경계 요청·오류 예시. 제품의 프로젝트 포함 5단계와 일치하는지 확인해야 한다.
4. 계획일 삭제·단일 날짜·기간 순서·부모 기간 제약, 상태 전이, 자동 진행률 집계와 override 설정/해제 규칙.
5. 취소 시 하위 업무·진행률·프로젝트 요약 변경 범위와 `summary`, `detail_policy`, children의 정식 응답 schema.
6. 실제 서버 검증용 계정·권한·접속 정보와 문서/서버 배포 버전의 일치 여부.

## 8. 3차 담당자 배정 인수인계

Work Item ID 기반 트리·선택 패널·프로젝트 쿼리 갱신 구조를 재사용할 수 있다. 현재 담당자 정보는 허용된 응답에 포함된 식별 정보의 읽기 표시만 제공한다. 이번 보완의 패널 선택 유지와 실패 재시도 흐름을 배정 후 재조회에도 참고할 수 있다.

담당자 배정 전에 기존 Assignment create/update DTO, 부서 연결 정책, 배정 가능한 회사 구성원 범위, owner/manager와 본인 assignment 수정 권한 차이, 정보 노출·중복 배정·배정 해제 규칙을 확보해야 한다. 경로 존재만으로 DTO를 추측하지 않는다. 일반 사용자 API와 기업 관리자 API를 구분하며 프로젝트 관리자의 업무 책임과 본인이 실제 assignee인 상태를 혼동하지 않는다.

Phase·Work Item 생성·수정 계약 확보와 실제 연동이 먼저 남아 있다. 그 작업과 서버 검증을 마치기 전에는 이번 2차 목표가 완료됐다고 보고하지 않는다.
