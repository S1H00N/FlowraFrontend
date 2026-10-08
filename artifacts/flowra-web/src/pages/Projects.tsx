import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FolderKanban, Plus, RefreshCw, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomSelect from "@/components/ui/CustomSelect";
import EmptyState from "@/components/ui/EmptyState";
import { FullSpinner } from "@/components/ui/Spinner";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import {
  canCreateProject,
  formatProjectDate,
  isActiveProjectMembership,
  PROJECT_STATUS_OPTIONS,
  ProjectEditAction,
  ProjectError,
  ProjectStatusBadge,
} from "@/components/projects/ProjectPresentation";
import { useCompanyMemberships } from "@/hooks/useCompanyMemberships";
import { useCompanyProjects } from "@/hooks/useCompanyProjects";
import type { CompanyProject, CompanyProjectStatus } from "@/types";
import "./Projects.css";

export default function Projects() {
  const [params, setParams] = useSearchParams();
  const memberships = useCompanyMemberships();
  const activeMemberships =
    memberships.data?.filter(isActiveProjectMembership) ?? [];
  const requestedCompany = params.get("company_id");
  const membership =
    activeMemberships.find(
      (item) => String(item.company_id) === requestedCompany,
    ) ?? (!requestedCompany ? activeMemberships[0] : undefined);
  const q = params.get("q") ?? "";
  const status = PROJECT_STATUS_OPTIONS.find(
    (item) => item.value === params.get("status"),
  )?.value;
  const [search, setSearch] = useState(q);
  const [form, setForm] = useState<"create" | CompanyProject | null>(null);
  const projects = useCompanyProjects(
    { company_id: membership?.company_id, q: q || undefined, status },
    {
      enabled: Boolean(membership) && !memberships.isError,
      keepPreviousData: false,
    },
  );
  const changeParams = (
    values: Record<string, string | undefined>,
    replace = false,
  ) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace });
  };

  useEffect(() => setSearch(q), [q]);
  useEffect(() => setForm(null), [membership?.company_member_id]);
  useEffect(() => {
    if (search.trim() === q) return;
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search, q, params, setParams]);

  const rows = projects.data ?? [];
  const companyLabel =
    membership?.company?.name ??
    (membership ? `회사 ${membership.company_id}` : "");
  const createAllowed = membership && canCreateProject(membership);
  const ready =
    membership &&
    !memberships.isError &&
    !projects.isLoading &&
    !projects.isError;
  const summary = [
    { label: "조회된 프로젝트", count: rows.length },
    {
      label: "진행 중",
      count: rows.filter((item) => item.status === "active").length,
    },
    {
      label: "완료",
      count: rows.filter((item) => item.status === "completed").length,
    },
    {
      label: "일시중지·보관",
      count: rows.filter(
        (item) => item.status === "paused" || item.status === "archived",
      ).length,
    },
  ];

  return (
    <AppShell>
      <div className="projects-page flowra-page-stack">
        <div className="projects-heading">
          <div>
            <h2>프로젝트 관리</h2>
          </div>
          {createAllowed && (
            <Button type="button" onClick={() => setForm("create")}>
              <Plus aria-hidden="true" />
              프로젝트 생성
            </Button>
          )}
        </div>
        {memberships.isLoading ? (
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
            description="회사 초대를 수락하거나 회사 구성원 상태를 확인해 주세요."
            action={
              <Button asChild variant="outline">
                <Link to="/settings">회사 정보 확인</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="projects-toolbar flowra-toolbar">
              <CustomSelect
                value={membership ? String(membership.company_id) : ""}
                options={activeMemberships.map((item) => ({
                  value: String(item.company_id),
                  label: item.company?.name ?? `회사 ${item.company_id}`,
                }))}
                ariaLabel="회사 선택"
                className="h-10"
                placeholder="회사 선택"
                onChange={(value) => {
                  setForm(null);
                  changeParams({ company_id: value });
                }}
              />
              <div className="projects-search">
                <Search size={16} aria-hidden="true" />
                <Input
                  aria-label="프로젝트 검색"
                  placeholder="프로젝트 이름 또는 설명 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <CustomSelect
                value={status ?? "all"}
                options={[
                  { value: "all", label: "모든 상태" },
                  ...PROJECT_STATUS_OPTIONS,
                ]}
                ariaLabel="프로젝트 상태"
                className="h-10"
                onChange={(value) =>
                  changeParams({
                    status:
                      value === "all"
                        ? undefined
                        : (value as CompanyProjectStatus),
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="projects-refresh h-10 w-10"
                aria-label="프로젝트 새로고침"
                disabled={projects.isFetching || !membership}
                onClick={() => void projects.refetch()}
              >
                <RefreshCw
                  className={projects.isFetching ? "animate-spin" : ""}
                />
              </Button>
            </div>
            {!membership ? (
              <EmptyState
                title="선택한 회사에 접근할 수 없습니다"
                description="활성 멤버십이 있는 회사를 선택해 주세요."
              />
            ) : (
              <>
                {!createAllowed && (
                  <p className="projects-note">
                    프로젝트 생성에는 활성 소속 부서가 필요합니다.
                  </p>
                )}
                {projects.isLoading ? (
                  <FullSpinner message="프로젝트를 불러오는 중..." />
                ) : projects.isError ? (
                  <ProjectError
                    error={projects.error}
                    onRetry={() => void projects.refetch()}
                    retrying={projects.isFetching}
                  />
                ) : (
                  ready && (
                    <>
                      <section
                        className="projects-summary flowra-surface"
                        aria-label="조회된 프로젝트 현황"
                      >
                        <p className="projects-summary-scope">
                          {companyLabel} · 현재 조회 결과 기준
                        </p>
                        <dl>
                          {summary.map((item) => (
                            <div key={item.label}>
                              <dt>{item.label}</dt>
                              <dd>{item.count}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                      <section
                        aria-label="프로젝트 목록"
                        aria-busy={projects.isFetching}
                      >
                        {rows.length === 0 ? (
                          <EmptyState
                            icon={<FolderKanban />}
                            title={
                              q || status
                                ? "검색 결과가 없습니다"
                                : "프로젝트가 없습니다"
                            }
                            description={
                              q || status
                                ? "검색어나 상태 필터를 변경해 주세요."
                                : "조회할 수 있는 프로젝트가 없습니다. 새 프로젝트를 시작해 보세요."
                            }
                            action={
                              q || status ? (
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setSearch("");
                                    changeParams({
                                      q: undefined,
                                      status: undefined,
                                    });
                                  }}
                                >
                                  필터 초기화
                                </Button>
                              ) : undefined
                            }
                          />
                        ) : (
                          <ul className="project-list flowra-surface">
                            {rows.map((project) => (
                              <li
                                className="project-row"
                                key={project.company_project_id}
                              >
                                <Link
                                  className="project-row-title"
                                  to={`/projects/${project.company_project_id}?company_id=${membership.company_id}`}
                                >
                                  <span>{project.name}</span>
                                  <p>
                                    {project.description || "설명이 없습니다."}
                                  </p>
                                </Link>
                                <ProjectStatusBadge status={project.status} />
                                <dl className="project-row-dates">
                                  <div>
                                    <dt>계획 시작일</dt>
                                    <dd>
                                      {formatProjectDate(
                                        project.planned_start_date,
                                      )}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>계획 종료일</dt>
                                    <dd>
                                      {formatProjectDate(
                                        project.planned_end_date,
                                      )}
                                    </dd>
                                  </div>
                                </dl>
                                <div className="project-row-action">
                                  <ProjectEditAction
                                    project={project}
                                    membership={membership}
                                    compact
                                    onEdit={() => setForm(project)}
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </>
                  )
                )}
              </>
            )}
          </>
        )}
        {membership && form && (
          <ProjectFormDialog
            key={`${membership.company_member_id}-${form === "create" ? "create" : form.company_project_id}`}
            open
            onOpenChange={(open) => {
              if (!open) setForm(null);
            }}
            membership={membership}
            project={form === "create" ? undefined : form}
            onSaved={() => {
              if (form === "create") {
                setSearch("");
                changeParams({ q: undefined, status: undefined });
              }
              setForm(null);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
