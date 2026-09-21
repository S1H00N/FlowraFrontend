# 오류 발생 지점 색인

> 백엔드 저장소에서 가져온 2026-09-16 기준 참고 자료입니다. 아래 `src/...` 경로·줄 번호·생성/검증 명령은 원본 백엔드 기준이며, 이 프런트엔드 저장소에는 해당 소스와 도구가 없습니다. 현재 웹 반영 범위는 [문서 안내](../README.md)를 참고하세요.

[문서 입구](../README.md) · [공통 디버깅](debugging-guide.md)

소스의 `new ApiError(...)` / `new AdminApiError(...)`를 AST로 추출한 검색용 색인이다. `node devdocs/tools/generate-api-reference.cjs`로 재생성한다. 직접 수정하지 않는다.

## 해석 주의

- 아래 status/message는 **생성 시점 값**이다. 인증 catch, 관리자 오류 middleware 등이 다른 오류로 변환할 수 있으므로 모든 코드가 그대로 HTTP 응답에 나온다는 뜻은 아니다.
- 동적 식은 그대로 표시한다. 오류 발생 조건은 링크의 if/조회/권한 검사 및 상위 catch에서 확인한다. 같은 코드도 여러 원인이 있다.
- Zod 오류는 일반/기업/조직에서 `VALIDATION_ERROR`, 시스템 관리자에서 `BAD_REQUEST`로 매핑된다. 오류 생성자가 아닌 직접 JSON 응답·외부 프록시 오류는 자동 추출 대상이 아니다.
- 4xx라고 항상 프론트 책임은 아니다. 서버가 저장한 AI 제안의 의미 오류도 400이 될 수 있다. 재시도 여부는 공통 가이드와 영역별 문서에서 판단한다.

## ACTION_INDEX_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "action_index is required for apply_type action" | `src/modules/ai/ai.service.ts:345` |
| 400 / ApiError | "action_index is required for apply_type action" | `src/modules/ai-chat/ai-chat.service.ts:295` |

## AI_ACTION_NOT_APPLICABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Pending item cannot be applied directly" | `src/modules/ai/ai.service.ts:353` |
| 400 / ApiError | "Pending item cannot be applied directly" | `src/modules/ai/ai.service.ts:371` |

## AI_ACTION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI suggested action not found" | `src/modules/ai/ai.service.ts:350` |
| 404 / ApiError | `No ${payload.apply_type} action available` | `src/modules/ai/ai.service.ts:366` |

## AI_CHAT_ACTION_ALREADY_APPLIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "AI chat action was already applied" | `src/modules/ai-chat/ai-chat.service.ts:387` |

## AI_CHAT_ACTION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat suggested action not found" | `src/modules/ai-chat/ai-chat.service.ts:300` |
| 404 / ApiError | `No ${payload.apply_type} action available` | `src/modules/ai-chat/ai-chat.service.ts:313` |

## AI_CHAT_MESSAGE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat assistant message not found" | `src/modules/ai-chat/ai-chat.service.ts:1037` |

## AI_CHAT_SESSION_ARCHIVED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Archived session cannot be modified" | `src/modules/ai-chat/ai-chat-session-lifecycle.ts:21` |
| 409 / ApiError | "Archived AI chat session cannot receive messages" | `src/modules/ai-chat/ai-chat.service.ts:872` |
| 409 / ApiError | "Archived AI chat action cannot be applied" | `src/modules/ai-chat/ai-chat.service.ts:1041` |

## AI_CHAT_SESSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat session not found" | `src/modules/ai-chat/ai-chat-pages.ts:29` |
| 404 / ApiError | "AI chat session not found" | `src/modules/ai-chat/ai-chat-session-lifecycle.ts:19` |
| 404 / ApiError | "AI chat session not found" | `src/modules/ai-chat/ai-chat.service.ts:565` |

## AI_RESULT_ALREADY_APPLIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "AI action was already applied" | `src/modules/ai/ai.service.ts:654` |

## AI_RESULT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "No parse result available for this memo" | `src/modules/ai/ai.service.ts:993` |
| 404 / ApiError | "AI parse result not found" | `src/modules/ai/ai.service.ts:1005` |

## AI_RESULT_REJECTED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Rejected parse result cannot be applied" | `src/modules/ai/ai.service.ts:1009` |

## AMBIGUOUS_CATEGORY_TARGET

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "category_id cannot be used when applying both schedule and task actions" | `src/modules/ai/ai.service.ts:1043` |
| 400 / ApiError | "category_id cannot be used when applying both schedule and task actions" | `src/modules/ai-chat/ai-chat.service.ts:1072` |

## APPROVAL_DELEGATE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | `src/company-admin/modules/departments/departments.controller.ts:363` |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | `src/company-admin/modules/departments/departments.controller.ts:518` |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | `src/modules/companies/companies.controller.ts:395` |

## BAD_REQUEST

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | `${field_name} must be a positive integer.` | `src/admin/common/admin-query.ts:5` |
| 400 / AdminApiError | "Query value must be a positive integer." | `src/admin/common/admin-query.ts:17` |
| 400 / AdminApiError | "One or more permission_codes are invalid." | `src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:34` |
| 400 / AdminApiError | "One or more group_codes are invalid." | `src/admin/modules/admin-users/admin-users.controller.ts:36` |
| 400 / AdminApiError | "Current password is incorrect." | `src/admin/modules/auth/auth.controller.ts:108` |
| 400 / AdminApiError | "Invalid company permission code." | `src/admin/modules/companies/companies.controller.ts:948` |
| 400 / AdminApiError | "System company roles cannot be modified." | `src/admin/modules/companies/companies.controller.ts:1021` |
| 400 / AdminApiError | "Invalid company permission code." | `src/admin/modules/companies/companies.controller.ts:1039` |
| 400 / AdminApiError | "System company roles cannot be deleted." | `src/admin/modules/companies/companies.controller.ts:1128` |
| 400 / AdminApiError | "Company role is assigned and cannot be deleted." | `src/admin/modules/companies/companies.controller.ts:1132` |
| 400 / AdminApiError | "A department is required for own department scoped company admins." | `src/admin/modules/companies/companies.controller.ts:1289` |
| 400 / AdminApiError | "At least one active owner must remain." | `src/admin/modules/companies/companies.controller.ts:1312` |
| 400 / AdminApiError | "Action is not allowed for this service." | `src/admin/modules/developer/developer.controller.ts:286` |
| 400 / AdminApiError | "Company notices require company_id." | `src/admin/modules/notices/notices.controller.ts:276` |
| 400 / AdminApiError | "publish_end_at must be after publish_start_at." | `src/admin/modules/notices/notices.controller.ts:284` |
| 400 / AdminApiError | "Working directory must be inside the workspace." | `src/admin/modules/terminal/terminal.controller.ts:33` |
| 400 / AdminApiError | "banned_until must be a valid future datetime." | `src/admin/modules/users/users.controller.ts:675` |
| 400 / AdminApiError | "Verification email is only available for local accounts." | `src/admin/modules/users/users.controller.ts:897` |
| 400 / AdminApiError | "User email is already verified." | `src/admin/modules/users/users.controller.ts:905` |
| 400 / AdminApiError | "Password reset link is only available for local accounts." | `src/admin/modules/users/users.controller.ts:976` |
| 400 / ApiError | "Password reset is only available for local accounts" | `src/modules/auth/auth.service.ts:632` |

## BULK_DELETE_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | `Bulk delete is limited to ${BULK_DELETE_USER_LIMIT} users per request.` | `src/admin/modules/users/users.controller.ts:342` |

## CATEGORY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Category not found" | `src/modules/categories/categories.service.ts:23` |
| 404 / ApiError | "Category not found" | `src/modules/categories/categories.service.ts:60` |
| 404 / ApiError | "Category not found" | `src/modules/categories/categories.service.ts:122` |
| 404 / ApiError | "Category not found" | `src/modules/categories/categories.service.ts:162` |
| 404 / ApiError | "Owned schedule category not found" | `src/modules/schedules/schedule-series.service.ts:44` |

## CHANGE_REQUEST_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Approval does not have a change request" | `src/modules/company-schedules/company-schedules.service.ts:1206` |

## COMPANY_ADMIN_COMPANY_SELECTION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Multiple company admin assignments were found. Select a company to continue" | `src/company-admin/modules/auth/auth.controller.ts:104` |

## COMPANY_ADMIN_DEPARTMENT_SCOPE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "At least one department is required for department scoped admins" | `src/company-admin/modules/admins/admins.controller.ts:71` |

