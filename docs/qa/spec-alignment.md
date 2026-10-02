# 2026-10-01 할 일 순서·Google 인증 문서 반영

새로 제공된 일반 API의 Tasks 계약, Google 로그인 문서, 라우트 및 오류 색인을 웹 구현과 대조했다. 기존 자체 순서 API 구현을 현재 계약으로 사용하지 않으며, 웹과 브라우저 fixture에서 해당 API 및 서버 모듈 의존성을 제거했다.

## 반영 내용

| 영역 | 수정 |
| --- | --- |
| 할 일 순서 API | `PATCH /tasks/:task_id/order`와 `PATCH /schedules/:schedule_id/tasks/reorder` API 및 타입 추가. 일정 내 드래그·이동 메뉴는 필터 없는 전체 목록을 조회하고 완료·숨겨진 항목까지 포함하여 벌크 순서를 전송 |
| 일정 간 이동·연결 해제 | 기존 Task PATCH의 `schedule_id`·`sort_order` 사용. 연결 해제는 `schedule_id: null`로 요청하고 서버 순번은 `null`. 마감일은 이동 요청에서 변경하지 않음 |
| 순서 충돌·목록 조회 | `TASK_ORDER_MISMATCH`는 캐시를 복구하고 목록을 다시 조회. 사용자가 재시도하면 최신 전체 ID를 다시 조회하며 자동 재전송하지 않음. 문서에 없는 Tasks page/size 및 pagination 가정 제거 |
| 독립 할 일 | 서버 순번 API를 호출하지 않고 사용자별 브라우저 저장소에 수동 순서 유지. 다른 기기와 동기화되지 않으며 서버 `sort_order`는 `null` |
| Google 로그인·가입 | Google Identity Services의 Google ID 토큰만 `prepare`로 전달. `signed_in`, `existing_account`, `signup` 분기, 직접 선택한 기존 계정의 비밀번호 연결, 201 로그인 및 202 이메일 확인 대기 처리 |
| Google 계정 관리 | 설정에서 연결 계정 조회, `prepare-link` 후 현재 계정 비밀번호로 `link` 처리. 티켓 만료·소비·세션 교체 오류는 티켓을 폐기하고 새 Google 인증으로 복귀. 비밀번호 재설정 후 Google 연결 해제 안내 |
| 인증 요청 경합 | 이메일 로그인·가입과 Google 인증이 하나의 요청 잠금을 공유. API 호출 직전 잠금을 확인하고 요청 중 다른 인증 입력·제출을 비활성화. 실패 후 다시 시도 가능 |
| HTTP·오류 진단 | 공개 Google 요청은 Flowra Bearer를 제거하고 refresh 대상에서 제외. 잘못된 Google 토큰·연결 티켓·비밀번호의 401을 Flowra 세션 오류와 구분. 200·401의 비 JSON 프록시 응답은 재전송 없이 실패 처리. 204 허용, 원래 오류 메시지·details·요청 ID 보존 및 코드별 한글 안내 |
| 문서 | Google 문서 안내 추가. 공식 Tasks 계약으로 대체된 자체 task-board 인계 문서·전달용 묶음·전용 생성 스크립트를 삭제하고 문서 링크를 현재 위치로 갱신 |

## 검증

| 검사 | 결과 |
| --- | --- |
| 전체 워크스페이스 타입 검사 | `pnpm.cmd run typecheck` 통과. 최종 인증 잠금 변경 후 웹 타입 검사도 통과 |
| 브라우저 테스트 타입 검사 | `pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck` 통과 |
| API 계약·HTTP·알림함 테스트 | `pnpm.cmd --filter @workspace/flowra-web run test:api`: 62/62 통과 |
| QA 빌드 | 최종 소스로 Vite QA 빌드 통과 |
| 브라우저 | 첫 100건: 91 통과, 8 건너뜀, 1 실패. 최종 소스의 핵심 26건: 24 통과, 2 실패. 아래 테스트 수정 후 해당 2건 재실행 모두 통과 |
| 파일 검사 | 수정한 소스·테스트의 UTF-8/BOM·한글 검사와 변경 구현의 `git diff --check` 통과 |

브라우저 대상은 `google-auth.spec.ts`, `task-board-move.spec.ts`, `task-rows.spec.ts`, `tasks-independent.spec.ts`, `flows.spec.ts`이다. 마지막 실행 결과를 항목별로 합치면 고유 항목 **96건 통과, 8건 건너뜀**이며 단일 실행 결과는 아니다. 건너뛴 항목은 모바일의 마우스 드래그 3건과 데스크톱에서 별도로 검사한 화면 너비 5건이다. 모바일 이동은 메뉴로 검사했다.

