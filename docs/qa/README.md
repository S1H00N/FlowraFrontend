# Flowra 브라우저 QA

실제 화면을 Chrome으로 열고 기능, 반응형 배치, 오류 처리를 반복 검사합니다.
제품 코드는 변경하지 않으며, 테스트 실패를 자동으로 정상 처리하지 않습니다.

## 실행

저장소 루트의 Windows PowerShell에서 실행합니다. PowerShell 실행 정책 때문에 `pnpm` 대신 `pnpm.cmd`를 사용합니다.

```powershell
pnpm.cmd --filter @workspace/flowra-web run test:api
pnpm.cmd --filter @workspace/flowra-web run test:e2e:typecheck
pnpm.cmd --filter @workspace/flowra-web run test:e2e
pnpm.cmd --filter @workspace/flowra-web run test:e2e:report
```

설치된 Google Chrome을 기본 사용합니다. Chrome이 없는 환경은 다음과 같이 실행할 수 있습니다.

```powershell
pnpm.cmd --filter @workspace/flowra-web exec playwright install chromium
$env:PW_CHANNEL='chromium'
pnpm.cmd --filter @workspace/flowra-web run test:e2e
```

테스트가 현재 앱을 `dist/qa`에 빌드한 뒤 포트 4175에서 미리보기 서버를 시작하고 종료합니다. 실행 도중 편집된 소스가 화면에 섞이지 않도록 빌드 결과를 검사합니다. 해당 포트가 사용 중이면 기존 서버를 재사용하지 않고 실패합니다.

## 구성과 범위

| 파일 | 검사 |
| --- | --- |
| `tests/e2e/fixtures.ts` | 고정 사용자·날짜·데이터, 요청 기록, 가상 API |
| `tests/e2e/flows.spec.ts` | 로그인, 메뉴, 할 일 생성·완료, 일정 생성·편집, 메모 생성·편집·삭제 |
| `tests/e2e/shell.spec.ts` | 사이드바, 설정, 테마, AI 패널, 캘린더 보기 |
| `tests/e2e/tasks-design.spec.ts` | 할 일 카드, 완료·선택 분리, 검색·필터, 반응형 입력 패널과 포커스 |
| `tests/e2e/ai-chat-apply.spec.ts` | AI 제안 적용 실패 표시와 재시도 |
| `tests/e2e/layout.spec.ts` | 화면 캡처, 가로 넘침, 하단 메뉴의 콘텐츠·컨트롤 가림, 빈 목록·긴 내용·서버 오류 |
| `tests/e2e/visual.spec.ts` | 로그인 2개 크기, 데스크톱 메모·공지의 기준 이미지 비교 |

기능 시나리오는 1280×900 데스크톱과 390×844 모바일 에뮬레이션에서 실행합니다.
레이아웃 검사는 360, 390, 599, 600, 768, 1024, 1280, 1920px 너비를 사용합니다.
599/600px는 앱의 사이드바·하단 메뉴 전환 경계입니다. 추가로 다크 테마와 공개 인증 화면을 확인합니다.

가상 API는 브라우저 요청을 가로채고, 실제 서비스 API 및 외부 자원 요청을 차단합니다.
테스트용 API 주소는 `http://qa-api.invalid/api/v1`이며 실제 서버가 아닙니다.
가상 데이터는 테스트마다 새로 만들고 한 테스트 안에서는 새로고침 후에도 유지합니다.
따라서 이 테스트의 저장·새로고침 통과는 프런트엔드 동작에 대한 결과이며 실제 서버의 영속 저장을 증명하지 않습니다.
시간은 2026-09-09 10:00, 시간대는 Asia/Seoul로 고정합니다.

처리하지 않은 API 경로는 501 응답과 함께 테스트를 실패시킵니다. 이를 제품 오류와 구분하여 fixture를 보완해야 합니다.
외부 폰트와 프로필 이미지는 기본 검사에서 생략하므로 실제 서비스의 해당 자원 로딩은 별도 확인 대상입니다.

## 결과 보기

