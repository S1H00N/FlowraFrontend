# 2026-10-13 API 명세 변경 반영

`devdocs/api-reference`의 라우팅·오류·생명주기 색인과 새 기업 프로젝트 공통 계약, `docs/backend-specs/api_general.md` 및 `api_ai.md`를 웹의 API·타입·훅·화면과 대조했다. 작업 시작 시 미커밋 상태였던 프로젝트 2차 구현과 사용자가 교체한 명세를 보존하고 현재 계약에 맞춰 보완했다.

## 반영 내용

| 영역 | 변경과 근거 |
| --- | --- |
| API 경로 | 웹의 정적 `apiClient` 호출 155곳을 일반 라우팅 명세의 고유 method/path 155개와 비교하여 일치 확인. 호출 횟수에는 같은 경로 재사용이 포함되므로 모든 서버 endpoint를 웹에서 지원한다는 의미는 아님 |
| 프로젝트 쓰기 | 새 [공통 계약](../../devdocs/api-reference/company-projects.md)의 허용 필드와 nullable/생략 규칙을 따르는 Phase·Work Item 생성/수정 API·타입·훅·폼 연결. 업무 depth는 루트1~최대5, Phase는 깊이에서 제외. 서버의 날짜/상태/진행률 처리를 클라이언트에서 자동 cascade로 추정하지 않음 |
| 프로젝트 관계 | 관리 담당자 배정 생성/교체·취소, 책임 부서 전체 교체, 의존성 생성/삭제의 API·타입 추가. 본인 배정 PATCH는 별도 경로의 status/progress/completed_at만 전송. 업무/배정 datetime은 UTC Z로 전송 |
| 프로젝트 조회 | 상세의 개인정보 마스킹 담당자 ID0 허용. children의 parent/업무/부서/배정/의존성 보존. Gantt는 실제 `{gantt_policy,phases,items,dependencies}` 응답을 사용. 부분 조회와 프로젝트 전체 건수/진행률을 구분 |
| AI 채팅 | 채팅 상세 GET wrapper 추가 및 상세 메시지 applications 보존. 적용 실패 뒤 실제 메시지·일정·할 일·리마인더·홈·브리핑 상태 재조회. 모델 이름은 서버 설정·model_used로 확인하며 UI에 고정하지 않음 |
| 메모 AI | 사용자가 확인한 ai_result_id를 모든 적용 요청에 명시. latest_result:null을 이전 분석으로 대체하지 않음. 분석/적용 충돌 및 응답 유실 뒤 재조회. 병렬 부분 적용이 끝난 다음 상태를 갱신하며 새 분석 카드에 과거 적용 상태를 덮어쓰지 않음 |
| 일정 삭제 | 삭제 후 서버에서 해제되는 Task 연결·순서와 정리되는 Reminder를 재조회. bulk는 성공한 일정 ID만 캐시에서 제거하고 실패한 일정은 유지. 응답 유실도 조회로 확인 |
| 재계획 | 일정 POST와 기존 Task 연결 PATCH가 별개인 계약 유지. POST 결과 불명확 시 제목·시간이 일치하는 소유 일정 후보를 조회하고 사용자 명시 선택으로 연결. 목록 다시 확인은 새 POST를 보내지 않음. 알려진 4xx 검증 오류는 일반 수정·재시도 가능 |
| 알림·리마인더 | 알림 목록의 native meta 및 빈 목록 total_pages=0 보존. 읽음 응답의 중첩 recipient 구조와 recipient ID 사용. Reminder 409 REMINDER_CHANGED 이후 상세·목록 재조회 |
| 오류 안내 | 깊이·부모 이동·의존성 순환/중복·마지막 owner·완료시각·기간 오류의 한글 안내. 원본 코드/메시지/details/request ID는 진단용으로 보존 |
| 문서 | 현재 위치에 맞춘 일반·AI·공통 계약 링크 수정. 없는 서버 소스·관리자 명세는 백엔드 원본 경로로 표기. 자동 생성 라우트/오류 색인의 서버 참조는 보존. 과거 DTO 미확인 보고서에 최신 반영 기록 안내 추가 |

## 검증

타입·API 검사와 프로덕션 빌드는 최종 소스로 통과했다. 브라우저 검사는 동일한 QA 빌드를 사용한다.

