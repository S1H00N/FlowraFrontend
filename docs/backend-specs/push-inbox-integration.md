# 푸시 알림 수신함

## 구현된 동작

- 포그라운드 FCM 수신과 백그라운드 서비스 워커 수신 모두 제목·본문을 IndexedDB에 저장한다.
- 기록은 로그인 사용자별로 분리한다. 로그아웃 시 백그라운드 저장 대상 연결을 해제하며, 사용자 ID가 다른 푸시는 저장하지 않는다.
- 서비스 워커는 탭이 모두 닫힌 상태에서도 연결된 사용자의 알림을 저장한다. OS 알림 권한과 FCM 수신이 동작하는 환경이 전제다.
- 상단 알림함은 서버 `/notifications` 응답과 브라우저 수신 기록을 최신순으로 합쳐 표시한다. 서버 API가 실패해도 저장된 수신 기록을 보여준다.
- `notification_recipient_id`, `notification_id`, 서버 `data.message_id`와 FCM `messageId`로 동일 알림을 식별한다. 같은 제목·본문만으로 서로 다른 알림을 제거하지 않는다.
- 같은 FCM 메시지를 다시 받아도 기존 기록과 읽음 상태를 유지한다.
- 수신 직후, 사이트 복귀, 알림함 재열기, 다른 탭의 읽음 처리 시 갱신하며 1분 간격으로 서버 기록도 확인한다.
- 개별 읽음 및 모두 읽음을 지원한다. 먼저 로컬에서 읽은 기록이 나중에 서버에서 조회되면 읽음 상태를 서버에도 반영한다.
- 브라우저 전용 기록에는 `이 브라우저에서 수신`을 표시한다.

## 주요 파일

- `src/lib/pushInboxStore.js`: 앱과 서비스 워커가 공유하는 IndexedDB 저장소.
- `src/lib/pushInbox.ts`: 수신 기록 저장 알림, 서버 기록과의 병합.
- `src/hooks/useBrowserPush.ts`: 포그라운드 저장, 계정 연결, 갱신 이벤트.
- `src/hooks/useNotifications.ts`: 서버/로컬 조회, 중복 제거 및 읽음 처리.
- `public/firebase-messaging-sw.js`: 백그라운드 저장 후 열린 탭에 갱신 통지.
- `vite.config.ts`: 공유 저장소 스크립트를 서비스 워커에서도 읽을 수 있도록 제공.

## 범위와 제한

- 이 변경이 적용된 뒤 해당 브라우저에서 받은 알림부터 보관한다. 과거 푸시를 소급 수집하지 않는다.
- 브라우저 전용 기록은 다른 기기로 동기화되지 않으며 사이트 데이터 삭제 시 사라진다.
- 브라우저가 실제 수신하지 못한 알림 및 다른 기기와의 동기화는 서버 `/notifications` 기록에 의존한다.
- 서버 알림과 푸시 모두에 같은 식별자를 포함해야 확실히 중복을 제거할 수 있다. Firebase 콘솔에서 보낸 별도 테스트 메시지는 자체 FCM 메시지 ID로 보관된다.
- 서버 명세는 `docs/backend-specs/api_general.md`에 있지만 실제 푸시 발송 서버 구현은 이 저장소에 없다. 알림 저장 후 FCM을 발송하는 서버 동작의 구현 여부는 여기에서 확인할 수 없다.

## 검증

- `node --test tests/push-inbox.test.mjs`: 서비스 워커 저장/알림 표시 및 병합 규칙.
- `pnpm test:e2e -- tests/e2e/notifications.spec.ts --project=desktop --project=mobile`: 실제 IndexedDB를 사용하는 보관·읽음·중복 방지·계정 분리 및 서버 오류 상황.
- `pnpm typecheck`, `pnpm test:e2e:typecheck`.
