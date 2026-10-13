# 기업 프로젝트 API 공통 계약

현행 계약 확인: 2026-10-12. [API 문서 입구](../../docs/README.md) · [일반 API](../../docs/backend-specs/api_general.md) · 기업 관리자 API (백엔드 원본: `docs/api_company_admin.md`) · 시스템 관리자 API (백엔드 원본: `docs/api_admin.md`).

일반 사용자와 기업 관리자 프로젝트 API가 재사용하는 DTO·서비스의 필수/nullable/상태/계층/부분조회 규칙이다. 미지원 기능은 구현된 계약과 구분한다. 2026-10-12 결함 수정은 입력 검증·일정 원자성·프로젝트 잠금과 DB migration을 포함한다. 실제 PostgreSQL 임시 스키마 회귀로 저장/롤백/동시성을 확인했으며 운영 사용자 데이터의 전체 HTTP 시나리오 실행 보고서는 아니다. 조직 full-upsert는 별도의 조직 계약 (백엔드 원본: `docs/api_org.md`)을 따른다.

## 1. 경로·권한·공통 형식

### 경로와 권한

| 호출 주체 | 기본 경로 | 편집 조건 |
| --- | --- | --- |
| 일반 사용자 | `/api/v1/company-projects` | 활성 회사의 활성 구성원 + 활성 프로젝트 멤버 `owner` 또는 `manager` |
| 기업 관리자 | `/company-admin/api/v1/projects` | 기업 관리자 인증 + `company.projects.write` + 관련 부서 전체가 관리자 scope에 포함 |
| 시스템 관리자 | `/admin/api/v1/company-projects` | `companies.read`로 조회. 이 경로에 Phase/업무/배정 편집 API는 없음 |

일반 사용자도 프로젝트 범위 안에서는 편집할 수 있다. 기업 관리자 토큰이나 회사 관리자 자격이 필수인 기능이 아니다. 프로젝트 생성자라는 사실만으로 편집권이 보장되지는 않으며 현재 활성 owner/manager 멤버십을 확인한다. 프로젝트 멤버 추가·역할 변경·제거는 일반 사용자 API에서 owner만 가능하다.

기업 관리자 scope 검사는 수정 대상 업무 하나뿐 아니라 프로젝트 원본 부서, 기존 전체 업무의 책임 부서, 배정 부서, 담당자·배정자의 현재 소속 부서를 검사한다. 책임 부서 없는 업무 등이 있으면 부서 범위가 제한된 관리자의 편집이 거절될 수 있다.

조회권은 편집권과 다르다. 일반 상세/children 조회는 회사 구성원과 프로젝트 visibility를 검사한다. 상세 응답에 `can_manage`나 현재 사용자의 프로젝트 role 필드는 없다.

근거: 라우트 등록 (백엔드 원본: `src/modules/index.ts`), 사용자 관리 라우트 (백엔드 원본: `src/modules/company-projects/project-management.controller.ts`), 관리 권한 검사 (백엔드 원본: `src/modules/company-projects/project-management-access.ts`), 부서 쓰기 범위 (백엔드 원본: `src/modules/company-projects/company-project-write-access.ts`), 기업 관리자 라우트 (백엔드 원본: `src/company-admin/modules/projects/projects.controller.ts`).

### 공통 요청·응답

- 아래 경로에서 `:p`는 `company_project_id`, `:w`는 `work_item_id`다. 경로 ID는 숫자로 구성된 문자열이다. 프로젝트 DTO 본문의 ID는 양의 정수이고 숫자 문자열도 coercion한다. 개인 Task의 `schedule_id`는 숫자 문자열 계약이므로 구별해야 한다.
- 성공: `{ "success": true, "message": "...", "data": { ... } }`. 생성은 201, 수정/취소/삭제는 200이다.
- 오류: `{ "success": false, "message": "...", "error": { "code": "...", "details": { ... } } }`. Zod 검증은 `400 VALIDATION_ERROR`, 상세는 `details.issues[]`의 `path`와 `message`다.
- 프로젝트 DTO의 알 수 없는 필드는 제거된다. PATCH는 제거 후 허용 필드가 하나 이상 있어야 한다. 허용 필드+unknown 요청은 성공하면서 unknown만 무시할 수 있다.
- PATCH에서 생략한 필드는 유지한다. `null`은 nullable 필드에만 명시적으로 보내되, 담당자 `department_id`의 fallback 같은 예외를 아래에서 확인해야 한다.
- 숫자는 JSON number와 유효한 숫자 문자열을 받는다. non-nullable 필드의 null/boolean/빈 문자열/배열/객체는400 VALIDATION_ERROR이며0으로 변환하지 않는다. nullable 필드의 명시 null은 유지한다.
- 날짜 입력은 `YYYY-MM-DD`. 프로젝트 업무/배정의 datetime 입력은 현재 UTC `Z` 형식만 허용하며 `+09:00`은 거절한다. 개인 일정·Task와 업무 reminder는 offset 형식을 허용한다.
- Date 응답은 `2026-10-12T00:00:00.000Z` 같은 ISO 문자열이다. DB DATE 필드도 동일하다. BigInt ID는 JSON number로 직렬화한다.

