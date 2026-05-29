import { checkRole, getCurrentUserRoleRow } from "@/lib/auth/session";
import { getAttendancePeriodRecapWorkspace, overrideAttendancePeriodTotals } from "@/server/actions/attendance";
import type { UserRole } from "@/types";
import AttendanceRecapClient from "./AttendanceRecapClient";

type PageProps = {
  searchParams: Promise<{ period?: string }>;
};

export default async function AttendanceRecapPage({ searchParams }: PageProps) {
  const guard = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (guard) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Akses rekap total absensi ditolak.
      </div>
    );
  }

  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const params = await searchParams;
  const workspaceResult = await getAttendancePeriodRecapWorkspace(params.period);

  if ("error" in workspaceResult) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {workspaceResult.error}
      </div>
    );
  }

  return (
    <AttendanceRecapClient
      role={role}
      workspace={workspaceResult}
      saveOverride={overrideAttendancePeriodTotals}
    />
  );
}
