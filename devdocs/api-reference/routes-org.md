# 조직 연동 라우트 디버깅 색인

> 백엔드 저장소에서 가져온 2026-09-16 기준 참고 자료입니다. 아래 `src/...` 경로·줄 번호·생성/검증 명령은 원본 백엔드 기준이며, 이 프런트엔드 저장소에는 해당 소스와 도구가 없습니다. 현재 웹 반영 범위는 [문서 안내](../../docs/README.md)를 참고하세요.

[문서 입구](../../docs/README.md) · [공통 디버깅](debugging-guide.md) · [오류 색인](error-index.md)

현재 소스의 명시적 HTTP 등록 9개, 고유 method/path 9개. `node devdocs/tools/generate-api-reference.cjs`로 재생성한다. 직접 수정하지 않는다.

## 읽는 법

- method와 전체 path를 함께 확인한다. Express가 암묵적으로 처리하는 HEAD/OPTIONS는 이 목록에 포함하지 않는다.
- 미들웨어 열은 상위 라우터와 해당 라우트에 선언된 순서다. 서비스 내부의 소유권·부서 범위·상태 검사를 대체하지 않는다. 링크로 실제 구현을 확인한다.
- 검증 링크는 DTO 선언으로 연결된다. min/max/default/nullable/refine 및 import된 공통 스키마를 함께 읽는다. `—`는 입력이 없다는 뜻이 아니라 `validate_request` 선언이 없다는 뜻이다. handler에서 직접 검사할 수 있다.
- 응답 열은 정적으로 찾은 응답 helper/status다. 조건별 envelope·데이터 필드는 기존 영역별 명세와 handler를 확인한다. 직접 response 호출은 status를 추정하지 않는다.
- 같은 method/path에 먼저 권한만 등록하고 나중에 본문 handler를 등록한 경우 두 행을 모두 표시하며, 후속 행에도 선행 권한을 반영한다. 이는 두 개의 독립 API가 아니다.
- 등록 순서를 유지한다. `/bulk` 같은 고정 경로와 `/:id`의 우선순위도 controller에서 확인한다. 오류 발생 전 실행된 인증이 있으면 잘못된 method에도 먼저 401/403이 나올 수 있다.


## src/modules/org-api/org-api.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /org-api/v1/departments` | — | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("departments.read"): `src/modules/org-api/org-api.controller.ts:28` | `send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:26` |
| `GET /org-api/v1/members` | — | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("members.read"): `src/modules/org-api/org-api.controller.ts:46` | `send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:44` |
| `POST /org-api/v1/departments/upsert` | "body": upsert_department_body_schema: `src/modules/org-api/org-api.dto.ts:9` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("departments.write"): `src/modules/org-api/org-api.controller.ts:127` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:125` |
| `POST /org-api/v1/projects/full-upsert` | "body": full_upsert_project_body_schema: `src/modules/org-api/org-api.dto.ts:149` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("projects.write"): `src/modules/org-api/org-api.controller.ts:145` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:143` |
| `POST /org-api/v1/members/upsert` | "body": upsert_member_body_schema: `src/modules/org-api/org-api.dto.ts:20` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("members.write"): `src/modules/org-api/org-api.controller.ts:167` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:165` |
| `POST /org-api/v1/members/deactivate` | "body": deactivate_member_body_schema: `src/modules/org-api/org-api.dto.ts:30` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("members.write"): `src/modules/org-api/org-api.controller.ts:182` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:180` |
| `POST /org-api/v1/schedules/upsert` | "body": upsert_company_schedule_body_schema: `src/modules/org-api/org-api.dto.ts:48` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("schedules.write"): `src/modules/org-api/org-api.controller.ts:200` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:198` |
| `POST /org-api/v1/schedules/recurring/upsert` | "body": upsert_recurring_company_schedules_body_schema: `src/modules/org-api/org-api.dto.ts:73` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("schedules.write"): `src/modules/org-api/org-api.controller.ts:218` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:216` |
| `POST /org-api/v1/schedules/delete` | "body": delete_company_schedule_body_schema: `src/modules/org-api/org-api.dto.ts:87` | authenticate_org_api: `src/modules/org-api/org-api.controller.ts:24`<br>require_org_api_scope("schedules.write"): `src/modules/org-api/org-api.controller.ts:236` | `with_sync_log → send_success (200)` | controller: `src/modules/org-api/org-api.controller.ts:234` |
