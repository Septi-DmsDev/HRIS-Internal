"use server";

import { db } from "@/lib/db";
import { getCurrentUserRoleRow, requireAuth } from "@/lib/auth/session";
import {
  employees,
  employeeDivisionHistories,
  employeeScheduleAssignments,
  workSchedules,
  workScheduleDays,
  workShiftMasters,
} from "@/lib/db/schema/employee";
import { POINT_TARGET_HARIAN } from "@/config/constants";
import { attendanceTickets } from "@/lib/db/schema/hr";
import { branches, divisions, positions } from "@/lib/db/schema/master";
import { dailyActivityEntries } from "@/lib/db/schema/point";
import { aliasedTable, and, asc, desc, eq, inArray, isNull, lte, gte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@/types";
import type { EmployeeGroup } from "@/lib/employee-groups";
import { replaceEmployeeScheduleRange } from "@/server/services/schedule-assignment-service";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ScheduleCalendarDay = {
  date: string;
  dayOfWeek: number;
  dayStatus: string;
  isWorkingDay: boolean;
  startTime: string | null;
  endTime: string | null;
  targetPoints: number;
  ticketOverride: string | null;
};

export type TicketHistoryItem = {
  ticketType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  reason: string;
};

export type MyScheduleResult = {
  employeeId: string;
  employeeName: string;
  scheduleName: string;
  scheduleCode: string;
  month: number;
  year: number;
  days: ScheduleCalendarDay[];
  periodTotalTargetPoints: number;
  periodApprovedPoints: number;
  dailyTargetNeeded: number | null;
  remainingWorkingDays: number;
  ticketHistory: TicketHistoryItem[];
};

export type TeamMember = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string | null;
  branchName: string;
  divisionId: string | null;
  divisionName: string;
  positionId: string | null;
  positionName: string;
  employeeGroup: EmployeeGroup;
  scheduleName: string | null;
  scheduleCode: string | null;
  scheduleId: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
};

export type ScheduleOption = {
  id: string;
  name: string;
  code: string;
};

export type ScheduleAssignmentRange = {
  employeeId: string;
  scheduleId: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
};


export type HrdScheduleOverviewDayCount = {
  key: string;
  label: string;
  count: number;
  kind: "SHIFT" | "TICKET";
};

export type HrdScheduleOverviewEmployee = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchName: string;
  divisionName: string;
  positionName: string;
  employeeGroup: EmployeeGroup;
};

export type HrdScheduleOverviewDayGroup = {
  key: string;
  label: string;
  count: number;
  kind: "SHIFT" | "TICKET";
  employees: HrdScheduleOverviewEmployee[];
};

export type HrdScheduleOverviewDay = {
  date: string;
  dayName: string;
  counts: HrdScheduleOverviewDayCount[];
  groups: HrdScheduleOverviewDayGroup[];
};

export type HrdScheduleOverview = {
  periodStart: string;
  periodEnd: string;
  days: HrdScheduleOverviewDay[];
};

type ScheduleAssignmentRow = {
  id: string;
  employeeId: string;
  scheduleId: string;
  scheduleName: string | null;
  scheduleCode: string | null;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  notes: string | null;
  createdAt: Date;
};

const SCHEDULE_TICKET_OVERRIDE_STATUSES = ["AUTO_APPROVED", "APPROVED_HRD", "LOCKED"] as const;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function createUtcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return createUtcDate(year, month - 1, day);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNameId(dayOfWeek: number): string {
  return ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dayOfWeek] ?? "-";
}

function sanitizeScheduleLabel(value: string): string {
  return value
    .replace(/target\s*13\.?000/gi, "")
    .replace(/target\s*13000/gi, "")
    .replace(/13k/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeScheduleCode(code: string): string {
  const cleaned = code
    .toLowerCase()
    .trim()
    .replace(/target\s*13\.?000/g, "")
    .replace(/target\s*13000/g, "")
    .replace(/13k/g, "")
    .replace(/[^a-z0-9_ ]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (cleaned === "status_izin") return "status_izin";
  const match = cleaned.match(/^shift_?(\d+[a-z]?)$/);
  if (match) return `shift_${match[1]}`;
  return cleaned;
}

function isSelectableShiftMaster(code: string, name: string): boolean {
  const normalizedCode = code.toUpperCase().trim();
  const normalizedName = name.toLowerCase().trim();
  if (normalizedCode.includes("STATUS") || normalizedName.includes("status")) return false;
  if (normalizedCode === "LIBUR" || normalizedName === "libur") return false;
  return true;
}

function buildDefaultScheduleDays(scheduleId: string, startTime: string, endTime: string) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const isWorkingDay = dayOfWeek !== 0;
    return {
      scheduleId,
      dayOfWeek,
      dayStatus: (isWorkingDay ? "KERJA" : "OFF") as "KERJA" | "OFF",
      isWorkingDay,
      startTime: isWorkingDay ? startTime : null,
      endTime: isWorkingDay ? endTime : null,
      breakStart: isWorkingDay ? "12:00" : null,
      breakEnd: isWorkingDay ? "13:00" : null,
      breakToleranceMinutes: isWorkingDay ? 5 : 0,
      checkInToleranceMinutes: 0,
      targetPoints: isWorkingDay ? POINT_TARGET_HARIAN : 0,
    };
  });
}

