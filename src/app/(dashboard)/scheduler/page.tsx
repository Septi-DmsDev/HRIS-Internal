import { redirect } from "next/navigation";
import { getCurrentUserRoleRow } from "@/lib/auth/session";
import { getScheduleManagementWorkspaceByPeriod } from "@/server/actions/schedule";
import SchedulerClient from "./SchedulerClient";
import type { UserRole } from "@/types";

const ALLOWED_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "KABAG", "SPV"];

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function SchedulerPage({ searchParams }: PageProps) {
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/schedule");
  }

  const params = await searchParams;
  const now = new Date();
  const defaultMonthDate = now.getDate() > 25
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : now;
  const defaultYear = defaultMonthDate.getFullYear();
  const defaultMonth = defaultMonthDate.getMonth() + 1;
  const year = params.year ? parseInt(params.year, 10) : defaultYear;
  const month = params.month ? parseInt(params.month, 10) : defaultMonth;
  const safeYear = Number.isNaN(year) ? defaultYear : year;
  const safeMonth = Number.isNaN(month) || month < 1 || month > 12 ? defaultMonth : month;

  const workspace = await getScheduleManagementWorkspaceByPeriod(safeYear, safeMonth);

  return (
    <div className="max-w-6xl">
      <SchedulerClient
        teamMembers={workspace.teamMembers}
        scheduleOptions={workspace.scheduleOptions}
        periodStart={workspace.periodStart}
        periodEnd={workspace.periodEnd}
        assignmentRanges={workspace.assignmentRanges}
        selectedYear={safeYear}
        selectedMonth={safeMonth}
        canBulkAssign={["HRD", "SUPER_ADMIN", "SPV", "KABAG"].includes(role)}
      />
    </div>
  );
}
