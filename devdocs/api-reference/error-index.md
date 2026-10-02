# 오류 발생 지점 색인

[문서 입구](../../docs/README.md) · [공통 디버깅](debugging-guide.md)

소스의 `new ApiError(...)` / `new AdminApiError(...)`를 AST로 추출한 검색용 색인이다. `node devdocs/tools/generate-api-reference.cjs`로 재생성한다. 직접 수정하지 않는다.

## 해석 주의

- 아래 status/message는 **생성 시점 값**이다. 인증 catch, 관리자 오류 middleware 등이 다른 오류로 변환할 수 있으므로 모든 코드가 그대로 HTTP 응답에 나온다는 뜻은 아니다.
- 동적 식은 그대로 표시한다. 오류 발생 조건은 링크의 if/조회/권한 검사 및 상위 catch에서 확인한다. 같은 코드도 여러 원인이 있다.
- Zod 오류는 일반/기업/조직에서 `VALIDATION_ERROR`, 시스템 관리자에서 `BAD_REQUEST`로 매핑된다. 오류 생성자가 아닌 직접 JSON 응답·외부 프록시 오류는 자동 추출 대상이 아니다.
- 4xx라고 항상 프론트 책임은 아니다. 서버가 저장한 AI 제안의 의미 오류도 400이 될 수 있다. 재시도 여부는 공통 가이드와 영역별 문서에서 판단한다.

