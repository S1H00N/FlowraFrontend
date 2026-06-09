# Flowra General API

일반 사용자 앱이 사용하는 백엔드 API 명세입니다.

## 기본 정보

- Base URL: `/api/v1`
- Content-Type: `application/json`
- 인증: 일부 공개 API를 제외하고 `Authorization: Bearer <access_token>` 필요
- 날짜/시간: ISO 8601 문자열 사용
- 날짜/시간 body 값은 타임존 오프셋 포함 필수입니다. 예: `2026-04-18T18:00:00+09:00`
- 날짜 query 중 `date`, `start_date`, `end_date`는 `YYYY-MM-DD` 형식입니다.
- ID 값은 요청 path/query/body에서 숫자가 아닌 숫자형 문자열로 보냅니다. 예: `"1"`
- 응답의 ID는 JSON 직렬화 과정에서 숫자형으로 내려올 수 있습니다.
- 모든 API 응답에는 `X-Request-Id` 헤더가 포함됩니다.
- 요청 시 `X-Request-Id`를 전달하면 40자 이하 값에 한해 그대로 사용합니다.

공개 API:

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /company-memberships/invites/:token`
- `GET /schedule-share-links/:token`
- `GET /holidays`
- `GET /holidays/range`
- `GET /holidays/check`

인증 필요 API:

- 위 공개 API를 제외한 모든 일반 사용자 API

## 응답 형식

성공 응답:

```json
{
  "success": true,
  "message": "Schedules retrieved",
  "data": {}
}
```

목록 응답도 별도 pagination envelope 없이 `data` 안에 배열 필드를 담습니다.

```json
{
  "success": true,
  "message": "Tasks retrieved",
  "data": {
    "tasks": []
  }
}
```

삭제 성공 응답:

```json
{
  "success": true,
  "message": "Task deleted",
  "data": {}
}
```

검증 에러:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "issues": [
        {
          "path": "category_id",
          "message": "Expected string, received number"
        }
      ]
    }
  }
}
```

인증 에러:

```json
{
  "success": false,
  "message": "Invalid or expired access token",
  "error": {
    "code": "UNAUTHORIZED",
    "details": {}
  }
}
```

자주 쓰는 에러 코드:

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 요청 형식 또는 타입 오류 |
| 400 | `INVALID_CATEGORY_TYPE` | 리소스 타입과 카테고리 타입 불일치 |
| 400 | `INVALID_DATE` | 날짜 query가 `YYYY-MM-DD`가 아니거나 실제 날짜가 아님 |
| 400 | `INVALID_DATE_RANGE` | 기간 조회의 종료일이 시작일보다 빠름 |
| 400 | `INVALID_SCHEDULE_RANGE` | 일정 종료 시간이 시작 시간보다 빠름 |
| 400 | `INVALID_TASK_STATE` | 할 일 완료 상태와 `completed_at` 불일치 |
| 400 | `INSUFFICIENT_AI_DATA` | AI 결과를 일정/할 일로 만들 데이터 부족 |
| 401 | `UNAUTHORIZED` | access token 없음/만료/오류 |
| 401 | `INVALID_CREDENTIALS` | 로그인 실패 |
| 401 | `INVALID_REFRESH_TOKEN` | refresh token 오류 또는 폐기됨 |
| 403 | `USER_INACTIVE` | 비활성 사용자 |
| 403 | `USER_BANNED` | 밴 상태 사용자 |
| 404 | `*_NOT_FOUND` | 대상 리소스 없음 또는 본인 소유가 아님 |
| 409 | `EMAIL_ALREADY_EXISTS` | 이미 가입된 이메일 |
| 409 | `MEMO_PARSE_IN_PROGRESS` | 메모 파싱 진행 중 |
| 409 | `AI_RESULT_ALREADY_APPLIED` | 이미 적용된 AI 결과 |
| 409 | `AI_RESULT_REJECTED` | 거절된 AI 결과 적용 시도 |

## 공통 리소스 타입

### User

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `user_id` | number | 내부 사용자 ID |
| `public_uid` | string | 외부 노출용 사용자 UID |
| `email` | string | 이메일 |
| `name` | string | 이름 |
| `profile_image_url` | string \| null | 프로필 이미지 URL |
| `timezone` | string \| null | IANA timezone |
| `login_type` | `local` \| `google` \| `naver` | 로그인 유형 |
| `status` | `active` \| `inactive` | 계정 상태 |
| `banned_until` | string \| null | 밴 만료 시각 |
| `ban_reason` | string \| null | 밴 사유 |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

### Category

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `category_id` | number | 카테고리 ID |
| `user_id` | number | 소유 사용자 ID |
| `name` | string | 이름 |
| `color` | string | `#RRGGBB` |
| `type` | `schedule` \| `task` \| `memo` | 카테고리 용도 |
| `is_default` | boolean | 기본 카테고리 여부 |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

### Schedule

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `schedule_id` | number | 일정 ID |
| `user_id` | number | 소유 사용자 ID |
| `category_id` | number \| null | 카테고리 ID |
| `title` | string | 제목 |
| `description` | string \| null | 설명 |
| `schedule_type` | `personal` \| `meeting` \| `fieldwork` \| `deadline` \| `other` | 일정 유형 |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | 우선순위 |
| `is_completed` | boolean | 완료 여부 |
| `start_datetime` | string | 시작 시각 |
| `end_datetime` | string \| null | 종료 시각 |
| `all_day` | boolean | 종일 여부 |
| `location` | string \| null | 장소 |
| `visibility` | `private` | 공개 범위. 현재 `private`만 허용 |
| `recurrence_group_id` | string \| null | 반복 일정 그룹 ID |
| `recurrence_sequence` | number \| null | 반복 일정 내 순번 |
| `recurrence_rule` | object \| null | 반복 일정 생성 규칙 |
| `source_memo_id` | number \| null | 원본 메모 ID |
| `source_ai_result_id` | number \| null | 원본 AI 결과 ID |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

### Holiday

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `holiday_id` | number | 공휴일 ID |
| `country_code` | string | 국가 코드. 현재 자동 동기화는 `KR` |
| `date` | `YYYY-MM-DD` | 공휴일 날짜 |
| `name` | string | 공휴일명 |
| `type` | string | 공휴일 유형. 현재 KASI 원천은 `public` |
| `is_public_holiday` | boolean | 법정 공휴일 여부 |
| `source` | string | 데이터 원천. 현재 `kasi` |
| `fetched_at` | string | 원천 API에서 마지막 수집한 시각 |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

### Task

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `task_id` | number | 할 일 ID |
| `user_id` | number | 소유 사용자 ID |
| `category_id` | number \| null | 카테고리 ID |
| `schedule_id` | number \| null | 연결 일정 ID |
| `title` | string | 제목 |
| `description` | string \| null | 설명 |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | 우선순위 |
| `status` | `todo` \| `in_progress` \| `done` \| `postponed` | 상태 |
| `due_datetime` | string \| null | 마감 시각 |
| `completed_at` | string \| null | 완료 시각 |
| `location` | string \| null | 장소 |
| `source_memo_id` | number \| null | 원본 메모 ID |
| `source_ai_result_id` | number \| null | 원본 AI 결과 ID |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

### Memo

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `memo_id` | number | 메모 ID |
| `user_id` | number | 소유 사용자 ID |
| `category_id` | number \| null | 카테고리 ID |
| `raw_text` | string | 메모 원문 |
| `memo_type` | `quick` \| `meeting` \| `general` | 메모 유형 |
| `source_type` | `manual` \| `voice` \| `imported` | 입력 출처 |
| `parse_status` | `pending` \| `processing` \| `completed` \| `failed` | AI 파싱 상태 |
| `parsed_at` | string \| null | 파싱 완료 시각 |
| `parse_error_message` | string \| null | 파싱 실패 메시지 |
| `last_ai_result_id` | number \| null | 최신 AI 결과 ID |
| `last_ai_result` | AiParseResult \| null | 최신 AI 결과 |
| `created_at` | string | 생성 시각 |
| `updated_at` | string | 수정 시각 |

