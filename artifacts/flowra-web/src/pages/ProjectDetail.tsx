import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FolderKanban, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { FullSpinner } from "@/components/ui/Spinner";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import ProjectWorkManager from "@/components/projects/ProjectWorkManager";
import {
  formatProjectDate,
  isActiveProjectMembership,
  PROJECT_VISIBILITY_OPTIONS,
  ProjectEditAction,
  ProjectError,
  ProjectStatusBadge,
} from "@/components/projects/ProjectPresentation";
import { useCompanyMemberships } from "@/hooks/useCompanyMemberships";
import {
  COMPANY_PROJECTS_QUERY_KEY,
  useCompanyProject,
} from "@/hooks/useCompanyProjects";
import "./Projects.css";

export default function ProjectDetail() {
  const queryClient = useQueryClient();
  const { companyProjectId } = useParams();
  const id =
    companyProjectId &&
    /^\d+$/.test(companyProjectId) &&
    Number.isSafeInteger(Number(companyProjectId)) &&
    Number(companyProjectId) > 0
      ? Number(companyProjectId)
      : null;
  const [params] = useSearchParams();
  const memberships = useCompanyMemberships();
  const activeMemberships =
    memberships.data?.filter(isActiveProjectMembership) ?? [];
  const requestedCompany = params.get("company_id");
  const requestedMembership = activeMemberships.find(
    (item) => String(item.company_id) === requestedCompany,
  );
  const companyAccessible = !requestedCompany || Boolean(requestedMembership);
  const detail = useCompanyProject(id, {
    enabled:
      !memberships.isLoading &&
      !memberships.isError &&
      activeMemberships.length > 0 &&
      companyAccessible,
  });
  const project = detail.data?.project;
  const membership = activeMemberships.find(
    (item) => item.company_id === project?.company_id,
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tab, setTab] = useState<"overview" | "work">("work");
  useEffect(() => setEditingId(null), [id, membership?.company_member_id]);
  useEffect(() => setTab("work"), [id]);
  const listCompany = requestedMembership?.company_id ?? membership?.company_id;
  const backUrl = listCompany
    ? `/projects?company_id=${listCompany}`
    : "/projects";
  const companyMismatch =
    requestedCompany &&
    project &&
    String(project.company_id) !== requestedCompany;

  return (
    <AppShell>
      <div className="projects-page projects-work-page flowra-page-stack">
        <div className="projects-detail-nav">
          <Button asChild variant="ghost">
            <Link to={backUrl}>
              <ArrowLeft aria-hidden="true" />
              목록으로 돌아가기
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="프로젝트 새로고침"
            disabled={
              detail.isFetching ||
              id === null ||
              !companyAccessible ||
              activeMemberships.length === 0
            }
            onClick={() => {
              void detail.refetch();
              void queryClient.invalidateQueries({
                queryKey: [...COMPANY_PROJECTS_QUERY_KEY, "members", id ?? 0],
              });
            }}
          >
            <RefreshCw className={detail.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
        {id === null ? (
          <EmptyState
            title="프로젝트를 찾을 수 없습니다"
            description="프로젝트 주소를 확인해 주세요."
          />
        ) : memberships.isLoading ? (
          <FullSpinner message="회사 정보를 불러오는 중..." />
        ) : memberships.isError ? (
          <ProjectError
            error={memberships.error}
            onRetry={() => void memberships.refetch()}
            retrying={memberships.isFetching}
          />
        ) : activeMemberships.length === 0 ? (
          <EmptyState
            icon={<FolderKanban />}
            title="활성 회사 멤버십이 없습니다"
            description="회사 구성원 상태를 확인해 주세요."
          />
        ) : !companyAccessible || companyMismatch ? (
          <EmptyState
            title="선택한 회사에 접근할 수 없습니다"
            description="목록에서 소속 회사의 프로젝트를 선택해 주세요."
          />
        ) : detail.isLoading ? (
          <FullSpinner message="프로젝트를 불러오는 중..." />
        ) : detail.isError ? (
          <ProjectError
            error={detail.error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : project && membership ? (
          <>
            <header className="projects-detail-header flowra-surface">
              <div className="projects-detail-title">
                <div>
                  <ProjectStatusBadge status={project.status} />
                  <h2>{project.name}</h2>
                </div>
                <ProjectEditAction
                  project={project}
                  membership={membership}
                  onEdit={() => setEditingId(project.company_project_id)}
                />
              </div>
              <div className="projects-detail-meta">
                <span>
                  {membership.company?.name ?? `회사 ${membership.company_id}`}
                  {project.origin_department_id
                    ? ` · ${membership.department?.department_id === project.origin_department_id ? membership.department.name : `부서 ${project.origin_department_id}`}`
                    : ""}
                </span>
                <span>
                  {formatProjectDate(project.planned_start_date)} ~{" "}
                  {formatProjectDate(project.planned_end_date)}
                </span>
              </div>
            </header>
            <div
              className="projects-detail-tabs"
              role="tablist"
              aria-label="프로젝트 상세 탐색"
            >
              <Button
                id="project-overview-tab"
                role="tab"
                variant="ghost"
                aria-selected={tab === "overview"}
                aria-controls="project-overview-panel"
                tabIndex={tab === "overview" ? 0 : -1}
                onClick={() => setTab("overview")}
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const nextTab = event.key === "Home" ? "overview" : "work";
                    setTab(nextTab);
                    document.getElementById(`project-${nextTab}-tab`)?.focus();
                  }
                }}
              >
                개요
              </Button>
              <Button
                id="project-work-tab"
                role="tab"
                variant="ghost"
                aria-selected={tab === "work"}
                aria-controls="project-work-panel"
                tabIndex={tab === "work" ? 0 : -1}
                onClick={() => setTab("work")}
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const nextTab = event.key === "End" ? "work" : "overview";
                    setTab(nextTab);
                    document.getElementById(`project-${nextTab}-tab`)?.focus();
                  }
                }}
              >
                업무 목록
              </Button>
            </div>
            <div
              id="project-work-panel"
              role="tabpanel"
              aria-labelledby="project-work-tab"
              hidden={tab !== "work"}
            >
              {detail.data && (
                <ProjectWorkManager
                  key={`${id}:${membership.company_member_id}`}
                  detail={detail.data}
                  detailUpdatedAt={detail.dataUpdatedAt}
                  membership={membership}
                  active={tab === "work"}
                />
              )}
            </div>
            <div
              id="project-overview-panel"
              role="tabpanel"
              aria-labelledby="project-overview-tab"
              hidden={tab !== "overview"}
            >
              <section
                className="projects-overview flowra-surface"
                aria-labelledby="project-overview-title"
                aria-busy={detail.isFetching}
              >
                <h3 id="project-overview-title">프로젝트 개요</h3>
                <p className="projects-detail-description">
                  {project.description || "등록된 프로젝트 설명이 없습니다."}
                </p>
                <dl className="projects-overview-fields">
                  <div>
                    <dt>계획 시작일</dt>
                    <dd>{formatProjectDate(project.planned_start_date)}</dd>
                  </div>
                  <div>
                    <dt>계획 종료일</dt>
                    <dd>{formatProjectDate(project.planned_end_date)}</dd>
                  </div>
                  <div>
                    <dt>소속 회사</dt>
                    <dd>
                      {membership.company?.name ??
                        `회사 ${membership.company_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt>소속 부서</dt>
                    <dd>
                      {project.origin_department_id
                        ? membership.department?.department_id ===
                          project.origin_department_id
                          ? membership.department.name
                          : `부서 ${project.origin_department_id}`
                        : "미지정"}
                    </dd>
                  </div>
                  {project.visibility && (
                    <div>
                      <dt>공개 범위</dt>
                      <dd>
                        {PROJECT_VISIBILITY_OPTIONS.find(
                          (item) => item.value === project.visibility,
                        )?.label ?? project.visibility}
                      </dd>
                    </div>
                  )}
                  {project.phase_mode && (
                    <div>
                      <dt>운영 방식</dt>
                      <dd>
                        {project.phase_mode === "phased"
                          ? "단계별 관리"
                          : project.phase_mode === "phase_less"
                            ? "단계 없이 관리"
                            : project.phase_mode}
                      </dd>
                    </div>
                  )}
                </dl>
                {detail.data?.summary && <>
                  <dl className="projects-overview-fields" aria-label="프로젝트 전체 건수">
                    <div><dt>전체 단계</dt><dd>{detail.data.summary.phase_count}개</dd></div>
                    <div><dt>전체 업무</dt><dd>{detail.data.summary.work_item_count}개</dd></div>
                    <div><dt>전체 배정</dt><dd>{detail.data.summary.assignment_count}건</dd></div>
                  </dl>
                  <p className="projects-note">취소된 항목을 포함한 전체 건수입니다. 배정 건수는 담당자 인원 수와 다를 수 있습니다.</p>
                </>}
              </section>
            </div>
            {editingId === project.company_project_id && (
              <ProjectFormDialog
                key={`${id}-${membership.company_member_id}`}
                open
                onOpenChange={(open) => {
                  if (!open) setEditingId(null);
                }}
                membership={membership}
                project={project}
                onSaved={() => setEditingId(null)}
              />
            )}
          </>
        ) : (
          <EmptyState
            title="접근 권한이 없습니다"
            description="이 프로젝트의 회사 멤버십을 확인해 주세요."
          />
        )}
      </div>
    </AppShell>
  );
}