function pickLatestAssignmentForDate<T extends { effectiveStartDate: Date; effectiveEndDate: Date | null; createdAt?: Date }>(
  rows: T[],
  date: Date
): T | null {
  const target = startOfLocalDay(date);
  let selected: T | null = null;

  for (const row of rows) {
    const rowStart = startOfLocalDay(row.effectiveStartDate);
    const rowEnd = row.effectiveEndDate ? startOfLocalDay(row.effectiveEndDate) : null;

    if (rowStart > target) continue;
    if (rowEnd && rowEnd < target) continue;

    if (!selected) {
      selected = row;
      continue;
    }

    const selectedStart = startOfLocalDay(selected.effectiveStartDate);
    if (rowStart > selectedStart) {
      selected = row;
      continue;
    }

    if (rowStart.getTime() === selectedStart.getTime()) {
      const selectedCreated = selected.createdAt ? new Date(selected.createdAt).getTime() : 0;
      const rowCreated = row.createdAt ? new Date(row.createdAt).getTime() : 0;
      if (rowCreated >= selectedCreated) {
        selected = row;
      }
    }
  }

  return selected;
}

function resolvePayrollPeriodWindow(now: Date): { periodStart: Date; periodEnd: Date } {
  const today = startOfLocalDay(now);
  const day = today.getDate();

  if (day >= 26) {
    return {
      periodStart: createUtcDate(today.getFullYear(), today.getMonth(), 26),
      periodEnd: createUtcDate(today.getFullYear(), today.getMonth() + 1, 25),
    };
  }

  return {
    periodStart: createUtcDate(today.getFullYear(), today.getMonth() - 1, 26),
    periodEnd: createUtcDate(today.getFullYear(), today.getMonth(), 25),
  };
}

// â”€â”€â”€ getMySchedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function resolveEmployeeDailyPointTarget(employeeId: string, periodStartDate: Date) {
  const divisionAlias = aliasedTable(divisions, "schedule_target_division");
  const [historyRow] = await db
    .select({
      dailyPointTarget: divisionAlias.dailyPointTarget,
    })
    .from(employeeDivisionHistories)
    .leftJoin(divisionAlias, eq(employeeDivisionHistories.newDivisionId, divisionAlias.id))
    .where(
      and(
        eq(employeeDivisionHistories.employeeId, employeeId),
        lte(employeeDivisionHistories.effectiveDate, periodStartDate)
      )
    )
    .orderBy(desc(employeeDivisionHistories.effectiveDate), desc(employeeDivisionHistories.createdAt))
    .limit(1);

  if (historyRow?.dailyPointTarget != null) {
    return historyRow.dailyPointTarget;
  }

  const [employeeRow] = await db
    .select({
      dailyPointTarget: divisions.dailyPointTarget,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return employeeRow?.dailyPointTarget ?? POINT_TARGET_HARIAN;
}

function resolveDefaultSchedulePeriodMonthYear(now: Date): { year: number; month: number } {
  const today = startOfLocalDay(now);
  if (today.getDate() > 25) {
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return {
      year: nextMonthDate.getFullYear(),
      month: nextMonthDate.getMonth() + 1,
    };
  }

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  };
}

