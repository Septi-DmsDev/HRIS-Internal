import { format } from "date-fns";
import { redirect } from "next/navigation";
import { getTickets } from "@/server/actions/tickets";
import { getAttendancePeriodOverrideWorkspace } from "@/server/actions/attendance";
import TicketingClient from "./TicketingClient";
import { getCurrentUserRoleRow } from "@/lib/auth/session";
import type { UserRole } from "@/types";

const TICKETING_DIRECT_REDIRECT_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD"];

export default async function TicketingPage() {
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (role === "FINANCE") {
    redirect("/finance");
  }
  if (TICKETING_DIRECT_REDIRECT_ROLES.includes(role)) {
    redirect("/ticketingapproval");
  }

  const ticketResult = await getTickets();
  const { tickets } = ticketResult;

  const ticketRows = tickets.map((t) => ({
    ...t,
    startDate: t.startDate instanceof Date ? format(t.startDate, "yyyy-MM-dd") : String(t.startDate),
    endDate: t.endDate instanceof Date ? format(t.endDate, "yyyy-MM-dd") : String(t.endDate),
    createdAt: t.createdAt instanceof Date ? format(t.createdAt, "yyyy-MM-dd HH:mm") : String(t.createdAt),
    employeeName: t.employeeName ?? "-",
    employeeCode: t.employeeCode ?? "-",
    divisionName: t.divisionName ?? "-",
    payrollImpact: t.payrollImpact ?? null,
    reviewNotes: t.reviewNotes ?? "",
    rejectionReason: t.rejectionReason ?? "",
    attachmentUrl: t.attachmentUrl ?? null,
  }));
  const isAttendanceManager = role === "SUPER_ADMIN" || role === "HRD";
  const attendanceWorkspace = isAttendanceManager
    ? await getAttendancePeriodOverrideWorkspace()
    : null;

  const attendanceData =
    attendanceWorkspace && !("error" in attendanceWorkspace)
      ? {
          periodStart: attendanceWorkspace.periodStart,
          periodEnd: attendanceWorkspace.periodEnd,
          workingDaysInPeriod: attendanceWorkspace.workingDaysInPeriod,
          employees: attendanceWorkspace.employees.map((row) => ({
            id: row.id,
            employeeCode: row.employeeCode,
            fullName: row.fullName,
            divisionName: row.divisionName ?? "-",
          })),
          totals: attendanceWorkspace.totals.map((row) => ({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            employeeCode: row.employeeCode,
            divisionName: row.divisionName,
            hadir: row.hadir,
            telat: row.telat,
            alpha: row.alpha,
            cuti: row.cuti,
            izinSakit: row.izinSakit,
          })),
        }
      : null;

  return (
    <div className="space-y-4">
      <TicketingClient
        role={role}
        hasEmployeeLink={Boolean(roleRow.employeeId)}
        tickets={ticketRows}
        attendanceData={attendanceData}
        canManageAttendance={isAttendanceManager}
      />
    </div>
  );
}
