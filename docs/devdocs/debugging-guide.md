# Flowra API 개발·디버깅 가이드

> 백엔드 저장소에서 가져온 2026-09-16 기준 참고 자료입니다. 아래 `src/...` 경로·줄 번호·생성/검증 명령은 원본 백엔드 기준이며, 이 프런트엔드 저장소에는 해당 소스와 도구가 없습니다. 현재 웹 반영 범위는 [문서 안내](../README.md)를 참고하세요.

기준: 2026-09-16 코드. [전체 문서](../README.md). 이 문서는 현재 구현 설명이며 계획된 기능의 제공을 약속하지 않는다. 실제 장애 조사에서는 해당 배포 버전과 소스를 먼저 맞춘다.

## 1. 어디부터 읽을까

| 상황 | 시작 문서 | 코드 추적 |
| --- | --- | --- |
| 일반 앱 로그인·일정·할 일·공유 | [일반 명세](../backend-specs/api_general.md) | [일반 라우트](routes-general.md) |
| AI 채팅·메모 분석·적용 실패 | [AI 명세의 디버깅 절](../backend-specs/api_ai.md#ai-개발자-디버깅-계약) | 일반 라우트의 ai-chat/memos, [오류 색인](error-index.md) |
| 시스템 관리자 도구 | 시스템 관리자 명세 (백엔드 원본: `docs/api_admin.md`, 이 저장소에 미포함) | [관리자 라우트](routes-admin.md) |
| 기업 패널·부서 범위·역할 | 기업 관리자 명세 (백엔드 원본: `docs/api_company_admin.md`, 이 저장소에 미포함) | [기업 관리자 라우트](routes-company-admin.md) |
| 외부 조직 동기화 | 조직 명세 (백엔드 원본: `docs/api_org.md`, 이 저장소에 미포함) | [조직 라우트](routes-org.md) |
| 기능에 대응하는 API가 안 보임 | [현재 기능 공백 / 현재 구현 계약](feature-lifecycle.md) | 라우트 색인에서 method/path 존재 여부 확인 |

기존 명세의 예제 값은 설명용이다. 요청 제약의 최종 기준은 DTO와 서비스 검사다. 라우트 색인의 입력 검증 경로로 원본 백엔드에서 필수·기본값·허용 enum·배열 크기·refine 조건을 확인한다. 이 저장소에 없는 DTO의 세부 제약은 추측하지 않는다.

## 2. API 영역과 자격 증명

| Prefix | 호출 주체 | Authorization | 성공 형식 |
| --- | --- | --- | --- |
| `/api/v1` | 일반 앱 사용자 | `Bearer <user_access_token>`; 공개 경로 제외 | `{ success, message, data }` |
| `/admin/api/v1` | 시스템 관리자 | `Bearer <admin_access_token>`; 인증 경로별 예외 | `{ data }`, 목록 `{ data, meta }`, 일부 삭제 204 |
| `/company-admin/api/v1` | 특정 회사의 관리자 | `Bearer <company_admin_access_token>`; 로그인·초대 경로별 예외 | `{ success, message, data }` |
| `/org-api/v1` | 조직 연동 서버 | `Bearer <org_api_key>` | `{ success, message, data }` |

- 같은 이메일 계정이어도 토큰은 서로 대체할 수 없다. 일반 사용자 ID, 기업 멤버 ID, 기업 관리자 ID, 시스템 관리자 ID도 별개다.
- 사용자 access token을 refresh_token 자리에 넣지 않는다. 조직 API key는 JWT 갱신 대상이 아니다.
- 회사/부서 ID를 보내는 것만으로 소속·관리 권한이 생기지 않는다. 서버는 토큰의 주체와 현재 DB 상태를 대조한다.
- 인증 성공과 리소스 권한 성공은 다르다. 계정/회사/멤버/역할/부서 범위·세션 철회가 추가로 적용된다.
- 공개 API에도 DTO 검증과 만료된 초대/재설정 토큰 검사는 있다. 공개는 “아무 상태나 성공”을 뜻하지 않는다.

## 3. 요청 작성 규칙

### Method와 URL

`POST /api/v1/ai-chat/messages/:message_id/apply`에 GET을 보내는 것은 잘못된 호출이다. 이 기능에 GET 대체 경로는 없다. 앱의 HTTP helper가 method 기본값을 GET으로 설정하는지, 재시도 시 method/body를 보존하는지 확인한다.

잘못된 method에 항상 405가 오는 것은 아니다. 현재 Express 라우터는 상위 인증을 먼저 실행할 수 있어 401/403이 먼저 오고, 인증을 통과한 뒤 등록 경로가 없으면 404가 날 수 있다. 401을 보고 URL/method가 맞다고 판단하지 않는다.

Cloudflare의 HTML 오류 페이지는 백엔드 JSON 오류와 구분한다. 앱에 설정된 base URL, 최종 URL, redirect 여부, Content-Type을 확인한다. 브라우저 주소창 열기는 앱의 Bearer 요청 재현이 아니다.

### Body·query·ID·날짜

| 항목 | 규칙 / 주의 |
| --- | --- |
| JSON body | `Content-Type: application/json`. 중첩 객체와 boolean을 JSON으로 보낸다. 문자열 `"false"`는 boolean `false`와 다르다. |
| ID | DTO가 문자열을 요구하면 `"86"`을 보낸다. 일부 기업 ID는 `z.coerce.number()`이며 일괄 삭제는 숫자도 허용한다. 모든 API를 같은 규칙으로 강제하지 않는다. |
| ID 응답 | 공통 serializer는 BigInt를 Number로 변환한다. 현재 숫자 ID를 받을 수 있다. 안전 정수 범위를 넘는 ID 표현 보장은 없으며 문자열로 재변환해도 이미 잃은 정밀도는 복구되지 않는다. |
| query | Express `simple` parser. 중첩 `filter[x]` 형식을 임의로 사용하지 않는다. 일정 복수 필터는 DTO가 지원하는 CSV 형식을 사용한다. |
| boolean query | `true`/`false` 문자열을 명시한다. 빈 문자열·0/1 지원을 가정하지 않는다. |
| datetime | 가능한 공통 형식은 UTC `...Z`. 개인 일정은 `+09:00` 등 offset을 허용하지만 사용자 기업 일정 body의 `.datetime()`은 현재 `Z` 형식을 요구한다. endpoint DTO 확인. |
| date-only | `YYYY-MM-DD`. 시각이 있는 datetime과 교환하지 않는다. 반복 제외일은 recurrence timezone의 날짜다. |
| PATCH 생략 | 보통 기존 값 유지. `null`로 지우려면 해당 필드가 nullable이어야 한다. 빈 문자열과 null은 다르다. |
| 알 수 없는 필드 | 기본 Zod object는 선언되지 않은 키를 제거한다. “200이므로 추가 필드가 저장됐다”는 추론은 금지. 응답/재조회 확인. |
| 기본값 | DTO가 서버에서 채운다. 클라이언트 기본값은 명세와 맞춘다. `optional()`과 `default()`를 구분한다. |
| PATCH 빈 객체 | 다수 DTO의 refine에서 거절된다. 일부 특별한 DTO에는 다른 조건이 있으므로 검증 링크를 확인한다. |

URLSearchParams를 사용하면 offset의 `+`가 공백으로 해석되는 실수를 피할 수 있다.

```js
const query = new URLSearchParams({
  start_from: "2026-09-22T09:00:00+09:00",
  is_completed: "false",
  category_id: "1,2"
});
const url = `/api/v1/schedules?${query.toString()}`;
```

전역 JSON 크기 제한은 1mb다. 현재 body parser는 request-id/log middleware보다 앞서므로 잘못된 JSON·크기 초과 응답에 요청 ID나 DB 요청 로그가 없을 수 있다. 이 parser 오류는 현재 일반 오류 middleware에서 500으로 보일 수도 있다. “500은 항상 비즈니스 로직 실패”로 좁히지 않는다.

근거: app: `src/app.ts`, 검증: `src/common/http/validate-request.ts`, 직렬화: `src/common/utils/serialize.ts`.

## 4. 응답과 오류 읽기

### 일반·기업 관리자·조직 API

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "issues": [{ "path": "action_index", "message": "Expected number, received string" }]
    }
  }
}
```

일반 ApiError는 `error.details`가 빈 객체일 수도 있다. 사용자 메시지는 최상위 `message`, 안정적인 분기는 `error.code`를 사용한다. `issues[].path`는 중첩 경로를 점으로 연결한 문자열이고 객체 전체 refine 오류는 빈 경로일 수 있다.

### 시스템 관리자 API

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request."
  }
}
```

