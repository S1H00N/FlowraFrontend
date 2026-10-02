# Google 로그인 및 계정 연결 API

일반 사용자 API 경로는 `/api/v1/auth/google`이다. 웹·앱은 Google에서 발급한 **Google ID 토큰**을 `id_token`으로 전달한다. Firebase/Identity Platform ID 토큰이나 Google access token은 받지 않는다. 백엔드는 허용된 `GOOGLE_OAUTH_CLIENT_IDS`의 audience, 서명, 발급자, 만료, 검증된 이메일을 확인한다. Flowra의 기존 access/refresh 토큰과 세션은 그대로 사용한다.

## 환경설정

`.env`의 `GOOGLE_OAUTH_CLIENT_IDS`에는 웹/백엔드용 OAuth client ID를 쉼표로 구분해 적는다. 앱이 같은 서버 client ID를 audience로 쓰면 한 값이면 된다. 이 ID는 웹·앱의 Google 로그인 설정에도 쓰이며, 백엔드에는 허용된 audience로 등록한다. 클라이언트 시크릿과 `GOOGLE_APPLICATION_CREDENTIALS`는 이 방식에 사용하지 않는다. 값이 없으면 Google 인증 API는 `GOOGLE_LOGIN_NOT_CONFIGURED`를 반환한다.

## 로그인/가입 준비

`POST /api/v1/auth/google/prepare`

```json
{ "id_token": "GOOGLE_ID_TOKEN" }
```

이 경로에는 Flowra `Authorization` 헤더를 보내지 않는다. 연결된 Google 신원이면 `next_action: "signed_in"`과 기존 로그인 형식의 `user`, `tokens`를 반환한다. 연결되지 않았으면 10분 유효한 `link_ticket`, `expires_at`, `google_profile`, `existing_account`, `next_action`을 반환한다. `next_action`은 `existing_account` 또는 `signup`이다. 기존 계정 후보는 Google에서 확인된 이메일과 일치하는 계정 하나이며 이름과 마스킹한 이메일만 제공한다. **이메일 일치만으로 계정 연결이나 로그인은 하지 않는다.**

`link_ticket`은 일회용이다. 비밀번호를 틀리면 해당 티켓의 시도를 누적하고 5회부터 거부한다. IP 기준 요청 제한도 적용한다. 원본 Google ID 토큰과 티켓을 URL, 로그, 장기 저장소에 남기지 않는다.

## 기존 계정 연결

- `POST /api/v1/auth/google/link-with-password`: `{ "link_ticket": "...", "email": "...", "password": "..." }`. 사용자가 고른 기존 계정의 이메일·비밀번호를 확인한 뒤 Google을 연결하고 `user + tokens`를 반환한다. Google 이메일과 Flowra 이메일이 달라도 가능하다. 기존 계정은 이메일 인증을 마친 상태여야 한다.
- `POST /api/v1/auth/google/prepare-link`: Flowra Bearer 세션 + `{ "id_token": "..." }`. 이미 로그인 중인 계정에 Google을 연결하기 위한 세션 전용 티켓을 발급한다. 다른 Flowra 계정에 연결된 Google 신원은 거부한다.
- `POST /api/v1/auth/google/link`: Flowra Bearer 세션 + `{ "link_ticket": "...", "password": "..." }`. 현재 세션의 계정 비밀번호로 재인증하고 연결한다. `prepare-link`의 티켓은 발급 세션에서만 사용 가능하다. 익명 `prepare` 티켓으로 다른 계정에 로그인한 뒤 연결하려면 티켓 발급 **이후** 생성된 로그인 세션이 필요하다.
- `GET /api/v1/auth/google/accounts`: Flowra Bearer 세션에서 연결된 제공자와 연결 시각을 반환한다.

기존 Flowra 이메일·이름은 Google 프로필 값으로 자동 변경하지 않는다. 한 Flowra 계정에 Google 신원은 최대 하나다.

## 신규 가입

`POST /api/v1/auth/google/signup`

```json
{ "link_ticket": "...", "name": "표시 이름", "password": "Flowra 비밀번호", "timezone": "Asia/Seoul" }
```

이메일은 검증된 Google ID 토큰에서 가져오고 요청 본문으로 받지 않는다. 이름과 비밀번호는 필수, 시간대는 선택이다. 가입 허용 설정과 이메일 도메인 제한을 일반 가입과 동일하게 적용한다. Google이 이메일에 대해 권위 있는 Gmail/Workspace 계정은 즉시 User와 local/Google 인증 계정을 생성하고 `user + tokens`를 반환한다 (`201`). 외부 도메인 이메일은 이메일 확인 전까지 User와 세션을 만들지 않고 `requires_email_verification: true`를 반환한다 (`202`). 확인 메일의 기존 `/verify-email` 화면에서 토큰을 `POST /api/v1/auth/verify-email`로 제출하면 최종 가입과 토큰 발급이 완료된다. 확인 전 이메일 또는 Google 신원을 다른 계정이 선점하면 가입은 충돌 오류로 종료된다.

신규 가입자는 항상 Flowra 비밀번호를 설정하므로 기존 비밀번호 로그인·재설정·회사 관리자 비밀번호 로그인도 계속 사용할 수 있다. `login_type`은 `local`로 유지하며 Google 연결 여부는 `AuthAccount`에서 확인한다. **Flowra 비밀번호를 재설정하면 계정 복구를 위해 Google 연결이 해제되고 기존 세션도 폐기된다.** 계속 Google 로그인을 사용하려면 새 비밀번호로 로그인한 뒤 다시 연결해야 한다.

## 오류 예시

- `INVALID_GOOGLE_ID_TOKEN` (401): Google 토큰이 유효하지 않거나 확인된 이메일이 없다.
- `INVALID_GOOGLE_LINK_TICKET` (401): 티켓 만료·소비·시도 초과·세션 불일치.
- `INVALID_CREDENTIALS` (401): 선택한 Flowra 계정의 비밀번호가 틀렸다.
- `EMAIL_NOT_VERIFIED` (403): 기존 Flowra 계정의 이메일 확인이 필요하다.
- `GOOGLE_ACCOUNT_ALREADY_LINKED` (409): Google 신원 또는 Flowra 계정에 이미 다른 연결이 있다.
- `GOOGLE_ACCOUNT_CONFLICT` (409): 가입·연결 중 이메일이나 Google 신원 충돌이 발생했다.
- `GOOGLE_AUTH_RATE_LIMITED` (429): 단기간 요청 제한에 걸렸다.
- `GOOGLE_LOGIN_NOT_CONFIGURED` (503): 허용된 OAuth client ID가 설정되지 않았다.

Google 로그인을 시스템 관리자 또는 회사 관리자 로그인 엔드포인트에 직접 추가하지 않는다. 관리자 포털은 기존 사용자 계정의 `linked_providers`와 인증 계정 목록에서 Google 연결 상태를 표시한다.