## Health

### `GET /health`

서버 헬스체크.

인증: 불필요

Response data:

- 빈 객체

Response 예시:

```json
{
  "success": true,
  "message": "Flowra backend is healthy",
  "data": {}
}
```

## Auth

### `POST /auth/signup`

로컬 계정 회원가입. 사용자, 로컬 auth account, 기본 카테고리 3개를 함께 생성합니다.

인증: 불필요

운영 설정:

- 시스템 관리자 패널의 회원가입 설정에서 회원가입을 전체 ON/OFF 할 수 있습니다.
- 긴급 봇 유입 방지를 위해 기본값은 OFF입니다. 운영자가 패널에서 ON으로 바꿔야 일반 회원가입이 열립니다.
- 허용 이메일 도메인이 설정되어 있으면 해당 도메인의 이메일만 가입할 수 있습니다.
- 허용 도메인 목록이 비어 있으면 도메인 제한 없이 가입 가능합니다.

Request body:

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `email` | string | O | 이메일, 최대 255자 |
| `password` | string | O | 8-72자 |
| `name` | string | O | trim 후 1-50자 |

Request 예시:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동"
}
```

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `user` | User | 생성된 사용자 |
| `tokens.access_token` | string | access token |
| `tokens.refresh_token` | string | refresh token |
| `tokens.expires_in` | number | access token 만료 초. 현재 3600 |
| `tokens.refresh_expires_at` | string | refresh token 만료 시각 |

상태 코드:

- `201`: 가입 성공
- `403 SIGNUP_DISABLED`: 회원가입 기능이 OFF 상태
- `403 SIGNUP_DOMAIN_NOT_ALLOWED`: 이메일 도메인이 허용 목록에 없음
- `409 EMAIL_ALREADY_EXISTS`: 이미 등록된 이메일

- `201 Created`
- `409 EMAIL_ALREADY_EXISTS`

### `POST /auth/login`

로컬 계정 로그인.

인증: 불필요

Request body:

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `email` | string | O | 이메일, 최대 255자 |
| `password` | string | O | 8-72자 |

Response data:

- `user`: User
- `tokens.access_token`
- `tokens.refresh_token`
- `tokens.expires_in`
- `tokens.refresh_expires_at`

상태 코드:

- `200 OK`
- `401 INVALID_CREDENTIALS`
- `403 USER_INACTIVE`
- `403 USER_BANNED`

### `POST /auth/refresh`

refresh token을 회전시키고 새 token pair를 발급합니다. 기존 refresh token은 revoke 됩니다.

인증: 불필요

Request body:

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `refresh_token` | string | O | 빈 문자열 불가 |

Response data:

- `user`: User
- `tokens.access_token`
- `tokens.refresh_token`
- `tokens.expires_in`
- `tokens.refresh_expires_at`

상태 코드:

- `200 OK`
- `401 INVALID_REFRESH_TOKEN`

### `POST /auth/logout`

refresh token을 revoke합니다. 잘못된 token이어도 idempotent하게 성공 응답을 반환합니다.

인증: 불필요

Request body:

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `refresh_token` | string | O | 빈 문자열 불가 |

Response data:

- 빈 객체

## Users

모든 Users API는 인증 필요.

### `GET /users/me`

내 프로필 조회.

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `user` | User | 현재 로그인한 사용자 |

### `PATCH /users/me`

내 프로필 수정.

Request body:

하나 이상의 필드가 필요합니다.

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `name` | string | X | trim 후 1-50자 |
| `profile_image_url` | string \| null | X | URL, 최대 2000자. `null`로 제거 |
| `timezone` | string | X | 유효한 IANA timezone, 최대 100자 |

Request 예시:

```json
{
  "name": "새 이름",
  "profile_image_url": "https://example.com/image.png",
  "timezone": "Asia/Seoul"
}
```

Response data:

- `user`: User

### `DELETE /users/me`

내 계정 삭제.

Response data:

- 빈 객체

비고:

- 사용자에 종속된 데이터는 DB 관계 설정에 따라 함께 삭제됩니다.

## Categories

모든 Categories API는 인증 필요.

### `GET /categories`

내 카테고리 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `type` | `schedule` \| `task` \| `memo` | X | 카테고리 유형 필터 |

정렬:

1. `is_default desc`
2. `name asc`

Response data:

- `categories`: Category[]

### `GET /categories/:category_id`

카테고리 상세 조회.

Path params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `category_id` | numeric string | O | 카테고리 ID |

Response data:

- `category`: Category

상태 코드:

- `404 CATEGORY_NOT_FOUND`

### `POST /categories`

카테고리 생성.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `name` | string | O | - | trim 후 1-50자 |
| `color` | string | O | - | `#RRGGBB` |
| `type` | `schedule` \| `task` \| `memo` | O | - | - |
| `is_default` | boolean | X | `false` | - |

Request 예시:

```json
{
  "name": "업무",
  "color": "#3B82F6",
  "type": "task",
  "is_default": false
}
```

Response data:

- `category`: Category

상태 코드:

- `201 Created`

### `PATCH /categories/:category_id`

카테고리 수정.

Request body:

하나 이상의 필드가 필요합니다.

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `name` | string | X | trim 후 1-50자 |
| `color` | string | X | `#RRGGBB` |
| `is_default` | boolean | X | - |

Response data:

- `category`: Category

상태 코드:

- `404 CATEGORY_NOT_FOUND`

### `DELETE /categories/:category_id`

카테고리 삭제.

Response data:

- 빈 객체

상태 코드:

- `404 CATEGORY_NOT_FOUND`

## Schedules

모든 Schedules API는 인증 필요. 이 섹션의 `/schedules` API는 개인 일정만 다룹니다. 조직 일정은 `/company-schedules`에서 조회합니다.

### `GET /schedules`

개인 일정 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `start_from` | datetime string | X | `start_datetime >= start_from` |
| `start_to` | datetime string | X | `start_datetime <= start_to` |
| `category_id` | numeric string 또는 comma-separated numeric string | X | 카테고리 필터. 예: `1,2` |
| `schedule_type` | enum 또는 comma-separated enum | X | 일정 유형 필터. 예: `personal,meeting` |
| `priority` | enum 또는 comma-separated enum | X | 우선순위 필터. 예: `high,urgent` |
| `is_completed` | `true` \| `false` | X | 완료 여부 필터 |
| `q` | string | X | 제목/설명 부분 검색 |
| `location` | string | X | 장소 부분 검색 |

정렬:

1. `start_datetime asc`
2. `created_at desc`

Response data:

- `schedules`: Schedule[]

### `GET /schedules/:schedule_id`

개인 일정 상세 조회.

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `schedule_id` | numeric string | O |

Response data:

- `schedule`: Schedule

상태 코드:

- `404 SCHEDULE_NOT_FOUND`

### `POST /schedules`

개인 일정 생성.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `category_id` | numeric string | X | - | `schedule` 타입 카테고리여야 함 |
| `title` | string | O | - | trim 후 1-100자 |
| `description` | string \| null | X | `null` | 최대 5000자 |
| `schedule_type` | `personal` \| `meeting` \| `fieldwork` \| `deadline` \| `other` | X | `personal` | - |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | X | `medium` | - |
| `is_completed` | boolean | X | `false` | - |
| `start_datetime` | datetime string | O | - | offset 포함 필수 |
| `end_datetime` | datetime string \| null | X | `null` | offset 포함, 시작 이후여야 함 |
| `all_day` | boolean | X | `false` | - |
| `location` | string \| null | X | `null` | 최대 255자 |
| `visibility` | `private` | X | `private` | 현재 `private`만 허용 |