시스템 관리자의 Zod 오류는 첫 issue 메시지만 내려가고 일반 API의 전체 issues 배열을 보장하지 않는다. 일부 DELETE는 204/빈 body이므로 무조건 `response.json()`을 호출하지 않는다. 터미널 명령은 HTTP 성공과 명령 exit_code 성공을 구분하며 해당 명세를 따른다.

### 상태별 조사 순서

| 결과 | 확인 순서 | 기본 조치 |
| --- | --- | --- |
| 응답 없음 / fetch TypeError | 최종 URL, 네트워크, TLS/프록시, CORS, 브라우저 console | 서버가 처리하지 않았다고 단정하지 말고 변경 결과 조회 |
| 400 | `error.code` → DTO issue → 서비스 상태/AI 저장 데이터 | 같은 body 무한 재시도 금지. 입력 또는 서버 데이터 원인 구분 |
| 401 | prefix, method, Bearer 헤더, 토큰 종류, 만료, 세션 철회 | 일반 앱은 지원되는 refresh 흐름; 관리자에 일반 refresh를 재사용하지 않음 |
| 403 | 필요한 permission/scope, owner 여부, 부서 범위, 계정 상태, IP | 재로그인만으로 해결된다고 가정하지 않음 |
| 404 | method/path, ID 종류, 삭제 여부, 리소스 소유자/회사 | 없는 것과 접근 불가를 숨기는 경우 모두 고려 |
| 409 | 이미 적용/이미 응답/진행 중/중복/마지막 owner | 상태 재조회 후 버튼·목록 갱신 |
| 500 | request ID, 서버 로그, DB/외부 AI, parser 실패 여부 | 생성 요청 재전송 전에 저장 결과 확인 |
| 502/503/504 또는 HTML | 응답 발생 주체, 프록시/터널, 백엔드 상태 | JSON 파싱 실패와 백엔드 오류를 구분 |