기본 HTML 보고서는 `artifacts/flowra-web/playwright-report/`에 생성됩니다.
스크린샷·위치 측정 JSON·실패 시 실행 기록은 `artifacts/flowra-web/test-results/`에 저장됩니다.
레이아웃의 `viewport.png`는 실제 보이는 화면, `full-page.png`는 전체 페이지입니다.
`layout-diagnostics.json`에는 화면 크기, 콘텐츠 영역, 하단 메뉴 위치, 가려진 컨트롤, 런타임 오류 및 요청 누락이 들어 있습니다.

부분 실행의 결과를 보관하려면 별도 디렉터리를 지정합니다.

```powershell
$env:QA_REPORT_DIR='playwright-report-layout'
$env:QA_RESULTS_DIR='test-results-layout'
pnpm.cmd --filter @workspace/flowra-web exec playwright test --project=layout
pnpm.cmd --filter @workspace/flowra-web exec playwright show-report playwright-report-layout
```

같은 PowerShell에서 기본 경로로 다시 실행하려면 `Remove-Item Env:QA_REPORT_DIR,Env:QA_RESULTS_DIR -ErrorAction SilentlyContinue`로 위 두 설정을 해제합니다.

## 판정 원칙

- 클릭 후 화면과 요청 결과를 확인합니다. `force` 클릭으로 가려진 버튼을 통과시키지 않습니다.
- 의도된 스크롤·팝업 겹침과 오작동을 구분합니다. 자동 측정만으로 모든 디자인 문제를 판단하지 않습니다.
- 현재 존재하는 결함을 정상 스크린샷으로 등록하지 않습니다. 시각 검토로 정상 확인한 화면만 향후 화면 비교 기준으로 사용할 수 있습니다.
- 모의 응답과 실제 서비스 결과, 통과·실패·미실행을 보고서에 구분합니다.
- 회사 관리자 권한, 외부 메일·푸시 수신, 실제 AI 품질, 실제 iOS/Android 기기 동작은 기본 검사에 포함되지 않습니다.

## 실제 서비스 계정

`artifacts/flowra-web/.env.qa.local`에 서비스 주소와 테스트 전용 계정 정보를 입력합니다.
이 파일은 Git에서 제외됩니다. 비밀번호와 인증 상태를 보고서나 저장소에 넣지 않습니다.
실제 계정 검사는 기본 가상 API 검사와 별도 설정으로 실행하며, 기본 명령에서 자동으로 실행하지 않습니다.

현재 별도 설정은 로그인 및 6개 페이지의 실제 API 조회만 검증합니다. 데이터 수정·삭제·메일·푸시 요청은 차단합니다.
`QA_WEB_BASE_URL`, `QA_API_BASE_URL`, `QA_EMAIL`, `QA_PASSWORD`를 테스트 대상 환경에 맞게 설정합니다.

```powershell
pnpm.cmd --filter @workspace/flowra-web run test:e2e:live:typecheck
pnpm.cmd --filter @workspace/flowra-web run test:e2e:live
```

## 통합 결과와 기준 이미지

기본 실행의 JSON 보고서로 검색 가능한 결과 화면을 생성합니다. 디렉터리 이름을 인자로 여러 개 지정하면 재검사 결과를 합치며, 동일 항목은 가장 최근 결과가 우선합니다. 실제 계정 검사는 이 집계에 포함되지 않습니다.

```powershell
node artifacts/flowra-web/tests/qa-report.mjs
# 여러 부분 실행의 결과를 합칠 때
node artifacts/flowra-web/tests/qa-report.mjs playwright-report playwright-report-layout
```

생성 결과는 `docs/qa/report.html` 및 `docs/qa/run-summary.json`입니다. HTML을 브라우저에서 열면 실패·통과·환경별로 필터링하고 화면 캡처를 볼 수 있습니다.
생성 보고서와 일회성 QA 기록·캡처는 로컬에 보관하며 Git에서 제외합니다.

기준 이미지는 `tests/e2e/visual.spec.ts-snapshots`에 있습니다. 의도한 디자인 변경을 검토한 경우에만 다음 명령으로 갱신합니다. 자동 갱신을 일반 검사 명령에 포함하지 않습니다.

```powershell
pnpm.cmd --filter @workspace/flowra-web exec playwright test --project=visual --update-snapshots
```