Request 예시:

```json
{
  "category_id": "1",
  "title": "팀 미팅",
  "description": "주간 정기 회의",
  "schedule_type": "meeting",
  "priority": "high",
  "is_completed": false,
  "start_datetime": "2026-04-18T09:00:00+09:00",
  "end_datetime": "2026-04-18T10:00:00+09:00",
  "all_day": false,
  "location": "회의실",
  "visibility": "private"
}
```

Response data:

- `schedule`: Schedule

상태 코드:

- `201 Created`
- `400 INVALID_CATEGORY_TYPE`
- `400 INVALID_SCHEDULE_RANGE`
- `404 CATEGORY_NOT_FOUND`

### `POST /schedules/recurring`

개인 반복 일정을 여러 건 생성합니다. 생성된 일정은 같은 `recurrence_group_id`로 묶입니다.

Request body:

기본 일정 필드는 `POST /schedules`와 동일하며 아래 필드가 추가로 필요합니다.

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `repeat_interval_days` | number | O | - | 1-3660, 일 단위 반복 간격 |
| `repeat_until` | datetime string | O | - | offset 포함, 마지막 후보 발생 시각 |
| `timezone` | IANA timezone string | X | 사용자 timezone | 요일/제외일 판정 기준 |
| `weekday_rules` | array | X | `[]` | 최대 7개, 요일별 예외 규칙 |
| `excluded_dates` | `YYYY-MM-DD`[] | X | `[]` | 최대 100개, timezone 기준 제외일 |
| `max_occurrences` | number | X | `500` | 1-500 |

`weekday_rules[]`:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `weekday` | `monday` \| `tuesday` \| `wednesday` \| `thursday` \| `friday` \| `saturday` \| `sunday` | 예외 요일 |
| `action` | `skip` \| `move_next_day` \| `move_previous_day` | 건너뛰기 또는 하루씩 이동 |

Request 예시:

```json
{
  "title": "3일 주기 점검",
  "schedule_type": "fieldwork",
  "priority": "medium",
  "start_datetime": "2026-04-27T09:00:00+09:00",
  "end_datetime": "2026-04-27T10:00:00+09:00",
  "all_day": false,
  "repeat_interval_days": 3,
  "repeat_until": "2026-05-31T23:59:59+09:00",
  "timezone": "Asia/Seoul",
  "weekday_rules": [
    {
      "weekday": "sunday",
      "action": "move_next_day"
    }
  ],
  "excluded_dates": ["2026-05-05"]
}
```

Response data:

- `recurrence_group_id`: 생성된 반복 일정 그룹 ID
- `recurrence_rule`: 적용된 반복 규칙
- `occurrence_count`: 생성된 일정 수
- `schedules`: Schedule[]

상태 코드:

- `201 Created`
- `400 INVALID_RECURRENCE_RANGE`
- `400 INVALID_RECURRENCE_EXCEPTION`
- `400 RECURRENCE_LIMIT_EXCEEDED`
- `400 INVALID_TIMEZONE`
- `400 INVALID_SCHEDULE_RANGE`
- `404 CATEGORY_NOT_FOUND`

### `PATCH /schedules/:schedule_id`

개인 일정 수정.

Request body:

하나 이상의 필드가 필요합니다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `category_id` | numeric string \| null | X | `null`로 카테고리 연결 해제 |
| `title` | string | X | trim 후 1-100자 |
| `description` | string \| null | X | 최대 5000자 |
| `schedule_type` | `personal` \| `meeting` \| `fieldwork` \| `deadline` \| `other` | X | - |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | X | - |
| `is_completed` | boolean | X | - |
| `start_datetime` | datetime string | X | offset 포함 |
| `end_datetime` | datetime string \| null | X | `null`로 종료 시각 제거 |
| `all_day` | boolean | X | - |
| `location` | string \| null | X | 최대 255자 |
| `visibility` | `private` | X | 현재 `private`만 허용 |

Response data:

- `schedule`: Schedule

상태 코드:

- `400 INVALID_CATEGORY_TYPE`
- `400 INVALID_SCHEDULE_RANGE`
- `404 SCHEDULE_NOT_FOUND`

### `DELETE /schedules/:schedule_id`

개인 일정 삭제.

Response data:

- 빈 객체

상태 코드:

- `404 SCHEDULE_NOT_FOUND`

### `DELETE /schedules/bulk`

개인 일정을 여러 건 삭제합니다. 본인 소유가 아닌 ID 또는 존재하지 않는 ID는 `failed_ids`에 포함됩니다.

Request body:

| 필드 | 타입 | 필수 | 제약 |
| --- | --- | --- | --- |
| `schedule_ids` | numeric string[] \| number[] | O | 1-100개 |

Request 예시:

```json
{
  "schedule_ids": ["101", "102", "103"]
}
```

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `deleted_count` | number | 삭제된 일정 수 |
| `failed_ids` | number[] | 삭제하지 못한 ID |

## Schedule Sharing

일정 공유 링크 API입니다. 일정 소유자는 링크를 만들고, 링크를 받은 사용자는 로그인 후 참가합니다.

공유 권한:

- `viewer`: 공유 일정 조회 가능
- `editor`: 공유 일정 조회 및 `PATCH /schedules/:schedule_id`로 일정 수정 가능

비고:

- 공유 링크는 카카오톡, 인스타 DM, 문자 등 외부 메신저로 전달하는 것을 전제로 합니다.
- 공유 링크 조회는 로그인 없이 가능하지만, 참가는 로그인 필요입니다.
- 일정 삭제, 공유 링크 관리, 참가자 권한 변경/해제는 일정 소유자만 가능합니다.
- 공유받은 일정은 `GET /shared-schedules`로 조회합니다.
- `GET /schedules/:schedule_id`는 공유받은 사용자도 조회할 수 있으며 `is_shared`, `shared_permission`이 함께 내려옵니다.

### `POST /schedules/:schedule_id/share-links`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 링크 생성.

Request body:

```json
{
  "permission": "viewer",
  "max_uses": 10,
  "expires_at": "2026-06-30T23:59:59+09:00"
}
```

필드:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `permission` | `viewer` \| `editor` | O | 이 링크로 참가한 사용자의 권한 |
| `max_uses` | number \| null | X | 최대 참가 횟수. `null` 또는 생략 시 무제한 |
| `expires_at` | datetime string \| null | X | 링크 만료 시각. `null` 또는 생략 시 만료 없음 |

Response data:

- `share_link`
- `url`: 프론트 공유 페이지 URL
- `token`: 개발/복사용 토큰

### `GET /schedules/:schedule_id/share-links`

인증 필요. 일정 소유자만 호출할 수 있습니다.

해당 일정의 공유 링크 목록 조회.

Response data:

- `share_links`: ScheduleShareLink[]

### `PATCH /schedules/:schedule_id/share-links/:schedule_share_link_id`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 링크 정책 수정.

수정 가능 필드:

- `permission`
- `status`: `active` | `disabled`
- `max_uses`
- `expires_at`

### `DELETE /schedules/:schedule_id/share-links/:schedule_share_link_id`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 링크를 비활성화합니다. 실제 삭제가 아니라 `status = disabled`로 변경합니다.

### `GET /schedule-share-links/:token`

공유 링크 미리보기 조회.

인증: 불필요

Response data:

- `schedule`
  - `schedule_id`
  - `title`
  - `description`
  - `schedule_type`
  - `start_datetime`
  - `end_datetime`
  - `all_day`
  - `location`
- `owner`
  - `user_id`
  - `public_uid`
  - `name`
  - `profile_image_url`
- `permission`
- `max_uses`
- `used_count`
- `expires_at`
- `requires_login`: 항상 `true`