## COMPANY_ADMIN_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company admin does not have the required permission" | `src/company-admin/common/require-company-admin-permission.ts:14` |
| 403 / ApiError | "Company admin does not have the required permission" | `src/company-admin/modules/admins/admins.controller.ts:358` |

## COMPANY_ADMIN_INACTIVE_MEMBERSHIP

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Active verified account and matching company membership are required" | `src/company-admin/common/company-admin-auth.ts:92` |

## COMPANY_ADMIN_INVALID_CREDENTIALS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Email or password is invalid" | `src/company-admin/modules/auth/auth.controller.ts:46` |
| 401 / ApiError | "Email or password is invalid" | `src/company-admin/modules/auth/auth.controller.ts:62` |

## COMPANY_ADMIN_INVITE_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "A department is required for own department scoped admin invites" | `src/modules/companies/companies.service.ts:789` |

## COMPANY_ADMIN_MEMBER_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "A member department is required for own department scoped admins" | `src/company-admin/modules/admins/admins.controller.ts:52` |

## COMPANY_ADMIN_NOT_ASSIGNED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "No active company admin assignment was found for this account" | `src/company-admin/modules/auth/auth.controller.ts:96` |

## COMPANY_ADMIN_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company admin not found" | `src/company-admin/modules/admins/admins.controller.ts:350` |
| 404 / ApiError | "Company admin not found" | `src/modules/companies/companies.service.ts:1266` |

## COMPANY_ADMIN_SCOPE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "This company admin can only access assigned departments" | `src/company-admin/common/company-admin-scope.ts:85` |
| 403 / ApiError | "This company admin can only access assigned departments" | `src/company-admin/common/company-admin-scope.ts:93` |
| 403 / ApiError | "Company-wide scope is required" | `src/company-admin/common/require-company-admin-permission.ts:25` |
| 403 / ApiError | "Department scoped admins cannot create company-wide schedule targets" | `src/company-admin/modules/schedules/schedules.controller.ts:66` |
| 403 / ApiError | "This company admin can only access assigned departments" | `src/company-admin/modules/schedules/schedules.controller.ts:164` |
| 403 / ApiError | "Department is outside admin scope" | `src/modules/company-projects/company-project-presets.service.ts:74` |
| 403 / ApiError | "All project departments must be within admin scope for this mutation" | `src/modules/company-projects/company-project-write-access.ts:11` |
| 403 / ApiError | "No active departments are assigned" | `src/modules/company-projects/company-projects.service.ts:228` |
| 403 / ApiError | "Project is outside admin scope" | `src/modules/company-projects/company-projects.service.ts:258` |
| 403 / ApiError | "A department is required for scoped writes" | `src/modules/company-projects/company-projects.service.ts:279` |
| 403 / ApiError | "Department is outside admin scope" | `src/modules/company-projects/company-projects.service.ts:284` |
| 403 / ApiError | "Member is outside admin scope" | `src/modules/company-projects/company-projects.service.ts:387` |
| 403 / ApiError | "Scoped projects require an origin department" | `src/modules/company-projects/company-projects.service.ts:1396` |
| 403 / ApiError | "Assignee is outside admin scope" | `src/modules/company-projects/company-projects.service.ts:2173` |
| 403 / ApiError | "Assignee is outside admin scope" | `src/modules/company-projects/company-projects.service.ts:2280` |
| 403 / ApiError | "Full project audit history requires company scope" | `src/modules/company-projects/company-projects.service.ts:2659` |

## COMPANY_ADMIN_UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Company admin token is invalid or expired" | `src/company-admin/common/company-admin-auth.ts:80` |
| 401 / ApiError | "Company admin token is invalid or expired" | `src/company-admin/common/company-admin-authenticate.ts:18` |
| 401 / ApiError | "Admin assignment has changed" | `src/company-admin/common/company-admin-authenticate.ts:35` |
| 401 / ApiError | "Company admin token is invalid or expired" | `src/company-admin/common/company-admin-authenticate.ts:48` |
| 401 / ApiError | "Company admin token is invalid or expired" | `src/company-admin/common/company-admin-authenticate.ts:59` |

## COMPANY_API_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company API key not found" | `src/company-admin/modules/api-keys/api-keys.controller.ts:74` |
| 404 / ApiError | "Company API key not found" | `src/company-admin/modules/api-keys/api-keys.controller.ts:104` |

## COMPANY_INACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company is inactive" | `src/company-admin/common/company-admin-auth.ts:96` |
| 403 / ApiError | "Company is inactive" | `src/modules/companies/companies.service.ts:907` |
| 403 / ApiError | "Company or invitation role is unavailable" | `src/modules/companies/company-admin-invite.service.ts:17` |
| 403 / ApiError | "Company or department is inactive" | `src/modules/companies/member-invite-acceptance.ts:18` |
| 403 / ApiError | "Company is inactive" | `src/modules/company-schedule-approvals/withdraw-approval.ts:15` |

## COMPANY_INVITE_ALREADY_USED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invitation was already consumed" | `src/modules/companies/company-admin-invite.service.ts:42` |

## COMPANY_INVITE_EXPIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company invite has expired" | `src/modules/companies/companies.service.ts:1178` |
| 400 / ApiError | "Company invite has expired" | `src/modules/companies/companies.service.ts:1226` |
| 400 / ApiError | "Company invite has expired" | `src/modules/companies/companies.service.ts:1323` |

## COMPANY_INVITE_LOGIN_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "초대받은 이메일의 기존 Flowra 계정 비밀번호로 본인 확인이 필요합니다. 먼저 가입과 이메일 인증을 완료해 주세요." | `src/modules/companies/company-admin-invite.service.ts:24` |

## COMPANY_INVITE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company invite not found" | `src/modules/companies/companies.service.ts:1162` |
| 404 / ApiError | "Company invite not found" | `src/modules/companies/companies.service.ts:1210` |
| 404 / ApiError | "Company invite not found" | `src/modules/companies/companies.service.ts:1307` |
| 404 / ApiError | "Company invite not found" | `src/modules/companies/member-invite-acceptance.ts:17` |

## COMPANY_INVITE_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Accessible pending invitation not found" | `src/company-admin/modules/invites/invites.controller.ts:35` |
| 409 / ApiError | "Only pending or expired invitations can be resent" | `src/company-admin/modules/invites/invites.controller.ts:43` |
| 400 / ApiError | "Company invite is not pending" | `src/modules/companies/companies.service.ts:1166` |
| 400 / ApiError | "Company invite is not pending" | `src/modules/companies/companies.service.ts:1214` |
| 400 / ApiError | "Company invite is not pending" | `src/modules/companies/companies.service.ts:1311` |
| 400 / ApiError | "Invitation is invalid or expired" | `src/modules/companies/company-admin-invite.service.ts:14` |
| 409 / ApiError | "Invite was already decided or expired" | `src/modules/companies/member-invite-acceptance.ts:20` |
| 409 / ApiError | "No pending invitation for this user" | `src/modules/company-memberships/company-memberships.controller.ts:233` |

## COMPANY_INVITE_REVOKED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Administrator invitation is no longer valid" | `src/modules/companies/company-admin-invite.service.ts:33` |

## COMPANY_MEMBER_ALREADY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "User is already a company member or has a pending member record" | `src/modules/companies/companies.service.ts:951` |

## COMPANY_MEMBER_DEPARTMENT_CHANGED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Member department changed; request a new invitation" | `src/modules/companies/member-invite-acceptance.ts:28` |

## COMPANY_MEMBER_DEPARTMENT_MISMATCH

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invite an imported member to their existing department" | `src/modules/companies/companies.service.ts:959` |

## COMPANY_MEMBER_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company member must belong to a department" | `src/modules/company-projects/company-projects.service.ts:951` |
| 400 / ApiError | "Company member must belong to a department" | `src/modules/company-schedules/company-schedules.service.ts:216` |

## COMPANY_MEMBER_IDENTITY_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invitation member is linked to another account" | `src/modules/companies/company-admin-invite.service.ts:47` |
| 409 / ApiError | "Multiple matching member identities require administrator review" | `src/modules/companies/member-invite-acceptance.ts:24` |
| 409 / ApiError | "Invitation target changed; request a new invitation" | `src/modules/companies/member-invite-acceptance.ts:26` |
| 409 / ApiError | "Member identity cannot be reassigned" | `src/modules/companies/member-invite-acceptance.ts:27` |

