# 일반 사용자 라우트 디버깅 색인

> 백엔드 저장소에서 가져온 2026-09-16 기준 참고 자료입니다. 아래 `src/...` 경로·줄 번호·생성/검증 명령은 원본 백엔드 기준이며, 이 프런트엔드 저장소에는 해당 소스와 도구가 없습니다. 현재 웹 반영 범위는 [문서 안내](../README.md)를 참고하세요.

[문서 입구](../README.md) · [공통 디버깅](debugging-guide.md) · [오류 색인](error-index.md)

현재 소스의 명시적 HTTP 등록 147개, 고유 method/path 147개. `node devdocs/tools/generate-api-reference.cjs`로 재생성한다. 직접 수정하지 않는다.

## 읽는 법

- method와 전체 path를 함께 확인한다. Express가 암묵적으로 처리하는 HEAD/OPTIONS는 이 목록에 포함하지 않는다.
- 미들웨어 열은 상위 라우터와 해당 라우트에 선언된 순서다. 서비스 내부의 소유권·부서 범위·상태 검사를 대체하지 않는다. 링크로 실제 구현을 확인한다.
- 검증 링크는 DTO 선언으로 연결된다. min/max/default/nullable/refine 및 import된 공통 스키마를 함께 읽는다. `—`는 입력이 없다는 뜻이 아니라 `validate_request` 선언이 없다는 뜻이다. handler에서 직접 검사할 수 있다.
- 응답 열은 정적으로 찾은 응답 helper/status다. 조건별 envelope·데이터 필드는 기존 영역별 명세와 handler를 확인한다. 직접 response 호출은 status를 추정하지 않는다.
- 같은 method/path에 먼저 권한만 등록하고 나중에 본문 handler를 등록한 경우 두 행을 모두 표시하며, 후속 행에도 선행 권한을 반영한다. 이는 두 개의 독립 API가 아니다.
- 등록 순서를 유지한다. `/bulk` 같은 고정 경로와 `/:id`의 우선순위도 controller에서 확인한다. 오류 발생 전 실행된 인증이 있으면 잘못된 method에도 먼저 401/403이 나올 수 있다.


## src/modules/index.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/health` | — | — | `response.status(200).json` | controller: `src/modules/index.ts:33` |

## src/modules/auth/auth.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `POST /api/v1/auth/signup` | "body": signup_body_schema: `src/modules/auth/auth.dto.ts:3` | — | `send_success (201)` | controller: `src/modules/auth/auth.controller.ts:20` |
| `POST /api/v1/auth/login` | "body": login_body_schema: `src/modules/auth/auth.dto.ts:9` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:37` |
| `POST /api/v1/auth/refresh` | "body": refresh_body_schema: `src/modules/auth/auth.dto.ts:14` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:46` |
| `POST /api/v1/auth/logout` | "body": logout_body_schema: `src/modules/auth/auth.dto.ts:18` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:55` |
| `POST /api/v1/auth/verify-email` | "body": verify_email_body_schema: `src/modules/auth/auth.dto.ts:22` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:64` |
| `POST /api/v1/auth/resend-verification-email` | "body": resend_verification_email_body_schema: `src/modules/auth/auth.dto.ts:26` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:73` |
| `POST /api/v1/auth/forgot-password` | "body": forgot_password_body_schema: `src/modules/auth/auth.dto.ts:30` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:85` |
| `POST /api/v1/auth/reset-password` | "body": reset_password_body_schema: `src/modules/auth/auth.dto.ts:34` | — | `send_success (200)` | controller: `src/modules/auth/auth.controller.ts:97` |