상태 코드:

- `404 SCHEDULE_SHARE_LINK_NOT_FOUND`
- `409 SCHEDULE_SHARE_LINK_USED_UP`
- `410 SCHEDULE_SHARE_LINK_DISABLED`
- `410 SCHEDULE_SHARE_LINK_EXPIRED`

### `POST /schedule-share-links/:token/join`

공유 링크로 일정에 참가합니다.

인증: 필요

비고:

- 일정 소유자는 본인 링크에 참가할 수 없습니다.
- 이미 참가한 사용자가 다시 호출하면 기존 공유 정보를 반환하고 참가 횟수는 증가하지 않습니다.
- 이전에 공유 해제된 사용자가 활성 링크로 다시 참가하면 공유가 재활성화되고 참가 횟수가 증가합니다.

Response data:

- `share`
- `schedule`
- `owner`
- `joined`: 새로 참가했으면 `true`, 이미 참가 중이면 `false`

### `GET /schedules/:schedule_id/shares`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 참가자 목록 조회.

Response data:

- `shares`: ScheduleShare[]

### `PATCH /schedules/:schedule_id/shares/:schedule_share_id`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 참가자의 권한 또는 상태 수정.

수정 가능 필드:

- `permission`: `viewer` | `editor`
- `status`: `active` | `revoked`

### `DELETE /schedules/:schedule_id/shares/:schedule_share_id`

인증 필요. 일정 소유자만 호출할 수 있습니다.

공유 참가자를 해제합니다. 실제 삭제가 아니라 `status = revoked`로 변경합니다.

### `GET /shared-schedules`

인증 필요.

내가 공유받은 일정 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `start_from` | datetime string | X | `schedule.start_datetime >= start_from` |
| `start_to` | datetime string | X | `schedule.start_datetime <= start_to` |

Response data:

- `shared_schedules[]`
  - `schedule_share_id`
  - `permission`
  - `status`
  - `joined_at`
  - `owner`
  - `schedule`

## Holidays

공휴일 조회 API입니다. 인증 불필요. 서버는 공공데이터포털 한국천문연구원 특일 정보 API를 매일 동기화하여 DB에 저장하고, 프론트는 Flowra API만 조회합니다.

비고:

- 현재 자동 동기화 대상 국가는 `KR`입니다.
- 서버 기동 시 1회 동기화하고, 이후 24시간마다 현재 연도 기준 전년도부터 2년 뒤까지 다시 upsert합니다.
- 조회 API는 DB에 저장된 데이터만 반환하므로 원천 API 장애가 있어도 기존 저장 데이터 조회는 가능합니다.
- `public_only` 기본값은 `true`입니다.

### `GET /holidays`

연/월 기준 공휴일 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `year` | number | O | - | 조회 연도 |
| `month` | number | X | 전체 연도 | 1-12 |
| `country_code` | string | X | `KR` | 국가 코드 |
| `public_only` | `true` \| `false` | X | `true` | 법정 공휴일만 조회 |

Response data:

- `holidays`: Holiday[]

Request 예시:

```http
GET /api/v1/holidays?year=2026&month=5
```

Response 예시:

```json
{
  "success": true,
  "message": "Holidays retrieved",
  "data": {
    "holidays": [
      {
        "holiday_id": 28,
        "country_code": "KR",
        "date": "2026-05-01",
        "name": "노동절",
        "type": "public",
        "is_public_holiday": true,
        "source": "kasi",
        "fetched_at": "2026-04-29T07:19:48.891Z",
        "created_at": "2026-04-29T07:16:26.643Z",
        "updated_at": "2026-04-29T07:19:50.929Z"
      }
    ]
  }
}
```

상태 코드:

- `400 VALIDATION_ERROR`

### `GET /holidays/range`

기간 기준 공휴일 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `start_date` | `YYYY-MM-DD` | O | - | 시작일 |
| `end_date` | `YYYY-MM-DD` | O | - | 종료일 |
| `country_code` | string | X | `KR` | 국가 코드 |
| `public_only` | `true` \| `false` | X | `true` | 법정 공휴일만 조회 |

Response data:

- `holidays`: Holiday[]

Request 예시:

```http
GET /api/v1/holidays/range?start_date=2026-05-01&end_date=2026-05-31
```

Response 예시:

```json
{
  "success": true,
  "message": "Holidays retrieved",
  "data": {
    "holidays": [
      {
        "holiday_id": 29,
        "country_code": "KR",
        "date": "2026-05-05",
        "name": "어린이날",
        "type": "public",
        "is_public_holiday": true,
        "source": "kasi",
        "fetched_at": "2026-04-29T07:19:48.891Z",
        "created_at": "2026-04-29T07:16:26.644Z",
        "updated_at": "2026-04-29T07:19:50.931Z"
      }
    ]
  }
}
```

상태 코드:

- `400 VALIDATION_ERROR`
- `400 INVALID_DATE`
- `400 INVALID_DATE_RANGE`

### `GET /holidays/check`

특정 날짜가 공휴일인지 확인.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | O | - | 확인할 날짜 |
| `country_code` | string | X | `KR` | 국가 코드 |

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `date` | string | 확인한 날짜 |
| `country_code` | string | 국가 코드 |
| `is_holiday` | boolean | 공휴일 여부 |
| `holidays` | Holiday[] | 해당 날짜의 공휴일 목록 |

Request 예시:

```http
GET /api/v1/holidays/check?date=2026-05-05
```

Response 예시:

```json
{
  "success": true,
  "message": "Holiday checked",
  "data": {
    "date": "2026-05-05",
    "country_code": "KR",
    "is_holiday": true,
    "holidays": [
      {
        "holiday_id": 29,
        "country_code": "KR",
        "date": "2026-05-05",
        "name": "어린이날",
        "type": "public",
        "is_public_holiday": true,
        "source": "kasi",
        "fetched_at": "2026-04-29T07:19:48.891Z",
        "created_at": "2026-04-29T07:16:26.644Z",
        "updated_at": "2026-04-29T07:19:50.931Z"
      }
    ]
  }
}
```

상태 코드:

- `400 VALIDATION_ERROR`
- `400 INVALID_DATE`

## Company Schedules

모든 Company Schedules API는 인증 필요.

### `GET /company-schedules`

로그인한 사용자가 볼 수 있는 조직 일정 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `start_from` | datetime string | X | `start_datetime >= start_from` |
| `start_to` | datetime string | X | `start_datetime <= start_to` |

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `company_schedules` | CompanySchedule[] | 조회 가능한 조직 일정 |

CompanySchedule 주요 필드:

- `company_schedule_id`
- `company.company_id`
- `company.name`
- `title`
- `description`
- `schedule_type`
- `start_datetime`
- `end_datetime`
- `all_day`
- `location`
- `source_type`
- `origin_department`
- `created_by_company_member`
- `updated_by_company_member`
- `is_collaboration`
- `is_modified`
- `approval_status`
- `approval_summary`
- `targets[]`

### `GET /company-schedules/:company_schedule_id`

조직 일정 상세 조회. 사용자가 볼 수 있는 일정이거나, 본인이 요청한 승인 대기 일정만 조회할 수 있습니다.

Response data:

- `company_schedule`
  - 일정 기본 정보
  - `origin_department`
  - `created_by_company_member`
  - `updated_by_company_member`
  - `targets[]`
  - `approvals[]`
  - `change_requests[]`
  - `approval_summary`

### `POST /company-schedules`

일반 사용자가 부서 일정 또는 협업 일정을 등록합니다.

Request body:

```json
{
  "company_id": 1,
  "title": "플랫폼-디자인 협업 회의",
  "description": "릴리즈 일정 정리",
  "schedule_type": "meeting",
  "start_datetime": "2026-06-03T01:00:00Z",
  "end_datetime": "2026-06-03T02:00:00Z",
  "all_day": false,
  "location": "회의실 A",
  "target_department_ids": [10, 12]
}
```

