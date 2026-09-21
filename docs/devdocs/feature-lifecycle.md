# 생성 이후 관리 API — 개발·디버깅 계약

> 백엔드 저장소에서 가져온 2026-09-16 기준 참고 자료입니다. 아래 `src/...` 경로·줄 번호·생성/검증 명령은 원본 백엔드 기준이며, 이 프런트엔드 저장소에는 해당 소스와 도구가 없습니다. 현재 웹 반영 범위는 [문서 안내](../README.md)를 참고하세요.

기준: 2026-09-16. 백엔드의 생성 이후 관리 기능 12개 구현 결과다. 아래 사용자 API는 `/api/v1`, 기업 관리자 API는 `/company-admin/api/v1`를 앞에 붙인다. 정상 응답은 `{success:true,message,data}`이며 ID는 응답 값을 그대로 보존한다. 사용자 앱 연결 범위는 [웹 반영 기록](../qa/spec-alignment.md)에서 확인한다.

## F01 프로젝트 관리

활성 회사의 활성 구성원이면서 **해당 프로젝트의 활성 owner 또는 manager**여야 한다. 기업 관리자 토큰/권한을 부여하지 않는다. 프로젝트 멤버 추가·역할 변경·제거는 owner만 가능하다. 멤버는 같은 회사의 활성 구성원이어야 한다. 마지막 owner를 내리거나 제거하면 `409 PROJECT_LAST_OWNER_REQUIRED`다. 다른 owner를 먼저 추가한다. 관리 권한이 없으면 `403 PROJECT_MANAGEMENT_FORBIDDEN`이다.

| Method | 사용자 경로 | data 필드 |
| --- | --- | --- |
| PATCH | `/company-projects/:company_project_id` | project |
| GET / POST | `/company-projects/:company_project_id/members` | members / member |
| PATCH / DELETE | `/company-projects/:company_project_id/members/:project_member_id` | member |
| POST | `/company-projects/:company_project_id/phases` | phase |
| PATCH / DELETE | `/company-projects/:company_project_id/phases/:phase_id` | phase |
| POST | `/company-projects/:company_project_id/work-items` | work_item |
| PATCH / DELETE | `/company-projects/:company_project_id/work-items/:work_item_id` | work_item |
| PUT | `/company-projects/:company_project_id/work-items/:work_item_id/departments` | departments |
| POST | `/company-projects/:company_project_id/work-items/:work_item_id/assignments` | assignment |
| PATCH | `/company-projects/:company_project_id/work-items/:work_item_id/assignments/:assignment_id` | assignment |
| POST | `/company-projects/:company_project_id/dependencies` | dependency |
| DELETE | `/company-projects/:company_project_id/dependencies/:dependency_id` | empty |
| GET / POST | `/company-projects/:company_project_id/baselines` | baselines / baseline,item_count |
| GET | `/company-projects/:company_project_id/audit-logs` | audit_logs |

요청 body/query는 동일한 기업 프로젝트 API의 DTO: `src/modules/company-projects/company-projects.dto.ts`를 재사용한다. `members` POST는 `{company_member_id,role?}`, PATCH는 `{role?,status?}`. 프로젝트 PATCH `{name?,description?,status?,visibility?,origin_department_id?,planned_start_date?,planned_end_date?,actual_start_date?,actual_end_date?,completed_at?}`. 날짜는 YYYY-MM-DD, completed_at은 ISO datetime이다. 프로젝트 보관은 `{status:"archived"}`. phase/work item DELETE는 기존 로직대로 취소 상태 변경이며 물리 삭제로 표시하지 않는다. 기존 사용자 자신의 배정 수정 API도 유지한다. 기록되는 관리 actor는 `company_member`이고 관리자 ID를 대입하지 않는다.

## F02 승인 요청 철회

`POST /company-schedule-approvals/:approval_id/withdraw`, body 없음.

- 작성자 본인의 요청에 속한 approval ID를 사용한다. 일정 ID나 change_request ID를 넣지 않는다.
- 같은 일정/변경 요청의 승인 중 하나라도 결정됐으면 `409 COMPANY_SCHEDULE_REQUEST_ALREADY_DECIDED`. 이미 철회한 요청도 동일하다.
- 생성 요청: 연결 승인들을 `withdrawn`, 일정은 `cancelled`/approval_status=`withdrawn`, pending target은 `removed`로 처리한다.
- 변경 요청: 요청과 연결 승인을 `withdrawn`으로 바꾸고 기존 일정/대상은 유지한다.
- 응답 data: `{company_schedule_id,change_request_id,status:"withdrawn"}`. 승인 목록은 `status=withdrawn` 필터를 지원한다.
- 승인/반려/철회는 같은 일정 행 잠금을 사용하므로 하나의 최종 결과만 적용된다. 409 발생 시 승인 현황을 다시 조회한다.