## COMPANY_MEMBER_IDENTITY_IMMUTABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "A membership identity cannot be transferred to another account; use a new membership" | `src/admin/common/admin-error-middleware.ts:23` |
| 409 / ApiError | "A membership identity cannot be transferred to another account; use a new membership" | `src/common/http/error-middleware.ts:30` |
| 409 / ApiError | "Unlink the existing account and send a new invitation before changing identity" | `src/company-admin/modules/members/members.controller.ts:460` |
| 409 / ApiError | "Linked member email cannot be changed by organization synchronization" | `src/modules/companies/companies.service.ts:1433` |

## COMPANY_MEMBER_INVITE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company members must be invited by email and accepted by an existing Flowra user" | `src/company-admin/modules/members/members.controller.ts:429` |
| 403 / ApiError | "Account linking requires the user to accept a company invitation" | `src/company-admin/modules/members/members.controller.ts:507` |

## COMPANY_MEMBER_INVITE_USER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "No Flowra account exists for this email. The user must sign up first." | `src/modules/companies/companies.service.ts:924` |

## COMPANY_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company member not found" | `src/company-admin/modules/admins/admins.controller.ts:168` |
| 404 / ApiError | "Company member not found" | `src/company-admin/modules/departments/departments.controller.ts:67` |
| 404 / ApiError | "Company member not found" | `src/company-admin/modules/members/members.controller.ts:51` |
| 404 / ApiError | "Company member not found" | `src/company-admin/modules/members/members.controller.ts:350` |
| 404 / ApiError | "Company member not found" | `src/company-admin/modules/schedules/schedules.controller.ts:118` |
| 404 / ApiError | "Company member not found" | `src/modules/companies/companies.service.ts:223` |
| 404 / ApiError | "Company member not found" | `src/modules/company-memberships/company-memberships.controller.ts:169` |
| 404 / ApiError | "Company member not found" | `src/modules/company-projects/company-projects.service.ts:329` |

## COMPANY_MEMBER_USER_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "User is already linked to another company member" | `src/company-admin/modules/members/members.controller.ts:96` |

## COMPANY_MEMBER_USER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company admin must be assigned from a linked active member" | `src/company-admin/modules/admins/admins.controller.ts:172` |

## COMPANY_MEMBERSHIP_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Active company membership is required" | `src/modules/companies/companies.controller.ts:56` |
| 403 / ApiError | "Active company membership is required" | `src/modules/company-projects/company-projects.service.ts:94` |
| 403 / ApiError | "Active company membership is required" | `src/modules/company-schedules/company-schedules.service.ts:208` |

## COMPANY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "Company not found." | `src/admin/modules/notices/notices.controller.ts:100` |
| 404 / ApiError | "Company not found" | `src/company-admin/modules/settings/settings.controller.ts:36` |
| 404 / ApiError | "Company not found" | `src/modules/companies/companies.service.ts:183` |
| 404 / ApiError | "Company not found" | `src/modules/companies/companies.service.ts:644` |
| 404 / ApiError | "Company not found" | `src/modules/companies/companies.service.ts:763` |
| 404 / ApiError | "Company not found" | `src/modules/companies/companies.service.ts:903` |
| 404 / ApiError | "Company not found" | `src/modules/companies/companies.service.ts:1585` |

## COMPANY_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "At least one active company owner must remain" | `src/admin/common/admin-error-middleware.ts:20` |
| 409 / ApiError | "At least one active company owner must remain" | `src/common/http/error-middleware.ts:27` |
| 403 / ApiError | "Only company owners may delegate administrative authority" | `src/company-admin/common/require-company-admin-permission.ts:29` |
| 400 / ApiError | "At least one active owner must remain assigned to the company" | `src/company-admin/modules/admins/admins.controller.ts:423` |

## COMPANY_PERMISSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid company permission code" | `src/company-admin/modules/roles/roles.controller.ts:89` |
| 400 / ApiError | "Invalid company permission code" | `src/company-admin/modules/roles/roles.controller.ts:160` |

## COMPANY_PROJECT_CREATE_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Project creation is disabled for this department" | `src/modules/company-projects/company-projects.service.ts:985` |

## COMPANY_PROJECT_CREATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader can create projects for this department" | `src/modules/company-projects/company-projects.service.ts:995` |

## COMPANY_PROJECT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Project is not visible to this user" | `src/modules/company-projects/company-projects.service.ts:190` |

## COMPANY_PROJECT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company project not found" | `src/modules/company-projects/company-projects.service.ts:108` |
| 404 / ApiError | "Company project not found" | `src/modules/company-projects/company-projects.service.ts:222` |

## COMPANY_ROLE_IN_USE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company role is assigned to active admins and cannot be deleted" | `src/company-admin/modules/roles/roles.controller.ts:237` |

## COMPANY_ROLE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company role not found" | `src/company-admin/modules/admins/admins.controller.ts:191` |
| 404 / ApiError | "Company role not found" | `src/company-admin/modules/admins/admins.controller.ts:297` |
| 404 / ApiError | "Company role not found" | `src/company-admin/modules/admins/admins.controller.ts:377` |
| 404 / ApiError | "Company role not found" | `src/company-admin/modules/roles/roles.controller.ts:139` |
| 404 / ApiError | "Company role not found" | `src/company-admin/modules/roles/roles.controller.ts:229` |
| 404 / ApiError | "Company role not found" | `src/modules/companies/companies.service.ts:388` |
| 404 / ApiError | "Company role not found" | `src/modules/companies/companies.service.ts:782` |

## COMPANY_ROLE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Either role_code or company_role_id is required" | `src/modules/companies/companies.service.ts:742` |

## COMPANY_ROLE_SYSTEM_IMMUTABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "System roles cannot be modified" | `src/company-admin/modules/roles/roles.controller.ts:143` |
| 400 / ApiError | "System roles cannot be deleted" | `src/company-admin/modules/roles/roles.controller.ts:233` |

## COMPANY_SCHEDULE_APPROVAL_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Approval is not accessible" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:177` |
| 403 / ApiError | "Department is inactive" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:196` |
| 403 / ApiError | "Only a department leader, ancestor department leader, or approval delegate can decide this approval" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:210` |
| 403 / ApiError | "Only a department leader, ancestor department leader, or approval delegate can decide this approval" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:247` |

## COMPANY_SCHEDULE_APPROVAL_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Approval not found" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:320` |
| 404 / ApiError | "Approval not found" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:351` |
| 404 / ApiError | "Approval not found" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:417` |
| 404 / ApiError | "Requested approval not found" | `src/modules/company-schedule-approvals/withdraw-approval.ts:13` |

## COMPANY_SCHEDULE_APPROVAL_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only pending approvals can be approved" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:355` |
| 400 / ApiError | "Only pending approvals can be rejected" | `src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:421` |

## COMPANY_SCHEDULE_CREATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader can create schedules for this department" | `src/modules/company-schedules/company-schedules.service.ts:238` |
| 403 / ApiError | "Company-wide schedules can only be created by company admins" | `src/modules/company-schedules/company-schedules.service.ts:250` |
| 403 / ApiError | "Only department leaders can create company-wide schedules" | `src/modules/company-schedules/company-schedules.service.ts:258` |

## COMPANY_SCHEDULE_DELETE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader or original creator can delete this schedule" | `src/modules/company-schedules/company-schedules.service.ts:1014` |
| 403 / ApiError | "Only the origin department leader or original creator can delete this schedule" | `src/modules/company-schedules/company-schedules.service.ts:1061` |
| 403 / ApiError | "This department is not an active target of the schedule" | `src/modules/company-schedules/company-schedules.service.ts:1093` |

## COMPANY_SCHEDULE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company schedule is not visible" | `src/modules/company-schedules/company-schedules.service.ts:443` |

## COMPANY_SCHEDULE_MANAGED_BY_SYSTEM

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only user-created company schedules can be changed from the general API" | `src/modules/company-schedules/company-schedules.service.ts:459` |

## COMPANY_SCHEDULE_NOT_ACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only active schedules can be updated" | `src/modules/company-schedules/company-schedules.service.ts:908` |
| 400 / ApiError | "Only active schedules can be deleted" | `src/modules/company-schedules/company-schedules.service.ts:1004` |