export async function getMySchedule(
  year?: number,
  month?: number
): Promise<MyScheduleResult | null> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();

  if (!roleRow.employeeId) return null;

  const now = new Date();
  const defaultPeriod = resolveDefaultSchedulePeriodMonthYear(now);
  const targetYear = year ?? defaultPeriod.year;
  const targetMonth = month ?? defaultPeriod.month;
  const periodStart = new Date(targetYear, targetMonth - 2, 26);
  const periodEnd = new Date(targetYear, targetMonth - 1, 25);
  const today = startOfLocalDay(now);

  const empRows = await db
    .select({ fullName: employees.fullName })
    .from(employees)
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);

  if (!empRows[0]) return null;
  const employeeName = empRows[0].fullName;

  const assignmentRows = await db
    .select({
      id: employeeScheduleAssignments.id,
      scheduleId: employeeScheduleAssignments.scheduleId,
      scheduleName: workSchedules.name,
      scheduleCode: workSchedules.code,
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
      createdAt: employeeScheduleAssignments.createdAt,
    })
    .from(employeeScheduleAssignments)
    .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
    .where(
      and(
        eq(employeeScheduleAssignments.employeeId, roleRow.employeeId),
        lte(employeeScheduleAssignments.effectiveStartDate, periodEnd),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, periodStart)
        )
      )
    )
    .orderBy(asc(employeeScheduleAssignments.effectiveStartDate), asc(employeeScheduleAssignments.createdAt));

  const scheduleIds = [...new Set(assignmentRows.map((row) => row.scheduleId))];
  const scheduleDays = scheduleIds.length
    ? await db
        .select({
          scheduleId: workScheduleDays.scheduleId,
          dayOfWeek: workScheduleDays.dayOfWeek,
          dayStatus: workScheduleDays.dayStatus,
          isWorkingDay: workScheduleDays.isWorkingDay,
          startTime: workScheduleDays.startTime,
          endTime: workScheduleDays.endTime,
        })
        .from(workScheduleDays)
        .where(inArray(workScheduleDays.scheduleId, scheduleIds))
        .orderBy(asc(workScheduleDays.dayOfWeek))
    : [];

  const scheduleDayMap = new Map<string, Map<number, (typeof scheduleDays)[0]>>();
  for (const sd of scheduleDays) {
    const current = scheduleDayMap.get(sd.scheduleId) ?? new Map<number, (typeof scheduleDays)[0]>();
    current.set(sd.dayOfWeek, sd);
    scheduleDayMap.set(sd.scheduleId, current);
  }

  const days: ScheduleCalendarDay[] = [];
  const cursor = startOfLocalDay(periodStart);
  const endCursor = startOfLocalDay(periodEnd);
  const currentAssignment = pickLatestAssignmentForDate(assignmentRows, today);
  const scheduleName = currentAssignment?.scheduleName ?? "OFF";
  const scheduleCode = currentAssignment?.scheduleCode ?? "-";
  const dailyPointTarget = await resolveEmployeeDailyPointTarget(roleRow.employeeId, periodStart);

  while (cursor <= endCursor) {
    const dateStr = toDateKey(cursor);
    const dayOfWeek = cursor.getDay();
    const assignment = pickLatestAssignmentForDate(assignmentRows, cursor);
    const config = assignment ? scheduleDayMap.get(assignment.scheduleId)?.get(dayOfWeek) ?? null : null;
    const isWorkingDay = Boolean(assignment);
    const dayStatus = assignment
      ? config?.dayStatus === "OFF"
        ? "KERJA"
        : config?.dayStatus ?? "KERJA"
      : "OFF";
    const targetPoints = isWorkingDay ? dailyPointTarget : 0;

    days.push({
      date: dateStr,
      dayOfWeek,
      dayStatus,
      isWorkingDay,
      startTime: config?.startTime ?? null,
      endTime: config?.endTime ?? null,
      targetPoints,
      ticketOverride: null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const periodTotalTargetPoints = days.reduce((sum, day) => sum + (day.targetPoints > 0 ? day.targetPoints : 0), 0);

  let remainingWorkingDays = 0;
  const remCursor = startOfLocalDay(today);
  while (remCursor <= endCursor) {
    const dayRow = days.find((day) => day.date === toDateKey(remCursor));
    if (dayRow?.isWorkingDay) remainingWorkingDays++;
    remCursor.setDate(remCursor.getDate() + 1);
  }

  const APPROVED_PERF = ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;
  const approvedEntries = await db
    .select({ totalPoints: dailyActivityEntries.totalPoints })
    .from(dailyActivityEntries)
    .where(
      and(
        eq(dailyActivityEntries.employeeId, roleRow.employeeId),
        gte(dailyActivityEntries.workDate, periodStart),
        lte(dailyActivityEntries.workDate, periodEnd),
        inArray(dailyActivityEntries.status, APPROVED_PERF)
      )
    );
  const periodApprovedPoints = approvedEntries.reduce((sum, e) => sum + Number(e.totalPoints), 0);

  const dailyTargetNeeded =
    remainingWorkingDays > 0
      ? Math.max(0, periodTotalTargetPoints - periodApprovedPoints) / remainingWorkingDays
      : null;

  const historyWindowStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const ticketHistoryRows = await db
    .select({
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      status: attendanceTickets.status,
      reason: attendanceTickets.reason,
    })
    .from(attendanceTickets)
    .where(
      and(
        eq(attendanceTickets.employeeId, roleRow.employeeId),
        gte(attendanceTickets.startDate, historyWindowStart)
      )
    )
    .orderBy(desc(attendanceTickets.startDate))
    .limit(15);

  const ticketHistory: TicketHistoryItem[] = ticketHistoryRows.map((t) => {
    const s = t.startDate instanceof Date ? t.startDate : new Date(t.startDate);
    const e = t.endDate instanceof Date ? t.endDate : new Date(t.endDate);
    return {
      ticketType: t.ticketType,
      startDate: toDateKey(new Date(s.getFullYear(), s.getMonth(), s.getDate())),
      endDate: toDateKey(new Date(e.getFullYear(), e.getMonth(), e.getDate())),
      daysCount: t.daysCount,
      status: t.status,
      reason: t.reason,
    };
  });

  return {
    employeeId: roleRow.employeeId,
    employeeName,
    scheduleName,
    scheduleCode,
    month: targetMonth,
    year: targetYear,
    days,
    periodTotalTargetPoints,
    periodApprovedPoints,
    dailyTargetNeeded,
    remainingWorkingDays,
    ticketHistory,
  };
}

export async function getEmployeeScheduleDetail(
  employeeId: string,
  year?: number,
  month?: number
): Promise<MyScheduleResult | null> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!employeeId) return null;
  if (!["SUPER_ADMIN", "HRD", "KABAG", "SPV"].includes(role)) return null;

  const employeeDivisionId = await getEmployeeDivisionId(employeeId);
  if (role === "SPV" || role === "KABAG") {
    if (!employeeDivisionId || !roleRow.divisionIds.includes(employeeDivisionId)) return null;
  }

  const now = new Date();
  const defaultPeriod = resolveDefaultSchedulePeriodMonthYear(now);
  const targetYear = year ?? defaultPeriod.year;
  const targetMonth = month ?? defaultPeriod.month;
  const periodStart = new Date(targetYear, targetMonth - 2, 26);
  const periodEnd = new Date(targetYear, targetMonth - 1, 25);
  const today = startOfLocalDay(now);

  const empRows = await db
    .select({ fullName: employees.fullName })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!empRows[0]) return null;
  const employeeName = empRows[0].fullName;

  const assignmentRows = await db
    .select({
      id: employeeScheduleAssignments.id,
      scheduleId: employeeScheduleAssignments.scheduleId,
      scheduleName: workSchedules.name,
      scheduleCode: workSchedules.code,
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
      createdAt: employeeScheduleAssignments.createdAt,
    })
    .from(employeeScheduleAssignments)
    .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
    .where(
      and(
        eq(employeeScheduleAssignments.employeeId, employeeId),
        lte(employeeScheduleAssignments.effectiveStartDate, periodEnd),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, periodStart)
        )
      )
    )
    .orderBy(asc(employeeScheduleAssignments.effectiveStartDate), asc(employeeScheduleAssignments.createdAt));

  const scheduleIds = [...new Set(assignmentRows.map((row) => row.scheduleId))];
  const scheduleDays = scheduleIds.length
    ? await db
        .select({
          scheduleId: workScheduleDays.scheduleId,
          dayOfWeek: workScheduleDays.dayOfWeek,
          dayStatus: workScheduleDays.dayStatus,
          isWorkingDay: workScheduleDays.isWorkingDay,
          startTime: workScheduleDays.startTime,
          endTime: workScheduleDays.endTime,
        })
        .from(workScheduleDays)
        .where(inArray(workScheduleDays.scheduleId, scheduleIds))
        .orderBy(asc(workScheduleDays.dayOfWeek))
    : [];

  const scheduleDayMap = new Map<string, Map<number, (typeof scheduleDays)[0]>>();
  for (const sd of scheduleDays) {
    const current = scheduleDayMap.get(sd.scheduleId) ?? new Map<number, (typeof scheduleDays)[0]>();
    current.set(sd.dayOfWeek, sd);
    scheduleDayMap.set(sd.scheduleId, current);
  }

  const days: ScheduleCalendarDay[] = [];
  const cursor = startOfLocalDay(periodStart);
  const endCursor = startOfLocalDay(periodEnd);
  const currentAssignment = pickLatestAssignmentForDate(assignmentRows, today);
  const scheduleName = currentAssignment?.scheduleName ?? "OFF";
  const scheduleCode = currentAssignment?.scheduleCode ?? "-";
  const dailyPointTarget = await resolveEmployeeDailyPointTarget(employeeId, periodStart);

  while (cursor <= endCursor) {
    const dateStr = toDateKey(cursor);
    const dayOfWeek = cursor.getDay();
    const assignment = pickLatestAssignmentForDate(assignmentRows, cursor);
    const config = assignment ? scheduleDayMap.get(assignment.scheduleId)?.get(dayOfWeek) ?? null : null;
    const isWorkingDay = Boolean(assignment);
    const dayStatus = assignment
      ? config?.dayStatus === "OFF"
        ? "KERJA"
        : config?.dayStatus ?? "KERJA"
      : "OFF";
    const targetPoints = isWorkingDay ? dailyPointTarget : 0;

    days.push({
      date: dateStr,
      dayOfWeek,
      dayStatus,
      isWorkingDay,
      startTime: config?.startTime ?? null,
      endTime: config?.endTime ?? null,
      targetPoints,
      ticketOverride: null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const periodTotalTargetPoints = days.reduce((sum, day) => sum + (day.targetPoints > 0 ? day.targetPoints : 0), 0);

  let remainingWorkingDays = 0;
  const remCursor = startOfLocalDay(today);
  while (remCursor <= endCursor) {
    const dayRow = days.find((day) => day.date === toDateKey(remCursor));
    if (dayRow?.isWorkingDay) remainingWorkingDays++;
    remCursor.setDate(remCursor.getDate() + 1);
  }

  const APPROVED_PERF = ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;
  const approvedEntries = await db
    .select({ totalPoints: dailyActivityEntries.totalPoints })
    .from(dailyActivityEntries)
    .where(
      and(
        eq(dailyActivityEntries.employeeId, employeeId),
        gte(dailyActivityEntries.workDate, periodStart),
        lte(dailyActivityEntries.workDate, periodEnd),
        inArray(dailyActivityEntries.status, APPROVED_PERF)
      )
    );
  const periodApprovedPoints = approvedEntries.reduce((sum, e) => sum + Number(e.totalPoints), 0);

  const dailyTargetNeeded =
    remainingWorkingDays > 0
      ? Math.max(0, periodTotalTargetPoints - periodApprovedPoints) / remainingWorkingDays
      : null;

  const historyWindowStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const ticketHistoryRows = await db
    .select({
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      status: attendanceTickets.status,
      reason: attendanceTickets.reason,
    })
    .from(attendanceTickets)
    .where(
      and(
        eq(attendanceTickets.employeeId, employeeId),
        gte(attendanceTickets.startDate, historyWindowStart)
      )
    )
    .orderBy(desc(attendanceTickets.startDate))
    .limit(15);

  const ticketHistory: TicketHistoryItem[] = ticketHistoryRows.map((t) => {
    const s = t.startDate instanceof Date ? t.startDate : new Date(t.startDate);
    const e = t.endDate instanceof Date ? t.endDate : new Date(t.endDate);
    return {
      ticketType: t.ticketType,
      startDate: toDateKey(new Date(s.getFullYear(), s.getMonth(), s.getDate())),
      endDate: toDateKey(new Date(e.getFullYear(), e.getMonth(), e.getDate())),
      daysCount: t.daysCount,
      status: t.status,
      reason: t.reason,
    };
  });

  return {
    employeeId,
    employeeName,
    scheduleName,
    scheduleCode,
    month: targetMonth,
    year: targetYear,
    days,
    periodTotalTargetPoints,
    periodApprovedPoints,
    dailyTargetNeeded,
    remainingWorkingDays,
    ticketHistory,
  };
}

async function getEmployeeDivisionId(employeeId: string) {
  const [row] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  return row?.divisionId ?? null;
}

// â”€â”€â”€ getTeamSchedules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TEAM_SCHEDULE_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "KABAG", "SPV"];

export async function getTeamSchedules(): Promise<TeamMember[]> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!TEAM_SCHEDULE_ROLES.includes(role)) {
    return [];
  }

  const useDivisionScope = (role === "SPV" || role === "KABAG") && roleRow.divisionIds.length > 0;
  const baseConditions = [eq(employees.isActive, true), ne(employees.employmentStatus, "RESIGN")];

  const employeeRows = await db
    .select({
      employeeId: employees.id,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      branchId: employees.branchId,
      branchName: branches.name,
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      positionId: employees.positionId,
      positionName: positions.name,
      employeeGroup: employees.employeeGroup,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(
      useDivisionScope
        ? and(...baseConditions, inArray(employees.divisionId, roleRow.divisionIds))
        : and(...baseConditions)
    )
    .orderBy(asc(employees.fullName));

  if (employeeRows.length === 0) return [];

  const employeeIds = employeeRows.map((row) => row.employeeId);
  const today = startOfLocalDay(new Date());

  const assignmentRows = await db
    .select({
      id: employeeScheduleAssignments.id,
      employeeId: employeeScheduleAssignments.employeeId,
      scheduleId: employeeScheduleAssignments.scheduleId,
      scheduleName: workSchedules.name,
      scheduleCode: workSchedules.code,
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
      createdAt: employeeScheduleAssignments.createdAt,
    })
    .from(employeeScheduleAssignments)
    .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
    .where(
      and(
        inArray(employeeScheduleAssignments.employeeId, employeeIds),
        lte(employeeScheduleAssignments.effectiveStartDate, today),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, today)
        )
      )
    )
    .orderBy(asc(employeeScheduleAssignments.effectiveStartDate), asc(employeeScheduleAssignments.createdAt));

  const assignmentMap = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    const current = assignmentMap.get(assignment.employeeId) ?? [];
    current.push(assignment);
    assignmentMap.set(assignment.employeeId, current);
  }

  const activeMasterRows = await db
    .select({
      code: workShiftMasters.code,
      name: workShiftMasters.name,
    })
    .from(workShiftMasters)
    .where(eq(workShiftMasters.isActive, true));

  const masterLabelMap = new Map(
    activeMasterRows.map((master) => [normalizeScheduleCode(master.code), sanitizeScheduleLabel(master.name)] as const)
  );

  return employeeRows.map((employee) => {
    const currentAssignment = pickLatestAssignmentForDate(assignmentMap.get(employee.employeeId) ?? [], today);
    const normalizedCode = currentAssignment?.scheduleCode ? normalizeScheduleCode(currentAssignment.scheduleCode) : null;
    const displayName = normalizedCode
      ? (masterLabelMap.get(normalizedCode) ?? sanitizeScheduleLabel(currentAssignment?.scheduleName ?? normalizedCode))
      : null;

    return {
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      employeeCode: employee.employeeCode,
      branchId: employee.branchId,
      branchName: employee.branchName ?? "—",
      divisionId: employee.divisionId,
      divisionName: employee.divisionName ?? "—",
      positionId: employee.positionId,
      positionName: employee.positionName ?? "—",
      employeeGroup: employee.employeeGroup,
      scheduleName: displayName,
      scheduleCode: normalizedCode,
      scheduleId: currentAssignment?.scheduleId ?? null,
      effectiveStartDate: currentAssignment?.effectiveStartDate ? toDateKey(currentAssignment.effectiveStartDate) : null,
      effectiveEndDate: currentAssignment?.effectiveEndDate ? toDateKey(currentAssignment.effectiveEndDate) : null,
    };
  });
}