## F03 기존 미연결 멤버 가입

기존 `POST /members/invite`(기업 관리자)와 사용자 초대 수락 API를 사용한다. 별도 link-user 우회는 없다.

- 조직 연동으로 active 미연결 멤버가 먼저 등록돼 있어도 초대 가능하다. 초대의 부서는 해당 구성원의 기존 부서와 같아야 한다. 다르면 `409 COMPANY_MEMBER_DEPARTMENT_MISMATCH`.
- 초대 생성 시 기존 구성원 ID를 고정한다. 수락은 이메일 인증을 마친 같은 이메일의 사용자만 가능하다.
- 수락 시 구성원 ID·외부 직원 ID·이름·기존 joined_at과 이력을 보존하고 user_id/status를 연결한다. 기존 identity가 다른 사용자였으면 재사용할 수 없다.
- 초대 대상이 바뀌거나 여러 구성원과 매칭되면 `409 COMPANY_MEMBER_IDENTITY_CONFLICT`. 수락 전에 부서가 바뀌면 `409 COMPANY_MEMBER_DEPARTMENT_CHANGED`. 정상 대상/부서를 정리하고 새 초대를 발급한다.
- `EMAIL_VERIFICATION_REQUIRED`/계정 접근 오류는 이메일 인증/계정 상태를 먼저 해결한다. 만료·수락·철회·거절된 초대는 `409 COMPANY_INVITE_NOT_PENDING`.

## F04 초대 목록·철회·재발급·거절

기업 관리자:

| Method / path | 입력 | 결과 |
| --- | --- | --- |
| GET `/invites` | query `invite_type=company_member|company_admin`(기본 member), `limit` 1~100(기본50), `before_id` 이전 next_cursor | `{invites,pagination:{has_more,next_cursor}}` |
| POST `/invites/:invite_id/revoke` | 같은 invite_type query, body 없음 | empty |
| POST `/invites/:invite_id/resend` | 같은 invite_type query, body 없음 | `{company_invite_id,invite_token,expires_at,email_sent}` |

member 종류는 `company.members.read/write`, admin 종류는 `company.admins.read/write`를 요구한다. admin write는 company 범위 owner만 가능하다. member 초대 목록/변경은 담당 부서 범위를 적용한다. 목록은 최신 ID부터이며 토큰 해시나 원문을 반환하지 않는다. 만료 시각을 지난 pending은 목록에 expired로 표시한다.

철회는 pending만, 재발급은 pending/expired만 허용한다. 맞는 상태의 접근 가능한 대상이 없으면 `409 COMPANY_INVITE_NOT_PENDING`. 재발급은 같은 invite ID의 토큰을 회전하고 7일 만료를 설정한다. 기존 링크는 더 이상 수락할 수 없다. member는 메일을 발송하고 `email_sent`로 결과를 알린다. admin은 기존 제품 방식대로 반환된 토큰을 수신자에게 전달한다. 메일 전송과 DB 저장은 하나의 트랜잭션이 아니므로 발송 실패 시 목록 상태를 확인하고 재발급한다.

수신자: `POST /company-memberships/invites/by-id/:company_invite_id/reject`, 사용자 인증, body 없음. 본인 이메일의 유효한 pending 멤버 초대만 거절한다. 수락/거절/철회가 경합하면 하나만 성공한다. 성공 후 초대 목록을 갱신한다.

기업 관리자 화면 **초대 관리**에서 종류 전환, 페이지 추가 조회, 철회, 재발급이 가능하다. 권한 없는 동작은 표시하지 않는다.

## F05 채팅 페이지 조회