근거: DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`), 요청 검증 (백엔드 원본: `src/common/http/validate-request.ts`), 성공 응답 (백엔드 원본: `src/common/http/response.ts`), 오류 응답 (백엔드 원본: `src/common/http/error-middleware.ts`), 직렬화 (백엔드 원본: `src/common/utils/serialize.ts`).

## 2. 프로젝트 생성·수정

일반 사용자 POST `/api/v1/company-projects`, 기업 관리자 POST `/company-admin/api/v1/projects`는 아래 계약을 사용한다. 상세 조건과 사용자 생성 예시는 [일반 명세](../../docs/backend-specs/api_general.md)에 있다.

| 필드 | 일반 사용자 POST | 기업 관리자 POST | 규칙 |
| --- | --- | --- | --- |
| `name` | 필수 | 필수 | trim 후1~150자 |
| `description` | 선택 | 선택 | trim 최대5000자 또는 null |
| `company_id` | 선택 | DTO에서 선택 | 양의 정수. 일반 사용자는 소속 회사 선택, 기업 관리자는 토큰의 회사를 사용 |
| `status` | 선택 | 선택 | 사용자 draft/active, 관리자 draft/active/paused/completed/cancelled/archived. 기본 draft |
| `phase_mode` | 선택 | 선택 | phased/phase_less, 기본 phased |
| `visibility` | 선택 | 선택 | 사용자 department_tree/members, 관리자 company/department_tree/members. 기본 department_tree |
| `origin_department_id` | 선택 | 선택 | 양의 정수 또는 null. 사용자는 생략/null이면 본인 부서, 다른 부서 지정403 |
| `planned_start_date`, `planned_end_date`, `actual_start_date`, `actual_end_date` | 선택 | 선택 | YYYY-MM-DD 또는 null |
| `source_type` | 미지원 | 선택 | manual/api/preset, 기본 manual |
| `external_project_id` | 미지원 | 선택 | trim1~255자 또는 null |
| `sync_source` | 미지원 | 선택 | trim1~50자 또는 null |

사용자 생성은 활성 소속 부서와 project_create_policy를 검사하고 project+owner 멤버십+생성 audit를 한 transaction에 저장한다. company_id 생략 시 활성 소속 중 최초 생성 멤버십을 선택한다. 기업 관리자 생성은 일반 사용자 owner 멤버십을 자동 만들지 않는다. 생성 시 계획/실적 종료<시작은400이다.

PATCH `/api/v1/company-projects/:p` 또는 `/company-admin/api/v1/projects/:p`는 name, description, status(6종), visibility(3종), origin_department_id, 계획/실적 날짜4개, completed_at만 받으며 한 필드 이상 필요하다. completed_at은 UTC Z 또는 null. phase_mode/source_type/external_project_id/sync_source/company_id/progress_percent는 PATCH에서 제거된다. 상태와 완료시각은 독립적이며 자동 취소/완료 cascade가 없다. 프로젝트 PATCH는 project 행 잠금 후 최신 날짜와 입력을 병합하여 계획/실적 역전을400 INVALID_PROJECT_DATE_RANGE/INVALID_PROJECT_ACTUAL_DATE_RANGE로 거절한다. 제한된 기업 관리자는 origin_department_id:null을 지정할 수 없다.

근거: 프로젝트 DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`), 프로젝트 서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`).

## 3. Phase 생성·수정·취소

```text
POST   /api/v1/company-projects/:p/phases
PATCH  /api/v1/company-projects/:p/phases/:phase_id
DELETE /api/v1/company-projects/:p/phases/:phase_id
```

| 필드 | POST | PATCH | 허용 값·기본 동작 |
| --- | --- | --- | --- |
| `name` | 필수 | 선택 | trim 후 1~150자, null 불가 |
| `description` | 선택 | 선택 | 최대 5000자 또는 null. 빈 문자열은 null 저장 |
| `status` | 선택 | 선택 | `todo`, `in_progress`, `done`, `postponed`, `cancelled`. 생성 기본 todo |
| `planned_start_date`, `planned_end_date` | 선택 | 선택 | 날짜 또는 null |
| `actual_start_date`, `actual_end_date` | 선택 | 선택 | 날짜 또는 null |
| `sort_order` | 선택 | 선택 | 정수, 음수도 허용. 생성 기본 0 |
| `external_phase_id` | 선택 | 선택 | trim 후 1~255자 또는 null. 프로젝트 내부 unique |

최소 생성 요청은 `{ "name": "기획" }`, 이름 수정은 `{ "name": "요구사항 정의" }`다. 응답은 `data.phase`에 Phase DB 행 전체를 반환한다. 모델의 모든 응답 필드는 CompanyProjectPhase (백엔드 원본: `prisma/schema.prisma`) (`schema.prisma:1173`)에서 확인할 수 있다. `progress_percent`는 응답에 있지만 생성/수정 DTO에는 없다.

`phase_less` 프로젝트는 Phase 생성이 `400 PROJECT_PHASELESS`로 거절된다. 상태 전이표는 없으며 `done` 변경으로 업무나 진행률이 자동 변경되지 않는다. DELETE는 Phase 자체를 `cancelled`로 변경하고 업무·배정·알림에는 영향을 주지 않는다.

PATCH는 입력과 기존 날짜를 합쳐 종료일≥시작일을 검사한다. 같은 날은 허용한다. 계획/실적 역전은 `400 INVALID_PROJECT_PHASE_DATE_RANGE` / `INVALID_PROJECT_PHASE_ACTUAL_DATE_RANGE`. 생성도 계획/실적 기간을 같은400 코드로 검증한다. 실제 달력 유효성은 DTO와 공통 날짜 parser로 확인한다.

근거: `company-projects.dto.ts:141,153`, `company-projects.service.ts:1458,1499,1583`의 DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`)와 서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`).

## 4. Work Item 생성·수정·계층

```text
POST   /api/v1/company-projects/:p/work-items
PATCH  /api/v1/company-projects/:p/work-items/:w
DELETE /api/v1/company-projects/:p/work-items/:w
```

| 필드 | POST | PATCH | 허용 값·기본 동작 |
| --- | --- | --- | --- |
| `title` | 필수 | 선택 | trim 후 1~200자, null 불가 |
| `company_project_phase_id` | 선택 | 선택 | 양의 정수 또는 null. 기본 null |
| `parent_work_item_id` | 선택 | 선택 | 양의 정수 또는 null. 기본 null |
| `description` | 선택 | 선택 | 최대 5000자 또는 null. 빈 문자열→null |
| `status` | 선택 | 선택 | `todo`, `in_progress`, `done`, `postponed`, `cancelled`. 기본 todo |
| `priority` | 선택 | 선택 | `low`, `medium`, `high`, `urgent`. 기본 medium |
| `planned_start_date`, `planned_end_date` | 선택 | 선택 | 날짜 또는 null |
| `actual_start_date`, `actual_end_date` | 선택 | 선택 | 날짜 또는 null |
| `planned_minutes` | 선택 | 선택 | 정수≥0 또는 null |
| `due_datetime` | 선택 | 선택 | UTC Z datetime 또는 null |
| `progress_percent` | 선택 | 선택 | 정수0~100, 생성 기본0. PATCH는 수동 override도 설정 |
| `progress_weight` | 선택 | 선택 | 정수≥1, 기본 1 |
| `is_milestone` | 선택 | 선택 | JSON boolean, 기본 false |
| `sort_order` | 선택 | 선택 | 정수, 기본 0. 음수 허용 |
| `wbs_code` | 선택 | 선택 | trim 후 1~100자 또는 null |
| `external_work_item_id` | 선택 | 미지원 | trim 후 1~255자 또는 null. 프로젝트 내부 unique |
| `department_ids` | 선택 | 선택 | 양의 정수 배열. POST 최대50/PATCH 최대100 |
| `completed_at` | 미지원 | 선택 | UTC Z datetime 또는 null |
| `progress_override_percent` | 미지원 | 선택 | 정수0~100 또는 null. null은 override 해제 |

`depth_level`, `company_schedule_id`, `completed_by_company_member_id`, `source_type`, `progress_source`는 입력할 수 없다. 응답은 `data.work_item`에 DB 행 전체를 반환하며 필드는 `schema.prisma:1195`의 CompanyProjectWorkItem (백엔드 원본: `prisma/schema.prisma`)와 같다.

### 바로 사용할 요청 예시

```json
{ "title": "요구사항 정리" }
```

```json
{
  "title": "인터뷰 진행",
  "parent_work_item_id": 101,
  "company_project_phase_id": 12,
  "priority": "high",
  "department_ids": [3]
}
```

```json
{ "parent_work_item_id": null, "company_project_phase_id": null }
```

마지막 예시는 PATCH로 업무를 루트로 옮기면서 해당 업무의 Phase 연결을 해제한다.

### 계층·Phase 연결 규칙

- 루트 depth=1, 최대 depth=5. 부모는 같은 프로젝트여야 한다. 없는/다른 프로젝트 부모는 `404 PARENT_WORK_ITEM_NOT_FOUND`, 6단계는 `400 PROJECT_WORK_ITEM_DEPTH_EXCEEDED`.
- `phased`에서도 Phase 연결은 선택이다. Phase가 전혀 없는 프로젝트에 업무를 생성할 수 있다.
- `phase_less`는 업무 생성이 가능하지만 non-null Phase 연결은 존재 여부와 무관하게 `400 PROJECT_PHASELESS`로 거절한다. `phased` 프로젝트에서 지정한 Phase가 해당 프로젝트에 없으면 `404 PROJECT_PHASE_NOT_FOUND`.
- 부모 Phase를 자식에게 자동 상속하지 않는다. 부모·자식이 다른 Phase여도 현재 허용하며 부모/Phase가 cancelled인지 검사하지 않는다.
- PATCH `parent_work_item_id:null`은 루트 이동. 자기 자신이나 자손 아래로 이동하면 `400 INVALID_PROJECT_WORK_ITEM_PARENT`.
- 부모 이동은 subtree 전체 깊이를 재계산한다. 자손 하나라도 5단계를 넘으면 transaction 전체가 실패한다. 기존·신규 부모 rollup도 갱신한다.
- Phase 변경은 해당 업무에만 적용하며 자손 Phase를 변경하지 않는다.
- 업무 생성 시 `department_ids` 생략 또는 `[]`은 빈 책임 부서 목록이다. 프로젝트 origin 부서를 자동 상속하지 않는다. 부서 scope가 제한된 관리자는 빈 목록이 거절된다.

### 상태·완료·취소 효과

| 요청 | 실제 효과 |
| --- | --- |
| PATCH `status:"done"` | 해당 업무 상태 변경. 진행률100·완료시각·자식/담당자 완료 자동 반영 없음 |
| PATCH `status:"todo"` | 상태 변경. 기존 completed_at을 자동으로 지우지 않음 |
| PATCH `completed_at` | 요청 시각 저장/제거. 업무 status와 독립적 |
| PATCH `status:"cancelled"` | 해당 업무 상태와 rollup 변경. 자손·배정·예약 알림·의존성 정리 없음 |
| DELETE 업무 | 자신+모든 자손 cancelled, 비취소 배정 cancelled, scheduled 업무 reminder cancelled, 관련 의존성 물리 삭제 |
| DELETE Phase | Phase 자체만 cancelled. 소속 업무에는 영향 없음 |

업무 DELETE도 물리 삭제가 아니며 완료 업무까지 cancelled가 될 수 있다. 기존 완료일·진행률이나 연결 일정은 삭제하지 않는다. 프로젝트·Phase·업무가 이미 완료/취소/보관 상태라는 이유로 관리 변경을 차단하는 별도 검사도 없다.

PATCH `progress_override_percent:null`은 override를 해제하고 배정 기반 진행률 재계산을 시도한다. 유효 배정이 없으면 재계산을 생략하여 기존 업무 진행률이 남는다. 숫자 override/progress_percent PATCH는 progress_source=manual_override로 저장한다. migration이 이 값을 허용하며 role·baseline·reminder 저장 값도 아래 계약을 따른다.

PATCH의 계획/실적 기간 역전은 `400 INVALID_WORK_ITEM_DATE_RANGE` / `INVALID_WORK_ITEM_ACTUAL_DATE_RANGE`. 생성도 같은 계획/실적 기간 검증을 적용한다. 동일일은 허용하고 존재하지 않는 달력 날짜는400이다.

근거: `company-projects.dto.ts:169,191`, `company-projects.service.ts:448,491,1632,1739,1950`의 DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`)와 서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`).

## 5. 담당자 배정·변경·해제

```text
POST  /api/v1/company-projects/:p/work-items/:w/assignments
PATCH /api/v1/company-projects/:p/work-items/:w/assignments/:assignment_id
PATCH /api/v1/company-projects/work-assignments/:assignment_id
```

앞의 두 경로는 owner/manager 관리 API다. 마지막 경로는 실제 담당자 본인의 상태 변경 API이며 담당자 교체에 사용할 수 없다.

| 필드 | 관리 POST | 관리 PATCH | 규칙 |
| --- | --- | --- | --- |
| `assignee_company_member_id` | 필수 | 선택 | 양의 정수. null 불가 |
| `department_id` | 선택 | 선택 | 양의 정수 또는 null. null은 담당자 부서 fallback |
| `assigned_by_company_member_id` | 선택 | 선택 | 양의 정수 또는 null. 생성 생략 시 호출자 대신 null 저장 |
| `role` | 선택 | 선택 | trim 후 owner/assignee/reviewer/watcher, 기본 assignee. 그 외 role은400 |
| `allocation_percent` | 선택 | 선택 | 정수1~100 또는 null. 0은 DTO에서 거절 |
| `planned_minutes` | 선택 | 선택 | 정수≥0 또는 null |
| `status` | 선택 | 선택 | 공통 업무 상태5종. POST 기본 todo |
| `progress_percent` | 선택 | 선택 | 정수0~100. POST 기본0 |
| `starts_at`, `ends_at` | 선택 | 선택 | UTC Z datetime 또는 null |
| `completed_at` | 미지원 | 선택 | UTC Z datetime 또는 null |
| `external_assignment_id` | 선택 | 미지원 | trim 후1~255자 또는 null |

본인 PATCH는 `status`, `progress_percent`, `completed_at`만 허용한다. 해당 회사의 활성 구성원 본인이어야 하며 별도의 프로젝트 멤버 등록은 검사하지 않는다.

```json
{ "assignee_company_member_id": 20 }
```

```json
{ "assignee_company_member_id": 21, "department_id": 4 }
```

```json
{ "status": "cancelled" }
```

위 예시는 각각 생성/교체/배정 취소다. 배정 DELETE와 `assignee_company_member_id:null` 해제는 없다. 취소는 ID·기록을 보존한다.

### 처리 규칙

- 담당자·배정자는 해당 회사의 활성 구성원이면 된다. 프로젝트 멤버이거나 사용자 계정과 연결되어 있을 필요는 없다. 부서는 해당 회사의 활성 부서여야 한다.
- 생성에서 department 생략/null은 담당자 소속 부서로 대체한다. PATCH `department_id:null`도 담당자 소속 부서로 대체하며 부서 제거를 뜻하지 않는다.
- 담당자 ID만 교체하면 기존 배정 부서는 유지한다. 부서도 바꾸려면 함께 보내야 한다. 담당자 교체가 상태·진행률·일정·완료 이력을 자동 초기화하지 않는다.
- PATCH에서 status:done을 보내고 completed_at을 생략하면 이번 요청 시각으로 설정한다. status/completed_at을 모두 생략한 진행률·담당자 수정은 기존 완료시각을 유지한다. done 상태에서 completed_at:null은 시각을 지운다. done 이외 상태의 non-null 완료시각은 `400 INVALID_PROJECT_ASSIGNMENT_STATE`.
- status와 진행률은 독립적이다. done 배정의 진행률이0일 수 있다. POST done 생성은 completed_at 자동 설정이 없다.
- 종료시각<시작시각은 `400 INVALID_ASSIGNMENT_DATE_RANGE`. 같은 시각은 허용한다.
- 생성·수정은 assignment/audit/업무 진행률/상위 rollup을 transaction 안에서 반영한다. 비취소 배정 진행률을 `planned_minutes>0`, 그 다음 `allocation_percent>0`, 그 다음1 순의 가중치로 평균한다.
- 마지막 유효 배정까지 취소하면 배정0개 처리에서 조기 반환하므로 기존 업무 진행률은 유지된다. 새 담당자 reminder를 자동 생성하지 않으며, 기존 담당자의 reminder는 발송 시 현재 배정자 불일치로 중단된다.

근거: `company-projects.dto.ts:222,252,262`, `company-projects.service.ts:46,675,2123,2225,3315`의 DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`)·서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`), 업무 알림 발송 검사 (백엔드 원본: `src/modules/company-projects/company-project-reminder-delivery.ts`).

## 6. 담당 부서·의존성 편집

### 책임 부서 목록 전체 교체

```text
PUT /api/v1/company-projects/:p/work-items/:w/departments
```

본문은 `{ "department_ids": [3, 4] }`. 배열 필수/최대100, 각 ID 양의 정수, null 불가다. 서비스가 중복 ID를 제거하고 `responsible` 행 전체를 transaction에서 교체한다. `collaborator`/`viewer` 행은 보존하며 배열 순서는 저장 계약이 아니다. 응답은 `data.departments`.

`[]`은 일반 owner/manager 및 전사 기업 관리자에게 책임 부서 전체 해제다. 제한된 부서 관리자는 `403 COMPANY_ADMIN_SCOPE_FORBIDDEN`. 업무 PATCH의 `department_ids`도 같은 목적에 사용할 수 있다. 기존 assignment.department_id는 함께 변경되지 않는다. `responsible_company_member_id`나 부서 role을 직접 변경하는 DTO는 없다.

### 의존성 생성·삭제

```text
POST   /api/v1/company-projects/:p/dependencies
DELETE /api/v1/company-projects/:p/dependencies/:dependency_id
```

| 필드 | 규칙 |
| --- | --- |
| `predecessor_work_item_id` | 필수, 양의 정수 |
| `successor_work_item_id` | 필수, 양의 정수 |
| `dependency_type` | finish_to_start/start_to_start/finish_to_finish/start_to_finish, 기본 finish_to_start |
| `lag_days` | 정수 -3650~3650, 기본0 |
| `external_dependency_id` | 선택, trim 후1~255자 또는 null |

두 업무는 같은 프로젝트여야 한다. 자기 연결은 `400 INVALID_PROJECT_DEPENDENCY`, 동일 project+선행+후행+type 중복은 `409 PROJECT_DEPENDENCY_EXISTS`, 순환은 `400 PROJECT_DEPENDENCY_CYCLE`, 없는 의존성 삭제는 `404 PROJECT_DEPENDENCY_NOT_FOUND`. POST 응답은 `data.dependency`, DELETE 응답은 `data:{}`다.

직접 PATCH는 없어서 lag/type 변경은 삭제 후 재생성해야 한다. 원자적 교체 API도 없다. 의존성 저장은 날짜 자동 이동, lag 날짜 적용, 후행 업무 시작 차단을 수행하지 않는다.

동일 project 행 NO KEY UPDATE 잠금 안에서 최신 업무/의존성을 읽고 순환·중복 검사와 저장을 한 transaction으로 처리한다. 반대 방향 동시 추가는 한쪽만 성공하고 다른 쪽은400 PROJECT_DEPENDENCY_CYCLE, 동일 edge는409 PROJECT_DEPENDENCY_EXISTS다. 부모 이동·생성·subtree 취소·org import도 같은 project 잠금과 함께 처리하여 graph 검사 경쟁을 방지한다.

근거: `company-projects.dto.ts:218,236`, `company-projects.service.ts:2046,2380,2483`의 DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`)·서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`), SQL unique/제약 (백엔드 원본: `prisma/migrations/20260619090000_company_projects/migration.sql`).

## 7. 상세·summary·부분 조회의 정확한 계약

### 상세 조회

```text
GET /api/v1/company-projects/:p
```

`data`의 실제 구조는 다음과 같다. 아래 TypeScript의 각 row type은 Prisma 모델 전체 필드에 공통 직렬화를 적용한 형태다.

```ts
type ProjectDetailData = {
  project: CompanyProjectRow;
  phases: CompanyProjectPhaseRow[];
  work_items: CompanyProjectWorkItemRow[];
  departments: CompanyProjectWorkDepartmentRow[];
  assignments: CompanyProjectWorkAssignmentRow[];
  dependencies: CompanyProjectWorkDependencyRow[];
  summary: {
    phase_count: number;
    work_item_count: number;
    assignment_count: number;
  };
  detail_policy: {
    scale: "small" | "medium" | "large";
    mode: "full" | "summary";
    max_depth: 2 | 5;
    full_load_allowed: boolean;
    returned_work_item_count: number;
  };
};
```

- summary는 프로젝트 전체 건수이며 모든 depth와 cancelled 행을 포함한다. assignment_count는 고유 담당자 수가 아니라 배정 행 수다. done_count, delayed_count, completion_rate, 집계 progress는 없다.
- `work_items`는 트리 중첩 배열이 아니라 평면 배열이다. `parent_work_item_id`로 트리를 구성한다. 상세 work_items에는 `rollup`을 붙이지 않는다.
- `scale`: 전체 업무>1500 또는 프로젝트 계획기간>365일이면 large, 그 외 업무>300이면 medium, 나머지 small. 300/1500건 및 정확히365일은 상위 분류가 아니다.
- `mode`: 전체 업무>500일 때 summary(depth≤2), 그 외 full(depth≤5). scale과 mode 기준은 다르므로 장기 프로젝트도 업무가 적으면 full일 수 있다.
- `returned_work_item_count`는 실제 반환된 work_items 길이. `full_load_allowed`는 상세 mode가 full인지 표시한다. 상세 GET에는 mode/max_depth override query가 없다.
- phases는 전체, departments/assignments는 반환 업무에 연결된 행만, dependencies는 선행·후행이 모두 반환 업무에 포함된 행만 반환한다. 부분 응답을 프로젝트 전체 관계 목록으로 취급하면 안 된다.
- project.progress_percent와 phase.progress_percent는 DB 필드지만 현재 관리/배정/rollup 흐름에서 업무를 통해 자동 집계되는 값이 아니다. 이 값을 전체 업무 완료율로 해석할 근거가 없다.

일반 사용자는 본인 배정 또는 프로젝트 생성자/활성 owner·manager일 때 담당자 식별 정보를 볼 수 있다. 나머지 배정은 행을 제거하지 않고 `assignee_company_member_id:0`, `assigned_by_company_member_id:null`, `completed_by_company_member_id:null`로 가린다. 0을 실제 구성원 ID로 조회하면 안 된다. 기업 관리자의 범위 밖 배정도 같은 방식으로 가린다.

### children 조회

```text
GET /api/v1/company-projects/:p/work-items/:w/children?depth=1
```

`depth`는 정수1~5, 기본1이며 **선택 업무에서 아래로 몇 단계 내려갈지**다. 프로젝트 절대 depth가 아니다.

```ts
type ChildrenData = {
  parent: CompanyProjectWorkItemRow;
  items: Array<CompanyProjectWorkItemRow & { rollup: WorkItemRollupRow | null }>;
  departments: CompanyProjectWorkDepartmentRow[];
  assignments: CompanyProjectWorkAssignmentRow[];
  dependencies: CompanyProjectWorkDependencyRow[];
};
```

parent는 items에 포함하지 않는다. items는 breadth-first 평면 배열이고 cancelled도 포함한다. 빈 자식은 items/관련 배열이 빈 배열이다. cursor, has_more, total, summary, detail_policy는 없다.

의존성은 반환 item이 선행 또는 후행 중 **한쪽에만** 있어도 포함된다. 상세/Gantt와 다른 조건이다. 외부 업무 ID를 가리키는 edge가 있을 수 있으므로 반환 items 안에서 양쪽을 반드시 찾을 수 있다고 가정하지 않는다. 여러 확장 요청 결과는 work/dependency ID로 중복 제거하여 합친다.

### rollup의 의미

| 필드 | 실제 의미 |
| --- | --- |
| `company_project_work_item_id` | 대상 업무 ID |
| `child_count` | 직계 자식 전체 수. 취소 포함 |
| `descendant_count` | 모든 깊이의 자손 전체 수. 취소 포함 |
| `done_count` | 직계 자식 중 done 수. 모든 자손 완료 수가 아님 |
| `delayed_count` | 직계 자식 중 planned_end_date<계산시각이고 done/cancelled가 아닌 수 |
| `rollup_progress_percent` | 비취소 직계 자식의 저장된 진행률/override 가중평균, 반올림. 자식 없음이면0 |
| `rollup_started_at`, `rollup_completed_at` | nullable DB 필드. 현재 rebuild 코드에서 값을 계산하지 않음 |
| `last_calculated_at` | 마지막 계산 시각 |
| `needs_rebuild` | 재계산 대기 표시 |
| `created_at`, `updated_at` | DB 생성/수정 시각 |

업무 가중치는 planned_minutes>0이면 분, 그 외 시작·종료일이 있으면 양 끝 포함 일수, 그 외 progress_weight(기본1)다. 자식 자체의 stored progress/override를 사용하고 자식 rollup_progress_percent를 재귀 전파하지 않는다. rollup 값도 부모 업무/Phase/project.progress_percent를 자동 갱신하지 않는다.

지연 집계는 due_datetime이나 사용자의 timezone 기반 날짜가 아니라 planned_end_date와 현재 Date를 비교한다. 계산시점의 캐시이므로 시간만 지나서 지연이 됐다고 즉시 갱신된다는 보장은 없다. 배경 job은 needs_rebuild=true만 처리하며 기본 주기는120초다. leaf의 rollup 진행률0을 leaf 자체 진행률로 표시하면 안 된다.

### Gantt 조회

```text
GET /api/v1/company-projects/:p/gantt?mode=full&max_depth=5
```

query는 mode=`auto|summary|full`(기본auto), max_depth=1~5(기본2), phase_id, from/to(날짜)다. 반환 data는 **`{gantt_policy,phases,items,dependencies}`**다. items에 rollup을 붙이고 project/departments/assignments/summary는 반환하지 않는다.

max_depth는 모든 mode에서 실제 필터로 적용한다. `mode=full`만 보내면 여전히 depth≤2다. 모든 업무를 받으려면 max_depth=5와 필터 없는 요청이 필요하다. mode에 따라 업무 목록을 추가로 축약하는 로직은 없으며, summary도 요청한 max_depth 범위의 행을 반환한다.

Gantt scale은 전체 업무 수 대신 **필터 후 반환 업무 수**와 프로젝트 기간으로 계산한다. auto+small이면 반환 mode도 auto, 그 외 auto면 summary다. full_load_allowed는 scale이 small이거나 요청 mode가 full이면 true다. 상세 detail_policy의 판정과 혼용하면 안 된다. phases는 전체이고 dependencies는 양쪽이 반환 items에 포함될 때만 반환한다.

기간 필터는 계획기간이 범위와 겹치는 업무 또는 due_datetime이 범위에 포함되는 업무다. from/to 모두 있으면 due 종료 경계는 to 다음 날0시 미만으로 계산한다. 날짜가 전혀 없는 업무는 기간 필터에서 빠질 수 있고, 필터가 부모를 제거한 채 자식만 반환할 수도 있다. from>to는 `400 INVALID_GANTT_DATE_RANGE`다.

근거: `company-projects.service.ts:590,675,727,1069,2677,2804,2878,2975,3557`의 서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`), rollup 모델 (백엔드 원본: `prisma/schema.prisma`), rollup job (백엔드 원본: `src/jobs/project-rollup-rebuild.job.ts`), [기존 상세/Gantt 명세](../../docs/backend-specs/api_general.md).

