import type { CompanyAdminMe } from "@/types";

export function formatCompanyAffiliation(
  admin: Pick<CompanyAdminMe, "company" | "department"> | null | undefined,
) {
  const companyName = admin?.company?.name?.trim();
  if (!companyName) return "";

  const department = admin?.department;
  const departmentName = department?.name?.trim();
  const departmentCode = department?.code?.trim();
  const departmentLabel = departmentName || "부서 미지정";

  return `${companyName} · ${departmentLabel}${
    departmentCode ? ` (${departmentCode})` : ""
  }`;
}