## COMPANY_SCHEDULE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company schedule not found" | `src/company-admin/modules/schedules/schedules.controller.ts:350` |
| 404 / ApiError | "Company schedule not found" | `src/company-admin/modules/schedules/schedules.controller.ts:444` |
| 404 / ApiError | "Company schedule not found" | `src/company-admin/modules/schedules/schedules.controller.ts:550` |
| 404 / ApiError | "Company schedule not found" | `src/modules/companies/companies.service.ts:1729` |
| 404 / ApiError | "Company schedule not found" | `src/modules/company-schedules/company-schedules.service.ts:439` |
| 404 / ApiError | "Company schedule not found" | `src/modules/company-schedules/company-schedules.service.ts:783` |
| 404 / ApiError | "Company schedule not found" | `src/modules/company-schedules/company-schedules.service.ts:900` |
| 404 / ApiError | "Company schedule not found" | `src/modules/company-schedules/company-schedules.service.ts:995` |

## COMPANY_SCHEDULE_REQUEST_ALREADY_DECIDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "A decision already exists; this request cannot be withdrawn" | `src/modules/company-schedule-approvals/withdraw-approval.ts:19` |

## COMPANY_SCHEDULE_UPDATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the origin department leader or original creator can update collaboration schedules" | `src/modules/company-schedules/company-schedules.service.ts:923` |
| 403 / ApiError | "Only the department leader or original creator can update this schedule" | `src/modules/company-schedules/company-schedules.service.ts:963` |

## COMPANY_SYNC_LOG_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company sync log not found" | `src/company-admin/modules/sync-logs/sync-logs.controller.ts:102` |

## CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "Resource conflict." | `src/admin/common/admin-error-middleware.ts:12` |
| 409 / AdminApiError | "User is already linked to another company member." | `src/admin/modules/companies/companies.controller.ts:133` |
| 409 / AdminApiError | "Company member email is already linked to another user." | `src/admin/modules/companies/companies.controller.ts:653` |
| 409 / AdminApiError | "Company member email is already linked to another user." | `src/admin/modules/companies/companies.controller.ts:1384` |
| 409 / AdminApiError | "Session is already revoked." | `src/admin/modules/sessions/sessions.controller.ts:176` |

## DATABASE_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "Database operation failed" | `src/common/http/error-middleware.ts:19` |

## DEPARTMENT_CODE_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Department code already exists" | `src/company-admin/modules/departments/departments.controller.ts:95` |

## DEPARTMENT_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Department tree cannot contain cycles" | `src/company-admin/modules/departments/departments.controller.ts:153` |
| 400 / ApiError | "Department tree cannot contain cycles" | `src/company-admin/modules/departments/departments.controller.ts:158` |
| 400 / ApiError | "Department tree cannot contain cycles" | `src/modules/companies/companies.service.ts:239` |
| 400 / ApiError | "Department tree cannot contain cycles" | `src/modules/companies/companies.service.ts:244` |

## DEPARTMENT_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | `src/company-admin/modules/departments/departments.controller.ts:372` |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | `src/company-admin/modules/departments/departments.controller.ts:465` |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | `src/modules/companies/companies.service.ts:1359` |

## DEPARTMENT_EXTERNAL_ID_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "External department id already exists" | `src/company-admin/modules/departments/departments.controller.ts:113` |

## DEPARTMENT_INACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Invitation department is inactive" | `src/modules/companies/company-admin-invite.service.ts:36` |
| 403 / ApiError | "Member department is inactive" | `src/modules/company-projects/company-projects.service.ts:982` |
| 403 / ApiError | "Member department is inactive" | `src/modules/company-schedules/company-schedules.service.ts:224` |

## DEPARTMENT_LEADER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader or ancestor department leader can update approval delegate mode" | `src/modules/companies/companies.controller.ts:129` |
| 400 / ApiError | "Collaboration target departments must have a department leader" | `src/modules/company-schedules/company-schedules.service.ts:305` |

## DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Department not found" | `src/company-admin/modules/admins/admins.controller.ts:91` |
| 404 / ApiError | "Department not found" | `src/company-admin/modules/departments/departments.controller.ts:44` |
| 404 / ApiError | "Department not found" | `src/company-admin/modules/departments/departments.controller.ts:319` |
| 404 / ApiError | "Department not found" | `src/company-admin/modules/members/members.controller.ts:71` |
| 404 / ApiError | "Department not found" | `src/company-admin/modules/schedules/schedules.controller.ts:92` |
| 404 / ApiError | "Department not found" | `src/modules/companies/companies.controller.ts:327` |
| 404 / ApiError | "Department not found" | `src/modules/companies/companies.controller.ts:382` |
| 404 / ApiError | "Department not found" | `src/modules/companies/companies.service.ts:203` |
| 404 / ApiError | "Department not found" | `src/modules/companies/companies.service.ts:807` |
| 404 / ApiError | "Department not found" | `src/modules/companies/companies.service.ts:975` |
| 404 / ApiError | "One or more departments were not found" | `src/modules/company-projects/company-project-presets.service.ts:97` |
| 404 / ApiError | "One or more departments were not found" | `src/modules/company-projects/company-projects.service.ts:307` |
| 404 / ApiError | "Department not found" | `src/modules/company-projects/company-projects.service.ts:895` |
| 404 / ApiError | "One or more departments were not found" | `src/modules/company-schedules/company-schedules.service.ts:289` |

## DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Change request department is missing" | `src/modules/company-schedules/company-schedules.service.ts:1240` |

## DUPLICATE_RECURRENCE_EXCEPTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "weekday_rules cannot contain duplicated weekdays" | `src/common/utils/recurrence.ts:103` |

## EMAIL_ALREADY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Email is already registered" | `src/modules/auth/auth.service.ts:176` |

## EMAIL_NOT_VERIFIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Email verification is required" | `src/company-admin/modules/auth/auth.controller.ts:58` |
| 403 / ApiError | "Email verification is required" | `src/modules/auth/auth.service.ts:277` |
| 403 / ApiError | "Email verification is required" | `src/modules/companies/company-admin-invite.service.ts:28` |

## EMAIL_VERIFICATION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Verify your email before accepting an invitation" | `src/modules/companies/member-invite-acceptance.ts:12` |

## EMAIL_VERIFICATION_RESEND_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 429 / ApiError | "Verification email resend limit exceeded" | `src/modules/auth/auth.service.ts:145` |

## EMAIL_VERIFICATION_RESEND_TOO_SOON

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 429 / ApiError | "Verification email can be resent after 5 minutes" | `src/modules/auth/auth.service.ts:103` |

## FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / AdminApiError | "Admin does not have the required permission." | `src/admin/common/require-admin-permission.ts:12` |
| 403 / AdminApiError | "Super administrator authority is required." | `src/admin/common/require-admin-permission.ts:18` |
| 403 / AdminApiError | "System permission groups are immutable." | `src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:255` |
| 403 / AdminApiError | "Admin does not have access." | `src/admin/modules/auth/auth.controller.ts:42` |

## FRIEND_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend not found" | `src/modules/friends/friends.service.ts:102` |
| 404 / ApiError | "Friend not found" | `src/modules/friends/friends.service.ts:410` |
| 404 / ApiError | "Friend not found" | `src/modules/friends/friends.service.ts:510` |

## FRIEND_PRESET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend preset not found" | `src/modules/friends/friends.service.ts:488` |
| 404 / ApiError | "Friend preset not found" | `src/modules/friends/friends.service.ts:527` |
| 404 / ApiError | "Friend preset not found" | `src/modules/friends/friends.service.ts:547` |
| 404 / ApiError | "Friend preset not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:500` |

## FRIEND_REQUEST_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend request not found" | `src/modules/friends/friends.service.ts:338` |
| 404 / ApiError | "Friend request not found" | `src/modules/friends/friends.service.ts:373` |
| 404 / ApiError | "Friend request not found" | `src/modules/friends/friends.service.ts:395` |

## FRIEND_REQUEST_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Friend request is not pending" | `src/modules/friends/friends.service.ts:342` |
| 400 / ApiError | "Friend request is not pending" | `src/modules/friends/friends.service.ts:377` |
| 409 / ApiError | "Only pending outgoing requests can be cancelled" | `src/modules/friends/friends.service.ts:397` |

## FRIEND_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "All preset members must be accepted friends" | `src/modules/friends/friends.service.ts:158` |

## FRIEND_SELF_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "User cannot add themselves as a friend" | `src/modules/friends/friends.service.ts:267` |

## HOLIDAY_PROVIDER_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Holiday provider returned an error" | `src/modules/holidays/holidays.service.ts:91` |

## HOLIDAY_PROVIDER_NOT_CONFIGURED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "KASI holiday service key is not configured" | `src/modules/holidays/holidays.service.ts:105` |

