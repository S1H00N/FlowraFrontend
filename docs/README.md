# Flowra 개발 문서

현재 웹 구현은 `artifacts/flowra-web`에 있습니다. 운영 API 계약은 아래 백엔드 명세를 기준으로 확인합니다.

| 문서 | 용도 |
| --- | --- |
| [일반 사용자 API](backend-specs/api_general.md) | 인증, 일정, 할 일, 메모, 회사, 공유, 알림 |
| [AI API](backend-specs/api_ai.md) | 채팅, 메모 분석, 제안 적용, 브리핑 |
| [Google 로그인 및 계정 연결](../devdocs/api-reference/google-login.md) | Google ID 토큰, 가입·기존 계정 연결, 티켓 및 세션 처리 |
| [디버깅 가이드](../devdocs/api-reference/debugging-guide.md) | HTTP 형식, 토큰 구분, 오류 및 요청 ID 조사 |
| [일반 사용자 라우트](../devdocs/api-reference/routes-general.md) | 사용자 API의 method/path, 백엔드 DTO와 처리 위치 |
| [기업 관리자 라우트](../devdocs/api-reference/routes-company-admin.md) | 회사 관리자 토큰과 권한·부서 범위 |
| [시스템 관리자 라우트](../devdocs/api-reference/routes-admin.md) | 별도 관리자 인증과 응답 형식 |
| [조직 연동 라우트](../devdocs/api-reference/routes-org.md) | 서버 간 조직 API key 연동 |
| [오류 색인](../devdocs/api-reference/error-index.md) | 오류 코드별 백엔드 발생 위치 |
| [생성 이후 관리 API](../devdocs/api-reference/feature-lifecycle.md) | F01~F12의 상태 전이, 페이지 조회, 반복 일정, 메모 복구 |
| [웹 반영 및 검증 기록](qa/spec-alignment.md) | 이번 구현 변경, 실제 검증 결과, 미포함 영역 |
| [브라우저 QA](qa/README.md) | 모의 API 테스트 및 실행 방법 |
| [프로젝트 정리 검토](cleanup-review.md) | 불필요 파일·의존성 삭제 근거와 검증 결과 |
| [할 일 드래그·날짜 동작](design/task-board-drag-and-dates.md) | 독립/일정 목록 드래그, 순서 저장, 날짜 입력 UX |

`backend-specs`와 `devdocs`에는 기존 자료와 새로 추가·업데이트된 백엔드 자료가 함께 있습니다. 일반 사용자 API의 할 일 순번 계약과 Google 로그인 문서를 우선 확인하고, 문서에 명시된 기준 시점과 실제 배포 버전을 맞춥니다. 원본 백엔드의 `src/...` 경로·줄 번호·생성 명령은 서버 저장소를 가리킵니다. 원본 서버 소스·DTO·DB migration·색인 생성 도구는 이 저장소에 없으므로 백엔드 검증 명령은 해당 서버 저장소에서 실행해야 합니다.

할 일 순서는 공식 계약의 `PATCH /tasks/:task_id/order`, `PATCH /schedules/:schedule_id/tasks/reorder`와 기존 `PATCH /tasks/:task_id`의 `schedule_id`·`sort_order`를 사용합니다. 순번은 일정 전체 기준이며 미연결 할 일의 `sort_order`는 `null`입니다.

`artifacts/api-server`와 `lib/api-spec/openapi.yaml`은 로컬 Express 서버의 `/api/healthz` 계약입니다. 웹이 `VITE_API_BASE_URL`로 호출하는 `/api/v1` 운영 API와 별개이며, OpenAPI codegen은 운영 명세를 생성하지 않습니다. 이 웹 저장소는 로컬 DB 설정이나 할 일 순서용 DB 마이그레이션을 필요로 하지 않습니다. 일반 사용자 토큰, 기업 관리자 토큰, 시스템 관리자 토큰, 조직 API key도 서로 대체하지 않습니다.

API가 추가됐다는 사실과 웹에 해당 관리 화면이 있다는 사실은 구분합니다. 서버 제공 기능은 원본 계약에서, 현재 웹 반영 범위와 검증 결과는 위 반영 기록에서 확인하세요.