비고:

- 요청자는 해당 회사의 active 멤버여야 합니다.
- 요청자는 active 부서에 소속되어 있어야 합니다.
- 요청자 부서는 자동으로 target에 포함됩니다.
- 회사 전체 일정은 `target_type = "company"`로 요청합니다.
- 회사 전체 일정 등록은 회사의 `company_schedule_create_policy`를 따릅니다.
  - `company_admin_only`: 일반 사용자 API에서 회사 전체 일정 등록 불가
  - `department_leaders`: 부서장만 회사 전체 일정 등록 가능
  - `members`: 부서원도 회사 전체 일정 등록 가능
- 요청자 부서의 `schedule_create_policy`가 `leader_only`이면 부서장만 등록할 수 있습니다.
- `schedule_create_policy`가 `members`이면 부서원도 등록할 수 있습니다.
- target 부서가 2개 이상이면 협업 일정으로 생성되며, 요청자 부서를 제외한 모든 target 부서장의 승인이 필요합니다.
- 협업 승인이 완료되기 전에는 `status = pending_approval`, `approval_status = pending` 입니다.

### `PATCH /company-schedules/:company_schedule_id`

조직 일정을 수정하거나, 협업 일정 수정 승인 요청을 생성합니다.

Request body:

```json
{
  "title": "플랫폼-디자인 협업 회의 변경",
  "start_datetime": "2026-06-03T02:00:00Z",
  "end_datetime": "2026-06-03T03:00:00Z"
}
```

권한:

- 일반 부서 일정은 부서장 또는 최초 작성자만 수정할 수 있습니다.
- 협업 일정은 최초 등록 부서의 부서장 또는 최초 작성자만 수정할 수 있습니다.
- 협업 일정에서 최초 등록 부서장이 수정하면 즉시 반영됩니다.
- 협업 일정에서 최초 작성자인 부서원이 수정하면 최초 등록 부서장 승인 요청이 생성됩니다.
- 실제 수정 반영 시 `updated_by_company_member`는 승인자가 아니라 수정 요청자로 기록됩니다.

### `DELETE /company-schedules/:company_schedule_id`

조직 일정을 삭제하거나, 협업 일정 삭제/부서 제거 승인 요청을 생성합니다.

권한:

- 일반 부서 일정은 부서장 또는 최초 작성자만 삭제할 수 있습니다.
- 협업 일정에서 최초 등록 부서장이 삭제하면 전체 일정이 `cancelled` 처리됩니다.
- 협업 일정에서 최초 작성자인 부서원이 삭제하면 최초 등록 부서장 승인 요청이 생성됩니다.
- 협업 일정에서 최초 등록 부서가 아닌 참여 부서의 부서장이 삭제하면 본인 부서 target만 제거됩니다.
- 협업 일정에서 참여 부서원이 삭제하면 본인 부서장 승인 후 본인 부서 target만 제거됩니다.

### `GET /company-schedules/:company_schedule_id/approval-status`

일정별 승인 상태 조회.

Response data:

- `schedule`
- `approvals`
- `change_requests`
- `approval_summary`

## Company Schedule Approvals

모든 Company Schedule Approvals API는 인증 필요.

### `GET /company-schedule-approvals`

내가 요청했거나, 내가 부서장으로 승인해야 하는 조직 일정 승인 요청 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `status` | `pending` \| `approved` \| `rejected` | X | 승인 상태 |
| `role` | `approver` \| `requested` | X | 승인자/요청자 관점 필터 |

승인 유형:

- `create_collaboration`: 협업 일정 생성 승인
- `update_collaboration`: 협업 일정 수정 승인
- `delete_schedule`: 협업 일정 전체 삭제 승인
- `remove_department_target`: 협업 일정에서 특정 부서 target 제거 승인

### `GET /company-schedule-approvals/:approval_id`

승인 요청 상세 조회.

### `POST /company-schedule-approvals/:approval_id/approve`

부서장, 상위 부서장 또는 활성화된 승인 대행자가 승인 요청을 승인합니다.

승인 가능자:

- 승인 대상 부서의 부서장
- 승인 대상 부서의 상위 부서장
- 승인 대상 부서에 지정된 `approval_delegate_company_member_id` 멤버
  - 단, 해당 부서의 `approval_delegate_enabled = true`인 경우에만 승인 가능

비고:

- `create_collaboration`은 모든 대상 부서장이 승인하면 일정이 active로 전환됩니다.
- `update_collaboration`은 승인 후 변경 payload가 일정에 반영됩니다.
- `delete_schedule`은 승인 후 일정이 `cancelled` 처리됩니다.
- `remove_department_target`은 승인 후 해당 부서 target이 `removed` 처리됩니다.

### `POST /company-schedule-approvals/:approval_id/reject`

부서장, 상위 부서장 또는 활성화된 승인 대행자가 승인 요청을 반려합니다.

비고:

- 협업 일정 생성 승인이 반려되면 일정은 `cancelled`, `approval_status = rejected`가 됩니다.

## Companies

모든 Companies API는 인증 필요.

### `GET /companies`

로그인한 사용자의 active 회사 멤버십 목록을 회사 정보와 함께 조회합니다.

### `GET /companies/:company_id/departments`

본인이 속한 회사의 부서 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `view` | `tree` \| `flat` | X | `tree` | 트리/목록 응답 |
| `status` | `active` \| `inactive` | X | - | 부서 상태 |

Response data:

- `departments[]`
  - `department_id`
  - `parent_department_id`
  - `leader_company_member_id`
  - `approval_delegate_company_member_id`
  - `approval_delegate_enabled`
  - `name`
  - `code`
  - `depth_level`
  - `status`
  - `schedule_create_policy`
  - `leader`
  - `_count`

### `GET /companies/:company_id/org-chart`

본인이 속한 회사의 조직도 조회. active 부서와 active 부서원을 함께 반환합니다.

Response data:

- `company`
- `departments[]`
  - 부서 트리
  - `members[]`
- `unassigned_members[]`

### `GET /companies/:company_id/departments/:department_id/members`

본인이 속한 회사의 특정 부서원 조회.

### `PATCH /companies/:company_id/departments/:department_id/approval-delegate-mode`

부서장 부재 시 대행승인 모드를 켜거나 끕니다.

권한:

- 해당 부서의 부서장
- 해당 부서의 상위 부서장

Request body:

```json
{
  "approval_delegate_enabled": true
}
```

비고:

- `approval_delegate_company_member_id`가 사전에 지정된 부서만 활성화할 수 있습니다.
- 모드가 비활성화된 상태에서는 지정된 대행승인자라도 승인/반려할 수 없습니다.

## Company Memberships

### `GET /company-memberships/invites`

로그인한 사용자의 이메일과 일치하는 pending 회사 구성원 초대 목록을 조회합니다.

인증: 필요

비고:

- 앱 초대함에서 사용하는 인증 기반 조회 API입니다.
- `invite_token`은 응답하지 않습니다.
- 만료된 pending 초대는 조회 시 `expired`로 갱신되고 목록에서 제외됩니다.

Response data:

- `invites[]`
  - `company_invite_id`
  - `email`
  - `name`
  - `expires_at`
  - `company`
  - `department`

### `GET /company-memberships/invites/by-id/:company_invite_id`

로그인한 사용자의 이메일과 일치하는 회사 구성원 초대 상세를 조회합니다.

인증: 필요

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `company_invite_id` | numeric string | O |

Response data:

- `company_invite_id`
- `email`
- `name`
- `expires_at`
- `company`
- `department`

상태 코드:

- `404 COMPANY_INVITE_NOT_FOUND`
- `400 COMPANY_INVITE_NOT_PENDING`
- `400 COMPANY_INVITE_EXPIRED`

### `POST /company-memberships/invites/by-id/:company_invite_id/accept`

로그인한 사용자가 회사 구성원 초대를 token 없이 수락합니다.

인증: 필요

비고:

- 앱 수락용 API입니다.
- 백엔드는 로그인 사용자 이메일과 초대 이메일이 일치하는지 검증합니다.
- 웹 이메일 링크 수락은 기존 token 기반 API를 사용합니다.

Response data:

- `member`
- `company`
- `department`

상태 코드:

- `404 COMPANY_INVITE_NOT_FOUND`
- `400 COMPANY_INVITE_NOT_PENDING`
- `400 COMPANY_INVITE_EXPIRED`
- `403 COMPANY_INACTIVE`

### `GET /company-memberships/invites/:token`

회사 구성원 초대 토큰 조회.

인증: 불필요

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `token` | string | O |

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `company_invite_id` | number | 초대 ID |
| `email` | string | 초대 이메일 |
| `name` | string | 초대 이름 |
| `expires_at` | string | 만료 시각 |
| `company` | object | 회사 정보 |
| `department` | object \| null | 부서 정보 |

### `POST /company-memberships/invites/:token/accept`

로그인한 사용자가 회사 구성원 초대를 수락합니다.

인증: 필요

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `token` | string | O |

Request body:

- 없음

Response data:

- `member`
- `company`
- `department`

### `GET /company-memberships`

로그인한 사용자의 활성 회사 멤버십 목록 조회. `inactive` 멤버십은 제외됩니다.

인증: 필요

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `memberships` | CompanyMember[] | 멤버십 목록 |

CompanyMember 주요 필드:

- `company_member_id`
- `company_id`
- `user_id`
- `department_id`
- `email`
- `name`
- `role`
- `status`
- `company.company_id`
- `company.public_uid`
- `company.name`
- `company.status`
- `department.department_id`
- `department.name`
- `department.code`
- `department.status`

### `POST /company-memberships/:company_member_id/leave`

로그인한 사용자가 해당 회사 멤버십을 비활성화합니다. 같은 회사의 기업 관리자 계정도 함께 비활성화됩니다.

인증: 필요

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `company_member_id` | numeric string | O |

Response data:

- `member`

상태 코드:

- `404 COMPANY_MEMBER_NOT_FOUND`

## Tasks

모든 Tasks API는 인증 필요.

### `GET /tasks`

할 일 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `status` | enum 또는 comma-separated enum | X | 상태 필터. 예: `todo,in_progress` |
| `priority` | enum 또는 comma-separated enum | X | 우선순위 필터. 예: `high,urgent` |
| `category_id` | numeric string 또는 comma-separated numeric string | X | 카테고리 필터. 예: `1,2` |
| `schedule_id` | numeric string | X | 연결 일정 필터 |
| `schedule_filter` | `linked` \| `unlinked` | X | 일정 연결 여부 필터. `schedule_id`와 동시 사용 불가 |
| `q` | string | X | 제목/설명 부분 검색 |
| `due_from` | datetime string | X | `due_datetime >= due_from` |
| `due_to` | datetime string | X | `due_datetime <= due_to` |

정렬:

1. `due_datetime asc`
2. `created_at desc`

Response data:

- `tasks`: Task[]

### `GET /tasks/:task_id`

할 일 상세 조회.

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `task_id` | numeric string | O |

Response data:

- `task`: Task

상태 코드:

- `404 TASK_NOT_FOUND`

### `POST /tasks`

할 일 생성.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `category_id` | numeric string | X | - | `task` 타입 카테고리여야 함 |
| `schedule_id` | numeric string | X | - | 본인 소유 일정이어야 함 |
| `title` | string | O | - | trim 후 1-100자 |
| `description` | string \| null | X | `null` | 최대 5000자 |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | X | `medium` | - |
| `status` | `todo` \| `in_progress` \| `done` \| `postponed` | X | `todo` | - |
| `due_datetime` | datetime string \| null | X | `null` | offset 포함 |
| `completed_at` | datetime string \| null | X | `null` | `status`가 `done`일 때만 가능 |
| `location` | string \| null | X | `null` | 최대 255자 |

주의:

- `category_id`, `schedule_id`는 숫자가 아니라 숫자형 문자열로 보내야 합니다.
- `status`가 `done`이고 `completed_at`을 생략하면 서버가 현재 시각을 자동 설정합니다.
- `status`가 `done`이 아닌데 `completed_at`을 보내면 `INVALID_TASK_STATE` 에러가 발생합니다.

Request 예시:

```json
{
  "category_id": "1",
  "schedule_id": "10",
  "title": "제안서 작성",
  "description": "초안 먼저 완성",
  "priority": "high",
  "status": "todo",
  "due_datetime": "2026-04-18T18:00:00+09:00",
  "location": null
}
```

Response data:

- `task`: Task

상태 코드:

- `201 Created`
- `400 INVALID_CATEGORY_TYPE`
- `400 INVALID_TASK_STATE`
- `404 CATEGORY_NOT_FOUND`
- `404 SCHEDULE_NOT_FOUND`

### `PATCH /tasks/:task_id`

할 일 수정.

Request body:

하나 이상의 필드가 필요합니다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `category_id` | numeric string \| null | X | `null`로 카테고리 연결 해제 |
| `schedule_id` | numeric string \| null | X | `null`로 일정 연결 해제 |
| `title` | string | X | trim 후 1-100자 |
| `description` | string \| null | X | 최대 5000자 |
| `priority` | `low` \| `medium` \| `high` \| `urgent` | X | - |
| `status` | `todo` \| `in_progress` \| `done` \| `postponed` | X | - |
| `due_datetime` | datetime string \| null | X | `null`로 마감 제거 |
| `completed_at` | datetime string \| null | X | `done` 상태에서만 유지 가능 |
| `location` | string \| null | X | 최대 255자 |

Response data:

- `task`: Task

상태 코드:

- `400 INVALID_CATEGORY_TYPE`
- `400 INVALID_TASK_STATE`
- `404 TASK_NOT_FOUND`

### `DELETE /tasks/:task_id`

할 일 삭제.

Response data:

- 빈 객체

상태 코드:

- `404 TASK_NOT_FOUND`

## Memos

모든 Memos API는 인증 필요.

### `GET /memos`

메모 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `parse_status` | `pending` \| `processing` \| `completed` \| `failed` | X | 파싱 상태 필터 |
| `memo_type` | `quick` \| `meeting` \| `general` | X | 메모 유형 필터 |
| `category_id` | numeric string | X | 카테고리 필터 |

정렬:

- `created_at desc`

Response data:

- `memos`: Memo[]

비고:

- 각 memo에는 `last_ai_result`가 포함됩니다.

### `GET /memos/:memo_id`

메모 상세 조회.

Path params:

| 이름 | 타입 | 필수 |
| --- | --- | --- |
| `memo_id` | numeric string | O |

Response data:

- `memo`: Memo

상태 코드:

- `404 MEMO_NOT_FOUND`

### `POST /memos`

메모 생성.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `category_id` | numeric string | X | - | `memo` 타입 카테고리여야 함 |
| `raw_text` | string | O | - | trim 후 1-20000자 |
| `memo_type` | `quick` \| `meeting` \| `general` | X | `quick` | - |
| `source_type` | `manual` \| `voice` \| `imported` | X | `manual` | - |
| `auto_parse` | boolean | X | `false` | true면 생성 후 비동기 파싱 큐에 등록 |

Request 예시:

```json
{
  "category_id": "1",
  "raw_text": "다음 주 화요일 오전 10시 병원 예약",
  "memo_type": "quick",
  "source_type": "manual",
  "auto_parse": true
}
```