## src/modules/ai-chat/ai-chat.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/ai-chat/sessions` | "query": list_ai_chat_sessions_query_schema: `src/modules/ai-chat/ai-chat.dto.ts:11` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (200)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:26` |
| `POST /api/v1/ai-chat/sessions` | "body": create_ai_chat_session_body_schema: `src/modules/ai-chat/ai-chat.dto.ts:17` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (201)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:35` |
| `GET /api/v1/ai-chat/sessions/:session_id` | "params": ai_chat_session_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:3` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (200)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:44` |
| `DELETE /api/v1/ai-chat/sessions/:session_id` | "params": ai_chat_session_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:3` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (200)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:53` |
| `GET /api/v1/ai-chat/sessions/:session_id/messages` | "params": ai_chat_session_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:3`<br>"query": list_ai_chat_messages_query_schema: `src/modules/ai-chat/ai-chat.dto.ts:32` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (200)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:62` |
| `POST /api/v1/ai-chat/sessions/:session_id/messages` | "params": ai_chat_session_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:3`<br>"body": send_ai_chat_message_body_schema: `src/modules/ai-chat/ai-chat.dto.ts:21` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (201)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:77` |
| `POST /api/v1/ai-chat/messages/:message_id/apply` | "params": ai_chat_message_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:7`<br>"body": apply_ai_chat_message_body_schema: `src/modules/ai-chat/ai-chat.dto.ts:25` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (201)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:91` |
| `PATCH /api/v1/ai-chat/sessions/:session_id` | "params": ai_chat_session_id_params_schema: `src/modules/ai-chat/ai-chat.dto.ts:3`<br>"body": update_ai_chat_session_body_schema: `src/modules/ai-chat/ai-chat.dto.ts:36` | authenticate: `src/modules/ai-chat/ai-chat.controller.ts:24` | `send_success (200)` | controller: `src/modules/ai-chat/ai-chat.controller.ts:105` |

## src/modules/users/users.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/users/me` | — | authenticate: `src/modules/users/users.controller.ts:12` | `send_success (200)` | controller: `src/modules/users/users.controller.ts:14` |
| `PATCH /api/v1/users/me` | "body": update_me_body_schema: `src/modules/users/users.dto.ts:5` | authenticate: `src/modules/users/users.controller.ts:12` | `send_success (200)` | controller: `src/modules/users/users.controller.ts:22` |
| `DELETE /api/v1/users/me` | — | authenticate: `src/modules/users/users.controller.ts:12` | `send_success (200)` | controller: `src/modules/users/users.controller.ts:31` |

## src/modules/categories/categories.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/categories` | "query": list_categories_query_schema: `src/modules/categories/categories.dto.ts:11` | authenticate: `src/modules/categories/categories.controller.ts:17` | `send_success (200)` | controller: `src/modules/categories/categories.controller.ts:19` |
| `GET /api/v1/categories/:category_id` | "params": category_id_params_schema: `src/modules/categories/categories.dto.ts:7` | authenticate: `src/modules/categories/categories.controller.ts:17` | `send_success (200)` | controller: `src/modules/categories/categories.controller.ts:28` |
| `POST /api/v1/categories` | "body": create_category_body_schema: `src/modules/categories/categories.dto.ts:15` | authenticate: `src/modules/categories/categories.controller.ts:17` | `send_success (201)` | controller: `src/modules/categories/categories.controller.ts:40` |
| `PATCH /api/v1/categories/:category_id` | "params": category_id_params_schema: `src/modules/categories/categories.dto.ts:7`<br>"body": update_category_body_schema: `src/modules/categories/categories.dto.ts:22` | authenticate: `src/modules/categories/categories.controller.ts:17` | `send_success (200)` | controller: `src/modules/categories/categories.controller.ts:49` |
| `DELETE /api/v1/categories/:category_id` | "params": category_id_params_schema: `src/modules/categories/categories.dto.ts:7` | authenticate: `src/modules/categories/categories.controller.ts:17` | `send_success (200)` | controller: `src/modules/categories/categories.controller.ts:63` |

## src/modules/companies/companies.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/companies` | — | authenticate: `src/modules/companies/companies.controller.ts:23` | `send_success (200)` | controller: `src/modules/companies/companies.controller.ts:136` |
| `GET /api/v1/companies/:company_id/departments` | "params": company_id_params_schema: `src/modules/companies/companies.dto.ts:3`<br>"query": company_departments_query_schema: `src/modules/companies/companies.dto.ts:12` | authenticate: `src/modules/companies/companies.controller.ts:23` | `send_success (200)` | controller: `src/modules/companies/companies.controller.ts:178` |
| `GET /api/v1/companies/:company_id/org-chart` | "params": company_id_params_schema: `src/modules/companies/companies.dto.ts:3` | authenticate: `src/modules/companies/companies.controller.ts:23` | `send_success (200)` | controller: `src/modules/companies/companies.controller.ts:228` |
| `GET /api/v1/companies/:company_id/departments/:department_id/members` | "params": company_department_id_params_schema: `src/modules/companies/companies.dto.ts:7` | authenticate: `src/modules/companies/companies.controller.ts:23` | `send_success (200)` | controller: `src/modules/companies/companies.controller.ts:304` |
| `PATCH /api/v1/companies/:company_id/departments/:department_id/approval-delegate-mode` | "params": company_department_id_params_schema: `src/modules/companies/companies.dto.ts:7`<br>"body": update_department_approval_delegate_mode_body_schema: `src/modules/companies/companies.dto.ts:17` | authenticate: `src/modules/companies/companies.controller.ts:23` | `send_success (200)` | controller: `src/modules/companies/companies.controller.ts:356` |

