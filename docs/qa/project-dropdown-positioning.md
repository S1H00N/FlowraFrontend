# 프로젝트 모달 드롭다운 위치 개선

## 실제 원인

기존 `CustomSelect`의 필드 너비 배치(`matchTriggerWidth`)는 입력창 위치와 **브라우저 화면**의 상하 공간만 비교했다. 메뉴는 기존 Portal을 통해 모달의 스크롤 폼 밖에 표시되므로 overflow에 의해 잘리지는 않았지만, 고정 헤더·하단 버튼 영역을 공간 계산에서 제외하지 않았다. 특히 일반적인 900px/844px 높이에서는 화면 아래 공간이 충분한 것으로 계산되어 운영 방식 메뉴가 폼 아래로 열리고 하단 버튼 위까지 내려왔다. 이전 500px 높이 테스트는 화면 안에 표시되는지만 확인해 일반 높이의 하단 버튼 겹침을 검출하지 못했다.

## 수정 방식

- 공통 `CustomSelect`에 선택적 `collisionBoundaryRef`를 추가했다. 프로젝트 폼의 세 드롭다운에만 기존 `[data-project-fields]` 폼을 경계로 연결한다.
- 화면과 폼의 실제 표시 영역(`getBoundingClientRect`, `clientTop`, `clientLeft`, `clientHeight`, `clientWidth`)의 교집합을 사용한다. 모달 제목·하단 버튼 영역과 스크롤바 영역은 경계에 포함하지 않는다.
- 실제 메뉴 내용 높이와 위/아래 가용 공간을 비교한다. 아래에 충분한 공간이 있으면 아래로, 부족하면 공간이 더 큰 위쪽으로 연다. 두 방향 모두 부족하면 더 넓은 쪽에 높이를 제한하고 기존 `overflow-y-auto`로 메뉴 내부 스크롤을 제공한다.
- 입력창과 메뉴의 좌우 정렬·너비와 기존 7px 연결 간격을 유지한다. 일부 가려진 입력창은 보이는 위치를 기준으로 배치하고, 입력창이 완전히 스크롤 영역 밖으로 사라지면 메뉴를 닫는다. 작성한 폼 값과 선택값은 유지한다.
- 내용 높이 계산에는 메뉴 테두리 높이를 포함한다. 가용 공간이 메뉴의 padding·border조차 담을 수 없을 만큼 작으면 표시를 종료해 실제 박스가 경계를 넘지 않게 한다.
- 기존 resize/scroll 위치 갱신을 유지하며 `ResizeObserver`로 메뉴·입력창·폼 경계의 크기 변화를 관찰한다. 스크롤과 창 크기 변경, 모달 내부 영역 높이 변경 후 위치를 다시 계산한다.
- 기존 `FloatingPanelPortalProvider`를 그대로 사용해 메뉴가 모달 포커스 범위 안에 있고 스크롤 폼 밖에 표시되도록 유지한다. Portal 구현, z-index, 전역 overflow, 메뉴 스타일·간격·체크·색상, 모달 크기 및 버튼 디자인은 변경하지 않았다. 라이브러리도 추가하지 않았다.

## 수정 파일

| 파일                                                                 | 이번 변경                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `artifacts/flowra-web/src/components/ui/CustomSelect.tsx`            | 선택적 충돌 경계, 경계 내 방향/높이 계산, 가려진 입력창 처리 및 경계 크기 관찰        |
| `artifacts/flowra-web/src/components/projects/ProjectFormDialog.tsx` | 기존 폼에 ref 연결, 공개 범위·생성 상태/수정 상태·운영 방식 드롭다운에 동일 경계 전달 |
| `artifacts/flowra-web/tests/e2e/projects.spec.ts`                    | 일반 크기 footer 겹침, 낮은 화면·내부 스크롤·리사이즈·수정 모달·목록 필터 회귀 검증   |
| `docs/qa/project-dropdown-positioning.md`                            | 원인·구현·검증 기록                                                                   |

## 공통 컴포넌트 영향