첫 실패는 시작 날짜 선택 후 종료 날짜로 자동 초점이 이동하여 달력이 열렸는데 테스트가 그 입력란을 다시 클릭한 문제였다. 자동 초점·달력 열림을 확인하고 선택하는 흐름으로 테스트를 수정했으며 최종 데스크톱·모바일 모두 통과했다. 마지막 두 실패는 가입 오류 토스트와 Google 오류 안내를 같은 `alert` 선택자로 읽은 문제였으며, Google 오류 안내를 구분한 뒤 데스크톱·모바일 모두 통과했다. 최종 인증 요청 경합 및 실패 후 재시도도 확인했다.

원본 결과는 `artifacts/flowra-web/playwright-report-api-update/`, `playwright-report-api-update-final/`, `playwright-report-api-update-retry/`에 보관한다. 제공된 원본 `docs/devdocs/error-index.md`의 기존 EOF 빈 줄 경고는 구현 파일 검사에서 제외했다. 기존 UI sourcemap 경고는 빌드 실패를 일으키지 않았다.

## 실제 환경 확인 범위

검증은 모의 API와 모의 Google credential로 수행했다. 운영 백엔드의 DB 순번 migration·권한·동시 처리와 실제 Google 인증·메일 발송은 이 검증에 포함하지 않는다. 현재 로컬 웹 환경에는 `VITE_GOOGLE_OAUTH_CLIENT_ID`가 없어 Google 로그인 준비 안내를 표시한다. 실제 활성화하려면 웹 OAuth client ID, 백엔드 `GOOGLE_OAUTH_CLIENT_IDS`, Google OAuth의 허용 웹 origin을 설정해야 한다. ID 토큰과 일회용 연결 티켓은 URL·로그·장기 저장소에 저장하지 않는다.

# 2026-09-21 API 명세 대조 및 웹 반영

2026-09-16 기준 `backend-specs`의 API 문서 2개와 `devdocs`의 개발·디버깅 자료 7개를 현재 웹 구현과 대조했다. 작업 시작 시 존재했던 알림함 변경과 문서 교체·삭제는 보존했다.

## 반영 내용

| 영역 | 확인된 차이와 수정 |
| --- | --- |
| 공통 HTTP | 공개 인증 요청의 401을 일반 세션 갱신 대상으로 처리하지 않도록 수정. 실제 401 갱신은 하나로 합치고 원래 method/body를 유지하며 한 번만 재시도. 늦게 도착한 이전 토큰의 401은 갱신된 토큰을 재사용. 사용자 전환 후 이전 요청 재시도와 갱신 결과의 세션 덮어쓰기 차단. 재시도 요청 ID는 새로 발급 |
| 오류 진단 | 일반/관리자 오류의 메시지 구조 지원. `getApiErrorDetails`로 상태·코드·검증 details·응답 request ID 조회. HTML/네트워크 실패는 화면의 기본 오류 안내 사용 |
| 로그인 | 비밀번호 8~72자 제약을 서버와 일치시킴 |
| AI 채팅 | 세션/메시지 cursor 페이지 조회, 중복 ID 제거, 과거 메시지 추가 조회, 제목 수정, 보관·복원 연결. 실패한 메시지를 다른 body로 자동 재전송하던 동작 제거 |
| AI 적용 | 적용 실패·409 이후 서버 메시지 상태 재조회. 보관한 대화의 전송·적용 차단. 반복 제안의 timezone·제외일·요일 규칙 표시 |
| 메모 | `pending`과 `parse_requested`를 함께 해석. 자동 분석을 요청하지 않은 메모의 무한 polling 제거. 요청된 분석만 주기 조회하며 `memo: null` 응답 수용. 모바일에서 생성 후 목록을 닫아 편집 버튼이 가려지는 문제 수정 |
| 개인 일정 | 반복 시리즈의 범위 수정·삭제와 연결 데이터 확인 UI 연결. 선택 필드 지우기는 `null`로 전송. 일괄 삭제 400 응답을 개별 삭제로 자동 대체하던 동작 제거 |
| 회사 일정 | 생성·수정 datetime을 UTC `Z`로 변환. 승인 대기/철회 일정을 확정 목록 캐시에 삽입하지 않음 |
| 회사 초대·멤버십 | 설정의 초대 거절 연결. 거절/수락 충돌 후 초대 재조회. 수락·탈퇴 후 소속·일정·프로젝트 등 관련 캐시 갱신 |
| 권한 및 ID | 일반 `company_member_id`를 `company_admin_id`로 대입하던 변환 제거. 사용자 API와 기업 관리자 권한의 구분 유지 |
| 검색 | 낙관적 일정·할 일 목록의 `q` 검색 대상을 명세의 제목/설명과 일치시킴 |
| 문서 | 문서 간 링크를 실제 저장 위치로 수정. 없는 백엔드 소스는 원본 경로·줄 번호로 표시. 로컬 healthz OpenAPI와 운영 `/api/v1` 명세를 구분 |

## 생성 이후 관리 기능 범위

