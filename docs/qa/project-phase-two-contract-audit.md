# 프로젝트 관리 2차 API 계약 재검토

> 이 문서는 2026-10-12 당시의 검색 기록입니다. 이후 제공된 [기업 프로젝트 공통 계약](../../devdocs/api-reference/company-projects.md)으로 생성·수정 DTO와 깊이·취소 규칙을 확인했습니다. 최신 구현과 검증은 [2026-10-13 변경 반영](api-contract-update.md)을 참고하세요.

검토일: 2026-10-12. Phase 및 Work Item 생성·수정 요청 DTO는 이번 재검색에서도 확보하지 못했다. 메서드와 경로가 존재한다는 사실만으로 요청 필드를 확정할 수 없으므로 해당 POST/PATCH 구현과 실제 쓰기 호출을 추가하지 않는다.

## 검색 범위와 원본 접근 결과

- 현재 저장소의 `docs`, `devdocs`, 웹 API 서비스·타입·트리·컴포넌트, 로컬 서버, OpenAPI 및 생성 타입을 확인했다. 숨김·무시 파일을 포함한 파일명 검색에서도 `company-projects.dto.ts`, 서버 프로젝트 service, 운영 Swagger/OpenAPI 원본은 발견되지 않았다. 의존성·빌드·브라우저 결과물은 운영 계약으로 취급하지 않았다.
- 문서의 원본 경로 `src/modules/company-projects/company-projects.dto.ts`는 실제로 존재하지 않는다. [문서 안내](../README.md#L23)와 [F01 자료 안내](../../devdocs/api-reference/feature-lifecycle.md#L3)도 서버 소스가 포함되지 않았음을 명시한다. F01 참고 자료의 기준일은 2026-09-16이다.
- [로컬 OpenAPI](../../lib/api-spec/openapi.yaml#L15)는 `/api/healthz`만 정의한다. `/api/v1` 운영 프로젝트 계약이 아니다.
- 상위 `Flowra-FrontKit` 폴더에는 현재 작업 폴더만 있었다. Downloads의 디렉터리 목록과 인접 `firstproject`의 관련 파일명을 확인했지만 백엔드 사본을 찾지 못했다. 사용자 홈 전체 목록은 파일 시스템 권한으로 읽을 수 없었으며 다른 위치에 원본이 없다고 단정하지 않는다.
- Git remote는 `S1H00N/FlowraFrontend`다. 연결된 GitHub의 설치 저장소 검색 `Flowra`, 소유자 `S1H00N`의 저장소 검색 `Flowra`, 코드 검색 `company-projects.dto.ts`를 수행했다. 검색 가능한 결과는 [FlowraFrontend](https://github.com/S1H00N/FlowraFrontend)와 현재 문서의 원본 경로 참조뿐이었다. 검색 결과의 문서 커밋은 `30c788f1481037eb54e50f63ab41748fac43d01f`다. 접근 가능한 백엔드 저장소 URL은 확보하지 못했다.

## 확인한 기존 일반 사용자 API

아래 경로는 모두 `/api/v1` 기준이다. 기업 관리자 API와 경로·토큰을 혼용하지 않는다.

| 기능 | 확인한 경로 | DTO 참조 위치 | 현재 확인 수준 |
| --- | --- | --- | --- |
| Phase 생성 | `POST /company-projects/:company_project_id/phases` | 서버 `company-projects.dto.ts:141`, `create_company_project_phase_body_schema` | 경로·201·`data.phase` 확인, body 미확인 |
| Phase 수정 | `PATCH /company-projects/:company_project_id/phases/:phase_id` | 서버 `company-projects.dto.ts:153`, `update_company_project_phase_body_schema` | 경로·200·`data.phase` 확인, body 미확인 |
| Work Item 생성 | `POST /company-projects/:company_project_id/work-items` | 서버 `company-projects.dto.ts:169`, `create_company_project_work_item_body_schema` | 경로·201·`data.work_item` 확인, body 미확인 |
| Work Item 수정 | `PATCH /company-projects/:company_project_id/work-items/:work_item_id` | 서버 `company-projects.dto.ts:191`, `update_company_project_work_item_body_schema` | 경로·200·`data.work_item` 확인, body 미확인 |
| Phase 취소 | `DELETE /company-projects/:company_project_id/phases/:phase_id` | ID params만 참조 | 취소 상태 변경·`data.phase` 확인 |
| Work Item 취소 | `DELETE /company-projects/:company_project_id/work-items/:work_item_id` | ID params만 참조 | 취소 상태 변경·`data.work_item` 확인 |

출처: [일반 사용자 라우트 126–131행](../../devdocs/api-reference/routes-general.md#L126), [F01 경로·응답 16–19행](../../devdocs/api-reference/feature-lifecycle.md#L16), [F01 취소 의미 28행](../../devdocs/api-reference/feature-lifecycle.md#L28). 표의 서버 줄 번호는 원본을 읽었다는 뜻이 아니라 문서에 기록된 참조다.

F01 [9행](../../devdocs/api-reference/feature-lifecycle.md#L9)은 활성 회사의 활성 구성원이면서 프로젝트의 활성 `owner` 또는 `manager`여야 관리할 수 있고, 권한 부족은 `403 PROJECT_MANAGEMENT_FORBIDDEN`이라고 명시한다. 취소는 물리 삭제가 아니다. 관련 하위 업무·집계에 미치는 구체적 효과는 확인하지 못했다.

## 계층·기간·진행률·상태

| 대상 | 확인한 내용 | 아직 확인하지 못한 내용 |
| --- | --- | --- |
| `parent_work_item_id` | 조회 객체에서 `number 또는 null`, 트리 상위 ID | 생성 필수 여부, 생략/null 차이, 부모 변경 시 하위 재계산, 프로젝트 범위 검증 |
| `company_project_phase_id` | 조회 객체에서 `number 또는 null`, Phase 그룹 ID | 생성 필수 여부, 부모 Phase 상속, 다른 Phase 부모 허용, Phase 변경/해제 정책 |
| 깊이 | 서버 오류 색인은 Work Item depth가 5를 넘으면 400이라고 기록 | 최상위 시작값, 프로젝트·Phase 포함 여부, create/update의 실제 계산식 |
| `phase_less` | Phase 추가 API 사용 불가 | Work Item 생성 시 Phase ID 생략/null 규칙 |
| 기간 | 조회의 계획 시작·종료일은 `YYYY-MM-DD 또는 null` | Phase/Work Item 수정 DTO, 날짜 삭제, 한쪽 날짜만 입력, 부모/프로젝트 기간 제약 |
| 상태·우선순위 | Work Item 조회 상태는 `todo/in_progress/done/postponed/cancelled`, 우선순위는 `low/medium/high/urgent` | 쓰기 DTO 허용 값·필수 여부·전이·완료/취소 후 수정·Phase 상태 enum |
| 진행률 | 조회에 `progress_percent`, `progress_override_percent`, rollup 진행률이 존재 | 자동 집계 계산식, 수동 override 허용 DTO·권한·범위·소수점·null 해제·상태 연동 |

읽기 필드 출처: [일반 API 명세 1763–1775행](../backend-specs/api_general.md#L1763). `phase_less` 출처: [1707행](../backend-specs/api_general.md#L1707). 읽기 타입은 쓰기 계약의 대체 근거가 아니다. 웹의 [Phase·Work Item 타입](../../artifacts/flowra-web/src/types/companyProject.ts#L82)은 응답 타입이며 생성·수정 DTO가 정의되어 있지 않다.

서버 오류 색인 [1457–1462행](../../devdocs/api-reference/error-index.md#L1457)은 `PROJECT_WORK_ITEM_DEPTH_EXCEEDED`, 메시지 `Work item depth cannot exceed 5`, 원본 service 468·504행을 가리킨다. [967–972행](../../devdocs/api-reference/error-index.md#L967)은 자기 자신 또는 자손을 부모로 이동할 수 없음을, [1284–1288행](../../devdocs/api-reference/error-index.md#L1284)은 부모 미존재 오류를 보여준다. 이 오류만으로 깊이 시작값과 생성 body를 유추하지 않는다.

현재 UI는 [projectWorkTree.ts](../../artifacts/flowra-web/src/lib/projectWorkTree.ts#L148)에서 프로젝트를 D1, 최상위 업무를 D2로 표시하고 Phase는 그룹으로 처리한다. 검증 가능한 부모 경로 길이로 UI 깊이를 계산하며 서버 `depth_level`에 임의로 1을 더하지 않는다. 부모 ID가 null/생략이면 화면상 최상위로 표시하고, 부모 ID가 있는데 아직 조회되지 않았거나 순환하면 불완전한 계층으로 처리해 UI 깊이를 확정하지 않는다.

제품 정책의 “프로젝트 포함 최대 5단계”와 서버 오류의 “Work Item depth 최대 5”는 같은 단위인지 아직 확인되지 않았다. 서버의 최상위가 1이고 Phase를 제외한다면 서버 5는 UI 6에 해당할 수 있지만, 이는 조건부 차이이며 서버 원본을 확인한 결론이 아니다. 최대 깊이에서의 생성 제한·부모 변경 제한을 구현하지 않고 기존 조회와 안내를 유지한다.

children 조회는 [일반 API 명세 1787–1793행](../backend-specs/api_general.md#L1787)의 `depth=1..5`, 기본 1을 사용한다. 조회 옵션 범위는 생성할 수 있는 절대 깊이를 확정하는 근거가 아니다. [본인 Assignment 수정 1804–1823행](../backend-specs/api_general.md#L1804)의 진행률·상태 규칙도 Work Item 수정 계약으로 전용하지 않는다.

## 백엔드에 필요한 정보 및 3차 인수인계

1. 배포 버전에 대응하는 `company-projects.dto.ts`의 네 create/update schema 원본과 의존 enum/refinement, 또는 동일 내용을 완전하게 담은 운영 명세를 제공해야 한다. 필수/선택, nullable, 길이/범위, PATCH 미전송과 null의 의미가 필요하다.
2. 부모·Phase 연결과 깊이를 계산하는 service 원본 또는 동등한 계약이 필요하다. `phased`/`phase_less` 각각의 최상위·하위 요청, 깊이 경계, 부모 없는 업무, 부모/Phase 변경 사례를 포함해야 한다.
3. 계획 날짜 제약, 상태 전이, 자동 진행률 집계와 override 설정·해제 규칙을 확정해야 한다. 취소 후 하위 업무·summary·rollup 변경 범위도 필요하다.
4. `summary`, `detail_policy`, children 응답의 정식 스키마와 실제 서버 검증용 계정·접속 정보가 필요하다. 이번 계약 감사에서는 실제 서버 요청이나 쓰기를 실행하지 않았다.
5. 3차 담당자 배정은 Work Item 생성·수정 계약 확보와 별도다. F01에 존재하는 Assignment 경로만으로 요청 필드를 추측하지 말고 assignment create/update DTO 원본, 부서 연결·배정 권한·정보 노출·중복 배정 정책을 먼저 확보해야 한다. 기존 응답의 배정 정보 조회만 유지하며 이번 작업에서 담당자 배정·간트 구현은 하지 않는다.

이번 감사는 생성·수정 연동 완료를 의미하지 않는다. 계약을 확보할 때까지 기존 조회·취소·UI 오류와 테스트 보완만 진행한다.