## src/modules/company-memberships/company-memberships.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/company-memberships/invites` | — | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:25` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:23` |
| `GET /api/v1/company-memberships/invites/by-id/:company_invite_id` | "params": company_member_invite_id_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:7` | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:37` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:35` |
| `POST /api/v1/company-memberships/invites/by-id/:company_invite_id/accept` | "params": company_member_invite_id_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:7` | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:58` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:56` |
| `GET /api/v1/company-memberships/invites/:token` | "params": company_member_invite_token_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:3` | — | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:74` |
| `POST /api/v1/company-memberships/invites/:token/accept` | "params": company_member_invite_token_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:3` | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:95` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:93` |
| `GET /api/v1/company-memberships` | — | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:111` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:113` |
| `POST /api/v1/company-memberships/:company_member_id/leave` | "params": company_membership_id_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:11` | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:111` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:151` |
| `POST /api/v1/company-memberships/invites/by-id/:company_invite_id/reject` | "params": company_member_invite_id_params_schema: `src/modules/company-memberships/company-memberships.dto.ts:7` | authenticate: `src/modules/company-memberships/company-memberships.controller.ts:111` | `send_success (200)` | controller: `src/modules/company-memberships/company-memberships.controller.ts:224` |

## src/modules/company-projects/company-projects.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/company-projects` | "query": list_company_projects_query_schema: `src/modules/company-projects/company-projects.dto.ts:46` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:29` |
| `POST /api/v1/company-projects` | "body": create_company_project_user_body_schema: `src/modules/company-projects/company-projects.dto.ts:99` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (201)` | controller: `src/modules/company-projects/company-projects.controller.ts:46` |
| `GET /api/v1/company-projects/my-work-items` | — | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:60` |
| `GET /api/v1/company-projects/my-calendar-items` | "query": list_my_company_project_calendar_items_query_schema: `src/modules/company-projects/company-projects.dto.ts:55` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:72` |
| `PATCH /api/v1/company-projects/work-assignments/:assignment_id` | "params": company_project_assignment_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:33`<br>"body": update_company_project_assignment_body_schema: `src/modules/company-projects/company-projects.dto.ts:252` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:95` |
| `POST /api/v1/company-projects/work-assignments/:assignment_id/reminders` | "params": company_project_assignment_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:33`<br>"body": create_company_project_work_reminder_body_schema: `src/modules/company-projects/company-projects.dto.ts:280` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (201)` | controller: `src/modules/company-projects/company-projects.controller.ts:111` |
| `GET /api/v1/company-projects/work-reminders` | "query": list_company_project_work_reminders_query_schema: `src/modules/company-projects/company-projects.dto.ts:286` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:126` |
| `DELETE /api/v1/company-projects/work-reminders/:reminder_id` | "params": company_project_work_reminder_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:42` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:142` |
| `GET /api/v1/company-projects/:company_project_id` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:155` |
| `GET /api/v1/company-projects/:company_project_id/gantt` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"query": company_project_gantt_query_schema: `src/modules/company-projects/company-projects.dto.ts:63` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:168` |
| `GET /api/v1/company-projects/:company_project_id/work-items/:work_item_id/children` | "params": company_project_work_item_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:25`<br>"query": list_company_project_work_item_children_query_schema: `src/modules/company-projects/company-projects.dto.ts:78` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27` | `send_success (200)` | controller: `src/modules/company-projects/company-projects.controller.ts:196` |

