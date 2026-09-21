# Flowra AI API

> 개발·장애 조사: [AI 개발자 디버깅 계약](#ai-개발자-디버깅-계약) · [공통 디버깅](../devdocs/debugging-guide.md) · [전체 라우트/DTO](../devdocs/routes-general.md) · [오류 코드 추적](../devdocs/error-index.md)

AI 관련 기능만 따로 모은 참고 문서입니다.

- 사용자 앱 API: `/api/v1`
- 관리자 조회 API: `/admin/api/v1`
- 사용자 앱 응답 envelope는 [api_general.md](./api_general.md) 기준. 관리자 응답은 원본 백엔드의 `api_admin.md`를 참조합니다(현재 프론트 저장소에 미포함).

이 문서는 아래를 설명합니다.

- 메모 AI 파싱 요청
- 파싱 결과 조회
- 파싱 결과를 일정/할 일로 반영
- AI 채팅으로 일정/할 일 제안 생성 및 반영
- 홈/브리핑처럼 AI 결과를 소비하는 API
- 관리자 패널에서 AI 파싱 결과를 조회하는 API

---

## 개요

현재 Flowra의 AI 기능은 `메모 -> AI 구조화 -> 일정/할 일 반영` 흐름과
`AI 채팅 -> 제안 생성 -> 사용자 확인 후 반영` 흐름을 중심으로 동작합니다.

핵심 개념:

- 메모는 `memo.parse_status`를 가짐
  - `pending`
  - `processing`
  - `completed`
  - `failed`
- AI 파싱 결과는 `ai_parse_results`에 저장됨
- AI 결과는 `status`를 가짐
  - `suggested`
  - `partially_applied`
  - `approved`
  - `rejected`
- 메모 생성/수정 시 `auto_parse=true`를 주거나, 별도 parse API를 호출해서 AI 파싱을 트리거할 수 있음
- 파싱 자체는 현재 비동기 큐 방식이며, 요청 직후 바로 완성 결과가 오는 구조는 아님

파싱 요청은 DB에 영속 저장하며, worker가 15초 주기로 요청된 작업을 처리합니다.
실행 lease는 10분이며 만료된 작업은 복구합니다. 최대 3회 시도하고,
force 재요청과 내용 수정은 generation을 바꿔 이전 결과가 새 상태를 덮어쓰지 못하게 합니다.
즉:

- `POST /memos/:memo_id/parse` 는 파싱 작업 시작 요청
- 실제 결과는 `GET /memos/:memo_id/parse-result` 로 폴링 조회

---

## AI 데이터 구조

### Detected Type

AI가 메모를 어떤 성격으로 판단했는지 나타냅니다.

- `schedule`: 일정 중심 메모
- `task`: 할 일/마감 중심 메모
- `note`: 일반 메모
- `mixed`: 일정과 할 일이 함께 포함된 메모

### AI 결과 주요 필드

- `detected_type`
- `extracted_title`
- `extracted_summary`
- `extracted_start_datetime`
- `extracted_end_datetime`
- `extracted_due_datetime`
- `extracted_priority`
- `suggested_actions`
- `confidence_score`
- `status`

### suggested_actions 형식

AI 파싱 결과의 주 데이터입니다. 일정/할 일 제안은 모두 `suggested_actions` 배열로 내려갑니다.

```json
[
  {
    "type": "create_schedule",
    "related_action_index": null,
    "linked_existing_schedule_id": null,
    "title": "러닝",
    "description": "한강 러닝",
    "schedule_type": "personal",
    "priority": null,
    "start_datetime": "2026-06-01T10:00:00+09:00",
    "end_datetime": "2026-06-01T11:00:00+09:00",
    "all_day": false,
    "due_datetime": null,
    "location": "한강공원",
    "visibility": "private",
    "recurrence": {
      "repeat_interval_days": 7,
      "repeat_until": "2026-08-30T10:00:00+09:00",
      "timezone": "Asia/Seoul",
      "weekday_rules": [],
      "excluded_dates": [],
      "max_occurrences": 20
    },
    "reminders": [
      {
        "remind_at": null,
        "offset_minutes": -30,
        "reminder_type": "push"
      }
    ],
    "needs_review": false,
    "review_reason": null,
    "date_uncertain": false,
    "time_uncertain": false,
    "auto_filled": false,
    "source_text": "매주 월요일 10시에 한강 러닝",
    "due_datetime_source": null,
    "related_schedule_title": null,
    "confidence": "high"
  },
  {
    "type": "create_task",
    "related_action_index": 0,
    "linked_existing_schedule_id": null,
    "title": "러닝화 준비",
    "description": null,
    "schedule_type": null,
    "priority": "medium",
    "start_datetime": null,
    "end_datetime": null,
    "all_day": null,
    "due_datetime": "2026-06-01T09:00:00+09:00",
    "location": null,
    "visibility": null,
    "recurrence": null,
    "reminders": [],
    "needs_review": false,
    "review_reason": null,
    "date_uncertain": false,
    "time_uncertain": false,
    "auto_filled": false,
    "source_text": "러닝화 준비는 6월 1일 오전까지",
    "due_datetime_source": "explicit",
    "related_schedule_title": "러닝",
    "confidence": "high"
  },
  {
    "type": "pending_item",
    "related_action_index": null,
    "linked_existing_schedule_id": null,
    "title": "리허설 시간 확정",
    "description": "수요일 오전 10시 또는 오후 1시 중 가능한 시간으로 추후 확정",
    "schedule_type": null,
    "priority": null,
    "start_datetime": null,
    "end_datetime": null,
    "all_day": null,
    "due_datetime": null,
    "location": null,
    "visibility": null,
    "recurrence": null,
    "reminders": [],
    "needs_review": true,
    "review_reason": "시간이 아직 확정되지 않음",
    "date_uncertain": true,
    "time_uncertain": true,
    "auto_filled": false,
    "source_text": "수요일 오전 10시 또는 오후 1시 중 가능한 시간으로 추후 확정",
    "due_datetime_source": "unknown",
    "related_schedule_title": null,
    "confidence": "medium"
  }
]
```

지원 범위:

- 복수 일정/할 일 액션
- `related_action_index`: 같은 `suggested_actions` 배열 안의 일정 액션에 속한 할 일일 때, 연결 대상 `create_schedule` 액션의 0-based index입니다. 없으면 `null`입니다.
- `linked_existing_schedule_id`: 메모 밖의 기존 일정과 연결해야 하는 할 일로 판단되고 후보 일정과 강하게 매칭된 경우, 기존 일정 ID 문자열입니다. 없거나 확신이 낮으면 `null`입니다.
- `pending_item`: 보류/확정 필요 항목. 실제 일정/할 일 생성 대상은 아니며 UI에서 확인 필요 항목으로 표시합니다.
- `pending_item`은 `/memos/:memo_id/apply`로 직접 적용할 수 없습니다. 사용자가 날짜/시간/타입을 확정한 뒤 일반 일정 생성 API(`/schedules`) 또는 할 일 생성 API(`/tasks`)로 새로 생성해야 합니다.
- 확인 필요 메타데이터: `needs_review`, `review_reason`, `date_uncertain`, `time_uncertain`, `auto_filled`, `source_text`, `due_datetime_source`, `related_schedule_title`, `confidence`
- 반복 일정: `repeat_interval_days`, `repeat_until`, `weekday_rules`, `excluded_dates`, `max_occurrences`
- 리마인더: 절대 시각 `remind_at` 또는 대상 시각 기준 `offset_minutes`
- 반복 일정에 리마인더가 있으면 각 발생 일정에 리마인더가 생성됩니다.

---

## 사용자 앱 AI API

모든 아래 엔드포인트는 인증 필요:

- `Authorization: Bearer <access_token>`

### 1. 메모 생성 시 AI 자동 파싱

### `POST /api/v1/memos`

메모 생성과 동시에 AI 파싱을 요청할 수 있습니다.

Request body:

```json
{
  "category_id": "1",
  "raw_text": "내일 오후 2시에 디자인 회의, 금요일까지 시안 제출",
  "memo_type": "quick",
  "source_type": "manual",
  "auto_parse": true
}
```

설명:

- `auto_parse=true` 이면 생성 직후 내부 파싱 큐에 들어감
- 즉시 완성된 AI 결과를 반환하지는 않음
- 응답의 `memo.parse_status`를 보고 이후 상태를 확인해야 함

Response 예시:

```json
{
  "success": true,
  "message": "Memo created",
  "data": {
    "memo": {
      "memo_id": 12,
      "user_id": 3,
      "raw_text": "내일 오후 2시에 디자인 회의, 금요일까지 시안 제출",
      "memo_type": "quick",
      "source_type": "manual",
      "parse_status": "pending",
      "parsed_at": null,
      "parse_error_message": null,
      "last_ai_result_id": null
    }
  }
}
```

### 2. 기존 메모 AI 파싱 요청

### `POST /api/v1/memos/:memo_id/parse`

기존 메모에 대해 AI 파싱을 다시 시작합니다.

Request body:

```json
{
  "force": false
}
```

설명:

- `force=false`
  - 이미 `processing` 중이면 `409 MEMO_PARSE_IN_PROGRESS`
- `force=true`
  - 진행 중이어도 다시 파싱 요청 가능
- 응답은 최신 메모 상태를 반환하며, 실제 결과는 별도 조회 API로 확인

Response 예시:

```json
{
  "success": true,
  "message": "Memo parse started",
  "data": {
    "memo": {
      "memo_id": 12,
      "parse_status": "pending"
    }
  }
}
```

주요 에러:

- `404 MEMO_NOT_FOUND`
- `409 MEMO_PARSE_IN_PROGRESS`

### 3. AI 파싱 결과 조회

### `GET /api/v1/memos/:memo_id/parse-result`

해당 메모의 최신 AI 결과와 히스토리를 조회합니다.

Response 구조:

- `memo`
- `latest_result`
- `parse_results`

Response 예시:

```json
{
  "success": true,
  "message": "Memo parse result retrieved",
  "data": {
    "memo": {
      "memo_id": 12,
      "parse_status": "completed",
      "last_ai_result_id": 44
    },
    "latest_result": {
      "ai_result_id": 44,
      "detected_type": "mixed",
      "extracted_title": "디자인 회의",
      "extracted_summary": "회의와 시안 제출 일정이 함께 언급됨",
      "extracted_start_datetime": "2026-04-22T05:00:00Z",
      "extracted_end_datetime": null,
      "extracted_due_datetime": "2026-04-24T14:59:59Z",
      "extracted_priority": "high",
      "suggested_actions": [
        {
          "type": "create_schedule",
          "title": "디자인 회의",
          "description": null,
          "schedule_type": "meeting",
          "priority": null,
          "start_datetime": "2026-04-22T05:00:00Z",
          "end_datetime": null,
          "all_day": false,
          "due_datetime": null,
          "location": null,
          "visibility": "private",
          "recurrence": null,
          "reminders": [],
          "needs_review": true,
          "review_reason": "종료 시간이 없어 기본 duration 보정 또는 확인이 필요함",
          "date_uncertain": false,
          "time_uncertain": true,
          "auto_filled": false,
          "source_text": "디자인 회의",
          "due_datetime_source": null,
          "related_schedule_title": null,
          "confidence": "high"
        },
        {
          "type": "create_task",
          "title": "시안 제출",
          "description": null,
          "schedule_type": null,
          "priority": "high",
          "start_datetime": null,
          "end_datetime": null,
          "all_day": null,
          "due_datetime": "2026-04-24T14:59:59Z",
          "location": null,
          "visibility": null,
          "recurrence": null,
          "reminders": [],
          "needs_review": false,
          "review_reason": null,
          "date_uncertain": false,
          "time_uncertain": false,
          "auto_filled": false,
          "source_text": "시안 제출은 4월 24일까지",
          "due_datetime_source": "explicit",
          "related_schedule_title": null,
          "confidence": "high"
        }
      ],
      "confidence_score": 0.912,
      "status": "suggested",
      "result_status": "suggested",
      "executable_action_indexes": [0, 1],
      "applied_action_indexes": [],
      "remaining_action_indexes": [0, 1],
      "action_states": [
        {
          "action_index": 0,
          "action_type": "create_schedule",
          "applicable": true,
          "applied": false
        },
        {
          "action_index": 1,
          "action_type": "create_task",
          "applicable": true,
          "applied": false
        }
      ]
    },
    "parse_results": [
      {
        "ai_result_id": 44,
        "status": "suggested"
      }
    ]
  }
}
```

설명:

- `latest_result`는 `memo.last_ai_result_id` 기준 최신 결과
- `parse_results`는 해당 메모의 AI 결과 이력 전체
- `result_status`, `action_states`, `remaining_action_indexes`는 현재 생성된 일정/할 일을 기준으로 계산됩니다. 프론트의 액션별 버튼 활성화는 저장된 `status`보다 이 필드를 우선 사용하세요.
- 메모 상태가 `failed`이면 `memo.parse_error_message`를 확인

### 4. AI 결과를 일정 또는 할 일로 반영

### `POST /api/v1/memos/:memo_id/apply`

AI 결과를 실제 일정/할 일/반복 일정/리마인더로 생성합니다.

Request body:

```json
{
  "ai_result_id": "44",
  "apply_type": "schedule",
  "category_id": "3"
}
```

또는 task 반영:

```json
{
  "ai_result_id": "44",
  "apply_type": "task",
  "category_id": "5",
  "schedule_id": "21"
}
```

필드 설명:

- `ai_result_id`
  - 생략 시 메모의 `last_ai_result_id` 사용
- `apply_type`
  - `schedule`: 첫 번째 일정 액션만 적용
  - `task`: 첫 번째 할 일 액션만 적용
  - `action`: `action_index`에 해당하는 액션 1개 적용
  - `all`: 생성 가능한 모든 일정/할 일 액션 적용. `pending_item`은 제외됨
- `action_index`
  - `apply_type=action`일 때 필수
  - `pending_item`의 index를 지정하면 `400 AI_ACTION_NOT_APPLICABLE`
  - `suggested_actions` 배열의 0-based index
- `category_id`
  - 생성할 리소스의 카테고리
  - `apply_type=all`에서 일정과 할 일이 섞여 있으면 사용할 수 없음
- `schedule_id`
  - `task` 생성 시 연결할 기존 일정 ID
  - `apply_type=all`에서 `related_action_index`가 있는 할 일은 같은 적용 요청에서 생성된 일정에 자동 연결됨

Response 예시:

```json
{
  "success": true,
  "message": "AI parse result applied",
  "data": {
    "apply_type": "schedule",
    "result_status": "partially_applied",
    "executable_action_indexes": [0, 1],
    "applied_action_indexes": [0],
    "remaining_action_indexes": [1],
    "skipped_action_indexes": [],
    "action_states": [
      {
        "action_index": 0,
        "action_type": "create_schedule",
        "applicable": true,
        "applied": true
      },
      {
        "action_index": 1,
        "action_type": "create_task",
        "applicable": true,
        "applied": false
      }
    ],
    "resource": {
      "schedule_id": 91,
      "title": "디자인 회의",
      "source_memo_id": 12,
      "source_ai_result_id": 44
    },
    "resources": [],
    "reminders": [],
    "applied_actions": []
  }
}
```

설명:

- `apply_type=schedule`
  - 첫 번째 `create_schedule` 액션을 적용
- `apply_type=task`
  - 첫 번째 `create_task` 액션을 적용
- `apply_type=action`
  - `action_index` 액션만 적용
- `apply_type=all`
  - 모든 액션을 순서대로 적용
  - `create_task.related_action_index`가 같은 결과 안의 `create_schedule`을 가리키면 생성된 할 일의 `schedule_id`가 해당 일정으로 자동 연결됨
  - 이미 적용된 액션은 오류로 처리하지 않고 건너뛰며, 응답의 `skipped_action_indexes`에 포함됨
- 반복 일정 액션은 여러 `Schedule`을 만들고 같은 `recurrence_group_id`로 묶음
- 액션에 `reminders`가 있으면 일정/할 일 생성 후 리마인더도 함께 생성
- 일부 액션만 적용하면 AI 결과 `status`는 `partially_applied`, 실행 가능한 모든 액션이 적용되면 `approved`로 변경
- 응답의 `action_states[].applied`, `remaining_action_indexes`, `skipped_action_indexes`로 액션별 적용 여부를 판단
- 동일 `ai_result_id + action_index` 조합으로 다시 생성하려 하면 중복 방지 에러 발생

주요 에러:

- `404 MEMO_NOT_FOUND`
- `404 AI_RESULT_NOT_FOUND`
- `404 AI_ACTION_NOT_FOUND`
- `400 ACTION_INDEX_REQUIRED`
- `400 AMBIGUOUS_CATEGORY_TARGET`
- `409 AI_RESULT_REJECTED`
- `409 AI_RESULT_ALREADY_APPLIED`
- `400 INSUFFICIENT_AI_DATA`

---

### 5. AI 채팅

AI 채팅은 사용자의 최근 일정/할 일/메모 일부를 컨텍스트로 참고해 답변하고,
일정/할 일 생성 요청은 `suggested_actions`로 제안합니다. 실제 생성은 별도 apply API를 호출해야 합니다.

### `POST /api/v1/ai-chat/sessions`

채팅 세션을 생성합니다.

Request body:

```json
{
  "title": "이번 주 일정 정리"
}
```

Response 예시:

```json
{
  "success": true,
  "message": "AI chat session created",
  "data": {
    "session": {
      "ai_chat_session_id": 5,
      "user_id": 1,
      "title": "이번 주 일정 정리",
      "status": "active",
      "last_message_at": "2026-06-08T18:50:43.747Z",
      "created_at": "2026-06-08T18:50:43.747Z",
      "updated_at": "2026-06-08T18:50:43.747Z"
    }
  }
}
```

설명:

- 이후 메시지 API의 `:session_id`에는 응답의 `session.ai_chat_session_id` 값을 사용합니다.
- 예: `POST /api/v1/ai-chat/sessions/5/messages`

### `GET /api/v1/ai-chat/sessions`

채팅 세션 목록을 조회합니다.

Query params:

- `status`: `active` | `archived`, 기본 `active`
- `limit`: 1~100, 기본 30
- `cursor`: 이전 응답의 `data.pagination.next_cursor`. 응답은 기존 sessions에 pagination을 추가합니다.

Response 예시:

```json
{
  "success": true,
  "message": "AI chat sessions retrieved",
  "data": {
    "sessions": [
      {
        "ai_chat_session_id": 5,
        "user_id": 1,
        "title": "이번 주 일정 정리",
        "status": "active",
        "last_message_at": "2026-06-08T18:50:43.747Z",
        "created_at": "2026-06-08T18:50:43.747Z",
        "updated_at": "2026-06-08T18:50:43.747Z",
        "_count": {
          "messages": 2
        },
        "messages": [
          {
            "ai_chat_message_id": 12,
            "role": "assistant",
            "content": "내일 오후 2시 일정 제안을 만들었어요."
          }
        ]
      }
    ]
  }
}
```

설명:

- 세션 목록의 각 항목도 `ai_chat_session_id`를 사용합니다.
- `messages`는 각 세션의 최신 메시지 1개만 포함됩니다.
- `data.pagination`은 `{ "has_more": true, "next_cursor": "<불투명 cursor>" }` 형식이며 마지막 페이지의 `next_cursor`는 `null`입니다.
- 페이지를 추가할 때 `ai_chat_session_id`로 중복을 제거합니다. 메시지 전송으로 정렬 순서가 바뀔 수 있으므로 목록을 새로고침할 수 있어야 합니다.

### `PATCH /api/v1/ai-chat/sessions/:session_id`

본인 채팅방의 제목 또는 보관 상태를 수정합니다.

```json
{
  "title": "다음 주 일정 정리",
  "status": "archived"
}
```

- `title`과 `status` 중 최소 1개 필수. `title`은 trim 후 1~100자, `status`는 `active` 또는 `archived`입니다.
- 성공 시 `data.session`을 반환합니다. `status=active`로 복원해도 기존 메시지를 유지합니다.
- 보관한 채팅방은 조회·삭제할 수 있으나 메시지 전송·제안 적용은 `409 AI_CHAT_SESSION_ARCHIVED`입니다.
- AI 응답 대기 중 보관하면 늦은 assistant 메시지는 저장되지 않습니다. 사용자 메시지가 먼저 저장됐을 수 있으므로 실패 후 메시지를 재조회합니다.

### `DELETE /api/v1/ai-chat/sessions/:session_id`

본인의 AI 채팅방을 영구 삭제합니다. Bearer 사용자 인증이 필요하며 요청 body는 없습니다.

- `session_id`: 삭제할 `ai_chat_session_id` (active/archived 모두 가능).
- 채팅방, 메시지, 제안 적용 기록을 함께 삭제합니다.
- 채팅에서 이미 생성한 일정·할 일·리마인더는 유지합니다.
- 없는 채팅방·다른 사용자의 채팅방·이미 삭제한 채팅방은 모두 `404 AI_CHAT_SESSION_NOT_FOUND`를 반환합니다. 잘못된 ID 형식은 400입니다.
- AI 응답 대기 중 삭제하면 진행 중인 메시지 요청은 저장 시 404로 종료됩니다. 이미 시작된 외부 AI 요청 자체를 취소하지는 않습니다.
- 제안 적용과 삭제는 순서대로 처리됩니다. 먼저 적용이 완료된 일정·할 일은 유지하고, 먼저 삭제된 메시지에서는 새 적용이 불가능합니다.

성공 응답 (200):

```json
{
  "success": true,
  "message": "AI chat session deleted",
  "data": {}
}
```

클라이언트는 삭제 확인 후 이 API를 호출하고, 성공 시 목록과 선택한 채팅방을 제거합니다. 열려 있던 채팅방의 늦은 메시지 응답도 폐기해야 합니다. 이미 삭제되어 404가 반환된 경우에도 로컬 목록을 정리할 수 있습니다.

### `POST /api/v1/ai-chat/sessions/:session_id/messages`

사용자 메시지를 저장하고 AI 응답을 생성합니다.

Path params:

- `session_id`: `ai_chat_session_id` 값

Request body:

```json
{
  "content": "내일 오후 2시에 디자인 회의 잡아줘. 30분 전에 알려줘."
}
```

AI가 참고하는 내부 문맥:

- `personal_schedules`
- `company_schedules`
- `project_work_items`
- `tasks`
- `recent_memos`

`project_work_items` 문맥은 최근 14일 범위의 실제 assignee 프로젝트 업무만 포함하며, AI 채팅에서는 read-only 참고 정보로만 사용합니다.

Response 주요 필드:

- `user_message`: 저장된 사용자 메시지
  - `ai_chat_message_id`: 사용자 메시지 ID
- `assistant_message`: AI 응답 메시지
  - `ai_chat_message_id`: assistant 메시지 ID
  - `content`: 사용자에게 보여줄 답변
  - `response_type`: `answer` | `suggestion` | `clarification`
  - `suggested_actions`: 생성 가능한 일정/할 일 액션
  - `action_status`: `none` | `suggested` | `partially_applied` | `applied`

### `GET /api/v1/ai-chat/sessions/:session_id/messages`

세션 메시지 목록과 적용 이력을 조회합니다.

Query params:

- `limit`: 1~100. 화면에서는 50개씩 조회합니다.
- `cursor`: 이전 응답의 `data.pagination.next_cursor`. 더 과거 페이지를 가리킵니다.
- 응답의 `data.messages`는 최신 페이지를 **페이지 내부 시간 오름차순**으로 반환합니다. 과거 페이지는 기존 메시지 앞에 붙이고 메시지 ID로 중복을 제거합니다.
- `data.pagination`은 `{has_more,next_cursor}`입니다. limit/cursor를 모두 생략하면 기존 전체 조회를 유지합니다.
- `400 INVALID_CURSOR`가 오면 해당 cursor를 재시도하지 않고 첫 페이지부터 조회합니다.

Path params:

- `session_id`: `ai_chat_session_id` 값

### `POST /api/v1/ai-chat/messages/:message_id/apply`

AI 채팅의 assistant 메시지에 포함된 제안을 실제 일정/할 일/반복 일정/리마인더로 생성합니다.

Path params:

- `message_id`: assistant 메시지의 `ai_chat_message_id` 값

Request body:

```json
{
  "apply_type": "action",
  "action_index": 0,
  "category_id": "3"
}
```

필드 설명:

- `apply_type`
  - `schedule`: 첫 번째 일정 액션만 적용
  - `task`: 첫 번째 할 일 액션만 적용
  - `action`: `action_index` 액션 1개 적용
  - `all`: 미적용 액션 전체 적용. 이미 적용된 액션은 건너뜀
- `category_id`: 생성할 일정 또는 할 일 카테고리
- `schedule_id`: 할 일 생성 시 연결할 기존 일정 ID
- `apply_type=all`에서 `related_action_index`가 있는 할 일은 같은 적용 요청에서 생성된 일정에 자동 연결됩니다.

Response 주요 필드:

- `action_status`: `suggested` | `partially_applied` | `applied`
- `executable_action_indexes`: 적용 가능한 액션 index 목록
- `applied_action_indexes`: 이미 적용된 액션 index 목록
- `remaining_action_indexes`: 아직 적용 가능한 미적용 액션 index 목록
- `skipped_action_indexes`: `apply_type=all`에서 이미 적용되어 건너뛴 액션 index 목록
- `action_states`: 액션별 `applied` 상태
- `applied_actions`: 이번 요청에서 실제 생성된 액션별 결과

중복 방지:

- 동일 `message_id + action_index` 조합은 한 번만 적용할 수 있습니다.
- 단, `apply_type=all`은 이미 적용된 액션을 오류로 처리하지 않고 `skipped_action_indexes`에 담아 건너뜁니다.

주요 에러:

- `404 AI_CHAT_SESSION_NOT_FOUND`
- `404 AI_CHAT_MESSAGE_NOT_FOUND`
- `404 AI_CHAT_ACTION_NOT_FOUND`
- `400 ACTION_INDEX_REQUIRED`
- `400 AMBIGUOUS_CATEGORY_TARGET`
- `400 RECURRENCE_OCCURRENCE_REQUIRED`: 반복 조건 적용 후 생성할 일정이 0건
- `400 RECURRENCE_LIMIT_EXCEEDED`: 반복 생성 건수 상한 초과
- `400 INVALID_RECURRENCE_RANGE`, `400 INVALID_TIMEZONE`: 반복 범위/시간대 오류
- `409 AI_CHAT_SESSION_ARCHIVED`
- `409 AI_CHAT_ACTION_ALREADY_APPLIED`

발생 조건과 복구 방법은 [AI 디버깅 계약](#ai-개발자-디버깅-계약)의 오류 대응표를 확인하세요.

---

## AI 결과를 소비하는 보조 API

이 API들은 AI 파싱 결과로 생성된 일정/할 일을 사용자에게 보여줍니다. 홈의 `briefing_text`는 AI 생성 및 캐시/fallback을 사용하며, 오늘 브리핑은 데이터 집계 API입니다.

### 6. 오늘 홈 피드

### `GET /api/v1/home/today`

오늘의 일정/할 일 중심 요약 데이터를 반환합니다.

Query params:

- `date` optional, `YYYY-MM-DD`
- `timezone` optional, 예: `Asia/Seoul`

Response 예시:

```json
{
  "success": true,
  "message": "Today's home feed retrieved",
  "data": {
    "date": "2026-04-21",
    "timezone": "Asia/Seoul",
    "briefing_text": "오늘은 일정 2건, 마감 일정 1건이 있고 오늘 마감 TODO는 3건입니다.",
    "summary": {
      "today_schedule_count": 2,
      "today_deadline_schedule_count": 1,
      "today_project_work_item_count": 1,
      "overdue_project_work_item_count": 0,
      "incomplete_task_count": 5
    },
    "slot_counts": {
      "meeting": 1,
      "fieldwork": 0,
      "deadline": 1,
      "other": 0
    },
    "today_schedules": [],
    "organization_schedules": [],
    "due_today_tasks": [],
    "project_work_items": [],
    "overdue_project_work_items": [],
    "focus_items": []
  }
}
```

사용 용도:

- 앱 홈 첫 화면
- 오늘의 핵심 일정/태스크 요약
- AI 파싱으로 생성된 리소스가 잘 반영되었는지 최종 사용자 관점에서 확인
- `briefing_text`는 AI 생성 우선, 실패 시 서버 기본 문구 fallback
- 같은 홈 데이터에서는 캐시된 `briefing_text`를 재사용하여 매 요청마다 재생성하지 않음

### 7. 오늘 브리핑

### `GET /api/v1/briefings/today`

오늘 일정/태스크/연체 태스크/리마인더를 묶어서 반환합니다.

Query params:

- `date` optional, `YYYY-MM-DD`

Response 예시:

```json
{
  "success": true,
  "message": "Today briefing retrieved",
  "data": {
    "date": "2026-04-21",
    "summary": {
      "schedule_count": 2,
      "company_schedule_count": 1,
      "total_schedule_count": 3,
      "task_count": 3,
      "overdue_task_count": 1,
      "project_work_item_count": 1,
      "overdue_project_work_item_count": 0,
      "reminder_count": 4
    },
    "schedules": [],
    "company_schedules": [],
    "tasks": [],
    "overdue_tasks": [],
    "project_work_items": [],
    "overdue_project_work_items": [],
    "reminders": []
  }
}
```

설명:

- 현재는 AI 텍스트 생성 API가 아니라 데이터 기반 브리핑 API
- AI 파싱 후 생성된 일정/할 일이 이 집계에 반영됨

---

## 관리자용 AI 조회 API

모든 아래 엔드포인트는 관리자 인증 필요:

- `Authorization: Bearer <admin_access_token>`

권한:

- `ai_parse_results.read`

### 8. AI 파싱 결과 목록 조회

### `GET /admin/api/v1/ai-parse-results`

운영자가 전체 AI 파싱 결과를 조회합니다.

Query params:

- `page`
- `page_size`
- `status`: `suggested` | `partially_applied` | `approved` | `rejected`
- `detected_type`: `schedule` | `task` | `note` | `mixed`
- `min_confidence`: `0.0 ~ 1.0`
- `user_id`
- `memo_id`
- `q`
- `sort`: `created_at_desc` | `confidence_asc`

Response data item 예시:

```json
{
  "ai_result_id": 44,
  "memo_id": 12,
  "user_id": 3,
  "user_name": "홍길동",
  "detected_type": "mixed",
  "extracted_title": "디자인 회의",
  "status": "partially_applied",
  "confidence_score": 0.912,
  "model_used": "gpt-5.4",
  "created_at": "2026-04-21T04:00:00Z",
  "updated_at": "2026-04-21T04:01:00Z"
}
```

사용 용도:

- AI 품질 점검
- 낮은 confidence 결과 찾기
- 사용자별 파싱 상태 점검

### 9. AI 파싱 결과 상세 조회

### `GET /admin/api/v1/ai-parse-results/:ai_result_id`

단일 AI 결과의 전체 구조를 확인합니다.

Response 예시:

```json
{
  "data": {
    "ai_result_id": 44,
    "memo_id": 12,
    "user_id": 3,
    "user_name": "홍길동",
    "detected_type": "mixed",
    "extracted_title": "디자인 회의",
    "extracted_summary": "회의와 제출 일정이 함께 언급됨",
    "extracted_start_datetime": "2026-04-22T05:00:00Z",
    "extracted_end_datetime": null,
    "extracted_due_datetime": "2026-04-24T14:59:59Z",
    "extracted_priority": "high",
    "suggested_actions": [],
    "confidence_score": 0.912,
    "model_used": "gpt-5.4",
    "status": "approved",
    "created_at": "2026-04-21T04:00:00Z",
    "updated_at": "2026-04-21T04:01:00Z"
  }
}
```

사용 용도:

- 모델 출력 검토
- 파싱 이상 케이스 디버깅
- 실제 반영 대상 값 점검

---

## 사용 흐름 예시

### 메모 기반 AI 일정 생성

1. `POST /api/v1/memos`
   - `auto_parse=true`
2. `GET /api/v1/memos/:memo_id/parse-result`
   - `latest_result.action_states`와 `remaining_action_indexes`로 적용 가능한 액션 확인
3. `POST /api/v1/memos/:memo_id/apply`
   - `apply_type=schedule`
4. `GET /api/v1/home/today`
   - 오늘 화면 반영 확인

### 메모 기반 AI 태스크 생성

1. `POST /api/v1/memos/:memo_id/parse`
2. `GET /api/v1/memos/:memo_id/parse-result`
3. `POST /api/v1/memos/:memo_id/apply`
   - `apply_type=task`
4. `GET /api/v1/briefings/today`
   - 브리핑 반영 확인

### 채팅 기반 AI 일정 생성

1. `POST /api/v1/ai-chat/sessions`
2. `POST /api/v1/ai-chat/sessions/:session_id/messages`
   - assistant 메시지의 `suggested_actions` 확인
3. `POST /api/v1/ai-chat/messages/:message_id/apply`
   - `apply_type=action` 또는 `apply_type=all`
4. `GET /api/v1/home/today`
   - 생성된 일정/할 일 반영 확인

---

## 구현 메모

- 기본 AI 호출 모델은 `env.OPENAI_MODEL` (코드 기본값 `gpt-5.6-luna`)
- 메모 파싱은 간단한 메모면 `env.OPENAI_MEMO_PARSE_LIGHT_MODEL`, 복잡한 메모면 `env.OPENAI_MEMO_PARSE_MODEL`을 우선 사용하고, 없으면 `env.OPENAI_MODEL`로 fallback
- 기준 timezone 해석은 `env.AI_DEFAULT_TIMEZONE`
- 상대 날짜 해석은 현재 시점 기준
- 연도 없는 월/일 날짜는 기본적으로 현재 연도로 해석하며, 이미 지난 날짜여도 자동으로 다음 해로 넘기지 않음
- 파싱 결과는 엄격한 JSON schema 검증 후 저장
- AI 채팅 응답도 엄격한 JSON schema 검증 후 메시지와 제안을 저장
- 파싱 실패는 parse_error_message에 기록하고 제한 재시도합니다. 총3회 실패하면 parse_status=failed입니다.
- 현재는 사용자용 `reject` API 없음
  - 관리자/사용자 UI에서는 결과를 읽고 apply 여부만 결정

---

## 향후 개선 후보

- 파싱 진행 상태 조회를 위한 dedicated status endpoint
- AI 결과 reject/feedback API
- parse webhook 또는 SSE
- 다국어 프롬프트/응답 전략 분리
- confidence 기준 자동 적용 정책
- 데이터 기반 `/briefings/today`에 LLM 요약 확장

---

## AI 개발자 디버깅 계약

기준: 2026-09-16. [공통 디버깅 가이드](../devdocs/debugging-guide.md), [라우트·DTO 색인](../devdocs/routes-general.md), [오류 발생 코드](../devdocs/error-index.md)를 함께 사용합니다. 아래는 현재 코드의 동작입니다. 새 AI 응답은 저장 전에 반복 조건을 실제 계산해 검증하며, 기존에 저장된 제안은 자동 수정하지 않습니다.

### A. 호출 주체와 데이터 책임

```text
앱: 사용자 텍스트 전송
→ 서버: 사용자 메시지 저장
→ 서버: 최근 대화/조회 가능한 컨텍스트로 AI 호출
→ 서버: AI 응답 형식·날짜·반복 발생 가능성 검증
→ 서버: assistant 메시지와 suggested_actions 저장
→ 앱: 제안 표시 및 적용할 action 선택
→ POST /ai-chat/messages/:message_id/apply
→ 서버: 저장된 제안 조회 + 소유권/상태 검사
→ 서버: 실제 반복 일정 계산 + DB 트랜잭션 적용
→ 앱: 적용 결과와 일정/할 일 목록 갱신
```

- apply body는 `apply_type`, `action_index`, `category_id`, `schedule_id`입니다. 앱이 `suggested_actions`나 `recurrence`를 다시 보내 수정하는 API가 아닙니다. 선언되지 않은 키는 DTO에서 제거될 수 있습니다.
- `message_id`는 **assistant 메시지 ID**입니다. session ID, 사용자 메시지 ID, AI 메모의 ai_result_id를 넣으면 안 됩니다.
- `action_index`는 해당 메시지 배열의 0-based index입니다. UI에서 정렬/필터링하더라도 원래 index를 보존합니다.
- `category_id`·`schedule_id`는 해당 사용자 소유 리소스여야 합니다. 화면에서 선택 가능하다는 사실만으로 서버 검증이 생략되지는 않습니다.
- 과거에 저장된 AI 반복 조건이 모순되면 앱이 정상 apply를 호출해도 400이 발생할 수 있습니다. 새 채팅 응답은 저장 전 반복 검증 실패 시 clarification으로 전환합니다. HTTP 400만으로 프론트 요청 오류라고 판단하지 않습니다.

### B. Method 고정과 최소 요청

**아래 적용 API는 POST 전용입니다. GET 호출은 앱 수정 대상입니다.** 조회나 재시도 helper에서 GET으로 바꾸지 않습니다. Authorization을 추가해도 GET 적용 기능은 생기지 않습니다.

```http
POST /api/v1/ai-chat/messages/86/apply
Authorization: Bearer <user_access_token>
Content-Type: application/json
X-Request-Id: 8f18fbb0-7fdd-46da-927d-5e642f118013
```

```json
{
  "apply_type": "action",
  "action_index": 0
}
```

개발용 shell 예시입니다. `FLOWRA_BASE_URL`, `FLOWRA_ACCESS_TOKEN`, `FLOWRA_MESSAGE_ID`는 자신의 개발 환경 값으로 설정합니다. 이 요청은 실제 데이터를 생성하므로 단순 연결 확인용으로 반복 실행하지 않습니다.

```bash
curl --request POST "$FLOWRA_BASE_URL/api/v1/ai-chat/messages/$FLOWRA_MESSAGE_ID/apply" \
  --header "Authorization: Bearer $FLOWRA_ACCESS_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"apply_type":"action","action_index":0}'
```

GET에 401이 왔다면 인증이 먼저 거절된 것입니다. 401 자체는 올바른 method였다는 증거가 아닙니다. 올바른 호출은 POST + 사용자 Bearer + JSON body입니다.

### C. 반복 일정의 정확한 의미

| 필드 | 해석 / 주의 |
| --- | --- |
| `start_datetime` | 첫 발생 후보의 시작 시각. 반복의 기준점입니다. |
| `end_datetime` | 개별 일정 종료. 반복 종료일이 아닙니다. 반복 발생에도 원래 시작/종료 간 지속 시간을 사용합니다. |
| `repeat_interval_days` | 시작점에서 N일 간격으로 후보를 생성합니다. 특정 요일을 선택하는 목록이 아닙니다. |
| `repeat_until` | 후보/보정된 시작 시각의 상한. 시작보다 이르면 `INVALID_RECURRENCE_RANGE`. |
| `timezone` | 요일 판정과 제외 날짜 판정에 사용합니다. 유효한 IANA timezone이어야 합니다. AI recurrence에 없으면 사용자 timezone을 사용합니다. |
| `weekday_rules` | 일치하는 요일을 `skip`, `move_next_day`, `move_previous_day` 처리합니다. `skip`은 “이 요일에 생성”의 반대입니다. |
| `excluded_dates` | timezone 기준 보정된 발생 날짜를 제외합니다. 날짜 형식뿐 아니라 유효한 달력 날짜인지도 검사합니다. |
| `max_occurrences` | 생성 결과 수의 상한. 초과분을 조용히 잘라내는 옵션이 아니라 초과 시 오류를 내는 안전 한도입니다. 1~500. |

발생 후보마다 요일 보정 → 시작/종료 범위 검사 → 제외일 검사 → 동일 시작 시각 중복 제거 → 건수 제한 검사를 수행합니다. 보정 규칙이 순환하거나 과도하게 이어져도 실패할 수 있습니다. 최종 0건은 성공 빈 배열이 아니라 오류입니다.

#### 실제 실패 유형: 매주 화요일 + 화요일 제외

```json
{
  "start_datetime": "2026-09-22T09:00:00+09:00",
  "end_datetime": "2026-09-22T12:00:00+09:00",
  "recurrence": {
    "repeat_interval_days": 7,
    "repeat_until": "2026-10-31T23:59:59+09:00",
    "timezone": "Asia/Seoul",
    "weekday_rules": [{ "weekday": "tuesday", "action": "skip" }],
    "excluded_dates": [],
    "max_occurrences": 6
  }
}
```

이 JSON은 **저장된 제안의 관련 필드 예시이며 apply request body가 아닙니다.** 모든 후보가 화요일이므로 전부 제외되어 아래 오류가 발생합니다.

```json
{
  "success": false,
  "message": "Recurring schedule must create at least one occurrence",
  "error": { "code": "RECURRENCE_OCCURRENCE_REQUIRED", "details": {} }
}
```

- 같은 apply 재전송으로 해결되지 않습니다.
- 제외 규칙이 불필요했다면 `weekday_rules: []`인 올바른 제안은 6건을 생성할 수 있습니다. 실제 수정은 원문 의도에 맞춰 판단해야 합니다.
- 현재 저장된 제안 수정 endpoint는 없습니다. 사용자에게 조건을 명확히 해 다시 요청하게 하거나, 확인한 값으로 일반 일정 생성 흐름을 사용합니다. 일반 생성으로 우회한 일정은 원래 AI action의 적용 이력과 자동 연결되지 않습니다.
- 새 응답은 공통 반복 계산기로 저장 전 검증합니다. 실패한 채팅 응답은 `response_type=clarification`, 빈 suggested_actions, confidence_score=0으로 반환합니다. 원래 skip 조건을 임의로 지우지는 않습니다. 메모 분석은 `OPENAI_PARSE_INVALID_RECURRENCE`로 실패 처리하며 원인 코드를 parse_error_message에서 확인할 수 있습니다. 과거 제안은 자동 수정하지 않습니다.

원본 백엔드 코드 근거(현재 프론트 저장소에 미포함): 반복 계산 `src/common/utils/recurrence.ts`, AI 응답 검증 `src/modules/ai-chat/openai-ai-chat.service.ts`, apply 구현 `src/modules/ai-chat/ai-chat.service.ts`.

### D. 적용 오류 대응표

기본 오류 envelope는 일반 API 형식입니다. 아래는 대표 경로이며 공유 helper에서 추가 오류가 발생할 수 있습니다. 전체 생성 지점은 오류 색인을 확인합니다.

| HTTP / code | 발생 조건 | 확인·복구 |
| --- | --- | --- |
| 401 `UNAUTHORIZED` | 사용자 인증 실패 | prefix/Bearer/세션 확인. GET을 POST로 먼저 교정. |
| 400 `VALIDATION_ERROR` | body/params 타입·enum·범위 위반 | details.issues 확인. action_index는 JSON number. |
| 404 `AI_CHAT_MESSAGE_NOT_FOUND` | 본인 assistant 메시지가 없음 | ID 종류, 소유자, 삭제 여부 확인. |
| 404 `AI_CHAT_SESSION_NOT_FOUND` | 세션 없음/소유권 불일치/진행 중 삭제 | 세션 목록 갱신. 삭제된 세션에 재적용하지 않음. |
| 404 `AI_CHAT_ACTION_NOT_FOUND` | 선택 index 또는 schedule/task 액션이 없음 | 원본 suggested_actions와 선택 방식을 대조. |
| 409 `AI_CHAT_SESSION_ARCHIVED` | archived 세션의 전송/적용 | 현재 상태 반영. PATCH /ai-chat/sessions/:session_id의 status=active로 복원 가능. |
| 409 `AI_CHAT_ACTION_ALREADY_APPLIED` | 개별 action 중복 적용 | 적용 상태 재조회, 성공 결과와 UI 복구. |
| 400 `ACTION_INDEX_REQUIRED` | action 모드인데 index 누락 | 0도 유효하므로 truthy 검사로 누락시키지 않음. |
| 400 `INSUFFICIENT_AI_CHAT_DATA` | 제안 없음 또는 일정 시작 시각 없음 | 서버 저장 제안을 확인. 필요 시 재질문. |
| 400 `AMBIGUOUS_CATEGORY_TARGET` | 미적용 일정·할 일을 함께 적용하면서 하나의 category 지정 | category 생략 또는 유형별/개별 적용. |
| 400 `SCHEDULE_TARGET_NOT_APPLICABLE` | 할 일 대상이 아닌데 schedule_id 전달 | 일정 연결은 할 일 적용에만 사용. |
| 400 `INVALID_SCHEDULE_RANGE` | 종료 < 시작 | 제안/시간 변환 확인. |
| 400 `INVALID_RECURRENCE_RANGE` | 반복 종료 < 시작 | recurrence와 timezone 확인. |
| 400 `RECURRENCE_OCCURRENCE_REQUIRED` | 규칙 적용 후 발생 0건 | 요일 skip, 제외일, 이동 후 범위 탈락 확인. 재시도보다 조건 재검토. |
| 400 `RECURRENCE_LIMIT_EXCEEDED` | 발생 건수가 max_occurrences 초과 | 반복 기간·간격·한도를 의도에 맞게 재설정. |
| 400 `INVALID_TIMEZONE` | 유효하지 않은 timezone | IANA 값 확인. 단순 `KST` 문자열로 대체하지 않음. |
| 400 `DUPLICATE_RECURRENCE_EXCEPTION` | 같은 요일의 규칙 중복 | 동일 요일에 하나의 규칙만 유지. |
| 400 `INVALID_RECURRENCE_EXCEPTION` | 잘못된 제외일·보정 순환 등 | 반복 helper의 해당 발생 조건 확인. |
| 400 `INVALID_RECURRENCE_INTERVAL` / `INVALID_RECURRENCE_LIMIT` / `INVALID_DATETIME` | 반복 입력의 수치·날짜 제약 위반 | DTO를 통과한 저장 데이터도 조사. |
| 502 `OPENAI_PARSE_INVALID_RECURRENCE` | 메모 파싱 응답의 반복 조건이 실행 불가 | 메모 parse_status/parse_error_message 확인. 직접 parser 오류의 details에는 cause_code/action_index가 포함됨. |
| 5xx 또는 응답 유실 | AI/DB/서버/네트워크 실패 | stage와 저장 상태 확인 후 재시도 판단. |

### E. 메시지 전송 실패와 적용 실패를 구분

- **메시지 전송:** 사용자 메시지를 저장한 뒤 외부 AI를 호출합니다. AI 실패 시 사용자 메시지만 남을 수 있습니다. 동일 텍스트 자동 재전송은 대화 중복을 만들 수 있으므로 메시지 목록을 먼저 확인합니다.
- **AI 응답 검증:** 빈 응답은 `OPENAI_CHAT_EMPTY`, 날짜/액션 문제는 `OPENAI_CHAT_INVALID_DATETIME`, `OPENAI_CHAT_INVALID_ACTION`, `OPENAI_CHAT_INVALID_RANGE` 등의 502가 될 수 있습니다. JSON/Zod/SDK 예외는 동일한 코드로 정규화되지 않을 수 있습니다. 서버 AI 응답의 Zod 오류가 400 `VALIDATION_ERROR`로 보이더라도 사용자 요청 DTO 오류로 단정하지 않습니다.
- **적용:** 이 단계는 저장된 제안을 사용합니다. 같은 제안 반복 적용을 위해 외부 AI를 다시 호출하지 않습니다.
- **적용 트랜잭션:** 이번 요청의 일정/할 일/리마인더/적용 이력은 트랜잭션 내에서 처리됩니다. 한 액션의 반복 계산 실패 시 이번 트랜잭션 변경은 롤백됩니다. 이전 요청에서 이미 적용된 결과는 유지됩니다.
- **전체 적용:** `apply_type=all`은 적용된 index를 건너뜁니다. 모두 이미 적용됐다면 성공이면서 신규 resources가 비고 resource가 null일 수 있습니다. 이를 생성 실패로 판단하지 않습니다.
- **삭제 경쟁:** AI 응답 대기 중 채팅방이 삭제되면 늦게 도착한 메시지 저장/적용은 실패할 수 있습니다. 세션을 자동으로 다시 만들지 않습니다.

### F. 화면 상태·재시도 계약

| 상태/응답 | UI 처리 |
| --- | --- |
| `response_type=answer` | 답변 표시. 적용할 액션이 있다는 가정을 하지 않음. |
| `response_type=clarification` | 조건 추가 입력 유도. 빈 suggested_actions에 적용 버튼을 만들지 않음. |
| 제안 표시 | 원본 index 유지, 날짜·timezone·반복 제외 규칙 표시. |
| 적용 요청 진행 중 | 해당 action/전체 적용 중복 클릭 방지. |
| 적용 성공 | action_states 및 applied_action_indexes 반영, 생성된 리소스 목록 갱신. |
| 409 이미 적용 | 메시지 목록을 재조회해 적용 상태 복구. |
| 결정적 400 | 동일 요청 자동 재시도 금지, 오류 code/request ID 기록 및 조건 수정 안내. |
| 네트워크 단절 | 성공 여부가 불명확함을 구분하고 재조회 후 처리. |

`executable_action_indexes`는 액션 종류 등 현재 분류 결과이지, 현재 DB 권한 검증까지 성공했다는 인증서가 아닙니다. 새 응답에 대한 반복 사전 검증과 별도로 최종 실행 검사도 apply 시 수행됩니다.

### G. 메모 파싱은 별도의 비동기 흐름

| 상태 | 의미 / 다음 행동 |
| --- | --- |
| `pending` | 대기 상태. auto_parse를 켰는지, parse 요청이 있었는지 함께 확인. 상태만으로 실제 worker 실행을 보장하지 않음. |
| `processing` | 처리 시작 표시. UI는 제한된 주기로 재조회하며 무한 즉시 polling하지 않음. |
| `completed` | 분석 결과 조회 가능. 분석 완료와 일정/할 일 적용 완료는 다름. |
| `failed` | parse_error_message와 관련 로그 확인. 입력/외부 AI 오류를 구분한 뒤 재요청. |

- `POST /api/v1/memos/:memo_id/parse`의 `force` 기본값은 false입니다. processing이면 `MEMO_PARSE_IN_PROGRESS` 409가 될 수 있습니다.
- 요청 상태는 DB에 영속 저장합니다. 15초 주기로 요청된 작업만 처리하고 10분 lease가 만료되면 복구합니다. 최대3회 시도하며 미요청 pending은 처리하지 않습니다. [F11 상세](../devdocs/feature-lifecycle.md#f11-메모-파싱-복구).
- `force: true`는 새 generation으로 재요청합니다. 이전 외부 호출 자체는 계속될 수 있지만 오래된 결과 저장은 차단됩니다. polling마다 force를 호출하지 않습니다.
- 메모 적용 시 특정 `ai_result_id`를 사용하면 사용자가 확인한 분석 버전을 명확히 지정할 수 있습니다. 재파싱된 새 결과와 과거 적용 이력을 혼동하지 않습니다.
- 메모의 `pending_item`은 직접 적용할 수 없습니다. `AI_ACTION_NOT_APPLICABLE`이면 확정된 정보로 일반 생성 경로를 사용합니다.
- AI 메모와 AI 채팅은 action 모델·오류 코드가 완전히 같지 않습니다. 메모는 `AI_RESULT_ALREADY_APPLIED`, `AI_ACTION_NOT_FOUND` 등을 사용합니다.

### H. 현재 제공하지 않는 동작

- 저장된 제안의 반복 조건 PATCH API와 apply 미리보기/dry-run API는 없습니다.
- 채팅방 삭제는 세션·메시지·적용 이력을 제거하지만 이미 생성한 일정/할 일/리마인더는 유지합니다. 삭제를 “생성 결과 되돌리기”로 표시하지 않습니다.

### I. 프론트·백엔드 공동 확인 자료

오류 전달 시 method/path, 요청 body(토큰 제외), HTTP status, error.code/details, X-Request-Id, session/message/action index, 발생 시각을 포함합니다. 반복 문제는 저장된 action의 시작/종료/간격/종료일/timezone/요일 규칙/제외일/max_occurrences를 대조합니다. 전체 대화 대신 관련 조건을 우선 전달합니다.

정상적인 POST가 실패하면 먼저 앱이 보낸 선택값 문제인지, 서버 저장 제안 문제인지 분리합니다. GET 전송·잘못된 ID/index·토큰 누락은 앱 호출 수정 대상이며, 모순된 과거 AI 제안이나 새 사전 검증에서 거절된 응답은 백엔드/모델 조사 대상입니다. 서버의 `ai_chat.recurrence_rejected` 로그에는 모델·action_index·cause_code만 남으며 원문 대화는 남기지 않습니다.


### J. 반복 조건 보강 및 모델 검증 (2026-09-16)

- 공통 프롬프트는 포함 요일과 제외 규칙을 구분하고, 첫 발생 날짜·개별 종료 시각·시리즈 종료·생성 한도를 설명합니다.
- 사전 검증은 일반 적용과 동일한 `build_recurring_occurrences`를 사용합니다. 채팅의 부적합 제안은 전체 actions를 비우고 재질문하며, 메모의 실행 불가 제안은 분석 실패로 처리합니다. 검증만으로 사용자의 의미를 모두 이해했다고 보장하지는 않습니다.
- 코드 기본값과 현재 배포의 기본/간단 메모 모델은 `gpt-5.6-luna`입니다. 복잡 메모는 `OPENAI_MEMO_PARSE_MODEL=gpt-5.6-terra`를 사용하며 Terra 요청에는 `reasoning.effort=medium`을 명시합니다. 기본 모델을 공유하는 홈 브리핑에도 Luna가 적용됩니다.
- 과거 채팅 metadata의 모델 이름과 이미 저장된 제안은 바뀌지 않습니다. 같은 과거 message에 apply만 재시도하면 새 모델을 호출하지 않습니다. 새로운 메시지나 메모 재파싱이 필요합니다.
- 로컬 회귀: `npm run test:ai-recurrence` (실제 API/DB 호출 없음).
- 실제 모델 평가: `node --require tsx/cjs devdocs/tools/eval-ai-recurrence.cjs gpt-5.6-luna`. 앱 시스템 프롬프트와 합성 입력을 OpenAI로 전송하고 API 사용량이 발생합니다. 앱 DB는 변경하지 않습니다.
- Luna는 반복/제외/다중 요일/모순/메모/홈 7개 사례를 통과했습니다. 당시 채팅 모델의 조건부 Terra 비교는 실행하지 않았으며, 이후 복잡 메모 전환은 별도 Terra 평가로 검증했습니다. 이는 제한된 회귀 샘플이며 모든 입력의 품질 보장이 아닙니다.
- 원본 백엔드의 설계·검증 결과 `devdocs/plans/ai-recurrence-hardening.md`, 합성 평가 응답 `devdocs/reviews/ai-recurrence-gpt-5.6-luna.json`은 현재 프론트 저장소에 미포함입니다. [OpenAI 공식 Luna 문서](https://developers.openai.com/api/docs/models/gpt-5.6-luna).


### K. 복잡 메모 Terra 설정

- 기존 복잡도 점수 4 미만은 간단 메모 경로(Luna), 4 이상은 복잡 메모 경로(Terra)입니다. 길이·줄/절 수·날짜 수·업무 키워드·정정/반복 등의 기존 점수 산식은 유지했습니다.
- 일반 메모 파싱과 기존 일정 컨텍스트 재파싱 모두 동일 분기를 사용합니다. `model_used`가 실제 선택 모델입니다.
- 정확히 `gpt-5.6-terra`를 선택했을 때 `reasoning: { effort: "medium" }`을 명시합니다. 다른 모델 override에 이 옵션을 강제하지 않습니다.
- 공식 기본 추론은 GPT-5.4가 none, Terra가 medium입니다. 추론 수준은 고정 토큰 할당이 아니므로 medium 요청에서도 usage의 reasoning_tokens가 0일 수 있습니다.
- `max_output_tokens=6000`은 유지했습니다. 실제 합성 평가 3건 모두 completed, 출력 511~855토큰이었습니다. 더 큰 입력에서는 한도/응답 상태를 계속 확인해야 합니다.
- 현재 배포 설정은 Terra이며 `OPENAI_MEMO_PARSE_MODEL`을 비워 두면 기존 규칙대로 `OPENAI_MODEL`로 fallback합니다. 예제 환경 파일에는 Terra를 명시했습니다.
- 원본 백엔드의 Terra 전환 결과 `devdocs/plans/terra-complex-memo.md`, 합성 평가 기록 `devdocs/reviews/terra-complex-memo.json`은 현재 프론트 저장소에 미포함입니다.

## 채팅 페이지·수정 API 및 메모 복구 보강

- `GET /ai-chat/sessions`는 cursor와 pagination을 지원합니다.
- `GET /ai-chat/sessions/:session_id/messages?limit=50`는 최신 페이지를 시간 오름차순으로 반환합니다. next_cursor는 더 과거 내역을 가리킵니다. limit/cursor 없는 요청은 기존 전체 조회입니다.
- `PATCH /ai-chat/sessions/:session_id` body `{title?,status?:"active|archived"}`는 최소1필드이며 data.session을 반환합니다. title은 trim 후1~100자입니다. 보관 중에는 전송/적용을 차단하고 복원 시 기존 메시지를 유지합니다.
- [F05/F09/F11 디버깅 계약](../devdocs/feature-lifecycle.md): cursor 오류 복구, 보관과 AI 응답 경합, 영속 요청/lease/generation/재시도.