Response data:

- `memo`: Memo

상태 코드:

- `201 Created`
- `400 INVALID_CATEGORY_TYPE`
- `404 CATEGORY_NOT_FOUND`

### `PATCH /memos/:memo_id`

메모 수정.

Request body:

`auto_parse`만 단독으로 보낼 수 없습니다. 그 외 수정 필드가 하나 이상 필요합니다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `category_id` | numeric string \| null | X | `null`로 카테고리 연결 해제 |
| `raw_text` | string | X | trim 후 1-20000자. 변경 시 파싱 상태 초기화 |
| `memo_type` | `quick` \| `meeting` \| `general` | X | - |
| `source_type` | `manual` \| `voice` \| `imported` | X | - |
| `auto_parse` | boolean | X | true면 수정 후 비동기 파싱 큐에 등록 |

Response data:

- `memo`: Memo

상태 코드:

- `404 MEMO_NOT_FOUND`

### `DELETE /memos/:memo_id`

메모 삭제.

Response data:

- 빈 객체

상태 코드:

- `404 MEMO_NOT_FOUND`

### `POST /memos/:memo_id/parse`

메모 AI 파싱 수동 트리거.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `force` | boolean | X | `false` | `processing` 상태여도 강제 재요청 |

Request 예시:

```json
{
  "force": true
}
```

Response data:

- `memo`: Memo \| null

상태 코드:

- `404 MEMO_NOT_FOUND`
- `409 MEMO_PARSE_IN_PROGRESS`

### `GET /memos/:memo_id/parse-result`

메모 AI 파싱 결과 조회.

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `memo` | Memo | 메모 |
| `latest_result` | AiParseResult \| null | 최신 결과 |
| `parse_results` | AiParseResult[] | 전체 결과. 최신순 |

AiParseResult 주요 필드:

- `ai_result_id`
- `memo_id`
- `user_id`
- `detected_type`: `schedule` | `task` | `note` | `mixed`
- `extracted_title`
- `extracted_summary`
- `extracted_start_datetime`
- `extracted_end_datetime`
- `extracted_due_datetime`
- `extracted_priority`
- `suggested_schedule`
- `suggested_task`
- `suggested_actions`
- `confidence_score`
- `status`: `suggested` | `approved` | `rejected`
- `created_at`
- `updated_at`

### `POST /memos/:memo_id/apply`

AI 파싱 결과를 일정, 반복 일정, 할 일, 리마인더로 반영합니다. 적용 성공 시 해당 AI 결과 상태는 `approved`로 변경됩니다.

Request body:

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `ai_result_id` | numeric string | X | 생략 시 메모의 최신 결과 사용 |
| `apply_type` | `schedule` \| `task` \| `action` \| `all` | O | 적용 방식 |
| `action_index` | number | X | `apply_type=action`일 때 `suggested_actions`의 0-based index |
| `category_id` | numeric string | X | 생성 리소스의 카테고리. 일정/할 일이 섞인 `all` 적용에는 사용 불가 |
| `schedule_id` | numeric string | X | `apply_type=task`일 때 기존 일정에 연결 |

Request 예시:

```json
{
  "ai_result_id": "12",
  "apply_type": "schedule",
  "category_id": "1"
}
```

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `apply_type` | `schedule` \| `task` \| `action` \| `all` | 적용 유형 |
| `resource` | Schedule \| Task \| null | 첫 번째 생성 리소스 |
| `resources` | Array | 생성된 일정/할 일 전체 |
| `reminders` | Reminder[] | 함께 생성된 리마인더 |
| `applied_actions` | object[] | 적용된 액션별 결과 |

비고:

- `suggested_actions[].type=create_schedule`는 일반 일정 또는 반복 일정을 생성할 수 있습니다.
- 반복 일정은 여러 일정으로 생성되고 같은 `recurrence_group_id`로 묶입니다.
- `suggested_actions[].reminders`가 있으면 생성된 일정/할 일에 리마인더가 함께 생성됩니다.
- 중복 방지는 `ai_result_id + action_index` 기준입니다.

상태 코드:

- `201 Created`
- `400 INSUFFICIENT_AI_DATA`
- `400 ACTION_INDEX_REQUIRED`
- `400 AMBIGUOUS_CATEGORY_TARGET`
- `404 AI_ACTION_NOT_FOUND`
- `404 MEMO_NOT_FOUND`
- `404 AI_RESULT_NOT_FOUND`
- `409 AI_RESULT_ALREADY_APPLIED`
- `409 AI_RESULT_REJECTED`

## Push Devices

모든 Push Devices API는 인증 필요.

웹/Android 프론트에서 발급한 FCM registration token을 백엔드에 등록합니다. Firebase 서비스 계정 JSON은 백엔드 전용이며 프론트로 전달하지 않습니다.

### `GET /push/devices`

현재 로그인 사용자의 푸시 디바이스 목록 조회.

Response data:

- `devices[]`
  - `push_device_id`
  - `user_id`
  - `provider`: `fcm`
  - `platform`: `web` | `android`
  - `device_name`
  - `app_version`
  - `status`: `active` | `inactive`
  - `last_seen_at`
  - `failed_count`
  - `last_error_code`
  - `last_error_message`
  - `created_at`
  - `updated_at`

비고:

- `device_token` 원문과 `token_hash`는 응답에 포함하지 않습니다.

### `POST /push/devices`

FCM registration token 등록/갱신.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `provider` | `fcm` | X | `fcm` | 발송 provider |
| `platform` | `web` \| `android` | O | - | 토큰이 발급된 플랫폼 |
| `device_token` | string | O | - | FCM registration token |
| `device_name` | string \| null | X | - | 브라우저/기기 표시명 |
| `app_version` | string \| null | X | - | 앱/웹 버전 |

Request 예시:

```json
{
  "provider": "fcm",
  "platform": "web",
  "device_token": "fcm-registration-token",
  "device_name": "Chrome",
  "app_version": "1.0.0"
}
```

Response data:

- `device`: PushDevice

비고:

- 같은 `device_token`을 다시 등록하면 새 row를 만들지 않고 기존 row를 active로 갱신합니다.
- 같은 토큰이 다른 사용자에게 등록되어 있던 경우 현재 사용자 소유로 갱신됩니다.

### `POST /push/devices/unregister`

FCM registration token으로 디바이스를 비활성화합니다. 로그아웃 또는 토큰 폐기 시 사용합니다.

Request body:

```json
{
  "device_token": "fcm-registration-token"
}
```

Response data:

- `device`: PushDevice

상태 코드:

- `404 PUSH_DEVICE_NOT_FOUND`

### `DELETE /push/devices/:push_device_id`

디바이스 ID로 디바이스를 비활성화합니다.

Response data:

- `device`: PushDevice

상태 코드:

- `404 PUSH_DEVICE_NOT_FOUND`

## Reminders

모든 Reminders API는 인증 필요.

`reminder_type = push`인 리마인더는 백엔드 job이 `remind_at` 이후 FCM으로 발송합니다. 발송 대상은 해당 사용자의 active push device입니다.

### `GET /reminders`

리마인더 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `target_type` | `schedule` \| `task` | X | 대상 유형 |
| `is_sent` | `true` \| `false` | X | 발송 여부 |
| `remind_from` | datetime string | X | `remind_at >= remind_from` |
| `remind_to` | datetime string | X | `remind_at <= remind_to` |

정렬:

- `remind_at asc`

Response data:

- `reminders`: Reminder[]

Reminder 추가 발송 필드:

- `send_attempts`: 푸시 발송 시도 횟수
- `last_send_error_code`: 최근 발송 오류 코드
- `last_send_error_message`: 최근 발송 오류 메시지

### `GET /reminders/:reminder_id`

리마인더 상세 조회.