## src/modules/company-projects/project-management.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/company-projects/:company_project_id/members` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:40` |
| `POST /api/v1/company-projects/:company_project_id/members` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": create_company_project_member_body_schema: `src/modules/company-projects/company-projects.dto.ts:127` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:55` |
| `PATCH /api/v1/company-projects/:company_project_id/members/:project_member_id` | "params": company_project_member_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:17`<br>"body": update_company_project_member_body_schema: `src/modules/company-projects/company-projects.dto.ts:132` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:75` |
| `DELETE /api/v1/company-projects/:company_project_id/members/:project_member_id` | "params": company_project_member_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:17` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:96` |
| `PATCH /api/v1/company-projects/:company_project_id` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": update_company_project_body_schema: `src/modules/company-projects/company-projects.dto.ts:110` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:115` |
| `POST /api/v1/company-projects/:company_project_id/phases` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": create_company_project_phase_body_schema: `src/modules/company-projects/company-projects.dto.ts:141` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:135` |
| `PATCH /api/v1/company-projects/:company_project_id/phases/:phase_id` | "params": company_project_phase_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:21`<br>"body": update_company_project_phase_body_schema: `src/modules/company-projects/company-projects.dto.ts:153` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:152` |
| `DELETE /api/v1/company-projects/:company_project_id/phases/:phase_id` | "params": company_project_phase_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:21` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:173` |
| `POST /api/v1/company-projects/:company_project_id/work-items` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": create_company_project_work_item_body_schema: `src/modules/company-projects/company-projects.dto.ts:169` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:192` |
| `PATCH /api/v1/company-projects/:company_project_id/work-items/:work_item_id` | "params": company_project_work_item_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:25`<br>"body": update_company_project_work_item_body_schema: `src/modules/company-projects/company-projects.dto.ts:191` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:209` |
| `DELETE /api/v1/company-projects/:company_project_id/work-items/:work_item_id` | "params": company_project_work_item_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:25` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:230` |
| `PUT /api/v1/company-projects/:company_project_id/work-items/:work_item_id/departments` | "params": company_project_work_item_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:25`<br>"body": put_company_project_work_departments_body_schema: `src/modules/company-projects/company-projects.dto.ts:218` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:249` |
| `PATCH /api/v1/company-projects/:company_project_id/work-items/:work_item_id/assignments/:assignment_id` | "params": company_project_work_assignment_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:37`<br>"body": update_company_project_work_assignment_admin_body_schema: `src/modules/company-projects/company-projects.dto.ts:262` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:270` |
| `POST /api/v1/company-projects/:company_project_id/work-items/:work_item_id/assignments` | "params": company_project_work_item_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:25`<br>"body": create_company_project_work_assignment_body_schema: `src/modules/company-projects/company-projects.dto.ts:222` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:292` |
| `POST /api/v1/company-projects/:company_project_id/dependencies` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": create_company_project_dependency_body_schema: `src/modules/company-projects/company-projects.dto.ts:236` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:313` |
| `DELETE /api/v1/company-projects/:company_project_id/dependencies/:dependency_id` | "params": company_project_dependency_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:29` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:333` |
| `POST /api/v1/company-projects/:company_project_id/baselines` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"body": create_company_project_baseline_body_schema: `src/modules/company-projects/company-projects.dto.ts:246` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (201)` | controller: `src/modules/company-projects/project-management.controller.ts:352` |
| `GET /api/v1/company-projects/:company_project_id/baselines` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:372` |
| `GET /api/v1/company-projects/:company_project_id/audit-logs` | "params": company_project_id_params_schema: `src/modules/company-projects/company-projects.dto.ts:13`<br>"query": list_company_project_audit_logs_query_schema: `src/modules/company-projects/company-projects.dto.ts:71` | authenticate: `src/modules/company-projects/company-projects.controller.ts:27`<br>authenticate: `src/modules/company-projects/project-management.controller.ts:38` | `send_success (200)` | controller: `src/modules/company-projects/project-management.controller.ts:387` |

