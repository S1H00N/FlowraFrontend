# Flowra 개발 문서

현재 웹 구현은 `artifacts/flowra-web`에 있습니다. 운영 API 계약은 아래 백엔드 명세를 기준으로 확인합니다.

| 문서 | 용도 |
| --- | --- |
| [일반 사용자 API](backend-specs/api_general.md) | 인증, 일정, 할 일, 메모, 회사, 공유, 알림 |
| [AI API](backend-specs/api_ai.md) | 채팅, 메모 분석, 제안 적용, 브리핑 |
| [디버깅 가이드](devdocs/debugging-guide.md) | HTTP 형식, 토큰 구분, 오류 및 요청 ID 조사 |
| [일반 사용자 라우트](devdocs/routes-general.md) | 사용자 API의 method/path, 백엔드 DTO와 처리 위치 |
| [기업 관리자 라우트](devdocs/routes-company-admin.md) | 회사 관리자 토큰과 권한·부서 범위 |
| [시스템 관리자 라우트](devdocs/routes-admin.md) | 별도 관리자 인증과 응답 형식 |
| [조직 연동 라우트](devdocs/routes-org.md) | 서버 간 조직 API key 연동 |
| [오류 색인](devdocs/error-index.md) | 오류 코드별 백엔드 발생 위치 |
| [생성 이후 관리 API](devdocs/feature-lifecycle.md) | F01~F12의 상태 전이, 페이지 조회, 반복 일정, 메모 복구 |
| [웹 반영 및 검증 기록](qa/spec-alignment.md) | 이번 구현 변경, 실제 검증 결과, 미포함 영역 |
| [브라우저 QA](qa/README.md) | 모의 API 테스트 및 실행 방법 |

`backend-specs` 2개와 `devdocs` 7개는 2026-09-16 백엔드 자료입니다. 이 저장소로 옮기면서 문서 간 상대 경로를 수정했습니다. 포함되지 않은 백엔드 `src/...` 링크는 원본 파일 경로와 줄 번호를 보존한 텍스트로 표시합니다. 원본 서버 소스·DTO·DB migration·색인 생성 도구는 이 저장소에 없으므로 백엔드 검증 명령은 해당 서버 저장소에서 실행해야 합니다.

`artifacts/api-server`와 `lib/api-spec/openapi.yaml`은 로컬 Express 서버의 `/api/healthz` 계약입니다. 웹이 `VITE_API_BASE_URL`로 호출하는 `/api/v1` 운영 API와 별개이며, OpenAPI codegen은 운영 명세를 생성하지 않습니다. 일반 사용자 토큰, 기업 관리자 토큰, 시스템 관리자 토큰, 조직 API key도 서로 대체하지 않습니다.

API가 추가됐다는 사실과 웹에 해당 관리 화면이 있다는 사실은 구분합니다. 서버 제공 기능은 원본 계약에서, 현재 웹 반영 범위와 검증 결과는 위 반영 기록에서 확인하세요.