## ACTION_INDEX_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "action_index is required for apply_type action" | [src/modules/ai/ai.service.ts:346](../../src/modules/ai/ai.service.ts#L346) |
| 400 / ApiError | "action_index is required for apply_type action" | [src/modules/ai-chat/ai-chat.service.ts:296](../../src/modules/ai-chat/ai-chat.service.ts#L296) |

## AI_ACTION_NOT_APPLICABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Pending item cannot be applied directly" | [src/modules/ai/ai.service.ts:354](../../src/modules/ai/ai.service.ts#L354) |
| 400 / ApiError | "Pending item cannot be applied directly" | [src/modules/ai/ai.service.ts:372](../../src/modules/ai/ai.service.ts#L372) |

## AI_ACTION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI suggested action not found" | [src/modules/ai/ai.service.ts:351](../../src/modules/ai/ai.service.ts#L351) |
| 404 / ApiError | `No ${payload.apply_type} action available` | [src/modules/ai/ai.service.ts:367](../../src/modules/ai/ai.service.ts#L367) |

## AI_CHAT_ACTION_ALREADY_APPLIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "AI chat action was already applied" | [src/modules/ai-chat/ai-chat.service.ts:388](../../src/modules/ai-chat/ai-chat.service.ts#L388) |

## AI_CHAT_ACTION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat suggested action not found" | [src/modules/ai-chat/ai-chat.service.ts:301](../../src/modules/ai-chat/ai-chat.service.ts#L301) |
| 404 / ApiError | `No ${payload.apply_type} action available` | [src/modules/ai-chat/ai-chat.service.ts:314](../../src/modules/ai-chat/ai-chat.service.ts#L314) |

## AI_CHAT_MESSAGE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat assistant message not found" | [src/modules/ai-chat/ai-chat.service.ts:1036](../../src/modules/ai-chat/ai-chat.service.ts#L1036) |

## AI_CHAT_SESSION_ARCHIVED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Archived session cannot be modified" | [src/modules/ai-chat/ai-chat-session-lifecycle.ts:21](../../src/modules/ai-chat/ai-chat-session-lifecycle.ts#L21) |
| 409 / ApiError | "Archived AI chat session cannot receive messages" | [src/modules/ai-chat/ai-chat.service.ts:871](../../src/modules/ai-chat/ai-chat.service.ts#L871) |
| 409 / ApiError | "Archived AI chat action cannot be applied" | [src/modules/ai-chat/ai-chat.service.ts:1040](../../src/modules/ai-chat/ai-chat.service.ts#L1040) |

## AI_CHAT_SESSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "AI chat session not found" | [src/modules/ai-chat/ai-chat-pages.ts:29](../../src/modules/ai-chat/ai-chat-pages.ts#L29) |
| 404 / ApiError | "AI chat session not found" | [src/modules/ai-chat/ai-chat-session-lifecycle.ts:19](../../src/modules/ai-chat/ai-chat-session-lifecycle.ts#L19) |
| 404 / ApiError | "AI chat session not found" | [src/modules/ai-chat/ai-chat.service.ts:564](../../src/modules/ai-chat/ai-chat.service.ts#L564) |

## AI_RESULT_ALREADY_APPLIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "AI action was already applied" | [src/modules/ai/ai.service.ts:655](../../src/modules/ai/ai.service.ts#L655) |

## AI_RESULT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "No parse result available for this memo" | [src/modules/ai/ai.service.ts:992](../../src/modules/ai/ai.service.ts#L992) |
| 404 / ApiError | "AI parse result not found" | [src/modules/ai/ai.service.ts:1004](../../src/modules/ai/ai.service.ts#L1004) |

## AI_RESULT_REJECTED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Rejected parse result cannot be applied" | [src/modules/ai/ai.service.ts:1008](../../src/modules/ai/ai.service.ts#L1008) |

## AMBIGUOUS_CATEGORY_TARGET

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "category_id cannot be used when applying both schedule and task actions" | [src/modules/ai/ai.service.ts:1042](../../src/modules/ai/ai.service.ts#L1042) |
| 400 / ApiError | "category_id cannot be used when applying both schedule and task actions" | [src/modules/ai-chat/ai-chat.service.ts:1071](../../src/modules/ai-chat/ai-chat.service.ts#L1071) |

## APPROVAL_DELEGATE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | [src/company-admin/modules/departments/departments.controller.ts:363](../../src/company-admin/modules/departments/departments.controller.ts#L363) |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | [src/company-admin/modules/departments/departments.controller.ts:518](../../src/company-admin/modules/departments/departments.controller.ts#L518) |
| 400 / ApiError | "Approval delegate is required to enable approval delegate mode" | [src/modules/companies/companies.controller.ts:395](../../src/modules/companies/companies.controller.ts#L395) |

## BAD_REQUEST

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | `${field_name} must be a positive integer.` | [src/admin/common/admin-query.ts:5](../../src/admin/common/admin-query.ts#L5) |
| 400 / AdminApiError | "Query value must be a positive integer." | [src/admin/common/admin-query.ts:17](../../src/admin/common/admin-query.ts#L17) |
| 400 / AdminApiError | "One or more permission_codes are invalid." | [src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:34](../../src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts#L34) |
| 400 / AdminApiError | "One or more group_codes are invalid." | [src/admin/modules/admin-users/admin-users.controller.ts:36](../../src/admin/modules/admin-users/admin-users.controller.ts#L36) |
| 400 / AdminApiError | "Current password is incorrect." | [src/admin/modules/auth/auth.controller.ts:108](../../src/admin/modules/auth/auth.controller.ts#L108) |
| 400 / AdminApiError | "Invalid company permission code." | [src/admin/modules/companies/companies.controller.ts:948](../../src/admin/modules/companies/companies.controller.ts#L948) |
| 400 / AdminApiError | "System company roles cannot be modified." | [src/admin/modules/companies/companies.controller.ts:1021](../../src/admin/modules/companies/companies.controller.ts#L1021) |
| 400 / AdminApiError | "Invalid company permission code." | [src/admin/modules/companies/companies.controller.ts:1039](../../src/admin/modules/companies/companies.controller.ts#L1039) |
| 400 / AdminApiError | "System company roles cannot be deleted." | [src/admin/modules/companies/companies.controller.ts:1128](../../src/admin/modules/companies/companies.controller.ts#L1128) |
| 400 / AdminApiError | "Company role is assigned and cannot be deleted." | [src/admin/modules/companies/companies.controller.ts:1132](../../src/admin/modules/companies/companies.controller.ts#L1132) |
| 400 / AdminApiError | "A department is required for own department scoped company admins." | [src/admin/modules/companies/companies.controller.ts:1289](../../src/admin/modules/companies/companies.controller.ts#L1289) |
| 400 / AdminApiError | "At least one active owner must remain." | [src/admin/modules/companies/companies.controller.ts:1312](../../src/admin/modules/companies/companies.controller.ts#L1312) |
| 400 / AdminApiError | "Action is not allowed for this service." | [src/admin/modules/developer/developer.controller.ts:286](../../src/admin/modules/developer/developer.controller.ts#L286) |
| 400 / AdminApiError | "Company notices require company_id." | [src/admin/modules/notices/notices.controller.ts:276](../../src/admin/modules/notices/notices.controller.ts#L276) |
| 400 / AdminApiError | "publish_end_at must be after publish_start_at." | [src/admin/modules/notices/notices.controller.ts:284](../../src/admin/modules/notices/notices.controller.ts#L284) |
| 400 / AdminApiError | "Working directory must be inside the workspace." | [src/admin/modules/terminal/terminal.controller.ts:33](../../src/admin/modules/terminal/terminal.controller.ts#L33) |
| 400 / AdminApiError | "banned_until must be a valid future datetime." | [src/admin/modules/users/users.controller.ts:679](../../src/admin/modules/users/users.controller.ts#L679) |
| 400 / AdminApiError | "Verification email is only available for local accounts." | [src/admin/modules/users/users.controller.ts:901](../../src/admin/modules/users/users.controller.ts#L901) |
| 400 / AdminApiError | "User email is already verified." | [src/admin/modules/users/users.controller.ts:909](../../src/admin/modules/users/users.controller.ts#L909) |
| 400 / AdminApiError | "Password reset link is only available for local accounts." | [src/admin/modules/users/users.controller.ts:980](../../src/admin/modules/users/users.controller.ts#L980) |
| 400 / ApiError | "Password reset is only available for local accounts" | [src/modules/auth/auth.service.ts:595](../../src/modules/auth/auth.service.ts#L595) |

## BULK_DELETE_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | `Bulk delete is limited to ${BULK_DELETE_USER_LIMIT} users per request.` | [src/admin/modules/users/users.controller.ts:346](../../src/admin/modules/users/users.controller.ts#L346) |

## CATEGORY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Category not found" | [src/modules/categories/categories.service.ts:26](../../src/modules/categories/categories.service.ts#L26) |
| 404 / ApiError | "Category not found" | [src/modules/categories/categories.service.ts:63](../../src/modules/categories/categories.service.ts#L63) |
| 404 / ApiError | "Category not found" | [src/modules/categories/categories.service.ts:125](../../src/modules/categories/categories.service.ts#L125) |
| 404 / ApiError | "Category not found" | [src/modules/categories/categories.service.ts:165](../../src/modules/categories/categories.service.ts#L165) |
| 404 / ApiError | "Owned schedule category not found" | [src/modules/schedules/schedule-series.service.ts:44](../../src/modules/schedules/schedule-series.service.ts#L44) |

## CHANGE_REQUEST_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Approval does not have a change request" | [src/modules/company-schedules/company-schedules.service.ts:1206](../../src/modules/company-schedules/company-schedules.service.ts#L1206) |

## COMPANY_ADMIN_COMPANY_SELECTION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Multiple company admin assignments were found. Select a company to continue" | [src/company-admin/modules/auth/auth.controller.ts:104](../../src/company-admin/modules/auth/auth.controller.ts#L104) |

## COMPANY_ADMIN_DEPARTMENT_SCOPE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "At least one department is required for department scoped admins" | [src/company-admin/modules/admins/admins.controller.ts:71](../../src/company-admin/modules/admins/admins.controller.ts#L71) |

## COMPANY_ADMIN_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company admin does not have the required permission" | [src/company-admin/common/require-company-admin-permission.ts:14](../../src/company-admin/common/require-company-admin-permission.ts#L14) |
| 403 / ApiError | "Company admin does not have the required permission" | [src/company-admin/modules/admins/admins.controller.ts:358](../../src/company-admin/modules/admins/admins.controller.ts#L358) |

## COMPANY_ADMIN_INACTIVE_MEMBERSHIP

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Active verified account and matching company membership are required" | [src/company-admin/common/company-admin-auth.ts:92](../../src/company-admin/common/company-admin-auth.ts#L92) |

## COMPANY_ADMIN_INVALID_CREDENTIALS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Email or password is invalid" | [src/company-admin/modules/auth/auth.controller.ts:46](../../src/company-admin/modules/auth/auth.controller.ts#L46) |
| 401 / ApiError | "Email or password is invalid" | [src/company-admin/modules/auth/auth.controller.ts:62](../../src/company-admin/modules/auth/auth.controller.ts#L62) |

## COMPANY_ADMIN_INVITE_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "A department is required for own department scoped admin invites" | [src/modules/companies/companies.service.ts:789](../../src/modules/companies/companies.service.ts#L789) |

## COMPANY_ADMIN_MEMBER_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "A member department is required for own department scoped admins" | [src/company-admin/modules/admins/admins.controller.ts:52](../../src/company-admin/modules/admins/admins.controller.ts#L52) |

## COMPANY_ADMIN_NOT_ASSIGNED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "No active company admin assignment was found for this account" | [src/company-admin/modules/auth/auth.controller.ts:96](../../src/company-admin/modules/auth/auth.controller.ts#L96) |

## COMPANY_ADMIN_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company admin not found" | [src/company-admin/modules/admins/admins.controller.ts:350](../../src/company-admin/modules/admins/admins.controller.ts#L350) |
| 404 / ApiError | "Company admin not found" | [src/modules/companies/companies.service.ts:1266](../../src/modules/companies/companies.service.ts#L1266) |

## COMPANY_ADMIN_SCOPE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "This company admin can only access assigned departments" | [src/company-admin/common/company-admin-scope.ts:85](../../src/company-admin/common/company-admin-scope.ts#L85) |
| 403 / ApiError | "This company admin can only access assigned departments" | [src/company-admin/common/company-admin-scope.ts:93](../../src/company-admin/common/company-admin-scope.ts#L93) |
| 403 / ApiError | "Company-wide scope is required" | [src/company-admin/common/require-company-admin-permission.ts:25](../../src/company-admin/common/require-company-admin-permission.ts#L25) |
| 403 / ApiError | "Department scoped admins cannot create company-wide schedule targets" | [src/company-admin/modules/schedules/schedules.controller.ts:66](../../src/company-admin/modules/schedules/schedules.controller.ts#L66) |
| 403 / ApiError | "This company admin can only access assigned departments" | [src/company-admin/modules/schedules/schedules.controller.ts:164](../../src/company-admin/modules/schedules/schedules.controller.ts#L164) |
| 403 / ApiError | "Department is outside admin scope" | [src/modules/company-projects/company-project-presets.service.ts:74](../../src/modules/company-projects/company-project-presets.service.ts#L74) |
| 403 / ApiError | "All project departments must be within admin scope for this mutation" | [src/modules/company-projects/company-project-write-access.ts:11](../../src/modules/company-projects/company-project-write-access.ts#L11) |
| 403 / ApiError | "No active departments are assigned" | [src/modules/company-projects/company-projects.service.ts:228](../../src/modules/company-projects/company-projects.service.ts#L228) |
| 403 / ApiError | "Project is outside admin scope" | [src/modules/company-projects/company-projects.service.ts:258](../../src/modules/company-projects/company-projects.service.ts#L258) |
| 403 / ApiError | "A department is required for scoped writes" | [src/modules/company-projects/company-projects.service.ts:279](../../src/modules/company-projects/company-projects.service.ts#L279) |
| 403 / ApiError | "Department is outside admin scope" | [src/modules/company-projects/company-projects.service.ts:284](../../src/modules/company-projects/company-projects.service.ts#L284) |
| 403 / ApiError | "Member is outside admin scope" | [src/modules/company-projects/company-projects.service.ts:387](../../src/modules/company-projects/company-projects.service.ts#L387) |
| 403 / ApiError | "Scoped projects require an origin department" | [src/modules/company-projects/company-projects.service.ts:1396](../../src/modules/company-projects/company-projects.service.ts#L1396) |
| 403 / ApiError | "Assignee is outside admin scope" | [src/modules/company-projects/company-projects.service.ts:2173](../../src/modules/company-projects/company-projects.service.ts#L2173) |
| 403 / ApiError | "Assignee is outside admin scope" | [src/modules/company-projects/company-projects.service.ts:2280](../../src/modules/company-projects/company-projects.service.ts#L2280) |
| 403 / ApiError | "Full project audit history requires company scope" | [src/modules/company-projects/company-projects.service.ts:2659](../../src/modules/company-projects/company-projects.service.ts#L2659) |

## COMPANY_ADMIN_UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Company admin token is invalid or expired" | [src/company-admin/common/company-admin-auth.ts:80](../../src/company-admin/common/company-admin-auth.ts#L80) |
| 401 / ApiError | "Company admin token is invalid or expired" | [src/company-admin/common/company-admin-authenticate.ts:18](../../src/company-admin/common/company-admin-authenticate.ts#L18) |
| 401 / ApiError | "Admin assignment has changed" | [src/company-admin/common/company-admin-authenticate.ts:35](../../src/company-admin/common/company-admin-authenticate.ts#L35) |
| 401 / ApiError | "Company admin token is invalid or expired" | [src/company-admin/common/company-admin-authenticate.ts:48](../../src/company-admin/common/company-admin-authenticate.ts#L48) |
| 401 / ApiError | "Company admin token is invalid or expired" | [src/company-admin/common/company-admin-authenticate.ts:59](../../src/company-admin/common/company-admin-authenticate.ts#L59) |

## COMPANY_API_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company API key not found" | [src/company-admin/modules/api-keys/api-keys.controller.ts:74](../../src/company-admin/modules/api-keys/api-keys.controller.ts#L74) |
| 404 / ApiError | "Company API key not found" | [src/company-admin/modules/api-keys/api-keys.controller.ts:104](../../src/company-admin/modules/api-keys/api-keys.controller.ts#L104) |

## COMPANY_INACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company is inactive" | [src/company-admin/common/company-admin-auth.ts:96](../../src/company-admin/common/company-admin-auth.ts#L96) |
| 403 / ApiError | "Company is inactive" | [src/modules/companies/companies.service.ts:907](../../src/modules/companies/companies.service.ts#L907) |
| 403 / ApiError | "Company or invitation role is unavailable" | [src/modules/companies/company-admin-invite.service.ts:17](../../src/modules/companies/company-admin-invite.service.ts#L17) |
| 403 / ApiError | "Company or department is inactive" | [src/modules/companies/member-invite-acceptance.ts:18](../../src/modules/companies/member-invite-acceptance.ts#L18) |
| 403 / ApiError | "Company is inactive" | [src/modules/company-schedule-approvals/withdraw-approval.ts:15](../../src/modules/company-schedule-approvals/withdraw-approval.ts#L15) |

## COMPANY_INVITE_ALREADY_USED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invitation was already consumed" | [src/modules/companies/company-admin-invite.service.ts:42](../../src/modules/companies/company-admin-invite.service.ts#L42) |

## COMPANY_INVITE_EXPIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company invite has expired" | [src/modules/companies/companies.service.ts:1178](../../src/modules/companies/companies.service.ts#L1178) |
| 400 / ApiError | "Company invite has expired" | [src/modules/companies/companies.service.ts:1226](../../src/modules/companies/companies.service.ts#L1226) |
| 400 / ApiError | "Company invite has expired" | [src/modules/companies/companies.service.ts:1323](../../src/modules/companies/companies.service.ts#L1323) |

## COMPANY_INVITE_LOGIN_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "초대받은 이메일의 기존 Flowra 계정 비밀번호로 본인 확인이 필요합니다. 먼저 가입과 이메일 인증을 완료해 주세요." | [src/modules/companies/company-admin-invite.service.ts:24](../../src/modules/companies/company-admin-invite.service.ts#L24) |

## COMPANY_INVITE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company invite not found" | [src/modules/companies/companies.service.ts:1162](../../src/modules/companies/companies.service.ts#L1162) |
| 404 / ApiError | "Company invite not found" | [src/modules/companies/companies.service.ts:1210](../../src/modules/companies/companies.service.ts#L1210) |
| 404 / ApiError | "Company invite not found" | [src/modules/companies/companies.service.ts:1307](../../src/modules/companies/companies.service.ts#L1307) |
| 404 / ApiError | "Company invite not found" | [src/modules/companies/member-invite-acceptance.ts:17](../../src/modules/companies/member-invite-acceptance.ts#L17) |

## COMPANY_INVITE_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Accessible pending invitation not found" | [src/company-admin/modules/invites/invites.controller.ts:35](../../src/company-admin/modules/invites/invites.controller.ts#L35) |
| 409 / ApiError | "Only pending or expired invitations can be resent" | [src/company-admin/modules/invites/invites.controller.ts:43](../../src/company-admin/modules/invites/invites.controller.ts#L43) |
| 400 / ApiError | "Company invite is not pending" | [src/modules/companies/companies.service.ts:1166](../../src/modules/companies/companies.service.ts#L1166) |
| 400 / ApiError | "Company invite is not pending" | [src/modules/companies/companies.service.ts:1214](../../src/modules/companies/companies.service.ts#L1214) |
| 400 / ApiError | "Company invite is not pending" | [src/modules/companies/companies.service.ts:1311](../../src/modules/companies/companies.service.ts#L1311) |
| 400 / ApiError | "Invitation is invalid or expired" | [src/modules/companies/company-admin-invite.service.ts:14](../../src/modules/companies/company-admin-invite.service.ts#L14) |
| 409 / ApiError | "Invite was already decided or expired" | [src/modules/companies/member-invite-acceptance.ts:20](../../src/modules/companies/member-invite-acceptance.ts#L20) |
| 409 / ApiError | "No pending invitation for this user" | [src/modules/company-memberships/company-memberships.controller.ts:233](../../src/modules/company-memberships/company-memberships.controller.ts#L233) |

## COMPANY_INVITE_REVOKED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Administrator invitation is no longer valid" | [src/modules/companies/company-admin-invite.service.ts:33](../../src/modules/companies/company-admin-invite.service.ts#L33) |

## COMPANY_MEMBER_ALREADY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "User is already a company member or has a pending member record" | [src/modules/companies/companies.service.ts:951](../../src/modules/companies/companies.service.ts#L951) |

## COMPANY_MEMBER_DEPARTMENT_CHANGED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Member department changed; request a new invitation" | [src/modules/companies/member-invite-acceptance.ts:28](../../src/modules/companies/member-invite-acceptance.ts#L28) |

## COMPANY_MEMBER_DEPARTMENT_MISMATCH

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invite an imported member to their existing department" | [src/modules/companies/companies.service.ts:959](../../src/modules/companies/companies.service.ts#L959) |

## COMPANY_MEMBER_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company member must belong to a department" | [src/modules/company-projects/company-projects.service.ts:951](../../src/modules/company-projects/company-projects.service.ts#L951) |
| 400 / ApiError | "Company member must belong to a department" | [src/modules/company-schedules/company-schedules.service.ts:216](../../src/modules/company-schedules/company-schedules.service.ts#L216) |

## COMPANY_MEMBER_IDENTITY_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Invitation member is linked to another account" | [src/modules/companies/company-admin-invite.service.ts:47](../../src/modules/companies/company-admin-invite.service.ts#L47) |
| 409 / ApiError | "Multiple matching member identities require administrator review" | [src/modules/companies/member-invite-acceptance.ts:24](../../src/modules/companies/member-invite-acceptance.ts#L24) |
| 409 / ApiError | "Invitation target changed; request a new invitation" | [src/modules/companies/member-invite-acceptance.ts:26](../../src/modules/companies/member-invite-acceptance.ts#L26) |
| 409 / ApiError | "Member identity cannot be reassigned" | [src/modules/companies/member-invite-acceptance.ts:27](../../src/modules/companies/member-invite-acceptance.ts#L27) |

## COMPANY_MEMBER_IDENTITY_IMMUTABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "A membership identity cannot be transferred to another account; use a new membership" | [src/admin/common/admin-error-middleware.ts:23](../../src/admin/common/admin-error-middleware.ts#L23) |
| 409 / ApiError | "A membership identity cannot be transferred to another account; use a new membership" | [src/common/http/error-middleware.ts:30](../../src/common/http/error-middleware.ts#L30) |
| 409 / ApiError | "Unlink the existing account and send a new invitation before changing identity" | [src/company-admin/modules/members/members.controller.ts:460](../../src/company-admin/modules/members/members.controller.ts#L460) |
| 409 / ApiError | "Linked member email cannot be changed by organization synchronization" | [src/modules/companies/companies.service.ts:1433](../../src/modules/companies/companies.service.ts#L1433) |

## COMPANY_MEMBER_INVITE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company members must be invited by email and accepted by an existing Flowra user" | [src/company-admin/modules/members/members.controller.ts:429](../../src/company-admin/modules/members/members.controller.ts#L429) |
| 403 / ApiError | "Account linking requires the user to accept a company invitation" | [src/company-admin/modules/members/members.controller.ts:507](../../src/company-admin/modules/members/members.controller.ts#L507) |

## COMPANY_MEMBER_INVITE_USER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "No Flowra account exists for this email. The user must sign up first." | [src/modules/companies/companies.service.ts:924](../../src/modules/companies/companies.service.ts#L924) |

## COMPANY_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company member not found" | [src/company-admin/modules/admins/admins.controller.ts:168](../../src/company-admin/modules/admins/admins.controller.ts#L168) |
| 404 / ApiError | "Company member not found" | [src/company-admin/modules/departments/departments.controller.ts:67](../../src/company-admin/modules/departments/departments.controller.ts#L67) |
| 404 / ApiError | "Company member not found" | [src/company-admin/modules/members/members.controller.ts:51](../../src/company-admin/modules/members/members.controller.ts#L51) |
| 404 / ApiError | "Company member not found" | [src/company-admin/modules/members/members.controller.ts:350](../../src/company-admin/modules/members/members.controller.ts#L350) |
| 404 / ApiError | "Company member not found" | [src/company-admin/modules/schedules/schedules.controller.ts:118](../../src/company-admin/modules/schedules/schedules.controller.ts#L118) |
| 404 / ApiError | "Company member not found" | [src/modules/companies/companies.service.ts:223](../../src/modules/companies/companies.service.ts#L223) |
| 404 / ApiError | "Company member not found" | [src/modules/company-memberships/company-memberships.controller.ts:169](../../src/modules/company-memberships/company-memberships.controller.ts#L169) |
| 404 / ApiError | "Company member not found" | [src/modules/company-projects/company-projects.service.ts:329](../../src/modules/company-projects/company-projects.service.ts#L329) |

## COMPANY_MEMBER_USER_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "User is already linked to another company member" | [src/company-admin/modules/members/members.controller.ts:96](../../src/company-admin/modules/members/members.controller.ts#L96) |

## COMPANY_MEMBER_USER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company admin must be assigned from a linked active member" | [src/company-admin/modules/admins/admins.controller.ts:172](../../src/company-admin/modules/admins/admins.controller.ts#L172) |

## COMPANY_MEMBERSHIP_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Active company membership is required" | [src/modules/companies/companies.controller.ts:56](../../src/modules/companies/companies.controller.ts#L56) |
| 403 / ApiError | "Active company membership is required" | [src/modules/company-projects/company-projects.service.ts:94](../../src/modules/company-projects/company-projects.service.ts#L94) |
| 403 / ApiError | "Active company membership is required" | [src/modules/company-schedules/company-schedules.service.ts:208](../../src/modules/company-schedules/company-schedules.service.ts#L208) |

## COMPANY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "Company not found." | [src/admin/modules/notices/notices.controller.ts:100](../../src/admin/modules/notices/notices.controller.ts#L100) |
| 404 / ApiError | "Company not found" | [src/company-admin/modules/settings/settings.controller.ts:36](../../src/company-admin/modules/settings/settings.controller.ts#L36) |
| 404 / ApiError | "Company not found" | [src/modules/companies/companies.service.ts:183](../../src/modules/companies/companies.service.ts#L183) |
| 404 / ApiError | "Company not found" | [src/modules/companies/companies.service.ts:644](../../src/modules/companies/companies.service.ts#L644) |
| 404 / ApiError | "Company not found" | [src/modules/companies/companies.service.ts:763](../../src/modules/companies/companies.service.ts#L763) |
| 404 / ApiError | "Company not found" | [src/modules/companies/companies.service.ts:903](../../src/modules/companies/companies.service.ts#L903) |
| 404 / ApiError | "Company not found" | [src/modules/companies/companies.service.ts:1585](../../src/modules/companies/companies.service.ts#L1585) |

## COMPANY_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "At least one active company owner must remain" | [src/admin/common/admin-error-middleware.ts:20](../../src/admin/common/admin-error-middleware.ts#L20) |
| 409 / ApiError | "At least one active company owner must remain" | [src/common/http/error-middleware.ts:27](../../src/common/http/error-middleware.ts#L27) |
| 403 / ApiError | "Only company owners may delegate administrative authority" | [src/company-admin/common/require-company-admin-permission.ts:29](../../src/company-admin/common/require-company-admin-permission.ts#L29) |
| 400 / ApiError | "At least one active owner must remain assigned to the company" | [src/company-admin/modules/admins/admins.controller.ts:423](../../src/company-admin/modules/admins/admins.controller.ts#L423) |

## COMPANY_PERMISSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid company permission code" | [src/company-admin/modules/roles/roles.controller.ts:89](../../src/company-admin/modules/roles/roles.controller.ts#L89) |
| 400 / ApiError | "Invalid company permission code" | [src/company-admin/modules/roles/roles.controller.ts:160](../../src/company-admin/modules/roles/roles.controller.ts#L160) |

## COMPANY_PROJECT_CREATE_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Project creation is disabled for this department" | [src/modules/company-projects/company-projects.service.ts:985](../../src/modules/company-projects/company-projects.service.ts#L985) |

## COMPANY_PROJECT_CREATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader can create projects for this department" | [src/modules/company-projects/company-projects.service.ts:995](../../src/modules/company-projects/company-projects.service.ts#L995) |

## COMPANY_PROJECT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Project is not visible to this user" | [src/modules/company-projects/company-projects.service.ts:190](../../src/modules/company-projects/company-projects.service.ts#L190) |

## COMPANY_PROJECT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company project not found" | [src/modules/company-projects/company-projects.service.ts:108](../../src/modules/company-projects/company-projects.service.ts#L108) |
| 404 / ApiError | "Company project not found" | [src/modules/company-projects/company-projects.service.ts:222](../../src/modules/company-projects/company-projects.service.ts#L222) |

## COMPANY_ROLE_IN_USE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Company role is assigned to active admins and cannot be deleted" | [src/company-admin/modules/roles/roles.controller.ts:237](../../src/company-admin/modules/roles/roles.controller.ts#L237) |

## COMPANY_ROLE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company role not found" | [src/company-admin/modules/admins/admins.controller.ts:191](../../src/company-admin/modules/admins/admins.controller.ts#L191) |
| 404 / ApiError | "Company role not found" | [src/company-admin/modules/admins/admins.controller.ts:297](../../src/company-admin/modules/admins/admins.controller.ts#L297) |
| 404 / ApiError | "Company role not found" | [src/company-admin/modules/admins/admins.controller.ts:377](../../src/company-admin/modules/admins/admins.controller.ts#L377) |
| 404 / ApiError | "Company role not found" | [src/company-admin/modules/roles/roles.controller.ts:139](../../src/company-admin/modules/roles/roles.controller.ts#L139) |
| 404 / ApiError | "Company role not found" | [src/company-admin/modules/roles/roles.controller.ts:229](../../src/company-admin/modules/roles/roles.controller.ts#L229) |
| 404 / ApiError | "Company role not found" | [src/modules/companies/companies.service.ts:388](../../src/modules/companies/companies.service.ts#L388) |
| 404 / ApiError | "Company role not found" | [src/modules/companies/companies.service.ts:782](../../src/modules/companies/companies.service.ts#L782) |

## COMPANY_ROLE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Either role_code or company_role_id is required" | [src/modules/companies/companies.service.ts:742](../../src/modules/companies/companies.service.ts#L742) |

## COMPANY_ROLE_SYSTEM_IMMUTABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "System roles cannot be modified" | [src/company-admin/modules/roles/roles.controller.ts:143](../../src/company-admin/modules/roles/roles.controller.ts#L143) |
| 400 / ApiError | "System roles cannot be deleted" | [src/company-admin/modules/roles/roles.controller.ts:233](../../src/company-admin/modules/roles/roles.controller.ts#L233) |

## COMPANY_SCHEDULE_APPROVAL_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Approval is not accessible" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:177](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L177) |
| 403 / ApiError | "Department is inactive" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:196](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L196) |
| 403 / ApiError | "Only a department leader, ancestor department leader, or approval delegate can decide this approval" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:210](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L210) |
| 403 / ApiError | "Only a department leader, ancestor department leader, or approval delegate can decide this approval" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:247](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L247) |

## COMPANY_SCHEDULE_APPROVAL_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Approval not found" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:320](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L320) |
| 404 / ApiError | "Approval not found" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:351](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L351) |
| 404 / ApiError | "Approval not found" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:417](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L417) |
| 404 / ApiError | "Requested approval not found" | [src/modules/company-schedule-approvals/withdraw-approval.ts:13](../../src/modules/company-schedule-approvals/withdraw-approval.ts#L13) |

## COMPANY_SCHEDULE_APPROVAL_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only pending approvals can be approved" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:355](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L355) |
| 400 / ApiError | "Only pending approvals can be rejected" | [src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts:421](../../src/modules/company-schedule-approvals/company-schedule-approvals.controller.ts#L421) |

## COMPANY_SCHEDULE_CREATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader can create schedules for this department" | [src/modules/company-schedules/company-schedules.service.ts:238](../../src/modules/company-schedules/company-schedules.service.ts#L238) |
| 403 / ApiError | "Company-wide schedules can only be created by company admins" | [src/modules/company-schedules/company-schedules.service.ts:250](../../src/modules/company-schedules/company-schedules.service.ts#L250) |
| 403 / ApiError | "Only department leaders can create company-wide schedules" | [src/modules/company-schedules/company-schedules.service.ts:258](../../src/modules/company-schedules/company-schedules.service.ts#L258) |

## COMPANY_SCHEDULE_DELETE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader or original creator can delete this schedule" | [src/modules/company-schedules/company-schedules.service.ts:1014](../../src/modules/company-schedules/company-schedules.service.ts#L1014) |
| 403 / ApiError | "Only the origin department leader or original creator can delete this schedule" | [src/modules/company-schedules/company-schedules.service.ts:1061](../../src/modules/company-schedules/company-schedules.service.ts#L1061) |
| 403 / ApiError | "This department is not an active target of the schedule" | [src/modules/company-schedules/company-schedules.service.ts:1093](../../src/modules/company-schedules/company-schedules.service.ts#L1093) |

## COMPANY_SCHEDULE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Company schedule is not visible" | [src/modules/company-schedules/company-schedules.service.ts:443](../../src/modules/company-schedules/company-schedules.service.ts#L443) |

## COMPANY_SCHEDULE_MANAGED_BY_SYSTEM

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only user-created company schedules can be changed from the general API" | [src/modules/company-schedules/company-schedules.service.ts:459](../../src/modules/company-schedules/company-schedules.service.ts#L459) |

## COMPANY_SCHEDULE_NOT_ACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only active schedules can be updated" | [src/modules/company-schedules/company-schedules.service.ts:908](../../src/modules/company-schedules/company-schedules.service.ts#L908) |
| 400 / ApiError | "Only active schedules can be deleted" | [src/modules/company-schedules/company-schedules.service.ts:1004](../../src/modules/company-schedules/company-schedules.service.ts#L1004) |

## COMPANY_SCHEDULE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company schedule not found" | [src/company-admin/modules/schedules/schedules.controller.ts:350](../../src/company-admin/modules/schedules/schedules.controller.ts#L350) |
| 404 / ApiError | "Company schedule not found" | [src/company-admin/modules/schedules/schedules.controller.ts:444](../../src/company-admin/modules/schedules/schedules.controller.ts#L444) |
| 404 / ApiError | "Company schedule not found" | [src/company-admin/modules/schedules/schedules.controller.ts:550](../../src/company-admin/modules/schedules/schedules.controller.ts#L550) |
| 404 / ApiError | "Company schedule not found" | [src/modules/companies/companies.service.ts:1729](../../src/modules/companies/companies.service.ts#L1729) |
| 404 / ApiError | "Company schedule not found" | [src/modules/company-schedules/company-schedules.service.ts:439](../../src/modules/company-schedules/company-schedules.service.ts#L439) |
| 404 / ApiError | "Company schedule not found" | [src/modules/company-schedules/company-schedules.service.ts:783](../../src/modules/company-schedules/company-schedules.service.ts#L783) |
| 404 / ApiError | "Company schedule not found" | [src/modules/company-schedules/company-schedules.service.ts:900](../../src/modules/company-schedules/company-schedules.service.ts#L900) |
| 404 / ApiError | "Company schedule not found" | [src/modules/company-schedules/company-schedules.service.ts:995](../../src/modules/company-schedules/company-schedules.service.ts#L995) |

## COMPANY_SCHEDULE_REQUEST_ALREADY_DECIDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "A decision already exists; this request cannot be withdrawn" | [src/modules/company-schedule-approvals/withdraw-approval.ts:19](../../src/modules/company-schedule-approvals/withdraw-approval.ts#L19) |

## COMPANY_SCHEDULE_UPDATE_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the origin department leader or original creator can update collaboration schedules" | [src/modules/company-schedules/company-schedules.service.ts:923](../../src/modules/company-schedules/company-schedules.service.ts#L923) |
| 403 / ApiError | "Only the department leader or original creator can update this schedule" | [src/modules/company-schedules/company-schedules.service.ts:963](../../src/modules/company-schedules/company-schedules.service.ts#L963) |

## COMPANY_SYNC_LOG_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Company sync log not found" | [src/company-admin/modules/sync-logs/sync-logs.controller.ts:102](../../src/company-admin/modules/sync-logs/sync-logs.controller.ts#L102) |

## CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "Resource conflict." | [src/admin/common/admin-error-middleware.ts:12](../../src/admin/common/admin-error-middleware.ts#L12) |
| 409 / AdminApiError | "User is already linked to another company member." | [src/admin/modules/companies/companies.controller.ts:133](../../src/admin/modules/companies/companies.controller.ts#L133) |
| 409 / AdminApiError | "Company member email is already linked to another user." | [src/admin/modules/companies/companies.controller.ts:653](../../src/admin/modules/companies/companies.controller.ts#L653) |
| 409 / AdminApiError | "Company member email is already linked to another user." | [src/admin/modules/companies/companies.controller.ts:1384](../../src/admin/modules/companies/companies.controller.ts#L1384) |
| 409 / AdminApiError | "Session is already revoked." | [src/admin/modules/sessions/sessions.controller.ts:176](../../src/admin/modules/sessions/sessions.controller.ts#L176) |

## DATABASE_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "Database operation failed" | [src/common/http/error-middleware.ts:19](../../src/common/http/error-middleware.ts#L19) |

## DEPARTMENT_CODE_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Department code already exists" | [src/company-admin/modules/departments/departments.controller.ts:95](../../src/company-admin/modules/departments/departments.controller.ts#L95) |

## DEPARTMENT_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Department tree cannot contain cycles" | [src/company-admin/modules/departments/departments.controller.ts:153](../../src/company-admin/modules/departments/departments.controller.ts#L153) |
| 400 / ApiError | "Department tree cannot contain cycles" | [src/company-admin/modules/departments/departments.controller.ts:158](../../src/company-admin/modules/departments/departments.controller.ts#L158) |
| 400 / ApiError | "Department tree cannot contain cycles" | [src/modules/companies/companies.service.ts:239](../../src/modules/companies/companies.service.ts#L239) |
| 400 / ApiError | "Department tree cannot contain cycles" | [src/modules/companies/companies.service.ts:244](../../src/modules/companies/companies.service.ts#L244) |

## DEPARTMENT_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | [src/company-admin/modules/departments/departments.controller.ts:372](../../src/company-admin/modules/departments/departments.controller.ts#L372) |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | [src/company-admin/modules/departments/departments.controller.ts:465](../../src/company-admin/modules/departments/departments.controller.ts#L465) |
| 400 / ApiError | `Department depth cannot exceed ${MAX_DEPARTMENT_DEPTH}` | [src/modules/companies/companies.service.ts:1359](../../src/modules/companies/companies.service.ts#L1359) |

## DEPARTMENT_EXTERNAL_ID_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "External department id already exists" | [src/company-admin/modules/departments/departments.controller.ts:113](../../src/company-admin/modules/departments/departments.controller.ts#L113) |

## DEPARTMENT_INACTIVE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Invitation department is inactive" | [src/modules/companies/company-admin-invite.service.ts:36](../../src/modules/companies/company-admin-invite.service.ts#L36) |
| 403 / ApiError | "Member department is inactive" | [src/modules/company-projects/company-projects.service.ts:982](../../src/modules/company-projects/company-projects.service.ts#L982) |
| 403 / ApiError | "Member department is inactive" | [src/modules/company-schedules/company-schedules.service.ts:224](../../src/modules/company-schedules/company-schedules.service.ts#L224) |

## DEPARTMENT_LEADER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the department leader or ancestor department leader can update approval delegate mode" | [src/modules/companies/companies.controller.ts:129](../../src/modules/companies/companies.controller.ts#L129) |
| 400 / ApiError | "Collaboration target departments must have a department leader" | [src/modules/company-schedules/company-schedules.service.ts:305](../../src/modules/company-schedules/company-schedules.service.ts#L305) |

## DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Department not found" | [src/company-admin/modules/admins/admins.controller.ts:91](../../src/company-admin/modules/admins/admins.controller.ts#L91) |
| 404 / ApiError | "Department not found" | [src/company-admin/modules/departments/departments.controller.ts:44](../../src/company-admin/modules/departments/departments.controller.ts#L44) |
| 404 / ApiError | "Department not found" | [src/company-admin/modules/departments/departments.controller.ts:319](../../src/company-admin/modules/departments/departments.controller.ts#L319) |
| 404 / ApiError | "Department not found" | [src/company-admin/modules/members/members.controller.ts:71](../../src/company-admin/modules/members/members.controller.ts#L71) |
| 404 / ApiError | "Department not found" | [src/company-admin/modules/schedules/schedules.controller.ts:92](../../src/company-admin/modules/schedules/schedules.controller.ts#L92) |
| 404 / ApiError | "Department not found" | [src/modules/companies/companies.controller.ts:327](../../src/modules/companies/companies.controller.ts#L327) |
| 404 / ApiError | "Department not found" | [src/modules/companies/companies.controller.ts:382](../../src/modules/companies/companies.controller.ts#L382) |
| 404 / ApiError | "Department not found" | [src/modules/companies/companies.service.ts:203](../../src/modules/companies/companies.service.ts#L203) |
| 404 / ApiError | "Department not found" | [src/modules/companies/companies.service.ts:807](../../src/modules/companies/companies.service.ts#L807) |
| 404 / ApiError | "Department not found" | [src/modules/companies/companies.service.ts:975](../../src/modules/companies/companies.service.ts#L975) |
| 404 / ApiError | "One or more departments were not found" | [src/modules/company-projects/company-project-presets.service.ts:97](../../src/modules/company-projects/company-project-presets.service.ts#L97) |
| 404 / ApiError | "One or more departments were not found" | [src/modules/company-projects/company-projects.service.ts:307](../../src/modules/company-projects/company-projects.service.ts#L307) |
| 404 / ApiError | "Department not found" | [src/modules/company-projects/company-projects.service.ts:895](../../src/modules/company-projects/company-projects.service.ts#L895) |
| 404 / ApiError | "One or more departments were not found" | [src/modules/company-schedules/company-schedules.service.ts:289](../../src/modules/company-schedules/company-schedules.service.ts#L289) |

## DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Change request department is missing" | [src/modules/company-schedules/company-schedules.service.ts:1240](../../src/modules/company-schedules/company-schedules.service.ts#L1240) |

## DUPLICATE_RECURRENCE_EXCEPTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "weekday_rules cannot contain duplicated weekdays" | [src/common/utils/recurrence.ts:103](../../src/common/utils/recurrence.ts#L103) |

## EMAIL_ALREADY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Email is already registered" | [src/modules/auth/auth.service.ts:137](../../src/modules/auth/auth.service.ts#L137) |
| 409 / ApiError | "Email is already registered" | [src/modules/auth/google-auth.service.ts:272](../../src/modules/auth/google-auth.service.ts#L272) |

## EMAIL_NOT_VERIFIED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Email verification is required" | [src/company-admin/modules/auth/auth.controller.ts:58](../../src/company-admin/modules/auth/auth.controller.ts#L58) |
| 403 / ApiError | "Email verification is required" | [src/modules/auth/auth.service.ts:238](../../src/modules/auth/auth.service.ts#L238) |
| 403 / ApiError | "Email verification is required" | [src/modules/auth/google-auth.service.ts:38](../../src/modules/auth/google-auth.service.ts#L38) |
| 403 / ApiError | "Email verification is required" | [src/modules/companies/company-admin-invite.service.ts:28](../../src/modules/companies/company-admin-invite.service.ts#L28) |

## EMAIL_VERIFICATION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Verify your email before accepting an invitation" | [src/modules/companies/member-invite-acceptance.ts:12](../../src/modules/companies/member-invite-acceptance.ts#L12) |

## EMAIL_VERIFICATION_RESEND_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 429 / ApiError | "Verification email resend limit exceeded" | [src/modules/auth/auth.service.ts:106](../../src/modules/auth/auth.service.ts#L106) |

## EMAIL_VERIFICATION_RESEND_TOO_SOON

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 429 / ApiError | "Verification email can be resent after 5 minutes" | [src/modules/auth/auth.service.ts:64](../../src/modules/auth/auth.service.ts#L64) |

## FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / AdminApiError | "Admin does not have the required permission." | [src/admin/common/require-admin-permission.ts:12](../../src/admin/common/require-admin-permission.ts#L12) |
| 403 / AdminApiError | "Super administrator authority is required." | [src/admin/common/require-admin-permission.ts:18](../../src/admin/common/require-admin-permission.ts#L18) |
| 403 / AdminApiError | "System permission groups are immutable." | [src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:255](../../src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts#L255) |
| 403 / AdminApiError | "Admin does not have access." | [src/admin/modules/auth/auth.controller.ts:42](../../src/admin/modules/auth/auth.controller.ts#L42) |

## FRIEND_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend not found" | [src/modules/friends/friends.service.ts:102](../../src/modules/friends/friends.service.ts#L102) |
| 404 / ApiError | "Friend not found" | [src/modules/friends/friends.service.ts:410](../../src/modules/friends/friends.service.ts#L410) |
| 404 / ApiError | "Friend not found" | [src/modules/friends/friends.service.ts:510](../../src/modules/friends/friends.service.ts#L510) |

## FRIEND_PRESET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend preset not found" | [src/modules/friends/friends.service.ts:488](../../src/modules/friends/friends.service.ts#L488) |
| 404 / ApiError | "Friend preset not found" | [src/modules/friends/friends.service.ts:527](../../src/modules/friends/friends.service.ts#L527) |
| 404 / ApiError | "Friend preset not found" | [src/modules/friends/friends.service.ts:547](../../src/modules/friends/friends.service.ts#L547) |
| 404 / ApiError | "Friend preset not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:500](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L500) |

## FRIEND_REQUEST_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Friend request not found" | [src/modules/friends/friends.service.ts:338](../../src/modules/friends/friends.service.ts#L338) |
| 404 / ApiError | "Friend request not found" | [src/modules/friends/friends.service.ts:373](../../src/modules/friends/friends.service.ts#L373) |
| 404 / ApiError | "Friend request not found" | [src/modules/friends/friends.service.ts:395](../../src/modules/friends/friends.service.ts#L395) |

## FRIEND_REQUEST_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Friend request is not pending" | [src/modules/friends/friends.service.ts:342](../../src/modules/friends/friends.service.ts#L342) |
| 400 / ApiError | "Friend request is not pending" | [src/modules/friends/friends.service.ts:377](../../src/modules/friends/friends.service.ts#L377) |
| 409 / ApiError | "Only pending outgoing requests can be cancelled" | [src/modules/friends/friends.service.ts:397](../../src/modules/friends/friends.service.ts#L397) |

## FRIEND_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "All preset members must be accepted friends" | [src/modules/friends/friends.service.ts:158](../../src/modules/friends/friends.service.ts#L158) |

## FRIEND_SELF_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "User cannot add themselves as a friend" | [src/modules/friends/friends.service.ts:267](../../src/modules/friends/friends.service.ts#L267) |

## GOOGLE_ACCOUNT_ALREADY_LINKED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "This account already has a Google identity" | [src/modules/auth/google-auth.service.ts:109](../../src/modules/auth/google-auth.service.ts#L109) |
| 409 / ApiError | "Google identity is already linked" | [src/modules/auth/google-auth.service.ts:116](../../src/modules/auth/google-auth.service.ts#L116) |
| 409 / ApiError | "Google identity is already linked" | [src/modules/auth/google-auth.service.ts:207](../../src/modules/auth/google-auth.service.ts#L207) |

## GOOGLE_ACCOUNT_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Email or Google identity was registered concurrently" | [src/modules/auth/google-auth.service.ts:148](../../src/modules/auth/google-auth.service.ts#L148) |

## GOOGLE_ACCOUNT_UNAVAILABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Linked account is unavailable" | [src/modules/auth/google-auth.service.ts:182](../../src/modules/auth/google-auth.service.ts#L182) |

## GOOGLE_AUTH_RATE_LIMITED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 429 / ApiError | "Too many Google authentication attempts" | [src/modules/auth/google-auth-rate-limit.ts:20](../../src/modules/auth/google-auth-rate-limit.ts#L20) |

## GOOGLE_LINK_FLOW_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Use the authenticated Google linking endpoint" | [src/modules/auth/google-auth.controller.ts:24](../../src/modules/auth/google-auth.controller.ts#L24) |
| 409 / ApiError | "Use the authenticated Google linking endpoint" | [src/modules/auth/google-auth.controller.ts:48](../../src/modules/auth/google-auth.controller.ts#L48) |
| 409 / ApiError | "Use the authenticated Google linking endpoint" | [src/modules/auth/google-auth.controller.ts:76](../../src/modules/auth/google-auth.controller.ts#L76) |

## GOOGLE_LOGIN_NOT_CONFIGURED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 503 / ApiError | "Google login is not configured" | [src/modules/auth/google-id-token.service.ts:19](../../src/modules/auth/google-id-token.service.ts#L19) |

## GOOGLE_VERIFICATION_EMAIL_FAILED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 503 / ApiError | "Could not send verification email; sign in again" | [src/modules/auth/google-auth.service.ts:303](../../src/modules/auth/google-auth.service.ts#L303) |

## HOLIDAY_PROVIDER_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Holiday provider returned an error" | [src/modules/holidays/holidays.service.ts:91](../../src/modules/holidays/holidays.service.ts#L91) |

## HOLIDAY_PROVIDER_NOT_CONFIGURED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "KASI holiday service key is not configured" | [src/modules/holidays/holidays.service.ts:105](../../src/modules/holidays/holidays.service.ts#L105) |

## HOLIDAY_PROVIDER_UNAVAILABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Holiday provider request failed" | [src/modules/holidays/holidays.service.ts:121](../../src/modules/holidays/holidays.service.ts#L121) |
| 502 / ApiError | "Holiday provider response could not be parsed" | [src/modules/holidays/holidays.service.ts:141](../../src/modules/holidays/holidays.service.ts#L141) |

## INSUFFICIENT_AI_CHAT_DATA

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule action requires start_datetime" | [src/modules/ai-chat/ai-chat.service.ts:403](../../src/modules/ai-chat/ai-chat.service.ts#L403) |
| 400 / ApiError | "No suggested actions are available" | [src/modules/ai-chat/ai-chat.service.ts:1045](../../src/modules/ai-chat/ai-chat.service.ts#L1045) |

## INSUFFICIENT_AI_DATA

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule action requires start_datetime" | [src/modules/ai/ai.service.ts:673](../../src/modules/ai/ai.service.ts#L673) |
| 400 / ApiError | "No suggested actions are available" | [src/modules/ai/ai.service.ts:1013](../../src/modules/ai/ai.service.ts#L1013) |

## INTERNAL_SERVER_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / AdminApiError | "Failed to check admin API IP restriction." | [src/admin/common/admin-api-ip-allowlist.ts:28](../../src/admin/common/admin-api-ip-allowlist.ts#L28) |
| 500 / AdminApiError | "Internal server error." | [src/admin/common/admin-error-middleware.ts:14](../../src/admin/common/admin-error-middleware.ts#L14) |

## INVALID_ASSIGNMENT_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "ends_at must be after starts_at" | [src/modules/company-projects/company-projects.service.ts:2180](../../src/modules/company-projects/company-projects.service.ts#L2180) |
| 400 / ApiError | "ends_at must be after starts_at" | [src/modules/company-projects/company-projects.service.ts:2291](../../src/modules/company-projects/company-projects.service.ts#L2291) |

## INVALID_CATEGORY_TYPE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Category must be of type ${expected_type}` | [src/modules/categories/categories.service.ts:30](../../src/modules/categories/categories.service.ts#L30) |

## INVALID_CREDENTIALS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Email or password is invalid" | [src/modules/auth/auth.service.ts:224](../../src/modules/auth/auth.service.ts#L224) |
| 401 / ApiError | "Email or password is invalid" | [src/modules/auth/auth.service.ts:234](../../src/modules/auth/auth.service.ts#L234) |
| 401 / ApiError | "Email or password is invalid" | [src/modules/auth/google-auth.service.ts:99](../../src/modules/auth/google-auth.service.ts#L99) |

## INVALID_CURSOR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid pagination cursor" | [src/modules/ai-chat/ai-chat-pages.ts:9](../../src/modules/ai-chat/ai-chat-pages.ts#L9) |
| 400 / ApiError | "Session cursor is no longer available; refresh the list" | [src/modules/ai-chat/ai-chat-pages.ts:16](../../src/modules/ai-chat/ai-chat-pages.ts#L16) |
| 400 / ApiError | "Message cursor is no longer available; refresh the list" | [src/modules/ai-chat/ai-chat-pages.ts:32](../../src/modules/ai-chat/ai-chat-pages.ts#L32) |

## INVALID_DATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "date must be YYYY-MM-DD" | [src/common/utils/date.ts:172](../../src/common/utils/date.ts#L172) |
| 400 / ApiError | "date must be a valid calendar day" | [src/common/utils/date.ts:177](../../src/common/utils/date.ts#L177) |
| 400 / ApiError | "date must be a valid calendar day" | [src/common/utils/date.ts:184](../../src/common/utils/date.ts#L184) |
| 400 / ApiError | "date must be YYYY-MM-DD" | [src/common/utils/date.ts:219](../../src/common/utils/date.ts#L219) |
| 400 / ApiError | "date must be a valid calendar day" | [src/common/utils/date.ts:224](../../src/common/utils/date.ts#L224) |
| 400 / ApiError | "date must be a valid calendar day" | [src/common/utils/date.ts:245](../../src/common/utils/date.ts#L245) |
| 400 / ApiError | `${field_name} must be a valid YYYY-MM-DD date` | [src/modules/holidays/holidays.service.ts:34](../../src/modules/holidays/holidays.service.ts#L34) |

## INVALID_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end_date must be after or equal to start_date" | [src/modules/holidays/holidays.service.ts:192](../../src/modules/holidays/holidays.service.ts#L192) |

## INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "recurrence datetimes must be valid ISO datetimes" | [src/common/utils/recurrence.ts:183](../../src/common/utils/recurrence.ts#L183) |
| 400 / ApiError | "end_datetime must be a valid ISO datetime" | [src/common/utils/recurrence.ts:187](../../src/common/utils/recurrence.ts#L187) |
| 400 / ApiError | `${field_name} must be a valid ISO datetime` | [src/company-admin/modules/schedules/schedules.controller.ts:40](../../src/company-admin/modules/schedules/schedules.controller.ts#L40) |
| 400 / ApiError | "start_datetime must be a valid ISO datetime" | [src/modules/companies/companies.service.ts:465](../../src/modules/companies/companies.service.ts#L465) |
| 400 / ApiError | "end_datetime must be a valid ISO datetime" | [src/modules/companies/companies.service.ts:469](../../src/modules/companies/companies.service.ts#L469) |
| 400 / ApiError | `${field_name} must be a valid ISO datetime` | [src/modules/company-schedules/company-schedules.service.ts:143](../../src/modules/company-schedules/company-schedules.service.ts#L143) |

## INVALID_EMAIL

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Email is required" | [src/modules/companies/companies.service.ts:739](../../src/modules/companies/companies.service.ts#L739) |
| 400 / ApiError | "Email is required" | [src/modules/companies/companies.service.ts:886](../../src/modules/companies/companies.service.ts#L886) |

## INVALID_EMAIL_TOKEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Invalid email token" | [src/modules/auth/auth.service.ts:400](../../src/modules/auth/auth.service.ts#L400) |
| 401 / ApiError | "Invalid email token" | [src/modules/auth/auth.service.ts:591](../../src/modules/auth/auth.service.ts#L591) |
| 401 / ApiError | "Invalid or expired email token" | [src/modules/auth/email-verification.service.ts:129](../../src/modules/auth/email-verification.service.ts#L129) |
| 401 / ApiError | "Invalid or expired email token" | [src/modules/auth/google-auth.service.ts:314](../../src/modules/auth/google-auth.service.ts#L314) |
| 401 / ApiError | "Invalid or expired email token" | [src/modules/auth/google-auth.service.ts:326](../../src/modules/auth/google-auth.service.ts#L326) |

## INVALID_FRIEND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "User cannot target themselves" | [src/modules/friends/friends.service.ts:129](../../src/modules/friends/friends.service.ts#L129) |

## INVALID_GOOGLE_ID_TOKEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Invalid Google ID token" | [src/modules/auth/google-id-token.service.ts:27](../../src/modules/auth/google-id-token.service.ts#L27) |
| 401 / ApiError | "Google identity is incomplete or unverified" | [src/modules/auth/google-id-token.service.ts:31](../../src/modules/auth/google-id-token.service.ts#L31) |
| 401 / ApiError | "Google email is invalid" | [src/modules/auth/google-id-token.service.ts:37](../../src/modules/auth/google-id-token.service.ts#L37) |

## INVALID_GOOGLE_LINK_TICKET

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Google sign-in step has expired; start again" | [src/modules/auth/google-auth.service.ts:74](../../src/modules/auth/google-auth.service.ts#L74) |
| 401 / ApiError | "Google sign-in step has expired; start again" | [src/modules/auth/google-auth.service.ts:90](../../src/modules/auth/google-auth.service.ts#L90) |
| 401 / ApiError | "Google sign-in step is bound to another session" | [src/modules/auth/google-auth.service.ts:238](../../src/modules/auth/google-auth.service.ts#L238) |
| 401 / ApiError | "Sign in to the target account after starting Google linking" | [src/modules/auth/google-auth.service.ts:245](../../src/modules/auth/google-auth.service.ts#L245) |

## INVALID_ID

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `${field_name} must be a positive integer` | [src/common/utils/ids.ts:7](../../src/common/utils/ids.ts#L7) |

## INVALID_PARENT_DEPARTMENT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Parent department not found" | [src/company-admin/modules/departments/departments.controller.ts:173](../../src/company-admin/modules/departments/departments.controller.ts#L173) |
| 400 / ApiError | "A department cannot be its own parent" | [src/company-admin/modules/departments/departments.controller.ts:426](../../src/company-admin/modules/departments/departments.controller.ts#L426) |
| 400 / ApiError | "Parent department not found" | [src/modules/companies/companies.service.ts:259](../../src/modules/companies/companies.service.ts#L259) |
| 400 / ApiError | "A department cannot be its own parent" | [src/modules/companies/companies.service.ts:1337](../../src/modules/companies/companies.service.ts#L1337) |

## INVALID_PROJECT_ASSIGNMENT_STATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "completed_at can only be set when status is done" | [src/modules/company-projects/company-projects.service.ts:53](../../src/modules/company-projects/company-projects.service.ts#L53) |

## INVALID_PROJECT_DEPENDENCY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Dependency cannot reference itself" | [src/modules/company-projects/company-projects.service.ts:548](../../src/modules/company-projects/company-projects.service.ts#L548) |
| 400 / ApiError | "Dependency cannot reference itself" | [src/modules/company-projects/company-projects.service.ts:2403](../../src/modules/company-projects/company-projects.service.ts#L2403) |

## INVALID_PROJECT_LIST_DATE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "to must be after from." | [src/admin/modules/company-projects/company-projects.controller.ts:80](../../src/admin/modules/company-projects/company-projects.controller.ts#L80) |

## INVALID_PROJECT_WORK_ITEM_PARENT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Work item cannot be its own parent" | [src/modules/company-projects/company-projects.service.ts:1813](../../src/modules/company-projects/company-projects.service.ts#L1813) |
| 400 / ApiError | "Work item cannot be moved under its descendant" | [src/modules/company-projects/company-projects.service.ts:1818](../../src/modules/company-projects/company-projects.service.ts#L1818) |

## INVALID_RECURRENCE_EXCEPTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "excluded_dates must be YYYY-MM-DD" | [src/common/utils/recurrence.ts:85](../../src/common/utils/recurrence.ts#L85) |
| 400 / ApiError | "excluded_dates must be valid dates" | [src/common/utils/recurrence.ts:95](../../src/common/utils/recurrence.ts#L95) |
| 400 / ApiError | "weekday_rules create an adjustment loop" | [src/common/utils/recurrence.ts:147](../../src/common/utils/recurrence.ts#L147) |
| 400 / ApiError | "weekday_rules exceeded maximum adjustment steps" | [src/common/utils/recurrence.ts:161](../../src/common/utils/recurrence.ts#L161) |

## INVALID_RECURRENCE_INTERVAL

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "repeat_interval_days must be a positive integer" | [src/common/utils/recurrence.ts:203](../../src/common/utils/recurrence.ts#L203) |

## INVALID_RECURRENCE_LIMIT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "max_occurrences must be between 1 and 500" | [src/common/utils/recurrence.ts:211](../../src/common/utils/recurrence.ts#L211) |

## INVALID_RECURRENCE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "repeat_until must be after or equal to start_datetime" | [src/common/utils/recurrence.ts:195](../../src/common/utils/recurrence.ts#L195) |

## INVALID_REFRESH_TOKEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Invalid or expired refresh token" | [src/modules/auth/auth.service.ts:288](../../src/modules/auth/auth.service.ts#L288) |
| 401 / ApiError | "Invalid refresh token payload" | [src/modules/auth/auth.service.ts:292](../../src/modules/auth/auth.service.ts#L292) |
| 401 / ApiError | "Refresh token was revoked or not found" | [src/modules/auth/auth.service.ts:309](../../src/modules/auth/auth.service.ts#L309) |
| 401 / ApiError | "User not available for token refresh" | [src/modules/auth/auth.service.ts:318](../../src/modules/auth/auth.service.ts#L318) |
| 401 / ApiError | "User not available for token refresh" | [src/modules/auth/auth.service.ts:323](../../src/modules/auth/auth.service.ts#L323) |
| 401 / ApiError | "Refresh token was already consumed" | [src/modules/auth/auth.service.ts:331](../../src/modules/auth/auth.service.ts#L331) |

## INVALID_SCHEDULE_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/common/utils/recurrence.ts:191](../../src/common/utils/recurrence.ts#L191) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/company-admin/modules/schedules/schedules.controller.ts:47](../../src/company-admin/modules/schedules/schedules.controller.ts#L47) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/modules/ai/ai.service.ts:678](../../src/modules/ai/ai.service.ts#L678) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/modules/ai-chat/ai-chat.service.ts:408](../../src/modules/ai-chat/ai-chat.service.ts#L408) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/modules/companies/companies.service.ts:473](../../src/modules/companies/companies.service.ts#L473) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/modules/company-schedules/company-schedules.service.ts:156](../../src/modules/company-schedules/company-schedules.service.ts#L156) |
| 400 / ApiError | "End must not precede start" | [src/modules/schedules/schedule-series.service.ts:81](../../src/modules/schedules/schedule-series.service.ts#L81) |
| 400 / ApiError | "end_datetime must be after start_datetime" | [src/modules/schedules/schedules.service.ts:15](../../src/modules/schedules/schedules.service.ts#L15) |

## INVALID_TASK_STATE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "completed_at can only be set when status is done" | [src/modules/tasks/tasks.service.ts:16](../../src/modules/tasks/tasks.service.ts#L16) |

## INVALID_TIMEZONE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "timezone must be a valid IANA timezone" | [src/common/utils/date.ts:146](../../src/common/utils/date.ts#L146) |
| 400 / ApiError | "timezone must be a valid IANA timezone" | [src/common/utils/date.ts:208](../../src/common/utils/date.ts#L208) |
| 400 / ApiError | "timezone must be a valid IANA timezone" | [src/common/utils/recurrence.ts:179](../../src/common/utils/recurrence.ts#L179) |
| 400 / ApiError | "timezone must be a valid IANA timezone" | [src/company-admin/modules/settings/settings.controller.ts:67](../../src/company-admin/modules/settings/settings.controller.ts#L67) |
| 400 / ApiError | "recurrence timezone must be a valid IANA timezone" | [src/modules/ai/ai.service.ts:723](../../src/modules/ai/ai.service.ts#L723) |
| 400 / ApiError | "recurrence timezone must be a valid IANA timezone" | [src/modules/ai-chat/ai-chat.service.ts:450](../../src/modules/ai-chat/ai-chat.service.ts#L450) |

## IP_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / AdminApiError | "Admin API IP restriction is enabled but no IP ranges are configured." | [src/admin/common/admin-api-ip-allowlist.ts:17](../../src/admin/common/admin-api-ip-allowlist.ts#L17) |
| 403 / AdminApiError | "This IP is not allowed to access the admin API." | [src/admin/common/admin-api-ip-allowlist.ts:22](../../src/admin/common/admin-api-ip-allowlist.ts#L22) |

## LAST_SUPER_ADMIN_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "At least one active super administrator must remain." | [src/admin/modules/admin-users/admin-users.controller.ts:249](../../src/admin/modules/admin-users/admin-users.controller.ts#L249) |

## MEMO_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Memo not found" | [src/modules/ai/ai.service.ts:946](../../src/modules/ai/ai.service.ts#L946) |
| 404 / ApiError | "Memo not found" | [src/modules/ai/ai.service.ts:985](../../src/modules/ai/ai.service.ts#L985) |
| 404 / ApiError | "Memo not found" | [src/modules/memos/memos.service.ts:52](../../src/modules/memos/memos.service.ts#L52) |
| 404 / ApiError | "Memo not found" | [src/modules/memos/memos.service.ts:131](../../src/modules/memos/memos.service.ts#L131) |
| 404 / ApiError | "Memo not found" | [src/modules/memos/memos.service.ts:204](../../src/modules/memos/memos.service.ts#L204) |

## MEMO_PARSE_NOT_CLAIMABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Memo parse is not queued or is already processing" | [src/modules/ai/memo-parse-job-state.ts:21](../../src/modules/ai/memo-parse-job-state.ts#L21) |

## MEMO_PARSE_NOT_PENDING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / AdminApiError | "Only pending memos can be forced into the parse queue." | [src/admin/modules/memos/memos.controller.ts:191](../../src/admin/modules/memos/memos.controller.ts#L191) |

## MEMO_PARSE_SUPERSEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Memo was edited, deleted, or parsing was restarted" | [src/modules/ai/ai.service.ts:881](../../src/modules/ai/ai.service.ts#L881) |

## NO_APPLICABLE_AI_ACTIONS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "No schedulable or task actions are available" | [src/modules/ai/ai.service.ts:1018](../../src/modules/ai/ai.service.ts#L1018) |

## NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Resource not found." | [src/admin/common/admin-error-middleware.ts:10](../../src/admin/common/admin-error-middleware.ts#L10) |
| 404 / AdminApiError | "Admin permission group not found." | [src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:161](../../src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts#L161) |
| 404 / AdminApiError | "Admin permission group not found." | [src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts:252](../../src/admin/modules/admin-permission-groups/admin-permission-groups.controller.ts#L252) |
| 404 / AdminApiError | "Admin user not found." | [src/admin/modules/admin-users/admin-users.controller.ts:136](../../src/admin/modules/admin-users/admin-users.controller.ts#L136) |
| 404 / AdminApiError | "Admin user not found." | [src/admin/modules/admin-users/admin-users.controller.ts:229](../../src/admin/modules/admin-users/admin-users.controller.ts#L229) |
| 404 / AdminApiError | "AI chat session not found." | [src/admin/modules/ai-chat/ai-chat.controller.ts:148](../../src/admin/modules/ai-chat/ai-chat.controller.ts#L148) |
| 404 / AdminApiError | "AI parse result not found." | [src/admin/modules/ai-parse-results/ai-parse-results.controller.ts:30](../../src/admin/modules/ai-parse-results/ai-parse-results.controller.ts#L30) |
| 404 / AdminApiError | "AI parse result not found." | [src/admin/modules/ai-parse-results/ai-parse-results.controller.ts:145](../../src/admin/modules/ai-parse-results/ai-parse-results.controller.ts#L145) |
| 404 / AdminApiError | "Company not found." | [src/admin/modules/companies/companies.controller.ts:86](../../src/admin/modules/companies/companies.controller.ts#L86) |
| 404 / AdminApiError | "Department not found." | [src/admin/modules/companies/companies.controller.ts:108](../../src/admin/modules/companies/companies.controller.ts#L108) |
| 404 / AdminApiError | "Company not found." | [src/admin/modules/companies/companies.controller.ts:319](../../src/admin/modules/companies/companies.controller.ts#L319) |
| 404 / AdminApiError | "Company not found." | [src/admin/modules/companies/companies.controller.ts:514](../../src/admin/modules/companies/companies.controller.ts#L514) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/companies/companies.controller.ts:628](../../src/admin/modules/companies/companies.controller.ts#L628) |
| 404 / AdminApiError | "Company member not found." | [src/admin/modules/companies/companies.controller.ts:752](../../src/admin/modules/companies/companies.controller.ts#L752) |
| 404 / AdminApiError | "Company invite not found." | [src/admin/modules/companies/companies.controller.ts:862](../../src/admin/modules/companies/companies.controller.ts#L862) |
| 404 / AdminApiError | "Company not found." | [src/admin/modules/companies/companies.controller.ts:932](../../src/admin/modules/companies/companies.controller.ts#L932) |
| 404 / AdminApiError | "Company role not found." | [src/admin/modules/companies/companies.controller.ts:1017](../../src/admin/modules/companies/companies.controller.ts#L1017) |
| 404 / AdminApiError | "Company role not found." | [src/admin/modules/companies/companies.controller.ts:1124](../../src/admin/modules/companies/companies.controller.ts#L1124) |
| 404 / AdminApiError | "Company admin not found." | [src/admin/modules/companies/companies.controller.ts:1232](../../src/admin/modules/companies/companies.controller.ts#L1232) |
| 404 / AdminApiError | "Company role not found." | [src/admin/modules/companies/companies.controller.ts:1251](../../src/admin/modules/companies/companies.controller.ts#L1251) |
| 404 / AdminApiError | "Company API key not found." | [src/admin/modules/companies/companies.controller.ts:1631](../../src/admin/modules/companies/companies.controller.ts#L1631) |
| 404 / AdminApiError | "Company API key not found." | [src/admin/modules/companies/companies.controller.ts:1680](../../src/admin/modules/companies/companies.controller.ts#L1680) |
| 404 / AdminApiError | "Company project not found." | [src/admin/modules/company-projects/company-projects.controller.ts:32](../../src/admin/modules/company-projects/company-projects.controller.ts#L32) |
| 404 / AdminApiError | "Memo not found." | [src/admin/modules/memos/memos.controller.ts:39](../../src/admin/modules/memos/memos.controller.ts#L39) |
| 404 / AdminApiError | "Memo not found." | [src/admin/modules/memos/memos.controller.ts:153](../../src/admin/modules/memos/memos.controller.ts#L153) |
| 404 / AdminApiError | "Memo not found." | [src/admin/modules/memos/memos.controller.ts:187](../../src/admin/modules/memos/memos.controller.ts#L187) |
| 404 / AdminApiError | "Schedule not found." | [src/admin/modules/schedules/schedules.controller.ts:115](../../src/admin/modules/schedules/schedules.controller.ts#L115) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/sessions/sessions.controller.ts:134](../../src/admin/modules/sessions/sessions.controller.ts#L134) |
| 404 / AdminApiError | "Session not found." | [src/admin/modules/sessions/sessions.controller.ts:173](../../src/admin/modules/sessions/sessions.controller.ts#L173) |
| 404 / AdminApiError | "Task not found." | [src/admin/modules/tasks/tasks.controller.ts:128](../../src/admin/modules/tasks/tasks.controller.ts#L128) |
| 404 / AdminApiError | "Resource not found." | [src/admin/modules/terminal/terminal.controller.ts:137](../../src/admin/modules/terminal/terminal.controller.ts#L137) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:453](../../src/admin/modules/users/users.controller.ts#L453) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:505](../../src/admin/modules/users/users.controller.ts#L505) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:626](../../src/admin/modules/users/users.controller.ts#L626) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:781](../../src/admin/modules/users/users.controller.ts#L781) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:821](../../src/admin/modules/users/users.controller.ts#L821) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:897](../../src/admin/modules/users/users.controller.ts#L897) |
| 404 / AdminApiError | "User not found." | [src/admin/modules/users/users.controller.ts:976](../../src/admin/modules/users/users.controller.ts#L976) |
| 404 / AdminApiError | "Resource not found." | [src/admin/routes.ts:63](../../src/admin/routes.ts#L63) |

## NOTICE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Notice not found." | [src/admin/modules/notices/notices.controller.ts:171](../../src/admin/modules/notices/notices.controller.ts#L171) |
| 404 / AdminApiError | "Notice not found." | [src/admin/modules/notices/notices.controller.ts:252](../../src/admin/modules/notices/notices.controller.ts#L252) |
| 404 / AdminApiError | "Notice not found." | [src/admin/modules/notices/notices.controller.ts:339](../../src/admin/modules/notices/notices.controller.ts#L339) |
| 404 / ApiError | "Notice not found" | [src/modules/notices/notices.service.ts:90](../../src/modules/notices/notices.service.ts#L90) |

## NOTIFICATION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Notification not found" | [src/modules/notifications/notifications.service.ts:105](../../src/modules/notifications/notifications.service.ts#L105) |

## OPENAI_CHAT_EMPTY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned no complete chat response" | [src/modules/ai-chat/openai-ai-chat.service.ts:445](../../src/modules/ai-chat/openai-ai-chat.service.ts#L445) |

## OPENAI_CHAT_INVALID_ACTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Schedule action requires start_datetime" | [src/modules/ai-chat/openai-ai-chat.service.ts:319](../../src/modules/ai-chat/openai-ai-chat.service.ts#L319) |
| 502 / ApiError | "Task action cannot include start_datetime" | [src/modules/ai-chat/openai-ai-chat.service.ts:327](../../src/modules/ai-chat/openai-ai-chat.service.ts#L327) |
| 502 / ApiError | "Task action cannot include end_datetime" | [src/modules/ai-chat/openai-ai-chat.service.ts:331](../../src/modules/ai-chat/openai-ai-chat.service.ts#L331) |

## OPENAI_CHAT_INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `Invalid datetime returned: ${value}` | [src/modules/ai-chat/openai-ai-chat.service.ts:306](../../src/modules/ai-chat/openai-ai-chat.service.ts#L306) |

## OPENAI_CHAT_INVALID_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned schedule end before start" | [src/modules/ai-chat/openai-ai-chat.service.ts:323](../../src/modules/ai-chat/openai-ai-chat.service.ts#L323) |

## OPENAI_NOT_CONFIGURED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 503 / ApiError | "OPENAI_API_KEY is required for AI features" | [src/lib/openai.ts:10](../../src/lib/openai.ts#L10) |

## OPENAI_PARSE_EMPTY

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned no complete structured parse result" | [src/modules/ai/openai-memo-parser.service.ts:732](../../src/modules/ai/openai-memo-parser.service.ts#L732) |

## OPENAI_PARSE_INVALID_ACTION

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "Schedule action requires start_datetime" | [src/modules/ai/openai-memo-parser.service.ts:548](../../src/modules/ai/openai-memo-parser.service.ts#L548) |
| 502 / ApiError | "Task action cannot include start_datetime" | [src/modules/ai/openai-memo-parser.service.ts:556](../../src/modules/ai/openai-memo-parser.service.ts#L556) |
| 502 / ApiError | "Task action cannot include end_datetime" | [src/modules/ai/openai-memo-parser.service.ts:560](../../src/modules/ai/openai-memo-parser.service.ts#L560) |

## OPENAI_PARSE_INVALID_DATETIME

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `Invalid datetime returned: ${value}` | [src/modules/ai/openai-memo-parser.service.ts:461](../../src/modules/ai/openai-memo-parser.service.ts#L461) |
| 502 / ApiError | "Task action returned invalid due_datetime" | [src/modules/ai/openai-memo-parser.service.ts:564](../../src/modules/ai/openai-memo-parser.service.ts#L564) |

## OPENAI_PARSE_INVALID_RANGE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | "OpenAI returned schedule end before start" | [src/modules/ai/openai-memo-parser.service.ts:552](../../src/modules/ai/openai-memo-parser.service.ts#L552) |
| 502 / ApiError | "OpenAI returned end_datetime earlier than start_datetime" | [src/modules/ai/openai-memo-parser.service.ts:621](../../src/modules/ai/openai-memo-parser.service.ts#L621) |

## OPENAI_PARSE_INVALID_RECURRENCE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 502 / ApiError | `AI returned recurrence conditions that cannot be applied: ${invalid_recurrence.cause_code}` | [src/modules/ai/openai-memo-parser.service.ts:649](../../src/modules/ai/openai-memo-parser.service.ts#L649) |
| 502 / ApiError | "A single shifted occurrence was applied to every matching weekday" | [src/modules/ai/openai-memo-parser.service.ts:689](../../src/modules/ai/openai-memo-parser.service.ts#L689) |

## ORG_API_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | `Missing required scope: ${scope}` | [src/modules/org-api/org-api-auth.ts:101](../../src/modules/org-api/org-api-auth.ts#L101) |

## ORG_API_IP_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "This IP is not allowed for the organization API key" | [src/modules/org-api/org-api-auth.ts:66](../../src/modules/org-api/org-api-auth.ts#L66) |

## ORG_API_UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Organization API key is required" | [src/modules/org-api/org-api-auth.ts:23](../../src/modules/org-api/org-api-auth.ts#L23) |
| 401 / ApiError | "Organization API key is invalid" | [src/modules/org-api/org-api-auth.ts:52](../../src/modules/org-api/org-api-auth.ts#L52) |
| 401 / ApiError | "Organization API key has expired" | [src/modules/org-api/org-api-auth.ts:57](../../src/modules/org-api/org-api-auth.ts#L57) |
| 401 / ApiError | "Organization API key is invalid" | [src/modules/org-api/org-api-auth.ts:92](../../src/modules/org-api/org-api-auth.ts#L92) |

## ORG_PROJECT_DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Department not found: ${key}` | [src/modules/company-projects/company-projects.service.ts:3736](../../src/modules/company-projects/company-projects.service.ts#L3736) |

## ORG_PROJECT_DEPENDENCY_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Dependency work item not found" | [src/modules/company-projects/company-projects.service.ts:4143](../../src/modules/company-projects/company-projects.service.ts#L4143) |

## ORG_PROJECT_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Member not found: ${key}` | [src/modules/company-projects/company-projects.service.ts:3757](../../src/modules/company-projects/company-projects.service.ts#L3757) |

## ORG_PROJECT_ORIGIN_DEPARTMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Origin department not found" | [src/modules/company-projects/company-projects.service.ts:3716](../../src/modules/company-projects/company-projects.service.ts#L3716) |

## ORG_PROJECT_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more parent work items could not be resolved" | [src/modules/company-projects/company-projects.service.ts:4127](../../src/modules/company-projects/company-projects.service.ts#L4127) |

## ORG_PROJECT_PHASE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | `Phase not found: ${item_input.external_phase_id.trim()}` | [src/modules/company-projects/company-projects.service.ts:3968](../../src/modules/company-projects/company-projects.service.ts#L3968) |

## ORG_PROJECT_PHASELESS_WITH_PHASES

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Phase-less projects cannot include phases or phase references" | [src/modules/company-projects/company-projects.service.ts:3699](../../src/modules/company-projects/company-projects.service.ts#L3699) |

## ORIGIN_DEPARTMENT_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule origin department is missing" | [src/modules/company-schedules/company-schedules.service.ts:918](../../src/modules/company-schedules/company-schedules.service.ts#L918) |

## PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Parent work item not found" | [src/modules/company-projects/company-projects.service.ts:464](../../src/modules/company-projects/company-projects.service.ts#L464) |

## PROJECT_ASSIGNMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the assignee can update this assignment" | [src/modules/company-projects/company-projects.service.ts:3336](../../src/modules/company-projects/company-projects.service.ts#L3336) |
| 403 / ApiError | "Only the assignee can create reminders" | [src/modules/company-projects/company-projects.service.ts:3429](../../src/modules/company-projects/company-projects.service.ts#L3429) |

## PROJECT_ASSIGNMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project assignment not found" | [src/modules/company-projects/company-projects.service.ts:2252](../../src/modules/company-projects/company-projects.service.ts#L2252) |
| 404 / ApiError | "Project assignment not found" | [src/modules/company-projects/company-projects.service.ts:3325](../../src/modules/company-projects/company-projects.service.ts#L3325) |
| 404 / ApiError | "Project assignment not found" | [src/modules/company-projects/company-projects.service.ts:3415](../../src/modules/company-projects/company-projects.service.ts#L3415) |

## PROJECT_DEPENDENCY_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Project dependency creates a cycle" | [src/modules/company-projects/company-projects.service.ts:560](../../src/modules/company-projects/company-projects.service.ts#L560) |
| 400 / ApiError | "Project dependency creates a cycle" | [src/modules/company-projects/company-projects.service.ts:2446](../../src/modules/company-projects/company-projects.service.ts#L2446) |

## PROJECT_DEPENDENCY_EXISTS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Project dependency already exists" | [src/modules/company-projects/company-projects.service.ts:2420](../../src/modules/company-projects/company-projects.service.ts#L2420) |

## PROJECT_DEPENDENCY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project dependency not found" | [src/modules/company-projects/company-projects.service.ts:2504](../../src/modules/company-projects/company-projects.service.ts#L2504) |

## PROJECT_LAST_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Add another owner before removing or demoting the last owner" | [src/modules/company-projects/project-member-lifecycle.ts:14](../../src/modules/company-projects/project-member-lifecycle.ts#L14) |

## PROJECT_MANAGEMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | owner_only ? "Project owner role required" : "Project owner or manager role required" | [src/modules/company-projects/project-management-access.ts:11](../../src/modules/company-projects/project-management-access.ts#L11) |
| 403 / ApiError | "Active project owner required" | [src/modules/company-projects/project-member-lifecycle.ts:9](../../src/modules/company-projects/project-member-lifecycle.ts#L9) |

## PROJECT_MEMBER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project member not found" | [src/modules/company-projects/company-projects.service.ts:1288](../../src/modules/company-projects/company-projects.service.ts#L1288) |
| 404 / ApiError | "Project member not found" | [src/modules/company-projects/company-projects.service.ts:1351](../../src/modules/company-projects/company-projects.service.ts#L1351) |

## PROJECT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project not found" | [src/modules/company-projects/project-management-access.ts:7](../../src/modules/company-projects/project-management-access.ts#L7) |

## PROJECT_ORIGIN_DEPARTMENT_FORBIDDEN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Users can create projects only for their own department" | [src/modules/company-projects/company-projects.service.ts:962](../../src/modules/company-projects/company-projects.service.ts#L962) |

## PROJECT_PHASE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project phase not found" | [src/modules/company-projects/company-projects.service.ts:1521](../../src/modules/company-projects/company-projects.service.ts#L1521) |
| 404 / ApiError | "Project phase not found" | [src/modules/company-projects/company-projects.service.ts:1604](../../src/modules/company-projects/company-projects.service.ts#L1604) |
| 404 / ApiError | "Project phase not found" | [src/modules/company-projects/company-projects.service.ts:1675](../../src/modules/company-projects/company-projects.service.ts#L1675) |
| 404 / ApiError | "Project phase not found" | [src/modules/company-projects/company-projects.service.ts:1776](../../src/modules/company-projects/company-projects.service.ts#L1776) |

## PROJECT_PHASELESS

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Phase-less projects cannot add phases" | [src/modules/company-projects/company-projects.service.ts:1480](../../src/modules/company-projects/company-projects.service.ts#L1480) |
| 400 / ApiError | "Phase-less project work items cannot use phase" | [src/modules/company-projects/company-projects.service.ts:1667](../../src/modules/company-projects/company-projects.service.ts#L1667) |
| 400 / ApiError | "Phase-less project work items cannot use phase" | [src/modules/company-projects/company-projects.service.ts:1765](../../src/modules/company-projects/company-projects.service.ts#L1765) |

## PROJECT_PRESET_COPY_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work items could not be copied" | [src/modules/company-projects/company-project-presets.service.ts:639](../../src/modules/company-projects/company-project-presets.service.ts#L639) |

## PROJECT_PRESET_DEPENDENCY_CYCLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency creates a cycle" | [src/modules/company-projects/company-project-presets.service.ts:157](../../src/modules/company-projects/company-project-presets.service.ts#L157) |

## PROJECT_PRESET_DEPENDENCY_SELF_REFERENCE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency cannot reference itself" | [src/modules/company-projects/company-project-presets.service.ts:331](../../src/modules/company-projects/company-project-presets.service.ts#L331) |

## PROJECT_PRESET_DEPENDENCY_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset dependency work item key not found" | [src/modules/company-projects/company-project-presets.service.ts:328](../../src/modules/company-projects/company-project-presets.service.ts#L328) |

## PROJECT_PRESET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project preset not found" | [src/modules/company-projects/company-project-presets.service.ts:111](../../src/modules/company-projects/company-project-presets.service.ts#L111) |

## PROJECT_PRESET_PARENT_WORK_ITEM_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work item keys could not be resolved" | [src/modules/company-projects/company-project-presets.service.ts:315](../../src/modules/company-projects/company-project-presets.service.ts#L315) |

## PROJECT_PRESET_PARENT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "One or more preset parent work items could not be resolved" | [src/modules/company-projects/company-project-presets.service.ts:912](../../src/modules/company-projects/company-project-presets.service.ts#L912) |

## PROJECT_PRESET_PHASE_KEY_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset phase key not found" | [src/modules/company-projects/company-project-presets.service.ts:267](../../src/modules/company-projects/company-project-presets.service.ts#L267) |

## PROJECT_PRESET_VERSION_ARCHIVED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Archived preset versions cannot create projects" | [src/modules/company-projects/company-project-presets.service.ts:779](../../src/modules/company-projects/company-project-presets.service.ts#L779) |

## PROJECT_PRESET_VERSION_NOT_DRAFT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Only draft preset versions can be edited" | [src/modules/company-projects/company-project-presets.service.ts:697](../../src/modules/company-projects/company-project-presets.service.ts#L697) |

## PROJECT_PRESET_VERSION_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project preset version not found" | [src/modules/company-projects/company-project-presets.service.ts:124](../../src/modules/company-projects/company-project-presets.service.ts#L124) |

## PROJECT_PRESET_VERSION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Project preset has no version" | [src/modules/company-projects/company-project-presets.service.ts:776](../../src/modules/company-projects/company-project-presets.service.ts#L776) |

## PROJECT_PRESET_WORK_ITEM_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Preset work item depth cannot exceed 5" | [src/modules/company-projects/company-project-presets.service.ts:274](../../src/modules/company-projects/company-project-presets.service.ts#L274) |

## PROJECT_WORK_ASSIGNMENT_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work assignment not found" | [src/modules/reminders/reminders.service.ts:52](../../src/modules/reminders/reminders.service.ts#L52) |

## PROJECT_WORK_ITEM_DEPTH_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Work item depth cannot exceed 5" | [src/modules/company-projects/company-projects.service.ts:468](../../src/modules/company-projects/company-projects.service.ts#L468) |
| 400 / ApiError | "Work item depth cannot exceed 5" | [src/modules/company-projects/company-projects.service.ts:504](../../src/modules/company-projects/company-projects.service.ts#L504) |

## PROJECT_WORK_ITEM_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work item not found" | [src/modules/company-projects/company-projects.service.ts:404](../../src/modules/company-projects/company-projects.service.ts#L404) |
| 404 / ApiError | "Project work item not found" | [src/modules/company-projects/company-projects.service.ts:3440](../../src/modules/company-projects/company-projects.service.ts#L3440) |
| 404 / ApiError | "Project work item not found" | [src/modules/reminders/reminders.service.ts:67](../../src/modules/reminders/reminders.service.ts#L67) |

## PROJECT_WORK_REMINDER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project work reminder not found" | [src/modules/company-projects/company-projects.service.ts:3542](../../src/modules/company-projects/company-projects.service.ts#L3542) |

## PROJECT_WORK_REMINDER_TARGET_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Project reminder target not found" | [src/modules/reminders/reminders.service.ts:37](../../src/modules/reminders/reminders.service.ts#L37) |

## PUBLIC_UID_GENERATION_FAILED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 500 / ApiError | "Could not generate a unique public UID" | [src/common/utils/ids.ts:30](../../src/common/utils/ids.ts#L30) |

## PUSH_DEVICE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "Push device not found." | [src/admin/modules/push-notifications/push-notifications.controller.ts:260](../../src/admin/modules/push-notifications/push-notifications.controller.ts#L260) |
| 404 / ApiError | "Push device not found" | [src/modules/push/push-devices.service.ts:114](../../src/modules/push/push-devices.service.ts#L114) |
| 404 / ApiError | "Push device not found" | [src/modules/push/push-devices.service.ts:141](../../src/modules/push/push-devices.service.ts#L141) |

## RECURRENCE_LIMIT_EXCEEDED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Recurring schedule would create too many occurrences" | [src/common/utils/recurrence.ts:258](../../src/common/utils/recurrence.ts#L258) |

## RECURRENCE_OCCURRENCE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Recurring schedule must create at least one occurrence" | [src/common/utils/recurrence.ts:276](../../src/common/utils/recurrence.ts#L276) |
| 400 / ApiError | "Recurrence must produce at least one occurrence" | [src/modules/schedules/schedule-series.service.ts:60](../../src/modules/schedules/schedule-series.service.ts#L60) |

## REMINDER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Reminder not found" | [src/modules/reminders/reminders.service.ts:238](../../src/modules/reminders/reminders.service.ts#L238) |
| 404 / ApiError | "Reminder not found" | [src/modules/reminders/reminders.service.ts:305](../../src/modules/reminders/reminders.service.ts#L305) |
| 404 / ApiError | "Reminder not found" | [src/modules/reminders/reminders.service.ts:376](../../src/modules/reminders/reminders.service.ts#L376) |

## RESOURCE_CONFLICT

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Resource already exists" | [src/common/http/error-middleware.ts:13](../../src/common/http/error-middleware.ts#L13) |

## RESOURCE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Resource not found" | [src/common/http/error-middleware.ts:17](../../src/common/http/error-middleware.ts#L17) |

## ROUTE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Route not found" | [src/app.ts:46](../../src/app.ts#L46) |

## SCHEDULE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:58](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L58) |
| 404 / ApiError | "Owned schedule not found" | [src/modules/schedules/schedule-series.service.ts:12](../../src/modules/schedules/schedule-series.service.ts#L12) |
| 404 / ApiError | "Schedule not found" | [src/modules/schedules/schedules.service.ts:65](../../src/modules/schedules/schedules.service.ts#L65) |
| 404 / ApiError | "Schedule not found" | [src/modules/schedules/schedules.service.ts:125](../../src/modules/schedules/schedules.service.ts#L125) |
| 404 / ApiError | "Schedule not found" | [src/modules/schedules/schedules.service.ts:150](../../src/modules/schedules/schedules.service.ts#L150) |
| 404 / ApiError | "Schedule not found" | [src/modules/schedules/schedules.service.ts:321](../../src/modules/schedules/schedules.service.ts#L321) |
| 404 / ApiError | "Schedule not found" | [src/modules/schedules/schedules.service.ts:340](../../src/modules/schedules/schedules.service.ts#L340) |
| 404 / ApiError | "Schedule not found" | [src/modules/tasks/task-ordering.ts:29](../../src/modules/tasks/task-ordering.ts#L29) |

## SCHEDULE_NOT_RECURRING

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule is not part of a recurring series" | [src/modules/schedules/schedule-series.service.ts:13](../../src/modules/schedules/schedule-series.service.ts#L13) |

## SCHEDULE_OWNER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Only the owner can change category or visibility" | [src/modules/schedules/schedules.service.ts:345](../../src/modules/schedules/schedules.service.ts#L345) |

## SCHEDULE_SERIES_CHANGED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Series changed; refresh before retrying" | [src/modules/schedules/schedule-series.service.ts:18](../../src/modules/schedules/schedule-series.service.ts#L18) |

## SCHEDULE_SHARE_LINK_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 410 / ApiError | "Schedule share link is disabled" | [src/modules/schedule-sharing/schedule-sharing.service.ts:90](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L90) |

## SCHEDULE_SHARE_LINK_EXPIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 410 / ApiError | "Schedule share link is expired" | [src/modules/schedule-sharing/schedule-sharing.service.ts:94](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L94) |

## SCHEDULE_SHARE_LINK_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule share link not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:187](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L187) |
| 404 / ApiError | "Schedule share link not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:240](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L240) |
| 404 / ApiError | "Schedule share link not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:271](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L271) |

## SCHEDULE_SHARE_LINK_USED_UP

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Schedule share link has reached its max uses" | [src/modules/schedule-sharing/schedule-sharing.service.ts:98](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L98) |
| 409 / ApiError | "Schedule share link has reached its max uses" | [src/modules/schedule-sharing/schedule-sharing.service.ts:329](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L329) |

## SCHEDULE_SHARE_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Schedule share not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:388](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L388) |
| 404 / ApiError | "Schedule share not found" | [src/modules/schedule-sharing/schedule-sharing.service.ts:447](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L447) |

## SCHEDULE_SHARE_OWNER_CANNOT_JOIN

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Schedule owner cannot join their own share link" | [src/modules/schedule-sharing/schedule-sharing.service.ts:277](../../src/modules/schedule-sharing/schedule-sharing.service.ts#L277) |

## SCHEDULE_TARGET_NOT_APPLICABLE

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "schedule_id can only be used with task actions" | [src/modules/ai-chat/ai-chat.service.ts:1088](../../src/modules/ai-chat/ai-chat.service.ts#L1088) |

## SCHEDULE_TARGET_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "At least one schedule target is required" | [src/company-admin/modules/schedules/schedules.controller.ts:130](../../src/company-admin/modules/schedules/schedules.controller.ts#L130) |
| 400 / ApiError | "At least one schedule target is required" | [src/modules/companies/companies.service.ts:428](../../src/modules/companies/companies.service.ts#L428) |

## SCHEDULE_TARGET_TYPE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "target_type is required when target_id is provided" | [src/company-admin/modules/schedules/schedules.controller.ts:191](../../src/company-admin/modules/schedules/schedules.controller.ts#L191) |

## SERIES_LINKED_DATA_CONFIRMATION_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Removed occurrences have linked tasks, shares, or reminders; set confirm_remove_linked=true" | [src/modules/schedules/schedule-series.service.ts:28](../../src/modules/schedules/schedule-series.service.ts#L28) |

## SESSION_REVOKED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / ApiError | "Session is invalid or expired" | [src/common/auth/sessions.ts:23](../../src/common/auth/sessions.ts#L23) |

## SIGNUP_DISABLED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Signup is currently disabled" | [src/common/signup-settings.ts:77](../../src/common/signup-settings.ts#L77) |

## SIGNUP_DOMAIN_NOT_ALLOWED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | "Email domain is not allowed for signup" | [src/common/signup-settings.ts:86](../../src/common/signup-settings.ts#L86) |

## TASK_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / ApiError | "Task not found" | [src/modules/tasks/task-ordering.ts:38](../../src/modules/tasks/task-ordering.ts#L38) |
| 404 / ApiError | "Task not found" | [src/modules/tasks/tasks.service.ts:37](../../src/modules/tasks/tasks.service.ts#L37) |
| 404 / ApiError | "Task not found" | [src/modules/tasks/tasks.service.ts:106](../../src/modules/tasks/tasks.service.ts#L106) |

## TASK_ORDER_MISMATCH

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 409 / ApiError | "Send every task in the schedule exactly once; refresh and retry" | [src/modules/tasks/task-ordering.ts:142](../../src/modules/tasks/task-ordering.ts#L142) |

## TASK_SCHEDULE_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Task order requires a linked schedule" | [src/modules/tasks/task-ordering.ts:32](../../src/modules/tasks/task-ordering.ts#L32) |

## UNAUTHORIZED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 401 / AdminApiError | "Admin token is invalid or expired." | [src/admin/common/admin-auth.ts:56](../../src/admin/common/admin-auth.ts#L56) |
| 401 / AdminApiError | "Admin token is invalid or expired." | [src/admin/common/admin-authenticate.ts:10](../../src/admin/common/admin-authenticate.ts#L10) |
| 401 / AdminApiError | "Admin token is invalid or expired." | [src/admin/common/admin-authenticate.ts:32](../../src/admin/common/admin-authenticate.ts#L32) |
| 401 / AdminApiError | "Admin token is invalid or expired." | [src/admin/common/admin-authenticate.ts:39](../../src/admin/common/admin-authenticate.ts#L39) |
| 401 / AdminApiError | "Admin email or password is invalid." | [src/admin/modules/auth/auth.controller.ts:38](../../src/admin/modules/auth/auth.controller.ts#L38) |
| 401 / AdminApiError | "Admin token is invalid or expired." | [src/admin/modules/auth/auth.controller.ts:99](../../src/admin/modules/auth/auth.controller.ts#L99) |
| 401 / ApiError | "Access token is required" | [src/common/middleware/authenticate.ts:13](../../src/common/middleware/authenticate.ts#L13) |
| 401 / ApiError | "User no longer exists" | [src/common/middleware/authenticate.ts:34](../../src/common/middleware/authenticate.ts#L34) |
| 401 / ApiError | "Invalid or expired access token" | [src/common/middleware/authenticate.ts:51](../../src/common/middleware/authenticate.ts#L51) |
| 401 / ApiError | "User not found" | [src/modules/auth/google-auth.service.ts:210](../../src/modules/auth/google-auth.service.ts#L210) |

## USER_NOT_FOUND

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 404 / AdminApiError | "User not found." | [src/admin/modules/push-notifications/push-notifications.controller.ts:217](../../src/admin/modules/push-notifications/push-notifications.controller.ts#L217) |
| 404 / ApiError | "User not found" | [src/modules/ai-chat/ai-chat.service.ts:581](../../src/modules/ai-chat/ai-chat.service.ts#L581) |
| 404 / ApiError | "User not found" | [src/modules/companies/companies.service.ts:667](../../src/modules/companies/companies.service.ts#L667) |
| 404 / ApiError | "User not found" | [src/modules/companies/companies.service.ts:1056](../../src/modules/companies/companies.service.ts#L1056) |
| 404 / ApiError | "User not found" | [src/modules/companies/companies.service.ts:1127](../../src/modules/companies/companies.service.ts#L1127) |
| 404 / ApiError | "User not found" | [src/modules/companies/member-invite-acceptance.ts:9](../../src/modules/companies/member-invite-acceptance.ts#L9) |
| 404 / ApiError | "User not found" | [src/modules/friends/friends.service.ts:257](../../src/modules/friends/friends.service.ts#L257) |
| 404 / ApiError | "User not found" | [src/modules/home/home.service.ts:553](../../src/modules/home/home.service.ts#L553) |
| 404 / ApiError | "User not found" | [src/modules/schedules/schedules.service.ts:217](../../src/modules/schedules/schedules.service.ts#L217) |
| 404 / ApiError | "User not found" | [src/modules/users/users.service.ts:14](../../src/modules/users/users.service.ts#L14) |
| 404 / ApiError | "User not found" | [src/modules/users/users.service.ts:61](../../src/modules/users/users.service.ts#L61) |

## USER_REQUIRED

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | "A Flowra user account is required to activate a company admin without invite acceptance." | [src/admin/modules/companies/companies.controller.ts:1357](../../src/admin/modules/companies/companies.controller.ts#L1357) |

## VALIDATION_ERROR

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "Invalid status" | [src/modules/org-api/org-api.controller.ts:32](../../src/modules/org-api/org-api.controller.ts#L32) |
| 400 / ApiError | "Invalid status" | [src/modules/org-api/org-api.controller.ts:51](../../src/modules/org-api/org-api.controller.ts#L51) |
| 400 / ApiError | "Invalid linked" | [src/modules/org-api/org-api.controller.ts:54](../../src/modules/org-api/org-api.controller.ts#L54) |

## 式: access_issue.code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / AdminApiError | access_issue.message | [src/admin/modules/companies/companies.controller.ts:633](../../src/admin/modules/companies/companies.controller.ts#L633) |
| 400 / AdminApiError | access_issue.message | [src/admin/modules/companies/companies.controller.ts:782](../../src/admin/modules/companies/companies.controller.ts#L782) |
| 400 / AdminApiError | access_issue.message | [src/admin/modules/companies/companies.controller.ts:1366](../../src/admin/modules/companies/companies.controller.ts#L1366) |
| 403 / ApiError | access_issue.message | [src/common/middleware/authenticate.ts:40](../../src/common/middleware/authenticate.ts#L40) |
| 403 / ApiError | access_issue.message | [src/company-admin/modules/auth/auth.controller.ts:55](../../src/company-admin/modules/auth/auth.controller.ts#L55) |
| 403 / ApiError | access_issue.message | [src/modules/auth/auth.service.ts:229](../../src/modules/auth/auth.service.ts#L229) |
| 403 / ApiError | access_issue.message | [src/modules/auth/auth.service.ts:413](../../src/modules/auth/auth.service.ts#L413) |
| 400 / ApiError | access_issue.message | [src/modules/companies/companies.service.ts:672](../../src/modules/companies/companies.service.ts#L672) |
| 400 / ApiError | access_issue.message | [src/modules/companies/companies.service.ts:933](../../src/modules/companies/companies.service.ts#L933) |
| 400 / ApiError | access_issue.message | [src/modules/companies/companies.service.ts:1061](../../src/modules/companies/companies.service.ts#L1061) |
| 400 / ApiError | access_issue.message | [src/modules/companies/companies.service.ts:1132](../../src/modules/companies/companies.service.ts#L1132) |

## 式: code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | message | [src/modules/company-projects/company-project-presets.service.ts:136](../../src/modules/company-projects/company-project-presets.service.ts#L136) |

## 式: error_code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 400 / ApiError | "end date must be after start date" | [src/modules/company-projects/company-projects.service.ts:74](../../src/modules/company-projects/company-projects.service.ts#L74) |

## 式: exists ? "MEMO_PARSE_IN_PROGRESS" : "MEMO_NOT_FOUND"

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| exists ? 409 : 404 / ApiError | exists ? "Memo parsing is already in progress" : "Memo not found" | [src/modules/ai/ai.service.ts:836](../../src/modules/ai/ai.service.ts#L836) |

## 式: issue.code

| 생성 status / 종류 | 메시지 또는 식 | 발생 지점 |
| --- | --- | --- |
| 403 / ApiError | issue.message | [src/modules/auth/google-auth.service.ts:36](../../src/modules/auth/google-auth.service.ts#L36) |
| 403 / ApiError | issue.message | [src/modules/companies/company-admin-invite.service.ts:27](../../src/modules/companies/company-admin-invite.service.ts#L27) |
| 403 / ApiError | issue.message | [src/modules/companies/member-invite-acceptance.ts:11](../../src/modules/companies/member-invite-acceptance.ts#L11) |