## src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/company-schedule-approvals` | "query": company_schedule_approvals_query_schema: `src/modules/company-schedule-approvals/company-schedule-approvals.dto.ts:7` | authenticate: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:20` | `send_success (200)` | controller: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:255` |
| `GET /api/v1/company-schedule-approvals/:approval_id` | "params": company_schedule_approval_id_params_schema: `src/modules/company-schedule-approvals/company-schedule-approvals.dto.ts:3` | authenticate: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:20` | `send_success (200)` | controller: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:307` |
| `POST /api/v1/company-schedule-approvals/:approval_id/approve` | "params": company_schedule_approval_id_params_schema: `src/modules/company-schedule-approvals/company-schedule-approvals.dto.ts:3` | authenticate: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:20` | `send_success (200)` | controller: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:330` |
| `POST /api/v1/company-schedule-approvals/:approval_id/reject` | "params": company_schedule_approval_id_params_schema: `src/modules/company-schedule-approvals/company-schedule-approvals.dto.ts:3` | authenticate: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:20` | `send_success (200)` | controller: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:396` |
| `POST /api/v1/company-schedule-approvals/:approval_id/withdraw` | "params": company_schedule_approval_id_params_schema: `src/modules/company-schedule-approvals/company-schedule-approvals.dto.ts:3` | authenticate: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:20` | `send_success (200)` | controller: `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:492` |

## src/modules/company-schedules/company-schedules.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/company-schedules` | "query": list_company_schedules_query_schema: `src/modules/company-schedules/company-schedules.dto.ts:14` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (200)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:21` |
| `POST /api/v1/company-schedules` | "body": create_company_schedule_body_schema: `src/modules/company-schedules/company-schedules.dto.ts:27` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (201)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:63` |
| `GET /api/v1/company-schedules/:company_schedule_id` | "params": company_schedule_id_params_schema: `src/modules/company-schedules/company-schedules.dto.ts:23` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (200)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:76` |
| `PATCH /api/v1/company-schedules/:company_schedule_id` | "params": company_schedule_id_params_schema: `src/modules/company-schedules/company-schedules.dto.ts:23`<br>"body": update_company_schedule_body_schema: `src/modules/company-schedules/company-schedules.dto.ts:40` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (200)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:93` |
| `DELETE /api/v1/company-schedules/:company_schedule_id` | "params": company_schedule_id_params_schema: `src/modules/company-schedules/company-schedules.dto.ts:23` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (200)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:118` |
| `GET /api/v1/company-schedules/:company_schedule_id/approval-status` | "params": company_schedule_id_params_schema: `src/modules/company-schedules/company-schedules.dto.ts:23` | authenticate: `src/modules/company-schedules/company-schedules.controller.ts:19` | `send_success (200)` | controller: `src/modules/company-schedules/company-schedules.controller.ts:141` |

## src/modules/friends/friends.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/friends` | — | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:25` |
| `GET /api/v1/friends/requests` | — | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:33` |
| `POST /api/v1/friends/requests` | "body": create_friend_request_body_schema: `src/modules/friends/friends.dto.ts:19` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (201)` | controller: `src/modules/friends/friends.controller.ts:41` |
| `POST /api/v1/friends/requests/:friendship_id/accept` | "params": friendship_id_params_schema: `src/modules/friends/friends.dto.ts:3` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:50` |
| `POST /api/v1/friends/requests/:friendship_id/reject` | "params": friendship_id_params_schema: `src/modules/friends/friends.dto.ts:3` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:62` |
| `DELETE /api/v1/friends/by-public-uid/:public_uid` | "params": friend_public_uid_params_schema: `src/modules/friends/friends.dto.ts:11` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:74` |
| `DELETE /api/v1/friends/:friend_user_id` | "params": friend_user_id_params_schema: `src/modules/friends/friends.dto.ts:7` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:83` |
| `POST /api/v1/friends/requests/:friendship_id/cancel` | "params": friendship_id_params_schema: `src/modules/friends/friends.dto.ts:3` | authenticate: `src/modules/friends/friends.controller.ts:22` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:146` |
| `GET /api/v1/friend-presets` | — | authenticate: `src/modules/friends/friends.controller.ts:23` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:92` |
| `POST /api/v1/friend-presets` | "body": create_friend_preset_body_schema: `src/modules/friends/friends.dto.ts:28` | authenticate: `src/modules/friends/friends.controller.ts:23` | `send_success (201)` | controller: `src/modules/friends/friends.controller.ts:100` |
| `PATCH /api/v1/friend-presets/:friend_preset_id` | "params": friend_preset_id_params_schema: `src/modules/friends/friends.dto.ts:15`<br>"body": update_friend_preset_body_schema: `src/modules/friends/friends.dto.ts:35` | authenticate: `src/modules/friends/friends.controller.ts:23` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:109` |
| `PUT /api/v1/friend-presets/:friend_preset_id/members` | "params": friend_preset_id_params_schema: `src/modules/friends/friends.dto.ts:15`<br>"body": replace_friend_preset_members_body_schema: `src/modules/friends/friends.dto.ts:44` | authenticate: `src/modules/friends/friends.controller.ts:23` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:123` |
| `DELETE /api/v1/friend-presets/:friend_preset_id` | "params": friend_preset_id_params_schema: `src/modules/friends/friends.dto.ts:15` | authenticate: `src/modules/friends/friends.controller.ts:23` | `send_success (200)` | controller: `src/modules/friends/friends.controller.ts:137` |

## src/modules/holidays/holidays.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/holidays` | "query": list_holidays_query_schema: `src/modules/holidays/holidays.dto.ts:12` | — | `send_success (200)` | controller: `src/modules/holidays/holidays.controller.ts:18` |
| `GET /api/v1/holidays/range` | "query": range_holidays_query_schema: `src/modules/holidays/holidays.dto.ts:27` | — | `send_success (200)` | controller: `src/modules/holidays/holidays.controller.ts:27` |
| `GET /api/v1/holidays/check` | "query": check_holiday_query_schema: `src/modules/holidays/holidays.dto.ts:42` | — | `send_success (200)` | controller: `src/modules/holidays/holidays.controller.ts:38` |