| 계약 | 이 웹 저장소에서 지원하는 범위 |
| --- | --- |
| F01 프로젝트 관리 | 사용자 프로젝트 PATCH, 멤버 목록·추가·수정·제거 API와 타입. 기존 개인 배정 업무 화면 유지. 프로젝트 관리 전체 화면·phase/의존성/baseline 편집기는 미포함 |
| F02 승인 철회 | 사용자 approval ID 기반 철회 API/hook, `withdrawn` 상태. 본인이 요청한 승인 화면에 철회 연결 |
| F03 미연결 구성원 초대 | 기존 초대 수락 경로 사용. identity 연결과 기존 구성원 이력 보존은 백엔드 책임 |
| F04 초대 관리 | 수신자의 초대 거절 화면/API. 별도 기업 관리자 초대 관리 패널은 이 웹에 없음 |
| F05/F09 채팅 | cursor 기반 더 보기, 제목 수정, 보관·복원 |
| F06 반복 일정 | 시리즈 조회·수정·삭제 API/hook. 기존 편집 화면에 single/following/all 범위 및 예외 보존·연결 데이터 확인. 반복 규칙 전체 교체는 API 계층에서 지원하며 전용 규칙 교체 편집기는 미포함 |
| F07/F08 공유·친구 | 공유 나가기 및 발신 pending 친구 요청 취소 API/hook. 별도 공유/친구 관리 화면은 기존 웹에 없어 추가하지 않음 |
| F10/F12 기업 관리자 | 별도 백엔드 관리자 패널의 프리셋 정리·역할 권한 안내 계약. 이 일반 사용자 웹에 해당 패널을 만들거나 관리자 토큰을 혼용하지 않음 |
| F11 메모 복구 | `parse_requested` 기반 상태 표시·조회. 재시도·lease·generation 처리는 백엔드에 맡기며 polling에서 force 재요청하지 않음 |

## 검증

| 검사 | 결과 |
| --- | --- |
| 전체 워크스페이스 타입 검사 | `pnpm.cmd run typecheck` 통과 |
| 브라우저 테스트 타입 검사 | `pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck` 통과 |
| API 계약·알림함 테스트 | `pnpm.cmd --filter @workspace/flowra-web run test:api`: 51/51 통과 |
| 프로덕션 QA 빌드 | Playwright 실행 시 Vite `dist/qa` 빌드 통과 |
| 데스크톱·모바일 브라우저 | 아래 5개 파일의 고유 시나리오 42개가 최종 결과 기준 모두 통과 |
| 문서·파일 검사 | 대상 문서의 로컬 링크, 변경 파일 UTF-8/BOM·한글 깨짐 검사, `git diff --check` 통과 |

브라우저 검사 대상은 `spec-lifecycle.spec.ts`, `ai-chat-apply.spec.ts`, `ai-chat-delete.spec.ts`, `flows.spec.ts`, `company-invites.spec.ts`이다. 첫 실행은 39/42 통과했다. 저장된 메시지와 초안의 동일 문구를 구분하도록 테스트 선택자를 수정하고, 모바일 메모 생성 후 열린 목록이 편집 버튼을 가리는 문제를 수정했다. 이후 `spec-lifecycle.spec.ts`와 `flows.spec.ts`의 관련 시나리오 24/24가 통과했다. 42/42는 두 실행에서 각 항목의 마지막 결과를 합친 값이며 단일 실행 결과가 아니다.

브라우저 실행 원본은 `artifacts/flowra-web/playwright-report-spec-alignment/`와 `artifacts/flowra-web/playwright-report-spec-alignment-rerun/`에 로컬 보관한다. 다음 명령으로 두 실행을 합친 `docs/qa/report.html`과 `docs/qa/run-summary.json`을 다시 생성할 수 있다.

```powershell
node artifacts/flowra-web/tests/qa-report.mjs playwright-report-spec-alignment playwright-report-spec-alignment-rerun
```

모의 API 테스트는 운영 서버의 DB·권한·메일·AI·푸시 전달을 검증하지 않는다. 빌드에는 기존 UI 컴포넌트의 sourcemap 경고가 남아 있으며 빌드 오류는 없다.

## 기존 문제와 확인 한계

- `src/hooks/useCompanySchedules.ts`에 기존 한글 깨짐이 있다. `.agents/AGENTS.md`의 원문 추측 복원 금지 규칙에 따라 이 파일은 수정하지 않았다. 원본 문자열 확인이 필요하다.
- 백엔드 소스와 DTO, DB migration, `devdocs/tools/generate-api-reference.cjs`는 이 저장소에 없다. 백엔드 색인 재생성, DB 경합 테스트와 운영 API 호출은 수행하지 않는다.
- 명세가 새 API의 DTO 경로만 제공하고 필드 계약을 포함하지 않은 부분은 추측해 구현하지 않았다.
- 서버 알림 삭제 API는 없다. 기존 웹의 삭제는 브라우저 로컬 숨김이며 서버 읽음 처리와 구분한다.
