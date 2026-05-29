"use server";

import { db } from "@/lib/db";
import {
  dailyActivityEntries,
  monthlyPointPerformances,
} from "@/lib/db/schema/point";
import { employeeAttendanceRecords, attendanceTickets, overtimeRequests } from "@/lib/db/schema/hr";
import { employees, employeeScheduleAssignments } from "@/lib/db/schema/employee";
import { divisions } from "@/lib/db/schema/master";
import { and, asc, eq, gte, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { resolvePayrollPeriod } from "@/server/payroll-engine/resolve-payroll-period";

function resolveCurrentPeriodCode() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function normalizeDivisionSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPeriodDays(start: Date, end: Date) {
  const days: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    days.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function getPublicRecaptDivisions() {
  const rows = await db
    .select({ id: divisions.id, name: divisions.name })
    .from(divisions)
    .where(eq(divisions.isActive, true))
    .orderBy(asc(divisions.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: normalizeDivisionSlug(row.name),
  }));
}

export async function getPublicRecaptDivisionDetail(divisionSlug: string, periodCode?: string) {
  const allDivisions = await getPublicRecaptDivisions();
  const division = allDivisions.find((row) => row.slug === divisionSlug);
  if (!division) return { error: "Divisi tidak ditemukan." } as const;

  const safePeriod = periodCode && /^\d{4}-\d{2}$/.test(periodCode) ? periodCode : resolveCurrentPeriodCode();
  const period = resolvePayrollPeriod(safePeriod);
  const periodStart = new Date(period.periodStartDate);
  const periodEnd = new Date(period.periodEndDate);

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
    })
    .from(employees)
    .where(and(eq(employees.divisionId, division.id), eq(employees.isActive, true)))
    .orderBy(asc(employees.fullName));

  const employeeIds = employeeRows.map((row) => row.id);
  const periodDays = getPeriodDays(periodStart, periodEnd);

  if (employeeIds.length === 0) {
    return {
      division,
      periodStart: ymd(periodStart),
      periodEnd: ymd(periodEnd),
      dayColumns: periodDays,
      rows: [],
    };
  }

  const [
    activityRows,
    monthlyRows,
    attendanceRows,
    izinJamRows,
    overtimeRows,
    assignmentRows,
  ] = await Promise.all([
    db
      .select({
        employeeId: dailyActivityEntries.employeeId,
        workDate: dailyActivityEntries.workDate,
        totalPoints: dailyActivityEntries.totalPoints,
      })
      .from(dailyActivityEntries)
      .where(
        and(
          inArray(dailyActivityEntries.employeeId, employeeIds),
          gte(dailyActivityEntries.workDate, periodStart),
          lte(dailyActivityEntries.workDate, periodEnd),
          inArray(dailyActivityEntries.status, ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const)
        )
      ),
    db
      .select({
        employeeId: monthlyPointPerformances.employeeId,
        performancePercent: monthlyPointPerformances.performancePercent,
        totalApprovedPoints: monthlyPointPerformances.totalApprovedPoints,
      })
      .from(monthlyPointPerformances)
      .where(
        and(
          inArray(monthlyPointPerformances.employeeId, employeeIds),
          eq(monthlyPointPerformances.periodStartDate, periodStart),
          eq(monthlyPointPerformances.periodEndDate, periodEnd)
        )
      ),
    db
      .select({
        employeeId: employeeAttendanceRecords.employeeId,
        attendanceStatus: employeeAttendanceRecords.attendanceStatus,
        punctualityStatus: employeeAttendanceRecords.punctualityStatus,
      })
      .from(employeeAttendanceRecords)
      .where(
        and(
          inArray(employeeAttendanceRecords.employeeId, employeeIds),
          gte(employeeAttendanceRecords.attendanceDate, periodStart),
          lte(employeeAttendanceRecords.attendanceDate, periodEnd)
        )
      ),
    db
      .select({
        employeeId: attendanceTickets.employeeId,
        totalHours: sql<number>`coalesce(sum(${attendanceTickets.izinHours}), 0)`,
      })
      .from(attendanceTickets)
      .where(
        and(
          inArray(attendanceTickets.employeeId, employeeIds),
          eq(attendanceTickets.ticketType, "IZIN_JAM"),
          inArray(attendanceTickets.status, ["APPROVED_SPV", "APPROVED_HRD", "AUTO_APPROVED", "LOCKED"] as const),
          lte(attendanceTickets.startDate, periodEnd),
          gte(attendanceTickets.endDate, periodStart)
        )
      )
      .groupBy(attendanceTickets.employeeId),
    db
      .select({
        employeeId: overtimeRequests.employeeId,
        overtimeHours: sql<number>`coalesce(sum(case when ${overtimeRequests.status} = 'APPROVED' and ${overtimeRequests.overtimeType} in ('OVERTIME_1H','OVERTIME_2H','OVERTIME_3H','PATCH_ABSENCE_3H') then ${overtimeRequests.overtimeHours} else 0 end), 0)`,
        lemburDays: sql<number>`coalesce(sum(case when ${overtimeRequests.status} = 'APPROVED' and ${overtimeRequests.overtimeType} = 'LEMBUR_FULLDAY' then 1 else 0 end), 0)`,
      })
      .from(overtimeRequests)
      .where(
        and(
          inArray(overtimeRequests.employeeId, employeeIds),
          gte(overtimeRequests.requestDate, periodStart),
          lte(overtimeRequests.requestDate, periodEnd)
        )
      )
      .groupBy(overtimeRequests.employeeId),
    db
      .select({ employeeId: employeeScheduleAssignments.employeeId })
      .from(employeeScheduleAssignments)
      .where(
        and(
          inArray(employeeScheduleAssignments.employeeId, employeeIds),
          lte(employeeScheduleAssignments.effectiveStartDate, periodEnd),
          or(
            isNull(employeeScheduleAssignments.effectiveEndDate),
            gte(employeeScheduleAssignments.effectiveEndDate, periodStart)
          )
        )
      ),
  ]);

  const activityMap = new Map<string, number>();
  const activityTotalMap = new Map<string, number>();
  for (const row of activityRows) {
    const key = `${row.employeeId}::${ymd(row.workDate)}`;
    const value = Number(row.totalPoints ?? 0);
    activityMap.set(key, Number((activityMap.get(key) ?? 0) + value));
    activityTotalMap.set(row.employeeId, Number((activityTotalMap.get(row.employeeId) ?? 0) + value));
  }

  const monthlyMap = new Map(monthlyRows.map((row) => [
    row.employeeId,
    {
      performancePercent: Number(row.performancePercent ?? 0),
      totalApprovedPoints: Number(row.totalApprovedPoints ?? 0),
    },
  ]));

  const attendanceMap = new Map<string, { hadir: number; telat: number; izinSakit: number; cuti: number; alpha: number }>();
  for (const row of attendanceRows) {
    const current = attendanceMap.get(row.employeeId) ?? { hadir: 0, telat: 0, izinSakit: 0, cuti: 0, alpha: 0 };
    if (row.attendanceStatus === "HADIR") current.hadir += 1;
    if (row.attendanceStatus === "HADIR" && row.punctualityStatus === "TELAT") current.telat += 1;
    if (row.attendanceStatus === "IZIN" || row.attendanceStatus === "SAKIT") current.izinSakit += 1;
    if (row.attendanceStatus === "CUTI") current.cuti += 1;
    if (row.attendanceStatus === "ALPA") current.alpha += 1;
    attendanceMap.set(row.employeeId, current);
  }

  const izinJamMap = new Map(izinJamRows.map((row) => [row.employeeId, Number(row.totalHours ?? 0)]));
  const overtimeMap = new Map(overtimeRows.map((row) => [
    row.employeeId,
    { overtimeHours: Number(row.overtimeHours ?? 0), lemburDays: Number(row.lemburDays ?? 0) },
  ]));

  const assignmentEmployeeSet = new Set(assignmentRows.map((row) => row.employeeId));
  const workingDaysInPeriod = periodDays.filter((day) => new Date(`${day}T00:00:00`).getDay() !== 0).length;

  const rows = employeeRows.map((employee) => {
    const attendance = attendanceMap.get(employee.id) ?? { hadir: 0, telat: 0, izinSakit: 0, cuti: 0, alpha: 0 };
    const overtime = overtimeMap.get(employee.id) ?? { overtimeHours: 0, lemburDays: 0 };
    const monthly = monthlyMap.get(employee.id) ?? {
      performancePercent: 0,
      totalApprovedPoints: activityTotalMap.get(employee.id) ?? 0,
    };

    const dailyPoints = Object.fromEntries(
      periodDays.map((day) => [day, Number((activityMap.get(`${employee.id}::${day}`) ?? 0).toFixed(2))])
    );

    const weeklyPercent = (() => {
      const total = monthly.performancePercent;
      return {
        week1: Number((total / 4).toFixed(2)),
        week2: Number((total / 4).toFixed(2)),
        week3: Number((total / 4).toFixed(2)),
        week4: Number((total / 4).toFixed(2)),
      };
    })();

    const totalKehadiran = attendance.hadir + attendance.izinSakit + attendance.cuti + attendance.alpha;
    const fulltimeEligible = totalKehadiran >= workingDaysInPeriod && assignmentEmployeeSet.has(employee.id);

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      dailyPoints,
      weeklyPercent,
      monthlyPointsTotal: Number((monthly.totalApprovedPoints ?? 0).toFixed(2)),
      monthlyPercent: Number((monthly.performancePercent ?? 0).toFixed(2)),
      hadir: attendance.hadir,
      telat: attendance.telat,
      izinJamHours: izinJamMap.get(employee.id) ?? 0,
      izinSakit: attendance.izinSakit,
      cuti: attendance.cuti,
      alpha: attendance.alpha,
      overtimeHours: overtime.overtimeHours,
      lemburDays: overtime.lemburDays,
      fulltimeEligibility: fulltimeEligible,
    };
  });

  return {
    division,
    periodCode: safePeriod,
    periodStart: ymd(periodStart),
    periodEnd: ymd(periodEnd),
    dayColumns: periodDays,
    rows,
  };
}