일반 Prisma unique 충돌은 `RESOURCE_CONFLICT`, 없는 레코드 변경은 `RESOURCE_NOT_FOUND`로 매핑된다. 시스템 관리자는 각각 `CONFLICT`, `NOT_FOUND`다. 모든 엔드포인트가 이 이름만 사용하지는 않는다. 서비스에서 더 구체적인 코드를 먼저 던질 수 있다.

일반 오류 처리: `src/common/http/error-middleware.ts` · 관리자 오류 처리: `src/admin/common/admin-error-middleware.ts` · [전체 생성 지점](error-index.md)

## 5. 인증 갱신과 권한 디버깅

일반 사용자 refresh는 회전 방식이다. 성공하면 새 access/refresh 쌍을 함께 저장하고 이전 refresh와 연결 세션을 더 이상 사용하지 않는다. 여러 요청의 401로 동시에 refresh를 보내면 한 요청이 소비한 토큰을 다른 요청이 재사용할 수 있다.

클라이언트 권장 흐름:

1. 토큰 영역별 저장 공간을 분리한다.
2. 일반 사용자의 여러 401은 하나의 refresh Promise를 공유한다.
3. 갱신 성공 시 새 토큰 쌍으로 원래 요청의 method/body를 유지해 최대 한 번 재시도한다.
4. refresh 자체의 실패에는 refresh를 재귀 호출하지 않는다. 재로그인으로 전환한다.
5. mutation의 네트워크 오류·5xx는 이 401 복구 규칙과 분리한다. 요청 결과가 불명확할 수 있다.

현재 일반 authenticate는 일부 내부 세션 오류도 `UNAUTHORIZED`로 바꾼다. 401 코드만으로 “만료”라고 확정하지 않는다. 로그의 user ID가 null이면 인증 컨텍스트가 설정되기 전에 끝났다는 뜻이지, 반드시 로그아웃 사용자라는 증거는 아니다.