## src/modules/schedules/schedules.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/schedules` | "query": list_schedules_query_schema: `src/modules/schedules/schedules.dto.ts:88` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:33` |
| `POST /api/v1/schedules/recurring` | "body": create_recurring_schedule_body_schema: `src/modules/schedules/schedules.dto.ts:61` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (201)` | controller: `src/modules/schedules/schedules.controller.ts:42` |
| `DELETE /api/v1/schedules/bulk` | "body": bulk_delete_schedules_body_schema: `src/modules/schedules/schedules.dto.ts:99` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:54` |
| `GET /api/v1/schedules/:schedule_id/share-links` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:66` |
| `POST /api/v1/schedules/:schedule_id/share-links` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5`<br>"body": create_schedule_share_link_body_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:27` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (201)` | controller: `src/modules/schedules/schedules.controller.ts:78` |
| `PATCH /api/v1/schedules/:schedule_id/share-links/:schedule_share_link_id` | "params": schedule_share_link_route_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:17`<br>"body": update_schedule_share_link_body_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:44` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:92` |
| `DELETE /api/v1/schedules/:schedule_id/share-links/:schedule_share_link_id` | "params": schedule_share_link_route_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:17` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:107` |
| `GET /api/v1/schedules/:schedule_id/shares` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:120` |
| `POST /api/v1/schedules/:schedule_id/friend-shares` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5`<br>"body": create_friend_schedule_shares_body_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:33` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (201)` | controller: `src/modules/schedules/schedules.controller.ts:132` |
| `PATCH /api/v1/schedules/:schedule_id/shares/:schedule_share_id` | "params": schedule_share_route_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:22`<br>"body": update_schedule_share_body_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:55` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:146` |
| `DELETE /api/v1/schedules/:schedule_id/shares/:schedule_share_id` | "params": schedule_share_route_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:22` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:161` |
| `GET /api/v1/schedules/:schedule_id` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:174` |
| `POST /api/v1/schedules` | "body": create_schedule_body_schema: `src/modules/schedules/schedules.dto.ts:42` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (201)` | controller: `src/modules/schedules/schedules.controller.ts:186` |
| `PATCH /api/v1/schedules/:schedule_id` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5`<br>"body": update_schedule_body_schema: `src/modules/schedules/schedules.dto.ts:70` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:195` |
| `DELETE /api/v1/schedules/:schedule_id` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:209` |
| `GET /api/v1/schedules/:schedule_id/series` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:218` |
| `PATCH /api/v1/schedules/:schedule_id/series` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5`<br>"body": series_update_schema: `src/modules/schedules/schedule-series.dto.ts:4` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:227` |
| `DELETE /api/v1/schedules/:schedule_id/series` | "params": schedule_id_params_schema: `src/modules/schedules/schedules.dto.ts:5`<br>"body": series_delete_schema: `src/modules/schedules/schedule-series.dto.ts:13` | authenticate: `src/modules/schedules/schedules.controller.ts:31` | `send_success (200)` | controller: `src/modules/schedules/schedules.controller.ts:237` |