export async function getScheduleOptions(): Promise<ScheduleOption[]> {
  await requireAuth();

  const [scheduleRows, masterRows] = await Promise.all([
    db
      .select({
        id: workSchedules.id,
        code: workSchedules.code,
        name: workSchedules.name,
      })
      .from(workSchedules)
      .where(eq(workSchedules.isActive, true))
      .orderBy(asc(workSchedules.name)),
    db
      .select({
        code: workShiftMasters.code,
        name: workShiftMasters.name,
        startTime: workShiftMasters.startTime,
        endTime: workShiftMasters.endTime,
        notes: workShiftMasters.notes,
        sortOrder: workShiftMasters.sortOrder,
        isActive: workShiftMasters.isActive,
      })
      .from(workShiftMasters)
      .where(eq(workShiftMasters.isActive, true))
      .orderBy(asc(workShiftMasters.sortOrder), asc(workShiftMasters.name)),
  ]);

  const scheduleMap = new Map(scheduleRows.map((schedule) => [normalizeScheduleCode(schedule.code), schedule] as const));
  const selectableMasters = masterRows.filter((master) => isSelectableShiftMaster(master.code, master.name));
  const missingMasters = selectableMasters.filter((master) => !scheduleMap.has(normalizeScheduleCode(master.code)));

  if (missingMasters.length > 0) {
    await db.transaction(async (tx) => {
      for (const master of missingMasters) {
        const inserted = await tx
          .insert(workSchedules)
          .values({
            code: normalizeScheduleCode(master.code),
            name: sanitizeScheduleLabel(master.name),
            description: master.notes ?? null,
            isActive: master.isActive,
          })
          .onConflictDoNothing()
          .returning({ id: workSchedules.id, code: workSchedules.code, name: workSchedules.name });

        const scheduleRow =
          inserted[0] ??
          (await tx
            .select({ id: workSchedules.id, code: workSchedules.code, name: workSchedules.name })
            .from(workSchedules)
            .where(eq(workSchedules.code, normalizeScheduleCode(master.code)))
            .limit(1))[0];

        if (!scheduleRow) continue;

        await tx.insert(workScheduleDays).values(
          buildDefaultScheduleDays(scheduleRow.id, master.startTime, master.endTime)
        );

        scheduleMap.set(normalizeScheduleCode(master.code), scheduleRow);
      }
    });
  }

  return selectableMasters
    .map((master) => {
      const scheduleRow = scheduleMap.get(normalizeScheduleCode(master.code));
      if (!scheduleRow) return null;
      return {
        id: scheduleRow.id,
        name: sanitizeScheduleLabel(master.name),
        code: normalizeScheduleCode(master.code),
        sortOrder: master.sortOrder,
      };
    })
    .filter((item): item is ScheduleOption & { sortOrder: number } => item !== null)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name);
    })
    .map(({ id, name, code }) => ({ id, name, code }));
}