## HOLIDAY_PROVIDER_UNAVAILABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Holiday provider request failed" | `src/modules/holidays/holidays.service.ts:121` |
| 502 / ApiError | "Holiday provider response could not be parsed" | `src/modules/holidays/holidays.service.ts:141` |

## INSUFFICIENT_AI_CHAT_DATA

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule action requires start_datetime" | `src/modules/ai-chat/ai-chat.service.ts:402` |
| 400 / ApiError | "No suggested actions are available" | `src/modules/ai-chat/ai-chat.service.ts:1046` |

## INSUFFICIENT_AI_DATA

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule action requires start_datetime" | `src/modules/ai/ai.service.ts:672` |
| 400 / ApiError | "No suggested actions are available" | `src/modules/ai/ai.service.ts:1014` |

## INTERNAL_SERVER_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / AdminApiError | "Failed to check admin API IP restriction." | `src/admin/common/admin-api-ip-allowlist.ts:28` |
| 500 / AdminApiError | "Internal server error." | `src/admin/common/admin-error-middleware.ts:14` |

## INVALID_ASSIGNMENT_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "ends_at must be after starts_at" | `src/modules/company-projects/company-projects.service.ts:2180` |
| 400 / ApiError | "ends_at must be after starts_at" | `src/modules/company-projects/company-projects.service.ts:2291` |

## INVALID_CATEGORY_TYPE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Category must be of type ${expected_type}` | `src/modules/categories/categories.service.ts:27` |

## INVALID_CREDENTIALS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Email or password is invalid" | `src/modules/auth/auth.service.ts:263` |
| 401 / ApiError | "Email or password is invalid" | `src/modules/auth/auth.service.ts:273` |

## INVALID_CURSOR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid pagination cursor" | `src/modules/ai-chat/ai-chat-pages.ts:9` |
| 400 / ApiError | "Session cursor is no longer available; refresh the list" | `src/modules/ai-chat/ai-chat-pages.ts:16` |
| 400 / ApiError | "Message cursor is no longer available; refresh the list" | `src/modules/ai-chat/ai-chat-pages.ts:32` |

## INVALID_DATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "date must be YYYY-MM-DD" | `src/common/utils/date.ts:172` |
| 400 / ApiError | "date must be a valid calendar day" | `src/common/utils/date.ts:177` |
| 400 / ApiError | "date must be a valid calendar day" | `src/common/utils/date.ts:184` |
| 400 / ApiError | "date must be YYYY-MM-DD" | `src/common/utils/date.ts:219` |
| 400 / ApiError | "date must be a valid calendar day" | `src/common/utils/date.ts:224` |
| 400 / ApiError | "date must be a valid calendar day" | `src/common/utils/date.ts:245` |
| 400 / ApiError | `${field_name} must be a valid YYYY-MM-DD date` | `src/modules/holidays/holidays.service.ts:34` |

## INVALID_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end_date must be after or equal to start_date" | `src/modules/holidays/holidays.service.ts:192` |

## INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "recurrence datetimes must be valid ISO datetimes" | `src/common/utils/recurrence.ts:183` |
| 400 / ApiError | "end_datetime must be a valid ISO datetime" | `src/common/utils/recurrence.ts:187` |
| 400 / ApiError | `${field_name} must be a valid ISO datetime` | `src/company-admin/modules/schedules/schedules.controller.ts:40` |
| 400 / ApiError | "start_datetime must be a valid ISO datetime" | `src/modules/companies/companies.service.ts:465` |
| 400 / ApiError | "end_datetime must be a valid ISO datetime" | `src/modules/companies/companies.service.ts:469` |
| 400 / ApiError | `${field_name} must be a valid ISO datetime` | `src/modules/company-schedules/company-schedules.service.ts:143` |

## INVALID_EMAIL

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Email is required" | `src/modules/companies/companies.service.ts:739` |
| 400 / ApiError | "Email is required" | `src/modules/companies/companies.service.ts:886` |

## INVALID_EMAIL_TOKEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Invalid email token" | `src/modules/auth/auth.service.ts:437` |
| 401 / ApiError | "Invalid email token" | `src/modules/auth/auth.service.ts:628` |
| 401 / ApiError | "Invalid or expired email token" | `src/modules/auth/email-verification.service.ts:125` |

## INVALID_FRIEND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "User cannot target themselves" | `src/modules/friends/friends.service.ts:129` |

## INVALID_ID

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `${field_name} must be a positive integer` | `src/common/utils/ids.ts:7` |

## INVALID_PARENT_DEPARTMENT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Parent department not found" | `src/company-admin/modules/departments/departments.controller.ts:173` |
| 400 / ApiError | "A department cannot be its own parent" | `src/company-admin/modules/departments/departments.controller.ts:426` |
| 400 / ApiError | "Parent department not found" | `src/modules/companies/companies.service.ts:259` |
| 400 / ApiError | "A department cannot be its own parent" | `src/modules/companies/companies.service.ts:1337` |

## INVALID_PROJECT_ASSIGNMENT_STATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "completed_at can only be set when status is done" | `src/modules/company-projects/company-projects.service.ts:53` |

## INVALID_PROJECT_DEPENDENCY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Dependency cannot reference itself" | `src/modules/company-projects/company-projects.service.ts:548` |
| 400 / ApiError | "Dependency cannot reference itself" | `src/modules/company-projects/company-projects.service.ts:2403` |

## INVALID_PROJECT_LIST_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "to must be after from." | `src/admin/modules/company-projects/company-projects.controller.ts:80` |

## INVALID_PROJECT_WORK_ITEM_PARENT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Work item cannot be its own parent" | `src/modules/company-projects/company-projects.service.ts:1813` |
| 400 / ApiError | "Work item cannot be moved under its descendant" | `src/modules/company-projects/company-projects.service.ts:1818` |

## INVALID_RECURRENCE_EXCEPTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "excluded_dates must be YYYY-MM-DD" | `src/common/utils/recurrence.ts:85` |
| 400 / ApiError | "excluded_dates must be valid dates" | `src/common/utils/recurrence.ts:95` |
| 400 / ApiError | "weekday_rules create an adjustment loop" | `src/common/utils/recurrence.ts:147` |
| 400 / ApiError | "weekday_rules exceeded maximum adjustment steps" | `src/common/utils/recurrence.ts:161` |

## INVALID_RECURRENCE_INTERVAL

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "repeat_interval_days must be a positive integer" | `src/common/utils/recurrence.ts:203` |

## INVALID_RECURRENCE_LIMIT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "max_occurrences must be between 1 and 500" | `src/common/utils/recurrence.ts:211` |

## INVALID_RECURRENCE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "repeat_until must be after or equal to start_datetime" | `src/common/utils/recurrence.ts:195` |

## INVALID_REFRESH_TOKEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Invalid or expired refresh token" | `src/modules/auth/auth.service.ts:327` |
| 401 / ApiError | "Invalid refresh token payload" | `src/modules/auth/auth.service.ts:331` |
| 401 / ApiError | "Refresh token was revoked or not found" | `src/modules/auth/auth.service.ts:348` |
| 401 / ApiError | "User not available for token refresh" | `src/modules/auth/auth.service.ts:357` |
| 401 / ApiError | "User not available for token refresh" | `src/modules/auth/auth.service.ts:362` |
| 401 / ApiError | "Refresh token was already consumed" | `src/modules/auth/auth.service.ts:370` |

## INVALID_SCHEDULE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/common/utils/recurrence.ts:191` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/company-admin/modules/schedules/schedules.controller.ts:47` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/modules/ai/ai.service.ts:677` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/modules/ai-chat/ai-chat.service.ts:407` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/modules/companies/companies.service.ts:473` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/modules/company-schedules/company-schedules.service.ts:156` |
| 400 / ApiError | "End must not precede start" | `src/modules/schedules/schedule-series.service.ts:81` |
| 400 / ApiError | "end_datetime must be after start_datetime" | `src/modules/schedules/schedules.service.ts:15` |

## INVALID_TASK_STATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "completed_at can only be set when status is done" | `src/modules/tasks/tasks.service.ts:16` |

## INVALID_TIMEZONE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "timezone must be a valid IANA timezone" | `src/common/utils/date.ts:146` |
| 400 / ApiError | "timezone must be a valid IANA timezone" | `src/common/utils/date.ts:208` |
| 400 / ApiError | "timezone must be a valid IANA timezone" | `src/common/utils/recurrence.ts:179` |
| 400 / ApiError | "timezone must be a valid IANA timezone" | `src/company-admin/modules/settings/settings.controller.ts:67` |
| 400 / ApiError | "recurrence timezone must be a valid IANA timezone" | `src/modules/ai/ai.service.ts:722` |
| 400 / ApiError | "recurrence timezone must be a valid IANA timezone" | `src/modules/ai-chat/ai-chat.service.ts:449` |

