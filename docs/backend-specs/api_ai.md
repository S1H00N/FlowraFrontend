# Flowra AI API

AI 관련 기능만 따로 모은 참고 문서입니다.

- 사용자 앱 API: `/api/v1`
- 관리자 조회 API: `/admin/api/v1`
- 기본 응답 envelope는 [api_general.md](./api_general.md), [api_admin.md](./api_admin.md) 기준

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
  - `approved`
  - `rejected`
- 메모 생성/수정 시 `auto_parse=true`를 주거나, 별도 parse API를 호출해서 AI 파싱을 트리거할 수 있음
- 파싱 자체는 현재 비동기 큐 방식이며, 요청 직후 바로 완성 결과가 오는 구조는 아님

현재 구현상 파싱 큐는 서버 내부 `setImmediate` 기반입니다.
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
      "status": "suggested"
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
- 반복 일정 액션은 여러 `Schedule`을 만들고 같은 `recurrence_group_id`로 묶음
- 액션에 `reminders`가 있으면 일정/할 일 생성 후 리마인더도 함께 생성
- 적용 성공 시 AI 결과 `status`는 `approved`로 변경
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
  - `all`: 모든 액션 적용
- `category_id`: 생성할 일정 또는 할 일 카테고리
- `schedule_id`: 할 일 생성 시 연결할 기존 일정 ID
- `apply_type=all`에서 `related_action_index`가 있는 할 일은 같은 적용 요청에서 생성된 일정에 자동 연결됩니다.

중복 방지:

- 동일 `message_id + action_index` 조합은 한 번만 적용할 수 있습니다.

주요 에러:

- `404 AI_CHAT_SESSION_NOT_FOUND`
- `404 AI_CHAT_MESSAGE_NOT_FOUND`
- `404 AI_CHAT_ACTION_NOT_FOUND`
- `400 ACTION_INDEX_REQUIRED`
- `400 AMBIGUOUS_CATEGORY_TARGET`
- `409 AI_CHAT_ACTION_ALREADY_APPLIED`

---

## AI 결과를 소비하는 보조 API

이 API들은 OpenAI를 직접 호출하지는 않지만, AI 파싱 결과로 생성된 일정/할 일을 사용자에게 보여주는 데 중요합니다.

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
      "incomplete_task_count": 5
    },
    "slot_counts": {
      "meeting": 1,
      "fieldwork": 0,
      "deadline": 1,
      "other": 0
    },
    "today_schedules": [],
    "due_today_tasks": [],
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
      "task_count": 3,
      "overdue_task_count": 1,
      "reminder_count": 4
    },
    "schedules": [],
    "tasks": [],
    "overdue_tasks": [],
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
- `status`: `suggested` | `approved` | `rejected`
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
  "status": "approved",
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
   - `latest_result.status == suggested` 확인
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

- 기본 AI 호출 모델은 `env.OPENAI_MODEL`
- 메모 파싱은 간단한 메모면 `env.OPENAI_MEMO_PARSE_LIGHT_MODEL`, 복잡한 메모면 `env.OPENAI_MEMO_PARSE_MODEL`을 우선 사용하고, 없으면 `env.OPENAI_MODEL`로 fallback
- 기준 timezone 해석은 `env.AI_DEFAULT_TIMEZONE`
- 상대 날짜 해석은 현재 시점 기준
- 연도 없는 월/일 날짜는 기본적으로 현재 연도로 해석하며, 이미 지난 날짜여도 자동으로 다음 해로 넘기지 않음
- 파싱 결과는 엄격한 JSON schema 검증 후 저장
- AI 채팅 응답도 엄격한 JSON schema 검증 후 메시지와 제안을 저장
- 파싱 실패 시 `memo.parse_status = failed`, `memo.parse_error_message` 기록
- 현재는 사용자용 `reject` API 없음
  - 관리자/사용자 UI에서는 결과를 읽고 apply 여부만 결정

---

## 향후 개선 후보

- 파싱 진행 상태 조회를 위한 dedicated status endpoint
- AI 결과 reject/feedback API
- parse webhook 또는 SSE
- 다국어 프롬프트/응답 전략 분리
- confidence 기준 자동 적용 정책
- 홈/브리핑 텍스트 자체를 LLM 요약으로 확장