export async function getScheduleManagementWorkspace(): Promise<{
  teamMembers: TeamMember[];
  scheduleOptions: ScheduleOption[];
  periodStart: string;
  periodEnd: string;
  assignmentRanges: ScheduleAssignmentRange[];
}> {
  return getScheduleManagementWorkspaceByPeriod();
}

export async function getScheduleManagementWorkspaceByPeriod(
  year?: number,
  month?: number
): Promise<{
  teamMembers: TeamMember[];
  scheduleOptions: ScheduleOption[];
  periodStart: string;
  periodEnd: string;
  assignmentRanges: ScheduleAssignmentRange[];
}> {
  await requireAuth();

  const [teamMembers, scheduleOptions] = await Promise.all([
    getTeamSchedules(),
    getScheduleOptions(),
  ]);

  const now = new Date();
  const defaultPeriod = resolveDefaultSchedulePeriodMonthYear(now);
  const targetYear = year ?? defaultPeriod.year;
  const targetMonth = month ?? defaultPeriod.month;
  const periodStart = new Date(targetYear, targetMonth - 2, 26);
  const periodEnd = new Date(targetYear, targetMonth - 1, 25);
  const employeeIds = teamMembers.map((member) => member.employeeId);
  let assignmentRanges: ScheduleAssignmentRange[] = [];

  if (employeeIds.length > 0) {
    const ranges = await db
      .select({
        employeeId: employeeScheduleAssignments.employeeId,
        scheduleId: employeeScheduleAssignments.scheduleId,
        effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
        effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
      })
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
      )
      .orderBy(asc(employeeScheduleAssignments.employeeId), asc(employeeScheduleAssignments.effectiveStartDate));

    assignmentRanges = ranges.map((row) => ({
      employeeId: row.employeeId,
      scheduleId: row.scheduleId,
      effectiveStartDate: toDateKey(row.effectiveStartDate),
      effectiveEndDate: row.effectiveEndDate ? toDateKey(row.effectiveEndDate) : null,
    }));
  }

  return {
    teamMembers,
    scheduleOptions,
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd),
    assignmentRanges,
  };
}