## 8. 검증·저장·동시성 보장

2026-10-12 결함 수정에 포함된 migration `20261012090000_project_contract_constraints`를 적용해야 아래 저장 값을 사용할 수 있다. 기존 행을 삭제/변환하지 않고 CHECK 허용 값을 확장한다.

| 동작 | 현행 계약 |
| --- | --- |
| 업무 진행률/숫자 override PATCH | progress_source=manual_override 저장. DB는 manual/manual_override/rollup/assignment_rollup 허용 |
| 배정 role | DTO와 DB 모두 owner/assignee/reviewer/watcher. 잘못된 역할은400 |
| baseline recovery 생성 | initial/revision/recovery 모두 저장 가능, 기본revision |
| 업무 reminder 실패 기록 | scheduled/sent/cancelled/failed 모두 저장 가능 |
| 날짜 | YYYY-MM-DD 실제 달력·윤년 검사, 0000/월·일 초과/말단 개행 거절 |
| 숫자 | non-nullable null/boolean/빈 문자열 거절. 정상 숫자 문자열 호환 |
| assigned_only | query true/false를 정상 구분하고 생략 시 필터 없음 |
| 프로젝트/Phase/업무 PATCH | project 잠금 후 최신 날짜와 입력 병합·검증·저장 |
| 의존성·부모 이동·import | 동일 프로젝트 변경을 직렬화하고 cycle/depth 검사와 저장을 같은 transaction에서 수행 |