## IP_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / AdminApiError | "Admin API IP restriction is enabled but no IP ranges are configured." | `src/admin/common/admin-api-ip-allowlist.ts:17` |
| 403 / AdminApiError | "This IP is not allowed to access the admin API." | `src/admin/common/admin-api-ip-allowlist.ts:22` |

## LAST_SUPER_ADMIN_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "At least one active super administrator must remain." | `src/admin/modules/admin-users/admin-users.controller.ts:249` |

## MEMO_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Memo not found" | `src/modules/ai/ai.service.ts:947` |
| 404 / ApiError | "Memo not found" | `src/modules/ai/ai.service.ts:986` |
| 404 / ApiError | "Memo not found" | `src/modules/memos/memos.service.ts:52` |
| 404 / ApiError | "Memo not found" | `src/modules/memos/memos.service.ts:131` |
| 404 / ApiError | "Memo not found" | `src/modules/memos/memos.service.ts:204` |

## MEMO_PARSE_NOT_CLAIMABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Memo parse is not queued or is already processing" | `src/modules/ai/memo-parse-job-state.ts:21` |

## MEMO_PARSE_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "Only pending memos can be forced into the parse queue." | `src/admin/modules/memos/memos.controller.ts:191` |

## MEMO_PARSE_SUPERSEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Memo was edited, deleted, or parsing was restarted" | `src/modules/ai/ai.service.ts:882` |

## NO_APPLICABLE_AI_ACTIONS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "No schedulable or task actions are available" | `src/modules/ai/ai.service.ts:1019` |

## NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Resource not found." | `src/admin/common/admin-error-middleware.ts:10` |
| 404 / AdminApiError | "Admin permission group not found." | `src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:161` |
| 404 / AdminApiError | "Admin permission group not found." | `src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:252` |
| 404 / AdminApiError | "Admin user not found." | `src/admin/modules/admin-users/admin-users.controller.ts:136` |
| 404 / AdminApiError | "Admin user not found." | `src/admin/modules/admin-users/admin-users.controller.ts:229` |
| 404 / AdminApiError | "AI chat session not found." | `src/admin/modules/ai-chat/ai-chat.controller.ts:148` |
| 404 / AdminApiError | "AI parse result not found." | `src/admin/modules/ai-parse-results/ai-parse-results.controller.ts:30` |
| 404 / AdminApiError | "AI parse result not found." | `src/admin/modules/ai-parse-results/ai-parse-results.controller.ts:145` |
| 404 / AdminApiError | "Company not found." | `src/admin/modules/companies/companies.controller.ts:86` |
| 404 / AdminApiError | "Department not found." | `src/admin/modules/companies/companies.controller.ts:108` |
| 404 / AdminApiError | "Company not found." | `src/admin/modules/companies/companies.controller.ts:319` |
| 404 / AdminApiError | "Company not found." | `src/admin/modules/companies/companies.controller.ts:514` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/companies/companies.controller.ts:628` |
| 404 / AdminApiError | "Company member not found." | `src/admin/modules/companies/companies.controller.ts:752` |
| 404 / AdminApiError | "Company invite not found." | `src/admin/modules/companies/companies.controller.ts:862` |
| 404 / AdminApiError | "Company not found." | `src/admin/modules/companies/companies.controller.ts:932` |
| 404 / AdminApiError | "Company role not found." | `src/admin/modules/companies/companies.controller.ts:1017` |
| 404 / AdminApiError | "Company role not found." | `src/admin/modules/companies/companies.controller.ts:1124` |
| 404 / AdminApiError | "Company admin not found." | `src/admin/modules/companies/companies.controller.ts:1232` |
| 404 / AdminApiError | "Company role not found." | `src/admin/modules/companies/companies.controller.ts:1251` |
| 404 / AdminApiError | "Company API key not found." | `src/admin/modules/companies/companies.controller.ts:1631` |
| 404 / AdminApiError | "Company API key not found." | `src/admin/modules/companies/companies.controller.ts:1680` |
| 404 / AdminApiError | "Company project not found." | `src/admin/modules/company-projects/company-projects.controller.ts:32` |
| 404 / AdminApiError | "Memo not found." | `src/admin/modules/memos/memos.controller.ts:39` |
| 404 / AdminApiError | "Memo not found." | `src/admin/modules/memos/memos.controller.ts:153` |
| 404 / AdminApiError | "Memo not found." | `src/admin/modules/memos/memos.controller.ts:187` |
| 404 / AdminApiError | "Schedule not found." | `src/admin/modules/schedules/schedules.controller.ts:115` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/sessions/sessions.controller.ts:134` |
| 404 / AdminApiError | "Session not found." | `src/admin/modules/sessions/sessions.controller.ts:173` |
| 404 / AdminApiError | "Task not found." | `src/admin/modules/tasks/tasks.controller.ts:128` |
| 404 / AdminApiError | "Resource not found." | `src/admin/modules/terminal/terminal.controller.ts:137` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:449` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:501` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:622` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:777` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:817` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:893` |
| 404 / AdminApiError | "User not found." | `src/admin/modules/users/users.controller.ts:972` |
| 404 / AdminApiError | "Resource not found." | `src/admin/routes.ts:63` |

## NOTICE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Notice not found." | `src/admin/modules/notices/notices.controller.ts:171` |
| 404 / AdminApiError | "Notice not found." | `src/admin/modules/notices/notices.controller.ts:252` |
| 404 / AdminApiError | "Notice not found." | `src/admin/modules/notices/notices.controller.ts:339` |
| 404 / ApiError | "Notice not found" | `src/modules/notices/notices.service.ts:90` |

## NOTIFICATION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Notification not found" | `src/modules/notifications/notifications.service.ts:105` |

## OPENAI_CHAT_EMPTY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned no chat response" | `src/modules/ai-chat/openai-ai-chat.service.ts:446` |

## OPENAI_CHAT_INVALID_ACTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Schedule action requires start_datetime" | `src/modules/ai-chat/openai-ai-chat.service.ts:319` |
| 502 / ApiError | "Task action cannot include start_datetime" | `src/modules/ai-chat/openai-ai-chat.service.ts:327` |
| 502 / ApiError | "Task action cannot include end_datetime" | `src/modules/ai-chat/openai-ai-chat.service.ts:331` |

## OPENAI_CHAT_INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `Invalid datetime returned: ${value}` | `src/modules/ai-chat/openai-ai-chat.service.ts:306` |

## OPENAI_CHAT_INVALID_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned schedule end before start" | `src/modules/ai-chat/openai-ai-chat.service.ts:323` |

## OPENAI_NOT_CONFIGURED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 503 / ApiError | "OPENAI_API_KEY is required for AI features" | `src/lib/openai.ts:10` |

## OPENAI_PARSE_EMPTY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned no structured parse result" | `src/modules/ai/openai-memo-parser.service.ts:783` |
| 502 / ApiError | "OpenAI returned no structured parse result" | `src/modules/ai/openai-memo-parser.service.ts:839` |

## OPENAI_PARSE_INVALID_ACTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Schedule action requires start_datetime" | `src/modules/ai/openai-memo-parser.service.ts:620` |
| 502 / ApiError | "Task action cannot include start_datetime" | `src/modules/ai/openai-memo-parser.service.ts:628` |
| 502 / ApiError | "Task action cannot include end_datetime" | `src/modules/ai/openai-memo-parser.service.ts:632` |

## OPENAI_PARSE_INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `Invalid datetime returned: ${value}` | `src/modules/ai/openai-memo-parser.service.ts:551` |
| 502 / ApiError | "Task action returned invalid due_datetime" | `src/modules/ai/openai-memo-parser.service.ts:636` |

## OPENAI_PARSE_INVALID_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned schedule end before start" | `src/modules/ai/openai-memo-parser.service.ts:624` |
| 502 / ApiError | "OpenAI returned end_datetime earlier than start_datetime" | `src/modules/ai/openai-memo-parser.service.ts:693` |

## OPENAI_PARSE_INVALID_RECURRENCE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `AI returned recurrence conditions that cannot be applied: ${invalid_recurrence.cause_code}` | `src/modules/ai/openai-memo-parser.service.ts:721` |