export async function getHrdScheduleOverview(): Promise<HrdScheduleOverview> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!["SUPER_ADMIN", "HRD"].includes(role)) {
    return {
      periodStart: "",
      periodEnd: "",
      days: [],
    };
  }

  const { periodStart, periodEnd } = resolvePayrollPeriodWindow(new Date());
  const periodStartKey = toDateKey(periodStart);
  const periodEndKey = toDateKey(periodEnd);

  const employeeRows = await db
    .select({
      employeeId: employees.id,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      branchName: branches.name,
      divisionName: divisions.name,
      positionName: positions.name,
      employeeGroup: employees.employeeGroup,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.fullName));

  const employeeIds = employeeRows.map((row) => row.employeeId);

  const assignmentRows: ScheduleAssignmentRow[] = employeeIds.length
    ? await db
        .select({
          id: employeeScheduleAssignments.id,
          employeeId: employeeScheduleAssignments.employeeId,
          scheduleId: employeeScheduleAssignments.scheduleId,
          scheduleName: workSchedules.name,
          scheduleCode: workSchedules.code,
          effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
          effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
          notes: employeeScheduleAssignments.notes,
          createdAt: employeeScheduleAssignments.createdAt,
        })
        .from(employeeScheduleAssignments)
        .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
        .where(
          and(
            inArray(employeeScheduleAssignments.employeeId, employeeIds),
            lte(employeeScheduleAssignments.effectiveStartDate, periodEnd),
            or(
              isNull(employeeScheduleAssignments.effectiveEndDate),
              gte(employeeScheduleAssignments.effectiveEndDate, periodStart)
            )
          )
        )
        .orderBy(asc(employeeScheduleAssignments.effectiveStartDate), asc(employeeScheduleAssignments.createdAt))
    : [];

  const activeMasterRows = await db
    .select({
      code: workShiftMasters.code,
      name: workShiftMasters.name,
    })
    .from(workShiftMasters)
    .where(eq(workShiftMasters.isActive, true));

  const masterLabelMap = new Map(
    activeMasterRows.map((master) => [normalizeScheduleCode(master.code), sanitizeScheduleLabel(master.name)] as const)
  );

  const assignmentMap = new Map<string, ScheduleAssignmentRow[]>();
  for (const assignment of assignmentRows) {
    const current = assignmentMap.get(assignment.employeeId) ?? [];
    current.push(assignment);
    assignmentMap.set(assignment.employeeId, current);
  }

  const ticketRows = employeeIds.length
    ? await db
        .select({
          employeeId: attendanceTickets.employeeId,
          ticketType: attendanceTickets.ticketType,
          startDate: attendanceTickets.startDate,
          endDate: attendanceTickets.endDate,
        })
        .from(attendanceTickets)
        .where(
          and(
            inArray(attendanceTickets.employeeId, employeeIds),
            inArray(attendanceTickets.status, SCHEDULE_TICKET_OVERRIDE_STATUSES),
            lte(attendanceTickets.startDate, periodEnd),
            gte(attendanceTickets.endDate, periodStart)
          )
        )
    : [];

  const ticketMap = new Map<string, Map<string, string>>();
  for (const ticket of ticketRows) {
    const rawStart = ticket.startDate instanceof Date ? ticket.startDate : new Date(ticket.startDate);
    const rawEnd = ticket.endDate instanceof Date ? ticket.endDate : new Date(ticket.endDate);
    const start = startOfLocalDay(rawStart);
    const end = startOfLocalDay(rawEnd);
    const cursor = new Date(Math.max(start.getTime(), periodStart.getTime()));
    const normalizedEnd = new Date(Math.min(end.getTime(), periodEnd.getTime()));

    while (cursor <= normalizedEnd) {
      const dateKey = toDateKey(cursor);
      const current = ticketMap.get(dateKey) ?? new Map<string, string>();
      current.set(ticket.employeeId, ticket.ticketType);
      ticketMap.set(dateKey, current);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  function getScheduleDisplayLabel(scheduleCode: string | null, scheduleName: string | null): string {
    const candidates = [scheduleCode, scheduleName].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      const masterLabel = masterLabelMap.get(normalizeScheduleCode(candidate));
      if (masterLabel) return masterLabel;
    }

    return sanitizeScheduleLabel(scheduleName ?? scheduleCode ?? "Jadwal");
  }

  const days: HrdScheduleOverviewDay[] = [];
  const cursor = startOfLocalDay(periodStart);
  const endCursor = startOfLocalDay(periodEnd);

  while (cursor <= endCursor) {
    const dateKey = toDateKey(cursor);
    const dayOfWeek = cursor.getDay();
    const counts = new Map<string, HrdScheduleOverviewDayCount>();
    const groups = new Map<string, HrdScheduleOverviewDayGroup>();
    const ticketByEmployee = ticketMap.get(dateKey) ?? new Map<string, string>();

    for (const employee of employeeRows) {
      const ticketType = ticketByEmployee.get(employee.employeeId);
      if (ticketType) {
        const label =
          {
            CUTI: "Cuti",
            CUTI_TAHUNAN: "Cuti Tahunan",
            CUTI_BULANAN: "Cuti Bulanan",
            CUTI_HAMIL_LAHIR: "Cuti Hamil/Lahir",
            CUTI_NIKAH: "Cuti Nikah",
            SAKIT: "Sakit",
            IZIN: "Izin",
            IZIN_ACARA: "Izin Acara",
            MENINGGAL: "Meninggal",
            EMERGENCY: "Emergency",
            SETENGAH_HARI: "1/2 Hari",
          }[ticketType] ?? ticketType;
        const key = `TICKET:${label}`;
        counts.set(key, {
          key,
          label,
          count: (counts.get(key)?.count ?? 0) + 1,
          kind: "TICKET",
        });

        const currentGroup =
          groups.get(key) ?? {
            key,
            label,
            count: 0,
            kind: "TICKET" as const,
            employees: [],
          };

        currentGroup.count += 1;
        currentGroup.employees.push({
          employeeId: employee.employeeId,
          employeeName: employee.employeeName,
          employeeCode: employee.employeeCode,
          branchName: employee.branchName ?? "—",
          divisionName: employee.divisionName ?? "—",
          positionName: employee.positionName ?? "—",
          employeeGroup: employee.employeeGroup,
        });
        groups.set(key, currentGroup);
        continue;
      }

      const assignment = pickLatestAssignmentForDate(assignmentMap.get(employee.employeeId) ?? [], cursor);
      if (!assignment) continue;

      const label = getScheduleDisplayLabel(assignment.scheduleCode, assignment.scheduleName);
      const key = `SHIFT:${label}`;
      counts.set(key, {
        key,
        label,
        count: (counts.get(key)?.count ?? 0) + 1,
        kind: "SHIFT",
      });

      const currentGroup =
        groups.get(key) ?? {
          key,
          label,
          count: 0,
          kind: "SHIFT" as const,
          employees: [],
        };

      currentGroup.count += 1;
      currentGroup.employees.push({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        employeeCode: employee.employeeCode,
        branchName: employee.branchName ?? "—",
        divisionName: employee.divisionName ?? "—",
        positionName: employee.positionName ?? "—",
        employeeGroup: employee.employeeGroup,
      });
      groups.set(key, currentGroup);
    }

    days.push({
      date: dateKey,
      dayName: dayNameId(dayOfWeek),
      counts: [...counts.values()].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "SHIFT" ? -1 : 1;
        if (right.count !== left.count) return right.count - left.count;
        return left.label.localeCompare(right.label);
      }),
      groups: [...groups.values()].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "SHIFT" ? -1 : 1;
        if (right.count !== left.count) return right.count - left.count;
        return left.label.localeCompare(right.label);
      }),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    periodStart: periodStartKey,
    periodEnd: periodEndKey,
    days,
  };
}