조직의 첫 project import는 company+external_project_id advisory 잠금으로 동일 외부 ID 동시 생성을 직렬화한다. 최종 업무 트리는 유지된 로컬 자손까지 cycle·깊이를 검사하고 이동된 자손 depth를 갱신한다. 오류 시 해당 import를 롤백한다.

잠금은 데이터 정합성을 위한 직렬화이며 expected_version/If-Match 충돌 검사를 추가한 것은 아니다. 비취소 배정0개 때 기존 업무 진행률 유지, done/완료시각/진행률 독립, Phase 비상속, PATCH 취소와 DELETE의 차이는 기존 정책이다.

근거: 입력 스키마 (백엔드 원본: `src/common/validation/request-schemas.ts`), DTO (백엔드 원본: `src/modules/company-projects/company-projects.dto.ts`), 날짜 검사 (백엔드 원본: `src/modules/company-projects/project-dates.ts`), 잠금 (백엔드 원본: `src/modules/company-projects/project-mutation-lock.ts`), 트리 검사 (백엔드 원본: `src/modules/company-projects/project-work-tree.ts`), 서비스 (백엔드 원본: `src/modules/company-projects/company-projects.service.ts`), migration (백엔드 원본: `prisma/migrations/20261012090000_project_contract_constraints/migration.sql`), DB 회귀 (백엔드 원본: `tests/project-mutations-db.test.cjs`).