## src/modules/schedule-sharing/schedule-sharing.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/schedule-share-links/:token` | "params": schedule_share_link_token_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:5` | — | `send_success (200)` | controller: `src/modules/schedule-sharing/schedule-sharing.controller.ts:17` |
| `POST /api/v1/schedule-share-links/:token/join` | "params": schedule_share_link_token_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:5` | authenticate: `src/modules/schedule-sharing/schedule-sharing.controller.ts:28` | `send_success (200)` | controller: `src/modules/schedule-sharing/schedule-sharing.controller.ts:26` |
| `GET /api/v1/shared-schedules` | "query": shared_schedules_query_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:64` | authenticate: `src/modules/schedule-sharing/schedule-sharing.controller.ts:39` | `send_success (200)` | controller: `src/modules/schedule-sharing/schedule-sharing.controller.ts:41` |
| `POST /api/v1/shared-schedules/:schedule_share_id/leave` | "params": leave_schedule_share_params_schema: `src/modules/schedule-sharing/schedule-sharing.dto.ts:69` | authenticate: `src/modules/schedule-sharing/schedule-sharing.controller.ts:39` | `send_success (200)` | controller: `src/modules/schedule-sharing/schedule-sharing.controller.ts:53` |

## src/modules/tasks/tasks.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/tasks` | "query": list_tasks_query_schema: `src/modules/tasks/tasks.dto.ts:59` | authenticate: `src/modules/tasks/tasks.controller.ts:17` | `send_success (200)` | controller: `src/modules/tasks/tasks.controller.ts:19` |
| `GET /api/v1/tasks/:task_id` | "params": task_id_params_schema: `src/modules/tasks/tasks.dto.ts:3` | authenticate: `src/modules/tasks/tasks.controller.ts:17` | `send_success (200)` | controller: `src/modules/tasks/tasks.controller.ts:28` |
| `POST /api/v1/tasks` | "body": create_task_body_schema: `src/modules/tasks/tasks.dto.ts:31` | authenticate: `src/modules/tasks/tasks.controller.ts:17` | `send_success (201)` | controller: `src/modules/tasks/tasks.controller.ts:37` |
| `PATCH /api/v1/tasks/:task_id` | "params": task_id_params_schema: `src/modules/tasks/tasks.dto.ts:3`<br>"body": update_task_body_schema: `src/modules/tasks/tasks.dto.ts:43` | authenticate: `src/modules/tasks/tasks.controller.ts:17` | `send_success (200)` | controller: `src/modules/tasks/tasks.controller.ts:46` |
| `DELETE /api/v1/tasks/:task_id` | "params": task_id_params_schema: `src/modules/tasks/tasks.dto.ts:3` | authenticate: `src/modules/tasks/tasks.controller.ts:17` | `send_success (200)` | controller: `src/modules/tasks/tasks.controller.ts:60` |

## src/modules/memos/memos.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/memos` | "query": list_memos_query_schema: `src/modules/memos/memos.dto.ts:31` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:21` |
| `GET /api/v1/memos/:memo_id` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:30` |
| `POST /api/v1/memos` | "body": create_memo_body_schema: `src/modules/memos/memos.dto.ts:11` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (201)` | controller: `src/modules/memos/memos.controller.ts:39` |
| `PATCH /api/v1/memos/:memo_id` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3`<br>"body": update_memo_body_schema: `src/modules/memos/memos.dto.ts:19` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:48` |
| `DELETE /api/v1/memos/:memo_id` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:62` |
| `POST /api/v1/memos/:memo_id/parse` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3`<br>"body": parse_memo_body_schema: `src/modules/memos/memos.dto.ts:37` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:71` |
| `GET /api/v1/memos/:memo_id/parse-result` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (200)` | controller: `src/modules/memos/memos.controller.ts:85` |
| `POST /api/v1/memos/:memo_id/apply` | "params": memo_id_params_schema: `src/modules/memos/memos.dto.ts:3`<br>"body": apply_parse_result_body_schema: `src/modules/memos/memos.dto.ts:41` | authenticate: `src/modules/memos/memos.controller.ts:19` | `send_success (201)` | controller: `src/modules/memos/memos.controller.ts:94` |

## src/modules/notices/notices.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/notices` | "query": list_notices_query_schema: `src/modules/notices/notices.dto.ts:3` | authenticate: `src/modules/notices/notices.controller.ts:15` | `send_success (200)` | controller: `src/modules/notices/notices.controller.ts:17` |
| `GET /api/v1/notices/:notice_id` | "params": notice_id_params_schema: `src/modules/notices/notices.dto.ts:8` | authenticate: `src/modules/notices/notices.controller.ts:15` | `send_success (200)` | controller: `src/modules/notices/notices.controller.ts:28` |