// â”€â”€â”€ assignEmployeeSchedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const scheduleIdCellSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([z.string().uuid(), z.null()])
);

const assignSchema = z.object({
  employeeId: z.string().uuid(),
  scheduleId: scheduleIdCellSchema,
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus yyyy-MM-dd"),
  effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus yyyy-MM-dd"),
  notes: z.string().optional(),
}).refine(
  (value) => parseDateOnly(value.effectiveEndDate).getTime() >= parseDateOnly(value.effectiveStartDate).getTime(),
  {
    message: "Tanggal selesai harus sama atau setelah tanggal mulai.",
    path: ["effectiveEndDate"],
  }
);

const ASSIGN_ALLOWED_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "SPV", "KABAG"];
const BULK_ASSIGN_ALLOWED_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "SPV", "KABAG"];

const assignManySchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, "Pilih minimal satu karyawan."),
  scheduleId: scheduleIdCellSchema,
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus yyyy-MM-dd"),
  effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus yyyy-MM-dd"),
  notes: z.string().optional(),
  skipSundays: z.boolean().optional(),
}).refine(
  (value) => parseDateOnly(value.effectiveEndDate).getTime() >= parseDateOnly(value.effectiveStartDate).getTime(),
  {
    message: "Tanggal selesai harus sama atau setelah tanggal mulai.",
    path: ["effectiveEndDate"],
  }
);