## 9. 관련 관리·알림 API

### 프로젝트 멤버

GET/POST `/api/v1/company-projects/:p/members`, PATCH/DELETE `/api/v1/company-projects/:p/members/:project_member_id`는 [F01 계약](./feature-lifecycle.md)에 경로/권한이 있다. POST `{company_member_id,role?}`에서 양의 정수 ID 필수, role=owner/manager/member/viewer 기본member. PATCH는 role 또는 status=active/inactive 하나 이상. DELETE는 inactive 처리다. 같은 회사 활성 구성원만 등록하며 일반 사용자 위임·제거는 owner만 가능하고 마지막 활성 owner 제거는409 PROJECT_LAST_OWNER_REQUIRED다. 이 project member와 실제 업무 assignee는 다른 개념이다.

### 기준선과 감사 로그

POST `/api/v1/company-projects/:p/baselines`: name(trim1~150자) 필수, description(최대5000자/null) 선택, baseline_type=initial/revision/recovery 기본revision. recovery도 migration 적용 후 저장 가능. 전체 업무(취소 포함)의 계획일/상태/진행/WBS/구조를 스냅샷 저장하고 data={baseline,item_count} 반환. GET 동일 경로는 data.baselines[]에 item_count를 붙여 최신순 반환한다. 기업 관리자 기본 경로로도 같은 계약을 제공한다.