- `GET /ai-chat/sessions?status=active&limit=30&cursor=...`: data.sessions 유지 + `pagination:{has_more,next_cursor}` 추가. limit 최대100. 최근 last_message_at, ID 내림차순.
- `GET /ai-chat/sessions/:session_id/messages?limit=50&cursor=...`: 최신 페이지를 가져오되 **페이지 내부는 오래된 메시지부터** 반환한다. data.messages + pagination. next_cursor로 더 과거 페이지를 받아 기존 배열 앞에 붙인다. limit 최대100.
- 메시지 호출에서 limit/cursor를 모두 생략하면 기존 전체 조회 응답을 유지한다. 세션 상세 GET도 기존 전체 메시지 응답이다. 큰 채팅방 화면은 분할 메시지 API를 사용한다.
- cursor는 불투명 문자열이다. 직접 생성/해석하지 않는다. 다른 사용자/다른 세션 cursor, 잘못된 cursor, 삭제된 경계 행은 `400 INVALID_CURSOR`; 첫 페이지부터 새로 조회한다.
- DB cursor로 timestamp의 마이크로초와 동일 시각의 ID 순서를 보존한다. 세션 목록은 메시지 전송으로 순서가 바뀌므로 스냅샷이 아니다. 앱은 ID 중복 제거와 새로고침을 지원한다.

## F06 개인 반복 일정 관리

`GET /schedules/:schedule_id/series` → `{recurrence_group_id,recurrence_rule,schedules}`. 그룹에 속한 본인 일정의 ID 하나를 사용한다. 공유 editor는 시리즈를 관리할 수 없다. 비반복 일정은 `400 SCHEDULE_NOT_RECURRING`, 다른 소유자는 404다.

`PATCH /schedules/:schedule_id/series`:

```json
{
  "scope": "following",
  "changes": {"title":"변경된 수업","start_datetime":"2026-10-06T10:00:00+09:00","end_datetime":"2026-10-06T13:00:00+09:00"},
  "recurrence": {"repeat_interval_days":7,"repeat_until":"2026-10-31T23:59:59+09:00","timezone":"Asia/Seoul","weekday_rules":[],"excluded_dates":[],"max_occurrences":500},
  "include_exceptions": false,
  "confirm_remove_linked": false
}
```

- scope 필수: single=선택 일정, following=선택 sequence부터, all=그룹 전체. 시각이 바뀐 예외도 sequence 기준이다.
- changes는 기존 일정 PATCH 필드이고 최소1개, 또는 recurrence를 제공한다. single은 recurrence를 허용하지 않는다. all/following의 날짜 변경은 recurrence를 함께 보내야 한다.
- recurrence는 **전체 규칙 교체**다. repeat_interval_days/repeat_until 필수. timezone 생략은 사용자 timezone, weekday_rules/excluded_dates 기본[], max_occurrences 기본500. 기존 예외 날짜를 유지하려면 GET 결과를 함께 반영한다.
- 규칙 교체의 시작은 all이면 현재 그룹 첫 일정, following이면 선택 일정이다. changes.start_datetime/end_datetime으로 시작/종료를 명확히 지정할 수 있다. 동일 상대 sequence는 기존 ID를 재사용하고 초과 발생은 추가한다. following 규칙 변경은 앞부분과 새 그룹으로 분리한다.
- single PATCH 및 기존 개별 PATCH는 `recurrence_exception=true`. 기본적으로 전체/이후 PATCH는 이 행의 내용·시각을 보존하고 skipped_exception_ids로 알려 준다. include_exceptions=true이면 함께 덮어쓴다. 예외 보존으로 새 규칙 범위 밖의 기존 예외가 남을 수 있다.
- 유지된 일정의 작업 연결/공유를 유지하고, 이동한 일정의 미발송 리마인더는 시작 시각 변화량만큼 이동한다. 새 발생에는 기존 공유·작업·알림을 복제하지 않는다.
- 삭제될 발생에 작업/공유/공유링크/알림이 있으면 `409 SERIES_LINKED_DATA_CONFIRMATION_REQUIRED`와 counts를 반환하고 **전체 요청을 롤백**한다. 앱에서 영향 안내 후 사용자가 확인하면 confirm_remove_linked=true로 다시 요청한다.
- 응답: `{recurrence_group_id,schedules,skipped_exception_ids,removed_schedule_ids,unlinked_tasks,removed_shares,removed_reminders,removed_share_links}`. schedules는 생성/수정된 행이다. 보존된 예외와 그룹 전체 상태는 GET으로 다시 조회한다.

`DELETE /schedules/:schedule_id/series` body: `{scope:"single|following|all",confirm_remove_linked:false}`. 같은 연결 데이터 확인 정책을 사용한다. 삭제 일정에 연결된 작업은 삭제하지 않고 schedule_id=null로 분리한다. 공유/공유링크/일정 알림은 삭제한다. single 삭제는 그룹의 제외 날짜, following 삭제는 종료 규칙에 반영한다. 응답은 삭제 ID와 연결 데이터 영향 counts다.