export async function assignEmployeeSchedule(
  input: unknown
): Promise<{ success: true } | { error: string }> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!ASSIGN_ALLOWED_ROLES.includes(role)) {
    return { error: "Akses ditolak. Hanya HRD, SPV, KABAG, atau Super Admin yang dapat mengatur jadwal." };
  }

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return { error: issues[0]?.message ?? "Input tidak valid." };
  }

  const { employeeId, scheduleId, effectiveStartDate, effectiveEndDate, notes } = parsed.data;

  if (["SPV", "KABAG"].includes(role)) {
    if (roleRow.divisionIds.length === 0) {
      return { error: "Akun Anda belum terhubung ke divisi. Hubungi HRD." };
    }

    const targetDivisionId = await getEmployeeDivisionId(employeeId);
    if (!targetDivisionId || !roleRow.divisionIds.includes(targetDivisionId)) {
      return { error: "Anda hanya boleh mengatur jadwal karyawan di divisi Anda." };
    }
  }

  const effectiveStartDateObj = parseDateOnly(effectiveStartDate);
  const effectiveEndDateObj = parseDateOnly(effectiveEndDate);

  try {
    await db.transaction(async (tx) => {
      await replaceEmployeeScheduleRange(
        tx,
        employeeId,
        scheduleId,
        effectiveStartDateObj,
        effectiveEndDateObj,
        notes ?? null
      );
    });

    revalidatePath("/schedule");
    revalidatePath("/scheduler");
    revalidatePath("/dashboard");
    revalidatePath("/performance");

    return { success: true };
  } catch (err) {
    console.error("[assignEmployeeSchedule] error:", err);
    return { error: "Gagal menyimpan penugasan jadwal. Coba lagi." };
  }
}

export async function assignEmployeeSchedulesBulk(
  input: unknown
): Promise<{ success: true; updatedCount: number } | { error: string }> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!BULK_ASSIGN_ALLOWED_ROLES.includes(role)) {
    return { error: "Akses ditolak. Hanya HRD, SPV, KABAG, atau Super Admin yang dapat mengatur jadwal serentak." };
  }

  const parsed = assignManySchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return { error: issues[0]?.message ?? "Input tidak valid." };
  }

  const uniqueEmployeeIds = [...new Set(parsed.data.employeeIds)];
  const effectiveStartDateObj = parseDateOnly(parsed.data.effectiveStartDate);
  const effectiveEndDateObj = parseDateOnly(parsed.data.effectiveEndDate);

  if (["SPV", "KABAG"].includes(role)) {
    if (roleRow.divisionIds.length === 0) {
      return { error: "Akun Anda belum terhubung ke divisi. Hubungi HRD." };
    }
    for (const employeeId of uniqueEmployeeIds) {
      const targetDivisionId = await getEmployeeDivisionId(employeeId);
      if (!targetDivisionId || !roleRow.divisionIds.includes(targetDivisionId)) {
        return { error: "Anda hanya boleh mengatur jadwal karyawan di divisi Anda." };
      }
    }
  }

  const skipSundays = parsed.data.skipSundays ?? false;

  // Build date segments: for skipSundays, group contiguous non-Sunday dates into segments
  // and mark Sundays (day=0) as null (clear/OFF)
  type DateSegment = { start: Date; end: Date; scheduleId: string | null };
  const segments: DateSegment[] = [];

  if (!skipSundays) {
    segments.push({ start: effectiveStartDateObj, end: effectiveEndDateObj, scheduleId: parsed.data.scheduleId });
  } else {
    let segStart: Date | null = null;
    const current = new Date(effectiveStartDateObj);
    while (current <= effectiveEndDateObj) {
      const isSunday = current.getDay() === 0;
      if (!isSunday) {
        if (!segStart) segStart = new Date(current);
      } else {
        if (segStart) {
          const segEnd = addLocalDays(current, -1);
          segments.push({ start: segStart, end: segEnd, scheduleId: parsed.data.scheduleId });
          segStart = null;
        }
        // Clear Sunday
        segments.push({ start: new Date(current), end: new Date(current), scheduleId: null });
      }
      current.setDate(current.getDate() + 1);
    }
    if (segStart) {
      segments.push({ start: segStart, end: new Date(effectiveEndDateObj), scheduleId: parsed.data.scheduleId });
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const employeeId of uniqueEmployeeIds) {
        for (const seg of segments) {
          await replaceEmployeeScheduleRange(
            tx,
            employeeId,
            seg.scheduleId,
            seg.start,
            seg.end,
            parsed.data.notes ?? null
          );
        }
      }
    });

    revalidatePath("/schedule");
    revalidatePath("/scheduler");
    revalidatePath("/employees");
    revalidatePath("/dashboard");
    revalidatePath("/performance");

    return { success: true, updatedCount: uniqueEmployeeIds.length };
  } catch (err) {
    console.error("[assignEmployeeSchedulesBulk] error:", err);
    return { error: "Gagal menyimpan jadwal serentak. Coba lagi." };
  }
}