GET `/api/v1/company-projects/:p/audit-logs`: work_item_id/assignment_id(숫자 문자열), action(trim1~100자), limit(정수1~100, 기본50). data.audit_logs[] 최신순. cursor/page 없음. 권한과 기록 여부를 구분한다. 현재 Phase/업무 생성 audit는 없고 업무 PATCH의 일반 제목/상태/부모 변경 audit도 없으며, 업무 PATCH는 부서/변경된 완료시각을 기록한다. 업무 DELETE는 subtree ID와 취소 audit를 기록한다.

### 본인 업무 reminder

POST `/api/v1/company-projects/work-assignments/:assignment_id/reminders`: remind_at(offset/Z datetime) 필수, reminder_type=custom/before_start/before_due 기본custom, message(최대255자/null) 선택. data.reminder,201. 이름만으로 remind_at을 자동 계산하지 않는다.

GET `/api/v1/company-projects/work-reminders`: status=scheduled/sent/cancelled/failed, assignment_id(숫자 문자열) 필터, data.reminders. DELETE `/api/v1/company-projects/work-reminders/:reminder_id`는 본인의 reminder를 cancelled 처리하고 data.reminder를 반환한다. notification 삭제와 별개다. failed 상태도 migration 적용 후 기록 가능하다.

### 대표 오류