## F07 공유 일정 나가기 / F08 친구 요청 취소

- `POST /shared-schedules/:schedule_share_id/leave`: 본인의 share만 revoked, body 없음, data empty. ID는 schedule_id가 아닌 schedule_share_id. 본인 이미 revoked 행에는 반복 호출해도 성공한다. 원본/다른 수신자는 유지. 이후 소유자 재공유·유효 링크 재참가로 다시 active가 될 수 있다.
- `POST /friends/requests/:friendship_id/cancel`: 발신자 본인의 pending 요청만 삭제. body 없음, data empty. 이미 수락/거절됐으면 `409 FRIEND_REQUEST_NOT_PENDING`, 없거나 다른 발신자면404. 취소와 수락은 한쪽만 성공. 기존 accepted 친구 삭제 API와 구별한다.

## F09 채팅 수정 / F10 프리셋 정리 / F12 권한 안내

- `PATCH /ai-chat/sessions/:session_id`: `{title?:"1~100자",status?:"active|archived"}`, 최소1필드. data.session 반환. 소유자만 가능하다. archived의 조회/삭제는 가능하며 메시지 전송·제안 적용은409. AI 응답을 기다리는 동안 보관하면 늦게 도착한 assistant 메시지는 저장되지 않는다. 사용자 메시지가 이미 저장됐을 수 있으므로 재전송 전 조회한다.
- 기업 관리자 프리셋 목록의 보관/초안 정리/복원은 기존 PATCH status 사용. 보관은 archived; 복원은 active_version이 있으면 active, 없으면 draft. 원본 프로젝트는 변경하지 않는다. 영구 삭제 버튼이 아니다.
- 역할 편집은 owner 전용 권한을 선택할 수 없고 이유를 표시한다. 회사 범위 권한을 구별하며 편집 중인 커스텀 역할의 회사/부서 범위별 유효 권한을 미리 볼 수 있다. 계정의 실제 유효 권한도 표시한다. 최종 서버 권한/부서 범위 검사는 그대로 유지한다.

## F11 메모 파싱 복구

기존 메모 생성/수정 auto_parse 및 parse 요청 API를 유지한다. 요청 상태를 메모 저장과 함께 DB에 기록한다. setImmediate는 빠른 시작 신호이며 유일한 작업 저장소가 아니다.

- `parse_requested=true`인 행만 실행. 단순 pending, auto_parse=false는 자동 처리하지 않는다.
- 15초 주기, 프로세스당 최대2개. DB 조건부 claim으로 다른 프로세스가 같은 메모를 동시에 처리하지 않는다.
- 실행 임대10분, 1분 주기 갱신. 재시작 후 기존 임대가 만료되면 복구한다. 실패 시 30초/60초 뒤 재시도, 총3회에서 failed. 만료된 세 번째 실행도 failed로 정리한다.
- force 재요청과 내용 수정은 generation을 바꾼다. 이전 외부 AI 호출 자체를 취소하지는 않지만 오래된 결과/오류가 새 상태를 덮어쓸 수 없다. 결과 생성+completed 전이는 한 트랜잭션이다.
- 추적 필드: parse_requested, parse_generation, parse_attempts, parse_lease_until, parse_next_attempt_at, parse_error_message. UI는 parse_status로 표시하고 몇 초 간격으로 조회한다. lease token은 앱 제어값으로 사용하지 않는다.
- 마이그레이션은 기존 processing만 요청됐다고 간주해 복구 대상으로 전환한다. 기존 pending은 auto_parse=false와 구별할 근거가 없어 임의 재처리하지 않는다. 필요한 메모는 명시적으로 parse 요청한다.
- 기존 수동 force=true 재파싱은 유지한다. 자동 polling마다 force를 보내면 현재 작업을 계속 무효화하므로 사용하지 않는다.

## 검증

`npm run test:feature-lifecycle:db`: 임시 PostgreSQL 스키마에 전체 마이그레이션을 적용하고 합성 데이터로 소유권/부서/회사/프로젝트 경계, 경합, cursor, 연결 데이터, 파싱 복구를 검사한 뒤 스키마를 삭제한다. 외부 AI는 stub이다. 기존 권한/채팅삭제/AI 반복 회귀와 회사 패널 빌드도 함께 검증한다.