## ORG_API_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | `Missing required scope: ${scope}` | `src/modules/org-api/org-api-auth.ts:101` |

## ORG_API_IP_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "This IP is not allowed for the organization API key" | `src/modules/org-api/org-api-auth.ts:66` |

## ORG_API_UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Organization API key is required" | `src/modules/org-api/org-api-auth.ts:23` |
| 401 / ApiError | "Organization API key is invalid" | `src/modules/org-api/org-api-auth.ts:52` |
| 401 / ApiError | "Organization API key has expired" | `src/modules/org-api/org-api-auth.ts:57` |
| 401 / ApiError | "Organization API key is invalid" | `src/modules/org-api/org-api-auth.ts:92` |

## ORG_PROJECT_DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Department not found: ${key}` | `src/modules/company-projects/company-projects.service.ts:3736` |

## ORG_PROJECT_DEPENDENCY_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Dependency work item not found" | `src/modules/company-projects/company-projects.service.ts:4143` |

## ORG_PROJECT_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Member not found: ${key}` | `src/modules/company-projects/company-projects.service.ts:3757` |

## ORG_PROJECT_ORIGIN_DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Origin department not found" | `src/modules/company-projects/company-projects.service.ts:3716` |

## ORG_PROJECT_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more parent work items could not be resolved" | `src/modules/company-projects/company-projects.service.ts:4127` |

## ORG_PROJECT_PHASE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Phase not found: ${item_input.external_phase_id.trim()}` | `src/modules/company-projects/company-projects.service.ts:3968` |

## ORG_PROJECT_PHASELESS_WITH_PHASES

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Phase-less projects cannot include phases or phase references" | `src/modules/company-projects/company-projects.service.ts:3699` |

## ORIGIN_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule origin department is missing" | `src/modules/company-schedules/company-schedules.service.ts:918` |

## PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Parent work item not found" | `src/modules/company-projects/company-projects.service.ts:464` |

## PROJECT_ASSIGNMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the assignee can update this assignment" | `src/modules/company-projects/company-projects.service.ts:3336` |
| 403 / ApiError | "Only the assignee can create reminders" | `src/modules/company-projects/company-projects.service.ts:3429` |

## PROJECT_ASSIGNMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project assignment not found" | `src/modules/company-projects/company-projects.service.ts:2252` |
| 404 / ApiError | "Project assignment not found" | `src/modules/company-projects/company-projects.service.ts:3325` |
| 404 / ApiError | "Project assignment not found" | `src/modules/company-projects/company-projects.service.ts:3415` |

## PROJECT_DEPENDENCY_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Project dependency creates a cycle" | `src/modules/company-projects/company-projects.service.ts:560` |
| 400 / ApiError | "Project dependency creates a cycle" | `src/modules/company-projects/company-projects.service.ts:2446` |

## PROJECT_DEPENDENCY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Project dependency already exists" | `src/modules/company-projects/company-projects.service.ts:2420` |

## PROJECT_DEPENDENCY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project dependency not found" | `src/modules/company-projects/company-projects.service.ts:2504` |

## PROJECT_LAST_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Add another owner before removing or demoting the last owner" | `src/modules/company-projects/project-member-lifecycle.ts:14` |

## PROJECT_MANAGEMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | owner_only ? "Project owner role required" : "Project owner or manager role required" | `src/modules/company-projects/project-management-access.ts:11` |
| 403 / ApiError | "Active project owner required" | `src/modules/company-projects/project-member-lifecycle.ts:9` |

## PROJECT_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project member not found" | `src/modules/company-projects/company-projects.service.ts:1288` |
| 404 / ApiError | "Project member not found" | `src/modules/company-projects/company-projects.service.ts:1351` |

## PROJECT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project not found" | `src/modules/company-projects/project-management-access.ts:7` |

## PROJECT_ORIGIN_DEPARTMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Users can create projects only for their own department" | `src/modules/company-projects/company-projects.service.ts:962` |

## PROJECT_PHASE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project phase not found" | `src/modules/company-projects/company-projects.service.ts:1521` |
| 404 / ApiError | "Project phase not found" | `src/modules/company-projects/company-projects.service.ts:1604` |
| 404 / ApiError | "Project phase not found" | `src/modules/company-projects/company-projects.service.ts:1675` |
| 404 / ApiError | "Project phase not found" | `src/modules/company-projects/company-projects.service.ts:1776` |

## PROJECT_PHASELESS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Phase-less projects cannot add phases" | `src/modules/company-projects/company-projects.service.ts:1480` |
| 400 / ApiError | "Phase-less project work items cannot use phase" | `src/modules/company-projects/company-projects.service.ts:1667` |
| 400 / ApiError | "Phase-less project work items cannot use phase" | `src/modules/company-projects/company-projects.service.ts:1765` |

## PROJECT_PRESET_COPY_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work items could not be copied" | `src/modules/company-projects/company-project-presets.service.ts:639` |

## PROJECT_PRESET_DEPENDENCY_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency creates a cycle" | `src/modules/company-projects/company-project-presets.service.ts:157` |

## PROJECT_PRESET_DEPENDENCY_SELF_REFERENCE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency cannot reference itself" | `src/modules/company-projects/company-project-presets.service.ts:331` |

## PROJECT_PRESET_DEPENDENCY_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency work item key not found" | `src/modules/company-projects/company-project-presets.service.ts:328` |

## PROJECT_PRESET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project preset not found" | `src/modules/company-projects/company-project-presets.service.ts:111` |

## PROJECT_PRESET_PARENT_WORK_ITEM_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work item keys could not be resolved" | `src/modules/company-projects/company-project-presets.service.ts:315` |

## PROJECT_PRESET_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work items could not be resolved" | `src/modules/company-projects/company-project-presets.service.ts:912` |

## PROJECT_PRESET_PHASE_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset phase key not found" | `src/modules/company-projects/company-project-presets.service.ts:267` |

## PROJECT_PRESET_VERSION_ARCHIVED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Archived preset versions cannot create projects" | `src/modules/company-projects/company-project-presets.service.ts:779` |

## PROJECT_PRESET_VERSION_NOT_DRAFT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only draft preset versions can be edited" | `src/modules/company-projects/company-project-presets.service.ts:697` |

## PROJECT_PRESET_VERSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project preset version not found" | `src/modules/company-projects/company-project-presets.service.ts:124` |

## PROJECT_PRESET_VERSION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Project preset has no version" | `src/modules/company-projects/company-project-presets.service.ts:776` |

## PROJECT_PRESET_WORK_ITEM_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset work item depth cannot exceed 5" | `src/modules/company-projects/company-project-presets.service.ts:274` |

## PROJECT_WORK_ASSIGNMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work assignment not found" | `src/modules/reminders/reminders.service.ts:52` |

## PROJECT_WORK_ITEM_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Work item depth cannot exceed 5" | `src/modules/company-projects/company-projects.service.ts:468` |
| 400 / ApiError | "Work item depth cannot exceed 5" | `src/modules/company-projects/company-projects.service.ts:504` |

## PROJECT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work item not found" | `src/modules/company-projects/company-projects.service.ts:404` |
| 404 / ApiError | "Project work item not found" | `src/modules/company-projects/company-projects.service.ts:3440` |
| 404 / ApiError | "Project work item not found" | `src/modules/reminders/reminders.service.ts:67` |

## PROJECT_WORK_REMINDER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work reminder not found" | `src/modules/company-projects/company-projects.service.ts:3542` |

## PROJECT_WORK_REMINDER_TARGET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project reminder target not found" | `src/modules/reminders/reminders.service.ts:37` |

## PUBLIC_UID_GENERATION_FAILED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "Could not generate a unique public UID" | `src/common/utils/ids.ts:30` |

## PUSH_DEVICE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Push device not found." | `src/admin/modules/push-notifications/push-notifications.controller.ts:260` |
| 404 / ApiError | "Push device not found" | `src/modules/push/push-devices.service.ts:114` |
| 404 / ApiError | "Push device not found" | `src/modules/push/push-devices.service.ts:141` |

## RECURRENCE_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Recurring schedule would create too many occurrences" | `src/common/utils/recurrence.ts:258` |

## RECURRENCE_OCCURRENCE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Recurring schedule must create at least one occurrence" | `src/common/utils/recurrence.ts:276` |
| 400 / ApiError | "Recurrence must produce at least one occurrence" | `src/modules/schedules/schedule-series.service.ts:60` |