선택적 경계를 사용하지 않는 목록의 회사·상태 필터와 홈·할 일·캘린더의 기존 `CustomSelect`는 기존 배치 경로를 유지한다. 기존 옵션 선택, 체크와 강조, 외부 클릭, Escape, 방향키/Enter, 포커스 복원 로직은 수정하지 않았다. 생성·수정 요청, 폼 값과 유효성 검사, 날짜 선택 기능도 수정하지 않았다.

## 검증 범위

- 기본 desktop 1280×900 / mobile 390×844: 생성 모달 세 메뉴가 폼 경계 안에 있고 고정 버튼을 가리지 않는지, 운영 방식이 위로 열리는지, 너비·좌우 정렬·간격이 유지되는지 확인한다.
- 높이 340px: 위아래 공간이 부족할 때 메뉴 높이 제한·내부 스크롤, 방향키로 아래 옵션 포커스, 폼 스크롤 중 위치 유지, 창 크기 변경 후 재계산을 확인한다.
- 열린 메뉴의 입력창을 폼 스크롤로 완전히 가리면 메뉴가 닫히고 프로젝트명과 운영 방식 선택값이 유지되는지 확인한다.
- 공개 범위·생성 상태·운영 방식의 선택/닫기, 외부 클릭, Arrow/Enter/Escape, 포커스 복원과 작성값 보존을 확인한다.
- 수정 모달의 공개 범위·상태 메뉴와 기존 목록 회사·상태 필터를 확인한다.
- 기존 프로젝트 날짜·생성/수정·권한·오류 시나리오와 라이트·다크 화면을 재검증한다.
- 홈 재계획의 날짜·소요시간 드롭다운, 할 일 패널의 우선순위, 캘린더 일정 생성/수정을 desktop/mobile에서 확인한다.

브라우저 테스트는 가상 API를 사용하며 실제 운영 데이터를 변경하지 않는다.

## 검증 결과

- `pnpm.cmd run typecheck`: 라이브러리·웹·기존 API 서버 전체 타입 검사 통과.
- 최종 변경 후 `pnpm.cmd --filter @workspace/flowra-web run typecheck` 및 `run test:e2e:typecheck`: 통과.
- `pnpm.cmd --filter @workspace/flowra-web run build`: production 빌드 통과. 앞서 확인한 Windows 샌드박스의 esbuild 상위 경로 탐색 제한을 피해서 승인된 일반 권한으로 실행했다.
- 추가한 드롭다운 집중 검증: desktop/mobile 6개 모두 통과.
- 최종 Playwright 실행: **54개 통과, 실패 0개**. 프로젝트 전체 48개와 홈·할 일·캘린더의 기존 공통 컴포넌트 검증 6개를 포함한다.
- desktop/mobile 라이트·다크 화면의 메뉴 캡처에서 위쪽 배치·입력창 연결·하단 버튼 표시를 확인했다. 스크린샷 12장과 실행 결과는 [최종 브라우저 보고서](../../artifacts/flowra-web/playwright-report-project-dropdown-final/index.html)에 첨부되어 있다.
- 수정한 4개 파일의 UTF-8 무BOM 인코딩과 한글, Prettier 및 diff 공백 검사를 통과했다.

최종 브라우저 실행 명령:

```powershell
$env:QA_RESULTS_DIR = 'test-results-project-dropdown-final'
$env:QA_REPORT_DIR = 'playwright-report-project-dropdown-final'
pnpm.cmd --filter @workspace/flowra-web run test:e2e projects.spec.ts home-reschedule.spec.ts tasks-design.spec.ts flows.spec.ts --project=desktop --project=mobile --grep '프로젝트 기본 관리|today and custom date|할 일 패널의 날짜·시간·우선순위를 선택하고 저장한다|일정을 생성하고 제목을 수정한'
```

검증 범위에서 미해결 문제는 발견되지 않았다. 이번 변경은 드롭다운의 위치·방향·스크롤 처리에 한정하며 새 프로젝트 관리 기능은 추가하지 않았다.