| HTTP | code·조건 |
| --- | --- |
| 400 | VALIDATION_ERROR, PROJECT_PHASELESS, PROJECT_WORK_ITEM_DEPTH_EXCEEDED, INVALID_PROJECT_WORK_ITEM_PARENT, 날짜기간 오류, INVALID_PROJECT_ASSIGNMENT_STATE, INVALID_ASSIGNMENT_DATE_RANGE, INVALID_PROJECT_DEPENDENCY, PROJECT_DEPENDENCY_CYCLE |
| 403 | PROJECT_MANAGEMENT_FORBIDDEN, PROJECT_ASSIGNMENT_FORBIDDEN, COMPANY_PROJECT_FORBIDDEN, COMPANY_ADMIN_SCOPE_FORBIDDEN |
| 404 | COMPANY_PROJECT_NOT_FOUND(조회/service), PROJECT_NOT_FOUND(사용자 관리권한 검사), PROJECT_PHASE_NOT_FOUND, PARENT_WORK_ITEM_NOT_FOUND, PROJECT_WORK_ITEM_NOT_FOUND, PROJECT_ASSIGNMENT_NOT_FOUND, DEPARTMENT_NOT_FOUND, COMPANY_MEMBER_NOT_FOUND, PROJECT_DEPENDENCY_NOT_FOUND |
| 409 | PROJECT_LAST_OWNER_REQUIRED, PROJECT_DEPENDENCY_EXISTS, unique 충돌 RESOURCE_CONFLICT |
| 500 | DB CHECK 등 DATABASE_ERROR 또는 INTERNAL_SERVER_ERROR. 동일 요청 무조건 재시도 대신 입력/migration/저장 결과 확인 |

[오류 발생 조건 색인](./error-index.md)은 생성 지점이다. 위 표는 일반/기업 관리자 mutation 계약이며 최종 HTTP 처리는 공통 오류 middleware (백엔드 원본: `src/common/http/error-middleware.ts`)를 따른다. 시스템 관리자는 서비스 ApiError의 status/code를 유지하고 관리자 {error:{code,message}} envelope로 변환하며 details는 반환하지 않는다.