## src/modules/notifications/notifications.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/notifications` | "query": list_notifications_query_schema: `src/modules/notifications/notifications.dto.ts:11` | authenticate: `src/modules/notifications/notifications.controller.ts:15` | `send_success (200)` | controller: `src/modules/notifications/notifications.controller.ts:17` |
| `GET /api/v1/notifications/unread-count` | — | authenticate: `src/modules/notifications/notifications.controller.ts:15` | `send_success (200)` | controller: `src/modules/notifications/notifications.controller.ts:34` |
| `PATCH /api/v1/notifications/read-all` | — | authenticate: `src/modules/notifications/notifications.controller.ts:15` | `send_success (200)` | controller: `src/modules/notifications/notifications.controller.ts:44` |
| `PATCH /api/v1/notifications/:notification_recipient_id/read` | "params": notification_recipient_id_params_schema: `src/modules/notifications/notifications.dto.ts:3` | authenticate: `src/modules/notifications/notifications.controller.ts:15` | `send_success (200)` | controller: `src/modules/notifications/notifications.controller.ts:52` |

## src/modules/push/push.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/push/devices` | — | authenticate: `src/modules/push/push.controller.ts:16` | `send_success (200)` | controller: `src/modules/push/push.controller.ts:18` |
| `POST /api/v1/push/devices` | "body": register_push_device_body_schema: `src/modules/push/push.dto.ts:17` | authenticate: `src/modules/push/push.controller.ts:16` | `send_success (201)` | controller: `src/modules/push/push.controller.ts:26` |
| `POST /api/v1/push/devices/unregister` | "body": unregister_push_device_body_schema: `src/modules/push/push.dto.ts:25` | authenticate: `src/modules/push/push.controller.ts:16` | `send_success (200)` | controller: `src/modules/push/push.controller.ts:38` |
| `DELETE /api/v1/push/devices/:push_device_id` | "params": push_device_id_params_schema: `src/modules/push/push.dto.ts:3` | authenticate: `src/modules/push/push.controller.ts:16` | `send_success (200)` | controller: `src/modules/push/push.controller.ts:50` |

## src/modules/reminders/reminders.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/reminders` | "query": list_reminders_query_schema: `src/modules/reminders/reminders.dto.ts:19` | authenticate: `src/modules/reminders/reminders.controller.ts:17` | `send_success (200)` | controller: `src/modules/reminders/reminders.controller.ts:19` |
| `GET /api/v1/reminders/:reminder_id` | "params": reminder_id_params_schema: `src/modules/reminders/reminders.dto.ts:3` | authenticate: `src/modules/reminders/reminders.controller.ts:17` | `send_success (200)` | controller: `src/modules/reminders/reminders.controller.ts:28` |
| `POST /api/v1/reminders` | "body": create_reminder_body_schema: `src/modules/reminders/reminders.dto.ts:26` | authenticate: `src/modules/reminders/reminders.controller.ts:17` | `send_success (201)` | controller: `src/modules/reminders/reminders.controller.ts:40` |
| `PATCH /api/v1/reminders/:reminder_id` | "params": reminder_id_params_schema: `src/modules/reminders/reminders.dto.ts:3`<br>"body": update_reminder_body_schema: `src/modules/reminders/reminders.dto.ts:33` | authenticate: `src/modules/reminders/reminders.controller.ts:17` | `send_success (200)` | controller: `src/modules/reminders/reminders.controller.ts:49` |
| `DELETE /api/v1/reminders/:reminder_id` | "params": reminder_id_params_schema: `src/modules/reminders/reminders.dto.ts:3` | authenticate: `src/modules/reminders/reminders.controller.ts:17` | `send_success (200)` | controller: `src/modules/reminders/reminders.controller.ts:63` |

## src/modules/home/home.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/home/today` | "query": today_home_feed_query_schema: `src/modules/home/home.dto.ts:5` | authenticate: `src/modules/home/home.controller.ts:12` | `send_success (200)` | controller: `src/modules/home/home.controller.ts:14` |

## src/modules/briefings/briefings.controller.ts

| Method / Path | 입력 검증 | 선행·직접 미들웨어 | 응답 호출 | 구현 |
| --- | --- | --- | --- | --- |
| `GET /api/v1/briefings/today` | "query": today_briefing_query_schema: `src/modules/briefings/briefings.dto.ts:3` | authenticate: `src/modules/briefings/briefings.controller.ts:12` | `send_success (200)` | controller: `src/modules/briefings/briefings.controller.ts:14` |