근거: 사용자 인증: `src/common/middleware/authenticate.ts`, refresh 구현: `src/modules/auth/auth.service.ts`, 세션: `src/common/auth/sessions.ts`.

## 6. 요청 추적과 장애 전달

### 클라이언트에서 남길 최소 정보

- 발생 시각 및 timezone, 환경/앱 버전.
- 정확한 method·최종 URL의 path와 필요한 query, HTTP status.
- 응답의 `X-Request-Id`, `error.code`, 메시지와 검증 issues.
- 사용한 토큰의 **종류**, 사용자/회사/리소스 식별자. 토큰 값 자체는 제외.
- 재현 단계, 직전의 생성/수정/삭제/refresh 여부.
- 필요한 필드만 남긴 request body와 response. AI라면 session/message/action_index 및 반복 조건.

`X-Request-Id`는 추적용이다. 40자 이하의 비어 있지 않은 값을 보내면 서버가 사용하고, 없으면 생성한다. 중복 방지 키가 아니다. 재시도마다 다른 ID를 쓰면 요청별 비교가 쉽다.

### 서버에서 찾는 순서

1. 시스템 관리자 `GET /admin/api/v1/logs/requests?request_id=...` (`logs.read` 필요).
2. `surface`, method, status, error_code, user/company ID, 시각을 비교한다. `request_id` 필터는 부분 일치다.
3. DB 로그는 응답 finish 후 비동기 저장된다. 즉시 안 보일 수 있고 저장 실패 가능성도 있다.
4. 서버의 `request.completed`, `request.api_error`, `request.validation_error`, `request.prisma_error`, `request.unhandled_error` 등과 대조한다. 시스템 관리자 자체 오류는 일반 오류 이벤트와 다르게 기록될 수 있다.
5. 필요하면 서비스가 조회한 원본 레코드를 읽기 전용으로 확인한다. 전체 사용자 대화/개인정보 덤프 대신 오류와 관련된 필드만 확인한다.

```bash
journalctl -u flowra-backend-dev.service --since '10 minutes ago' --no-pager | rg 'req_REPLACE_WITH_REQUEST_ID'
```

실제 request ID로 치환한다. 로그 파일 경로는 `DEVELOPER_LOG_FILE`, 기본 `/tmp/flowra-admin-backend.log`다. 시스템 관리자 IP 제한을 우회하지 않고 운영 접근 경로에서 조사한다.

요청 로그는 Authorization/body 전체를 저장하는 디버그 덤프가 아니다. 동일 IP·user agent·짧은 간격만으로 클라이언트 코드의 동일 원인을 확정할 수 없다. 반대로 앱 Network 기록에서 GET이 확인됐다면 그 호출 지점은 수정 대상이다.

### CORS와 헤더

현재 허용 요청 헤더는 Authorization, Content-Type, X-Request-Id이며 브라우저에 노출되는 응답 헤더는 X-Request-Id다. 조직 X-Org-Request-Id는 CORS expose 목록에 없어서 브라우저 JS에서 읽히지 않을 수 있다. Origin은 허용 목록과 정확히 맞아야 한다. `no-cors`로 덮으면 정상 JSON API 클라이언트를 만들 수 없다.

## 7. 재시도와 중복 적용

| 작업 | 결과 유실 후 처리 |
| --- | --- |
| 일반 GET | 권한·쿼리 수정 없이 일시 네트워크 실패라면 제한적 재시도 가능 |
| 일반 생성 POST | 범용 Idempotency-Key 지원 없음. 목록/관련 리소스를 확인하고 재생성 여부 결정 |
| AI chat 개별 apply | 동일 message/action은 이미 적용되면 409. 메시지 적용 상태를 재조회해 성공 결과를 복구 |
| AI chat `apply_type=all` | 이미 적용된 항목을 건너뜀. `skipped_action_indexes`와 실제 적용 결과를 함께 해석 |
| 메모 apply | ai_result_id와 action_index를 고정한다. 재파싱으로 새 결과가 생긴 경우 이전 결과와 구분 |
| 채팅방 DELETE | 첫 성공 후 재요청은 404. 본인 삭제 의도·선행 성공을 아는 경우 UI를 삭제 상태로 유지 |
| 조직 upsert | external ID의 매칭 규칙을 확인. 동일 ID 갱신과 전체 교체의 부수 효과를 구분 |
| 승인/거절 | 현재 요청 상태 재조회. 중복 클릭 방지와 서버의 상태 충돌 처리 모두 필요 |