## REMINDER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Reminder not found" | `src/modules/reminders/reminders.service.ts:238` |
| 404 / ApiError | "Reminder not found" | `src/modules/reminders/reminders.service.ts:305` |
| 404 / ApiError | "Reminder not found" | `src/modules/reminders/reminders.service.ts:376` |

## RESOURCE_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Resource already exists" | `src/common/http/error-middleware.ts:13` |

## RESOURCE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Resource not found" | `src/common/http/error-middleware.ts:17` |

## ROUTE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Route not found" | `src/app.ts:46` |

## SCHEDULE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:58` |
| 404 / ApiError | "Owned schedule not found" | `src/modules/schedules/schedule-series.service.ts:12` |
| 404 / ApiError | "Schedule not found" | `src/modules/schedules/schedules.service.ts:65` |
| 404 / ApiError | "Schedule not found" | `src/modules/schedules/schedules.service.ts:125` |
| 404 / ApiError | "Schedule not found" | `src/modules/schedules/schedules.service.ts:150` |
| 404 / ApiError | "Schedule not found" | `src/modules/schedules/schedules.service.ts:321` |
| 404 / ApiError | "Schedule not found" | `src/modules/schedules/schedules.service.ts:340` |

## SCHEDULE_NOT_RECURRING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule is not part of a recurring series" | `src/modules/schedules/schedule-series.service.ts:13` |

## SCHEDULE_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the owner can change category or visibility" | `src/modules/schedules/schedules.service.ts:345` |

## SCHEDULE_SERIES_CHANGED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Series changed; refresh before retrying" | `src/modules/schedules/schedule-series.service.ts:18` |

## SCHEDULE_SHARE_LINK_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 410 / ApiError | "Schedule share link is disabled" | `src/modules/schedule-sharing/schedule-sharing.service.ts:90` |

## SCHEDULE_SHARE_LINK_EXPIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 410 / ApiError | "Schedule share link is expired" | `src/modules/schedule-sharing/schedule-sharing.service.ts:94` |

## SCHEDULE_SHARE_LINK_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule share link not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:187` |
| 404 / ApiError | "Schedule share link not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:240` |
| 404 / ApiError | "Schedule share link not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:271` |

## SCHEDULE_SHARE_LINK_USED_UP

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Schedule share link has reached its max uses" | `src/modules/schedule-sharing/schedule-sharing.service.ts:98` |
| 409 / ApiError | "Schedule share link has reached its max uses" | `src/modules/schedule-sharing/schedule-sharing.service.ts:329` |

## SCHEDULE_SHARE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule share not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:388` |
| 404 / ApiError | "Schedule share not found" | `src/modules/schedule-sharing/schedule-sharing.service.ts:447` |

## SCHEDULE_SHARE_OWNER_CANNOT_JOIN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule owner cannot join their own share link" | `src/modules/schedule-sharing/schedule-sharing.service.ts:277` |

## SCHEDULE_TARGET_NOT_APPLICABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "schedule_id can only be used with task actions" | `src/modules/ai-chat/ai-chat.service.ts:1089` |

## SCHEDULE_TARGET_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "At least one schedule target is required" | `src/company-admin/modules/schedules/schedules.controller.ts:130` |
| 400 / ApiError | "At least one schedule target is required" | `src/modules/companies/companies.service.ts:428` |

## SCHEDULE_TARGET_TYPE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "target_type is required when target_id is provided" | `src/company-admin/modules/schedules/schedules.controller.ts:191` |

## SERIES_LINKED_DATA_CONFIRMATION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Removed occurrences have linked tasks, shares, or reminders; set confirm_remove_linked=true" | `src/modules/schedules/schedule-series.service.ts:28` |

## SESSION_REVOKED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Session is invalid or expired" | `src/common/auth/sessions.ts:23` |

## SIGNUP_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Signup is currently disabled" | `src/common/signup-settings.ts:77` |

## SIGNUP_DOMAIN_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Email domain is not allowed for signup" | `src/common/signup-settings.ts:86` |

## TASK_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Task not found" | `src/modules/tasks/tasks.service.ts:37` |
| 404 / ApiError | "Task not found" | `src/modules/tasks/tasks.service.ts:106` |
| 404 / ApiError | "Task not found" | `src/modules/tasks/tasks.service.ts:197` |

## UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / AdminApiError | "Admin token is invalid or expired." | `src/admin/common/admin-auth.ts:56` |
| 401 / AdminApiError | "Admin token is invalid or expired." | `src/admin/common/admin-authenticate.ts:10` |
| 401 / AdminApiError | "Admin token is invalid or expired." | `src/admin/common/admin-authenticate.ts:32` |
| 401 / AdminApiError | "Admin token is invalid or expired." | `src/admin/common/admin-authenticate.ts:39` |
| 401 / AdminApiError | "Admin email or password is invalid." | `src/admin/modules/auth/auth.controller.ts:38` |
| 401 / AdminApiError | "Admin token is invalid or expired." | `src/admin/modules/auth/auth.controller.ts:99` |
| 401 / ApiError | "Access token is required" | `src/common/middleware/authenticate.ts:13` |
| 401 / ApiError | "User no longer exists" | `src/common/middleware/authenticate.ts:34` |
| 401 / ApiError | "Invalid or expired access token" | `src/common/middleware/authenticate.ts:50` |

## USER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "User not found." | `src/admin/modules/push-notifications/push-notifications.controller.ts:217` |
| 404 / ApiError | "User not found" | `src/modules/ai-chat/ai-chat.service.ts:582` |
| 404 / ApiError | "User not found" | `src/modules/companies/companies.service.ts:667` |
| 404 / ApiError | "User not found" | `src/modules/companies/companies.service.ts:1056` |
| 404 / ApiError | "User not found" | `src/modules/companies/companies.service.ts:1127` |
| 404 / ApiError | "User not found" | `src/modules/companies/member-invite-acceptance.ts:9` |
| 404 / ApiError | "User not found" | `src/modules/friends/friends.service.ts:257` |
| 404 / ApiError | "User not found" | `src/modules/home/home.service.ts:553` |
| 404 / ApiError | "User not found" | `src/modules/schedules/schedules.service.ts:217` |
| 404 / ApiError | "User not found" | `src/modules/users/users.service.ts:14` |
| 404 / ApiError | "User not found" | `src/modules/users/users.service.ts:61` |

## USER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "A Flowra user account is required to activate a company admin without invite acceptance." | `src/admin/modules/companies/companies.controller.ts:1357` |

## VALIDATION_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid status" | `src/modules/org-api/org-api.controller.ts:32` |
| 400 / ApiError | "Invalid status" | `src/modules/org-api/org-api.controller.ts:51` |
| 400 / ApiError | "Invalid linked" | `src/modules/org-api/org-api.controller.ts:54` |

## 式: access_issue.code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | access_issue.message | `src/admin/modules/companies/companies.controller.ts:633` |
| 400 / AdminApiError | access_issue.message | `src/admin/modules/companies/companies.controller.ts:782` |
| 400 / AdminApiError | access_issue.message | `src/admin/modules/companies/companies.controller.ts:1366` |
| 403 / ApiError | access_issue.message | `src/common/middleware/authenticate.ts:40` |
| 403 / ApiError | access_issue.message | `src/company-admin/modules/auth/auth.controller.ts:55` |
| 403 / ApiError | access_issue.message | `src/modules/auth/auth.service.ts:268` |
| 403 / ApiError | access_issue.message | `src/modules/auth/auth.service.ts:450` |
| 400 / ApiError | access_issue.message | `src/modules/companies/companies.service.ts:672` |
| 400 / ApiError | access_issue.message | `src/modules/companies/companies.service.ts:933` |
| 400 / ApiError | access_issue.message | `src/modules/companies/companies.service.ts:1061` |
| 400 / ApiError | access_issue.message | `src/modules/companies/companies.service.ts:1132` |

## 式: code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | message | `src/modules/company-projects/company-project-presets.service.ts:136` |

## 式: error_code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end date must be after start date" | `src/modules/company-projects/company-projects.service.ts:74` |

## 式: exists ? "MEMO_PARSE_IN_PROGRESS" : "MEMO_NOT_FOUND"

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| exists ? 409 : 404 / ApiError | exists ? "Memo parsing is already in progress" : "Memo not found" | `src/modules/ai/ai.service.ts:837` |

## 式: issue.code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | issue.message | `src/modules/companies/company-admin-invite.service.ts:27` |
| 403 / ApiError | issue.message | `src/modules/companies/member-invite-acceptance.ts:11` |
