import { redirect } from "next/navigation";
import { getCurrentUserRoleRow } from "@/lib/auth/session";
import { getScheduleManagementWorkspace } from "@/server/actions/schedule";
import SchedulerClient from "./SchedulerClient";
import type { UserRole } from "@/types";

const ALLOWED_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "KABAG", "SPV"];

export default async function SchedulerPage() {
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/schedule");
  }

  const workspace = await getScheduleManagementWorkspace();

  return (
    <div className="max-w-6xl">
      <SchedulerClient
        teamMembers={workspace.teamMembers}
        scheduleOptions={workspace.scheduleOptions}
        periodStart={workspace.periodStart}
        periodEnd={workspace.periodEnd}
        assignmentRanges={workspace.assignmentRanges}
        canBulkAssign={["HRD", "SUPER_ADMIN", "SPV", "KABAG"].includes(role)}
      />
    </div>
  );
}