Response data:

- `reminder`: Reminder

상태 코드:

- `404 REMINDER_NOT_FOUND`

### `POST /reminders`

리마인더 생성.

Request body:

| 필드 | 타입 | 필수 | 기본값 | 제약 |
| --- | --- | --- | --- | --- |
| `target_type` | `schedule` \| `task` | O | - | - |
| `target_id` | numeric string | O | - | 본인 소유 일정/할 일이어야 함 |
| `remind_at` | datetime string | O | - | offset 포함 |
| `reminder_type` | `push` \| `in_app` | X | `push` | - |

Request 예시:

```json
{
  "target_type": "schedule",
  "target_id": "21",
  "remind_at": "2026-04-18T08:30:00+09:00",
  "reminder_type": "push"
}
```

Response data:

- `reminder`: Reminder

상태 코드:

- `201 Created`
- `404 SCHEDULE_NOT_FOUND`
- `404 TASK_NOT_FOUND`

### `PATCH /reminders/:reminder_id`

리마인더 수정.

Request body:

하나 이상의 필드가 필요합니다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `target_type` | `schedule` \| `task` | X | 대상 유형 |
| `target_id` | numeric string | X | 대상 ID |
| `remind_at` | datetime string | X | offset 포함 |
| `reminder_type` | `push` \| `in_app` | X | - |
| `is_sent` | boolean | X | 발송 여부 |
| `sent_at` | datetime string \| null | X | `null`로 발송 시각 제거 |

비고:

- `is_sent`를 true로 바꾸고 `sent_at`을 생략하면 기존 `sent_at`이 있으면 유지하고, 없으면 현재 시각을 설정합니다.
- `is_sent`가 false이면 `sent_at`은 null이 됩니다.
- `is_sent`를 false로 변경하거나 `remind_at`, `reminder_type`을 변경하면 푸시 발송 시도/오류 정보가 초기화됩니다.

Response data:

- `reminder`: Reminder

상태 코드:

- `404 REMINDER_NOT_FOUND`
- `404 SCHEDULE_NOT_FOUND`
- `404 TASK_NOT_FOUND`

### `DELETE /reminders/:reminder_id`

리마인더 삭제.

Response data:

- 빈 객체

상태 코드:

- `404 REMINDER_NOT_FOUND`

## Notifications

모든 Notifications API는 인증 필요.

알림센터용 인앱 알림 조회/읽음 처리 API입니다. 푸시 알림은 놓칠 수 있으므로, 앱/웹은 이 API로 사용자의 알림 목록과 unread count를 다시 조회합니다.

### `GET /notifications`

로그인한 사용자의 알림 목록 조회.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `page` | number | X | `1` | 페이지 |
| `page_size` | number | X | `20` | 최대 `100` |
| `unread_only` | `true` \| `false` | X | - | 미읽음만 조회 |
| `type` | string | X | - | 알림 유형 필터 |

Response data:

- `notifications[]`
  - `notification_recipient_id`
  - `notification_id`
  - `type`
  - `title`
  - `body`
  - `data`
  - `read_at`
  - `push_sent_at`
  - `push_status`
  - `created_at`
- `meta`

### `GET /notifications/unread-count`

로그인한 사용자의 미읽음 알림 수 조회.

Response data:

- `unread_count`

### `PATCH /notifications/:notification_recipient_id/read`

알림 1건을 읽음 처리합니다.

Response data:

- `notification`

상태 코드:

- `404 NOTIFICATION_NOT_FOUND`

### `PATCH /notifications/read-all`

로그인한 사용자의 모든 미읽음 알림을 읽음 처리합니다.

Response data:

- `updated_count`

## Briefings

모든 Briefings API는 인증 필요.

### `GET /briefings/today`

UTC 날짜 기준 오늘 브리핑 조회.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | X | 서버 기준 오늘 | 조회 날짜 |

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `date` | string | 해석된 날짜 |
| `summary.schedule_count` | number | 개인 일정 수 |
| `summary.company_schedule_count` | number | 조직 일정 수 |
| `summary.total_schedule_count` | number | 개인+조직 일정 수 |
| `summary.task_count` | number | 해당 날짜 마감 할 일 수 |
| `summary.overdue_task_count` | number | 기한 초과 미완료 할 일 수 |
| `summary.reminder_count` | number | 해당 날짜 리마인더 수 |
| `schedules` | Schedule[] | 개인 일정 |
| `company_schedules` | CompanySchedule[] | 조직 일정 |
| `tasks` | Task[] | 해당 날짜 마감 할 일 |
| `overdue_tasks` | Task[] | 기한 초과 미완료 할 일 |
| `reminders` | Reminder[] | 해당 날짜 리마인더 |

## Home

모든 Home API는 인증 필요.

### `GET /home/today`

모바일 홈 피드 전용 응답 조회. 사용자 타임존 기준 하루 범위로 개인 일정, 조직 일정, 오늘 마감 할 일, 요약, 포커스 아이템, 브리핑 문구를 반환합니다.

Query params:

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | X | 요청 시점 기준 오늘 | 조회 날짜 |
| `timezone` | string | X | 사용자 timezone, 없으면 `Asia/Seoul` | 유효한 IANA timezone |

타임존 우선순위:

1. query param `timezone`
2. 사용자 프로필 `timezone`
3. `Asia/Seoul`

Response data:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `date` | string | 조회 날짜 |
| `timezone` | string | 적용된 timezone |
| `briefing_text` | string | 홈 상단 브리핑 문구 |
| `summary.today_schedule_count` | number | 오늘 표시할 개인+조직 일정 수 |
| `summary.today_personal_schedule_count` | number | 미완료 개인 일정 수 |
| `summary.today_company_schedule_count` | number | 조직 일정 수 |
| `summary.today_deadline_schedule_count` | number | 마감 유형 일정 수 |
| `summary.incomplete_task_count` | number | 전체 미완료 할 일 수 |
| `slot_counts.meeting` | number | 회의 일정 수 |
| `slot_counts.fieldwork` | number | 현장 일정 수 |
| `slot_counts.deadline` | number | 마감 일정 수 |
| `slot_counts.other` | number | 기타 일정 수 |
| `today_schedules` | object[] | 오늘 개인 일정 |
| `organization_schedules` | object[] | 오늘 조직 일정 |
| `due_today_tasks` | object[] | 오늘 마감 미완료 할 일 |
| `focus_items` | object[] | 상위 3개 집중 항목 |

`today_schedules[]` 항목:

- `id`
- `title`
- `description`
- `schedule_type`
- `start_datetime`
- `end_datetime`
- `all_day`
- `location`
- `category_id`
- `priority`
- `is_completed`

`organization_schedules[]` 항목:

- `id`
- `company_id`
- `company_name`
- `title`
- `description`
- `schedule_type`
- `start_datetime`
- `end_datetime`
- `all_day`
- `location`
- `source_type`
- `target_types`

`due_today_tasks[]` 항목:

- `id`
- `title`
- `description`
- `priority`
- `status`
- `due_datetime`
- `schedule_id`
- `category_id`

`focus_items[]` 항목:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `item_type` | `schedule` \| `company_schedule` \| `task` | 항목 유형 |
| `id` | number | 해당 리소스 ID |

비고:

- 개인 일정은 완료되지 않은 일정만 `summary.today_personal_schedule_count`와 포커스 계산에 포함됩니다.
- `today_schedules` 배열 자체에는 오늘 개인 일정 전체가 내려옵니다.
- `briefing_text`는 AI 생성 문구가 우선 사용됩니다.
- AI 호출 실패 또는 검증 실패 시 서버 기본 문구로 fallback 됩니다.
- 같은 사용자/날짜/타임존에서 홈 데이터가 동일하면 기존 생성 문구를 캐시 재사용합니다.