원자성도 endpoint별이다. 트랜잭션 내 DB 변경이 롤백되더라도 별도 메일/푸시/로그까지 모두 취소된다는 뜻은 아니다. 조직 연동은 데이터 변경 뒤 sync log 저장 실패가 응답 실패로 보일 가능성을 고려한다.

## 8. 공통 HTTP helper 예시

아래는 **일반 JSON API**의 method 누락, 204 처리, 오류 envelope 차이를 피하기 위한 최소 예시다. 인증 갱신·timeout·스트림 처리는 별도 계층에서 구현한다. 자동 mutation 재시도는 하지 않는다.

```js
async function requestJson({ baseUrl, path, method, token, body, signal }) {
  if (!method) throw new Error("HTTP method is required");
  if ((method === "GET" || method === "HEAD") && body !== undefined) {
    throw new Error("GET/HEAD request must not carry a JSON body");
  }
  const headers = { "X-Request-Id": crypto.randomUUID() };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, signal,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const requestId = response.headers.get("X-Request-Id");
  if (response.status === 204) return { data: null, requestId };
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch {
    throw Object.assign(new Error("Non-JSON API response"), {
      status: response.status, requestId
    });
  }
  if (!response.ok || payload?.success === false || payload?.error) {
    throw Object.assign(new Error(
      payload?.error?.message ?? payload?.message ?? "API request failed"
    ), {
      status: response.status, requestId,
      code: payload?.error?.code, details: payload?.error?.details
    });
  }
  return { payload, requestId };
}
```

앱은 서버의 영문 message를 사용자에게 그대로 강제 노출하기보다 error.code별 안내를 정하고, 개발 로그에는 원래 code/details/requestId를 보존한다. 모르는 error.code도 일반 실패 UI로 처리한다.

## 9. 통합 확인 시나리오

개발용 계정과 테스트 데이터로 아래를 확인한다. 이 목록은 이번 문서 변경에서 실행한 테스트 결과가 아니다.

- 정상 요청 / 필수 필드 누락 / 잘못된 enum / 숫자·문자열 ID 혼동.
- 토큰 없음 / 다른 영역 토큰 / 만료·철회 / 다른 사용자 리소스 접근.
- 올바른 method와 잘못된 method 비교. 잘못된 method의 401을 정상 endpoint 증거로 사용하지 않음.
- 적용/승인 버튼 두 번 클릭, 응답 유실 후 재조회, 이미 삭제된 리소스.
- 반복 조건 정상 6건 / 같은 요일 모두 skip하여 0건 / max_occurrences 초과 / 잘못된 timezone.
- 회사 관리자 권한은 있으나 대상 부서 범위 밖인 경우, owner 전용 권한의 커스텀 역할.
- 비동기 메모 분석의 pending/processing/completed/failed 표시와 장기 processing 대응.
- 204·오류 JSON·프록시 HTML·CORS 실패의 UI 분기.

## 10. 문서 유지 절차

아래 2~4번은 백엔드 저장소에서 수행한다. 이 프런트엔드에서는 `pnpm.cmd --filter @workspace/flowra-web run test:api`, `pnpm.cmd run typecheck`와 [브라우저 QA](../qa/README.md)를 사용한다. 서버 DB·권한·경합 테스트와 프런트 모의 API 테스트의 결과는 구분해 기록한다.

1. controller/DTO/service/권한 변경 시 해당 기존 명세의 요청·응답·상태·오류·재시도 설명을 함께 수정한다.
2. `node devdocs/tools/generate-api-reference.cjs`로 라우트/오류 색인을 갱신한다.
3. `node devdocs/tools/generate-api-reference.cjs --check`로 현재 소스와 일치하는지 확인한다.
4. 생성 도구는 앱 서버나 DB를 실행하지 않는다. 명시적 등록과 오류 생성자를 추출하며 모든 런타임 분기를 증명하지 않는다.
5. 생성물이 일치해도 사람이 쓰는 설명의 정확성은 별도 검토한다. 미구현 계획은 현행 계약과 분리한다.