| 검사 | 결과 |
| --- | --- |
| 최초 전체 워크스페이스 타입 검사 | 통과 |
| 최초 API·도메인 회귀 테스트 | 106/106 통과 |
| 최종 전체 워크스페이스 타입 검사 | 통과 |
| 최종 API·도메인 회귀 테스트 | 141/141 통과 |
| 최종 E2E 타입 검사 | 통과 |
| 프로덕션 빌드 | 전체 워크스페이스 `pnpm.cmd run build` 통과. 웹 2,536개 모듈 및 로컬 API 서버 빌드 성공 |
| 일반·AI Desktop/Mobile 브라우저 | 11개 파일 164/164 통과, 단일 실행 16.1분 |
| 프로젝트 Desktop/Mobile 브라우저 | 고유 98개 최종 결과 통과. 첫 실행 95 통과/3 실패(11.3분), 계약 기대 수정 후 관련 Desktop/Mobile 4/4 재실행 통과(2.3분) |
| UTF-8/BOM·한글·diff·문서 링크 | 변경 파일 58개와 문서 링크 66개 통과. 커밋 준비 영역의 diff도 검사 |

브라우저 결과는 **262개 고유 시나리오의 최종 결과가 모두 통과**한 것으로, 전체 262개를 하나의 실행에서 검사했다는 의미는 아니다. 프로젝트 최초 실패는 full 상세 조회인데 부분 조회 검색 안내를 기대한 Desktop/Mobile 2건, 생성 날짜 초기화를 명시 null로 전송하는데 필드 생략을 기대한 Desktop 1건이다. 서버 계약과 실제 화면·요청을 확인해 테스트의 기대만 수정했으며 제품 소스는 브라우저 검사 도중 변경하지 않았다. 두 시나리오를 Desktop/Mobile 모두 재실행해 성공했다. 수정된 부분 조회 시나리오는 계속 별도의 부분 범위 안내를 검증한다.

Vite의 상위 폴더 접근이 샌드박스에서 차단되어 로컬 빌드·Chrome 실행은 일반 권한으로 수행했다. 프로젝트 전용 중복 빌드의 서버 시작 제한은 이미 생성한 같은 QA 빌드를 별도 포트에서 미리보기하는 방식으로 해결했다. 브라우저 실패를 자동 재시도하거나 timeout을 늘려 정상 처리하지 않았다. UI 동작에 영향을 주지 않는 파일 말단의 CRLF 정리는 커밋 준비 중 별도로 적용했다.

원본 결과는 웹 폴더의 `playwright-report-api-contract-20261013`, `playwright-report-project-contract-20261013`, `playwright-report-project-contract-retry-20261013`에 보관한다. 재생성 명령:

```powershell
node artifacts/flowra-web/tests/qa-report.mjs playwright-report-api-contract-20261013 playwright-report-project-contract-20261013 playwright-report-project-contract-retry-20261013
```

현재 소스를 다시 검사하려면 루트에서 `pnpm.cmd run build`, `pnpm.cmd --filter @workspace/flowra-web run test:api`, `pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck`를 실행한다. 브라우저는 `pnpm.cmd --filter @workspace/flowra-web exec playwright test projects.spec.ts project-work-items.spec.ts memo-ai-contract.spec.ts general-spec-recovery.spec.ts --project=desktop --project=mobile`로 새 계약 핵심을 재실행할 수 있다.

## 확인 범위와 제한

브라우저와 API 회귀 검사는 모의 서버를 사용한다. 운영 DB의 2026-10-12 CHECK migration, 서버 transaction/동시 잠금, 실제 관리자 scope·권한·메일·푸시·AI 공급자 호출은 검증하지 않는다. 서버 소스와 migration은 이 웹 저장소에 포함돼 있지 않다.

재계획의 후보 복구는 현재 홈 훅이 유지되는 동안만 보존된다. 후보의 제목·시간 일치가 서버 작업의 고유 식별자는 아니므로 자동 연결하지 않는다. 새로고침 이후 중복 생성 방지, expected_version/If-Match 충돌 검사, 원자적 새 일정 생성+기존 Task 연결은 서버가 제공하지 않는 보장이다.

테마·달력 기본 보기·주 시작일·표시 캘린더·독립 Task 수동 순서와 알림 숨김은 기존 브라우저 저장 범위를 유지한다. 사용자 timezone 저장과 서버 알림 읽음 처리는 서버 계약에 따라 구분한다. 관리자·시스템·조직 라우트 문서 변경을 일반 사용자 자격 증명으로 호출하지 않는다.

책임 부서·관리 담당자 배정·의존성 변경은 API·타입 계층까지 지원한다. 전용 편집 화면, Gantt 화면, baseline·audit 화면은 이번 변경으로 추가하지 않았다.
