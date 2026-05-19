"use server";

import { db } from "@/lib/db";
import type { EmployeeGroup } from "@/lib/employee-groups";
import { getCurrentUserRoleRow, getUser, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  employeeDivisionHistories,
  employeeGradeHistories,
  employees,
  employeePositionHistories,
  employeeScheduleAssignments,
  employeeSupervisorHistories,
  workSchedules,
} from "@/lib/db/schema/employee";
import { attendanceTickets, employeeReviews, incidentLogs } from "@/lib/db/schema/hr";
import { branches, divisions, grades, positions } from "@/lib/db/schema/master";
import { payrollPeriods, payrollResults } from "@/lib/db/schema/payroll";
import { dailyActivityEntries, monthlyPointPerformances } from "@/lib/db/schema/point";
import { aliasedTable, and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { resolvePointTargetForDivision } from "@/config/constants";
import type { UserRole } from "@/types";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isEmployeeProfileComplete } from "@/lib/auth/profile-completion";
import {
  buildPersonalQuickActions,
  buildTeamworkActivitySummary,
  type PersonalQuickAction,
  resolveMyAccessState,
  type TeamworkActivitySummary,
} from "./me.helpers";

type MyEmployeeCore = {
  id: string;
  employeeCode: string;
  nik: string | null;
  fullName: string;
  nickname: string | null;
  photoUrl: string | null;
  birthPlace: string | null;
  birthDate: Date | null;
  gender: string | null;
  religion: string | null;
  maritalStatus: string | null;
  phoneNumber: string | null;
  address: string | null;
  startDate: Date;
  trainingGraduationDate: Date | null;
  branchName: string | null;
  divisionName: string | null;
  positionName: string | null;
  gradeName: string | null;
  employeeGroup: EmployeeGroup;
  employmentStatus: string;
  payrollStatus: string;
  supervisorName: string | null;
  isActive: boolean;
  notes: string | null;
};

type MyScheduleSummary = {
  scheduleName: string | null;
  scheduleCode: string | null;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
} | null;

type MyTicketSummary = {
  ticketType: string;
  status: string;
  startDate: Date;
  endDate: Date;
  payrollImpact: string | null;
} | null;

type MyReviewSummary = {
  totalScore: string | null;
  category: string | null;
  status: string;
  periodStartDate: Date;
  periodEndDate: Date;
} | null;

type MyIncidentSummary = {
  activeCount: number;
  latestIncidentType: string | null;
  latestIncidentDate: Date | null;
};

type MyPerformanceSummary = {
  periodStartDate: Date;
  periodEndDate: Date;
  performancePercent: string;  // avg daily approved % in period
  weeklyPercent: string;       // avg last 6 non-Sunday days
  dailyPercent: string;        // last working day's %
  totalApprovedPoints: string;
  totalTargetPoints: number;
  progressPercent: string;     // cumulative approved / target * 100
  status: string;
} | null;

type MyPayrollSummary = {
  periodId: string;
  periodCode: string;
  periodStatus: string;
  takeHomePay: string;
  performancePercent: string;
  calculatedAt: Date;
  baseSalaryPaid: string;
  gradeAllowancePaid: string;
  tenureAllowancePaid: string;
  dailyAllowancePaid: string;
  overtimeAmount: string;
  bonusFulltimeAmount: string;
  bonusDisciplineAmount: string;
  bonusKinerjaAmount: string;
  bonusPrestasiAmount: string;
  bonusTeamAmount: string;
  incidentDeductionAmount: string;
  manualAdjustmentAmount: string;
  breakdown: Record<string, unknown> | null;
} | null;

type MyHistoryRow = {
  effectiveDate: Date;
  previousLabel: string | null;
  nextLabel: string | null;
  notes: string | null;
};

export type MyDashboardResult = {
  redirectTo: string | null;
  role: UserRole;
  userEmail: string;
  employee: MyEmployeeCore | null;
  quickActions: PersonalQuickAction[];
  activeSchedule: MyScheduleSummary;
  latestTicket: MyTicketSummary;
  latestReview: MyReviewSummary;
  incidentSummary: MyIncidentSummary;
  latestPerformance: MyPerformanceSummary;
  teamworkActivitySummary: TeamworkActivitySummary | null;
  latestPayroll: MyPayrollSummary;
  emptyReason: string | null;
};

export type MyProfileResult = {
  redirectTo: string | null;
  role: UserRole;
  userEmail: string;
  employee: MyEmployeeCore | null;
  activeSchedule: MyScheduleSummary;
  histories: {
    divisions: MyHistoryRow[];
    positions: MyHistoryRow[];
    grades: MyHistoryRow[];
    supervisors: MyHistoryRow[];
  };
  emptyReason: string | null;
  profileCompletionRequired: boolean;
};

const PAYROLL_SUMMARY_ROLES: UserRole[] = [
  "HRD",
  "FINANCE",
  "MANAGERIAL",
  "PAYROLL_VIEWER",
  "SPV",
  "KABAG",
  "TEAMWORK",
];

async function getMyEmployeeCore(employeeId: string): Promise<MyEmployeeCore | null> {
  const supervisor = aliasedTable(employees, "supervisor");

  const rows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      nik: employees.nik,
      fullName: employees.fullName,
      nickname: employees.nickname,
      photoUrl: employees.photoUrl,
      birthPlace: employees.birthPlace,
      birthDate: employees.birthDate,
      gender: employees.gender,
      religion: employees.religion,
      maritalStatus: employees.maritalStatus,
      phoneNumber: employees.phoneNumber,
      address: employees.address,
      startDate: employees.startDate,
      trainingGraduationDate: employees.trainingGraduationDate,
      branchName: branches.name,
      divisionName: divisions.name,
      positionName: positions.name,
      gradeName: grades.name,
      employeeGroup: employees.employeeGroup,
      employmentStatus: employees.employmentStatus,
      payrollStatus: employees.payrollStatus,
      supervisorName: supervisor.fullName,
      isActive: employees.isActive,
      notes: employees.notes,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(grades, eq(employees.gradeId, grades.id))
    .leftJoin(supervisor, eq(employees.supervisorEmployeeId, supervisor.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return rows[0] ?? null;
}

async function getActiveSchedule(employeeId: string): Promise<MyScheduleSummary> {
  const rows = await db
    .select({
      scheduleName: workSchedules.name,
      scheduleCode: workSchedules.code,
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
    })
    .from(employeeScheduleAssignments)
    .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
    .where(eq(employeeScheduleAssignments.employeeId, employeeId))
    .orderBy(desc(employeeScheduleAssignments.effectiveStartDate))
    .limit(1);

  return rows[0] ?? null;
}

async function getLatestTicket(employeeId: string): Promise<MyTicketSummary> {
  const rows = await db
    .select({
      ticketType: attendanceTickets.ticketType,
      status: attendanceTickets.status,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      payrollImpact: attendanceTickets.payrollImpact,
    })
    .from(attendanceTickets)
    .where(eq(attendanceTickets.employeeId, employeeId))
    .orderBy(desc(attendanceTickets.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function getLatestReview(employeeId: string): Promise<MyReviewSummary> {
  const rows = await db
    .select({
      totalScore: employeeReviews.totalScore,
      category: employeeReviews.category,
      status: employeeReviews.status,
      periodStartDate: employeeReviews.periodStartDate,
      periodEndDate: employeeReviews.periodEndDate,
    })
    .from(employeeReviews)
    .where(eq(employeeReviews.employeeId, employeeId))
    .orderBy(desc(employeeReviews.periodEndDate), desc(employeeReviews.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function getIncidentSummary(employeeId: string): Promise<MyIncidentSummary> {
  const rows = await db
    .select({
      incidentType: incidentLogs.incidentType,
      incidentDate: incidentLogs.incidentDate,
    })
    .from(incidentLogs)
    .where(and(eq(incidentLogs.employeeId, employeeId), eq(incidentLogs.isActive, true)))
    .orderBy(desc(incidentLogs.incidentDate));

  return {
    activeCount: rows.length,
    latestIncidentType: rows[0]?.incidentType ?? null,
    latestIncidentDate: rows[0]?.incidentDate ?? null,
  };
}

// Waktu saat ini dalam zona Jakarta (UTC+7)
function getJakartaNow() {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
  const jakartaMs = Date.now() + JAKARTA_OFFSET_MS;
  const d = new Date(jakartaMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

// Tanggal UTC midnight — format yang sama dengan resolvePayrollPeriod
function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

// Periode payroll berjalan (UTC dates, untuk perbandingan dengan DB)
function getCurrentPayrollPeriodUTC() {
  const { year, month, day } = getJakartaNow();
  if (day >= 26) {
    return {
      periodStart: utcDate(year, month, 26),
      periodEnd: utcDate(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 25),
    };
  }
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return {
    periodStart: utcDate(prevYear, prevMonth, 26),
    periodEnd: utcDate(year, month, 25),
  };
}

function dKey(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${dy}`;
}

export async function getLatestPerformance(employeeId: string): Promise<MyPerformanceSummary> {
  // Periode berjalan: tgl 26 bulan lalu s/d tgl 25 bulan ini (Jakarta time)
  const { periodStart, periodEnd } = getCurrentPayrollPeriodUTC();

  // Extended start: cover last 14 days for weekly/daily stats
  const extendedStart = utcDate(
    periodStart.getUTCFullYear(),
    periodStart.getUTCMonth(),
    periodStart.getUTCDate() - 14
  );
  const queryStart = extendedStart < periodStart ? extendedStart : periodStart;

  const APPROVED_STATUSES = ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;

  const [entries, empRows, leaveRows] = await Promise.all([
    db
      .select({
        workDate: dailyActivityEntries.workDate,
        totalPoints: dailyActivityEntries.totalPoints,
        status: dailyActivityEntries.status,
      })
      .from(dailyActivityEntries)
      .where(
        and(
          eq(dailyActivityEntries.employeeId, employeeId),
          gte(dailyActivityEntries.workDate, queryStart),
          lte(dailyActivityEntries.workDate, periodEnd),
          inArray(dailyActivityEntries.status, [...APPROVED_STATUSES])
        )
      ),
    db
      .select({ divisionName: divisions.name })
      .from(employees)
      .leftJoin(divisions, eq(employees.divisionId, divisions.id))
      .where(eq(employees.id, employeeId))
      .limit(1),
    db
      .select({ daysCount: attendanceTickets.daysCount })
      .from(attendanceTickets)
      .where(
        and(
          eq(attendanceTickets.employeeId, employeeId),
          lte(attendanceTickets.startDate, periodEnd),
          gte(attendanceTickets.endDate, periodStart),
          inArray(attendanceTickets.status, ["APPROVED_SPV", "APPROVED_HRD", "AUTO_APPROVED", "LOCKED"])
        )
      ),
  ]);

  const targetDailyPoints = resolvePointTargetForDivision(empRows[0]?.divisionName);

  // Map: dateKey -> total approved points that day
  const approvedByDate = new Map<string, number>();
  for (const entry of entries) {
    const k = dKey(entry.workDate);
    approvedByDate.set(k, (approvedByDate.get(k) ?? 0) + Number(entry.totalPoints));
  }

  const pStartKey = dKey(periodStart);
  const pEndKey = dKey(periodEnd);

  // Total approved in period + average daily % (only days that have entries)
  let totalApprovedPoints = 0;
  let dayPercentSum = 0;
  let dayCount = 0;
  for (const [k, pts] of approvedByDate) {
    if (k >= pStartKey && k <= pEndKey) {
      totalApprovedPoints += pts;
      dayPercentSum += targetDailyPoints > 0 ? (pts / targetDailyPoints) * 100 : 0;
      dayCount++;
    }
  }
  const performancePercent = dayCount > 0 ? (dayPercentSum / dayCount).toFixed(2) : "0.00";

  // Target poin bulanan (efektif = hari kerja Senin–Sabtu dikurangi izin approved)
  let workingDays = 0;
  const cur = new Date(periodStart);
  while (cur <= periodEnd) {
    if (cur.getUTCDay() !== 0) workingDays++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const leaveDays = leaveRows.reduce((sum, r) => sum + r.daysCount, 0);
  const effectiveTargetDays = Math.max(0, workingDays - leaveDays);
  const totalTargetPoints = targetDailyPoints * effectiveTargetDays;

  const progressPercent = totalTargetPoints > 0
    ? ((totalApprovedPoints / totalTargetPoints) * 100).toFixed(2)
    : "0.00";

  // Kinerja mingguan: rata-rata 6 hari kerja terakhir (Senin–Sabtu, lewati Minggu)
  // Gunakan UTC untuk konsistensi dengan dKey
  const { year: jYear, month: jMonth, day: jDay } = getJakartaNow();
  const todayUtc = utcDate(jYear, jMonth, jDay);
  const last6WorkDays: Date[] = [];
  const walker = utcDate(jYear, jMonth, jDay - 1);
  while (last6WorkDays.length < 6) {
    if (walker.getUTCDay() !== 0) last6WorkDays.push(new Date(walker));
    walker.setUTCDate(walker.getUTCDate() - 1);
  }
  const weeklySum = last6WorkDays.reduce((sum, d) => {
    const pts = approvedByDate.get(dKey(d)) ?? 0;
    return sum + (targetDailyPoints > 0 ? (pts / targetDailyPoints) * 100 : 0);
  }, 0);
  const weeklyPercent = (weeklySum / 6).toFixed(1);

  // Kinerja harian: hari kerja terakhir
  const dow = todayUtc.getUTCDay();
  let lastWorkDay: Date;
  if (dow === 0) {
    lastWorkDay = utcDate(jYear, jMonth, jDay - 1); // Sabtu
  } else if (dow === 1) {
    const sunday = utcDate(jYear, jMonth, jDay - 1);
    lastWorkDay = approvedByDate.has(dKey(sunday))
      ? sunday
      : utcDate(jYear, jMonth, jDay - 2); // Sabtu
  } else {
    lastWorkDay = utcDate(jYear, jMonth, jDay - 1);
  }
  const dailyPts = approvedByDate.get(dKey(lastWorkDay)) ?? 0;
  const dailyPercent = targetDailyPoints > 0
    ? ((dailyPts / targetDailyPoints) * 100).toFixed(1)
    : "0.0";

  return {
    periodStartDate: periodStart,
    periodEndDate: periodEnd,
    performancePercent,
    weeklyPercent,
    dailyPercent,
    totalApprovedPoints: totalApprovedPoints.toFixed(2),
    totalTargetPoints,
    progressPercent,
    status: "BERJALAN",
  };
}

async function getLatestMonthlyPerformance(employeeId: string): Promise<MyPerformanceSummary> {
  // Periode berjalan: UTC dates (sama format dengan resolvePayrollPeriod), Jakarta timezone
  const { periodStart, periodEnd } = getCurrentPayrollPeriodUTC();

  const rows = await db
    .select({
      periodStartDate: monthlyPointPerformances.periodStartDate,
      periodEndDate: monthlyPointPerformances.periodEndDate,
      performancePercent: monthlyPointPerformances.performancePercent,
      totalApprovedPoints: monthlyPointPerformances.totalApprovedPoints,
      totalTargetPoints: monthlyPointPerformances.totalTargetPoints,
      status: monthlyPointPerformances.status,
    })
    .from(monthlyPointPerformances)
    .where(
      and(
        eq(monthlyPointPerformances.employeeId, employeeId),
        eq(monthlyPointPerformances.periodStartDate, periodStart),
        eq(monthlyPointPerformances.periodEndDate, periodEnd)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const pct = String(row.performancePercent ?? "0");
  const approvedPoints = String(row.totalApprovedPoints ?? "0");
  const targetPoints = Number(row.totalTargetPoints ?? 0);

  return {
    periodStartDate: row.periodStartDate,
    periodEndDate: row.periodEndDate,
    performancePercent: Number(pct).toFixed(2),
    weeklyPercent: Number(pct).toFixed(1),
    dailyPercent: Number(pct).toFixed(1),
    totalApprovedPoints: Number(approvedPoints).toFixed(2),
    totalTargetPoints: targetPoints,
    progressPercent: Number(pct).toFixed(2),
    status: row.status,
  };
}

async function getLatestPayroll(employeeId: string): Promise<MyPayrollSummary> {
  const rows = await db
    .select({
      periodId: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStatus: payrollPeriods.status,
      takeHomePay: payrollResults.takeHomePay,
      performancePercent: payrollResults.performancePercent,
      calculatedAt: payrollResults.calculatedAt,
      baseSalaryPaid: payrollResults.baseSalaryPaid,
      gradeAllowancePaid: payrollResults.gradeAllowancePaid,
      tenureAllowancePaid: payrollResults.tenureAllowancePaid,
      dailyAllowancePaid: payrollResults.dailyAllowancePaid,
      overtimeAmount: payrollResults.overtimeAmount,
      bonusFulltimeAmount: payrollResults.bonusFulltimeAmount,
      bonusDisciplineAmount: payrollResults.bonusDisciplineAmount,
      bonusKinerjaAmount: payrollResults.bonusKinerjaAmount,
      bonusPrestasiAmount: payrollResults.bonusPrestasiAmount,
      bonusTeamAmount: payrollResults.bonusTeamAmount,
      incidentDeductionAmount: payrollResults.incidentDeductionAmount,
      manualAdjustmentAmount: payrollResults.manualAdjustmentAmount,
      breakdown: payrollResults.breakdown,
    })
    .from(payrollResults)
    .innerJoin(payrollPeriods, eq(payrollResults.periodId, payrollPeriods.id))
    .where(eq(payrollResults.employeeId, employeeId))
    .orderBy(desc(payrollResults.calculatedAt))
    .limit(1);

  return rows[0] ?? null;
}

async function getTeamworkActivitySummary(employeeId: string): Promise<TeamworkActivitySummary> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);

  const rows = await db
    .select({
      status: dailyActivityEntries.status,
      totalPoints: dailyActivityEntries.totalPoints,
    })
    .from(dailyActivityEntries)
    .where(
      and(
        eq(dailyActivityEntries.employeeId, employeeId),
        gte(dailyActivityEntries.workDate, sinceDate)
      )
    )
    .orderBy(desc(dailyActivityEntries.workDate), desc(dailyActivityEntries.createdAt));

  return buildTeamworkActivitySummary(rows);
}

async function getPersonalHistories(employeeId: string): Promise<MyProfileResult["histories"]> {
  const previousDivision = aliasedTable(divisions, "previous_division");
  const nextDivision = aliasedTable(divisions, "new_division");
  const previousPosition = aliasedTable(positions, "previous_position");
  const nextPosition = aliasedTable(positions, "new_position");
  const previousGrade = aliasedTable(grades, "previous_grade");
  const nextGrade = aliasedTable(grades, "new_grade");
  const previousSupervisor = aliasedTable(employees, "previous_supervisor");
  const nextSupervisor = aliasedTable(employees, "new_supervisor");

  const [divisionRows, positionRows, gradeRows, supervisorRows] =
    await Promise.all([
      db
        .select({
          effectiveDate: employeeDivisionHistories.effectiveDate,
          previousLabel: previousDivision.name,
          nextLabel: nextDivision.name,
          notes: employeeDivisionHistories.notes,
        })
        .from(employeeDivisionHistories)
        .leftJoin(previousDivision, eq(employeeDivisionHistories.previousDivisionId, previousDivision.id))
        .leftJoin(nextDivision, eq(employeeDivisionHistories.newDivisionId, nextDivision.id))
        .where(eq(employeeDivisionHistories.employeeId, employeeId))
        .orderBy(desc(employeeDivisionHistories.effectiveDate))
        .limit(5),
      db
        .select({
          effectiveDate: employeePositionHistories.effectiveDate,
          previousLabel: previousPosition.name,
          nextLabel: nextPosition.name,
          notes: employeePositionHistories.notes,
        })
        .from(employeePositionHistories)
        .leftJoin(previousPosition, eq(employeePositionHistories.previousPositionId, previousPosition.id))
        .leftJoin(nextPosition, eq(employeePositionHistories.newPositionId, nextPosition.id))
        .where(eq(employeePositionHistories.employeeId, employeeId))
        .orderBy(desc(employeePositionHistories.effectiveDate))
        .limit(5),
      db
        .select({
          effectiveDate: employeeGradeHistories.effectiveDate,
          previousLabel: previousGrade.name,
          nextLabel: nextGrade.name,
          notes: employeeGradeHistories.notes,
        })
        .from(employeeGradeHistories)
        .leftJoin(previousGrade, eq(employeeGradeHistories.previousGradeId, previousGrade.id))
        .leftJoin(nextGrade, eq(employeeGradeHistories.newGradeId, nextGrade.id))
        .where(eq(employeeGradeHistories.employeeId, employeeId))
        .orderBy(desc(employeeGradeHistories.effectiveDate))
        .limit(5),
      db
        .select({
          effectiveDate: employeeSupervisorHistories.effectiveDate,
          previousLabel: previousSupervisor.fullName,
          nextLabel: nextSupervisor.fullName,
          notes: employeeSupervisorHistories.notes,
        })
        .from(employeeSupervisorHistories)
        .leftJoin(previousSupervisor, eq(employeeSupervisorHistories.previousSupervisorEmployeeId, previousSupervisor.id))
        .leftJoin(nextSupervisor, eq(employeeSupervisorHistories.newSupervisorEmployeeId, nextSupervisor.id))
        .where(eq(employeeSupervisorHistories.employeeId, employeeId))
        .orderBy(desc(employeeSupervisorHistories.effectiveDate))
        .limit(5),
    ]);

  return {
    divisions: divisionRows,
    positions: positionRows,
    grades: gradeRows,
    supervisors: supervisorRows,
  };
}

export async function getMyDashboard(): Promise<MyDashboardResult> {
  await requireAuth();
  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const accessState = resolveMyAccessState(role, roleRow.employeeId);
  const userEmail = user?.email ?? "";
  const quickActions = buildPersonalQuickActions(role);

  if (!accessState.canAccess) {
    return {
      redirectTo: accessState.redirectTo,
      role,
      userEmail,
      employee: null,
      quickActions: [],
      activeSchedule: null,
      latestTicket: null,
      latestReview: null,
      incidentSummary: { activeCount: 0, latestIncidentType: null, latestIncidentDate: null },
      latestPerformance: null,
      teamworkActivitySummary: null,
      latestPayroll: null,
      emptyReason: null,
    };
  }

  if (!roleRow.employeeId) {
    return {
      redirectTo: null,
      role,
      userEmail,
      employee: null,
      quickActions,
      activeSchedule: null,
      latestTicket: null,
      latestReview: null,
      incidentSummary: { activeCount: 0, latestIncidentType: null, latestIncidentDate: null },
      latestPerformance: null,
      teamworkActivitySummary: null,
      latestPayroll: null,
      emptyReason: "Akun Anda belum terhubung ke data karyawan. Hubungi HRD.",
    };
  }

  const employee = await getMyEmployeeCore(roleRow.employeeId);
  if (!employee) {
    return {
      redirectTo: null,
      role,
      userEmail,
      employee: null,
      quickActions,
      activeSchedule: null,
      latestTicket: null,
      latestReview: null,
      incidentSummary: { activeCount: 0, latestIncidentType: null, latestIncidentDate: null },
      latestPerformance: null,
      teamworkActivitySummary: null,
      latestPayroll: null,
      emptyReason: "Data karyawan pribadi tidak ditemukan atau belum aktif.",
    };
  }

  const [activeSchedule, latestTicket, latestReview, incidentSummary, latestPerformance, teamworkActivitySummary, latestPayroll] =
    await Promise.all([
      getActiveSchedule(employee.id),
      getLatestTicket(employee.id),
      getLatestReview(employee.id),
      getIncidentSummary(employee.id),
      role === "TEAMWORK"
        ? getLatestPerformance(employee.id)
        : ["MANAGERIAL", "SPV", "KABAG"].includes(role)
          ? getLatestMonthlyPerformance(employee.id)
          : Promise.resolve(null),
      role === "TEAMWORK" ? getTeamworkActivitySummary(employee.id) : Promise.resolve(null),
      PAYROLL_SUMMARY_ROLES.includes(role) ? getLatestPayroll(employee.id) : Promise.resolve(null),
    ]);

  return {
    redirectTo: null,
    role,
    userEmail,
    employee,
    quickActions,
    activeSchedule,
    latestTicket,
    latestReview,
    incidentSummary,
    latestPerformance,
    teamworkActivitySummary,
    latestPayroll,
    emptyReason: null,
  };
}

export async function getMyProfile(): Promise<MyProfileResult> {
  await requireAuth();
  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const accessState = resolveMyAccessState(role, roleRow.employeeId);
  const userEmail = user?.email ?? "";

  if (!accessState.canAccess) {
    return {
      redirectTo: accessState.redirectTo,
      role,
      userEmail,
      employee: null,
      activeSchedule: null,
      histories: {
        divisions: [],
        positions: [],
        grades: [],
        supervisors: [],
      },
      emptyReason: null,
      profileCompletionRequired: false,
    };
  }

  if (!roleRow.employeeId) {
    return {
      redirectTo: null,
      role,
      userEmail,
      employee: null,
      activeSchedule: null,
      histories: {
        divisions: [],
        positions: [],
        grades: [],
        supervisors: [],
      },
      emptyReason: "Akun Anda belum terhubung ke data karyawan. Hubungi HRD.",
      profileCompletionRequired: false,
    };
  }

  const employee = await getMyEmployeeCore(roleRow.employeeId);
  if (!employee) {
    return {
      redirectTo: null,
      role,
      userEmail,
      employee: null,
      activeSchedule: null,
      histories: {
        divisions: [],
        positions: [],
        grades: [],
        supervisors: [],
      },
      emptyReason: "Data karyawan pribadi tidak ditemukan atau belum aktif.",
      profileCompletionRequired: false,
    };
  }

  const [activeSchedule, histories] = await Promise.all([
    getActiveSchedule(employee.id),
    getPersonalHistories(employee.id),
  ]);

  return {
    redirectTo: null,
    role,
    userEmail,
    employee,
    activeSchedule,
    histories,
    emptyReason: null,
    profileCompletionRequired: !isEmployeeProfileComplete({
      nik: employee.nik,
      birthPlace: employee.birthPlace,
      birthDate: employee.birthDate,
      gender: employee.gender,
      religion: employee.religion,
      maritalStatus: employee.maritalStatus,
      phoneNumber: employee.phoneNumber,
      address: employee.address,
      photoUrl: employee.photoUrl,
      userEmail: userEmail || null,
    }),
  };
}

const updateMyProfileSchema = z.object({
  nik: z.string().trim().min(1, "NIK wajib diisi.").max(50, "NIK maksimal 50 karakter."),
  nickname: z.string().trim().min(1, "Nama panggilan wajib diisi.").max(100, "Nama panggilan maksimal 100 karakter."),
  birthPlace: z.string().trim().min(1, "Tempat lahir wajib diisi.").max(100, "Tempat lahir maksimal 100 karakter."),
  birthDate: z.coerce.date({ message: "Tanggal lahir wajib diisi." }),
  gender: z.enum(["LAKI-LAKI", "PEREMPUAN"], { message: "Jenis kelamin tidak valid." }),
  religion: z.enum(["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Khonghucu"], {
    message: "Agama tidak valid.",
  }),
  maritalStatus: z.enum(["MENIKAH", "BELUM MENIKAH"], { message: "Status tidak valid." }),
  phoneNumber: z.string().trim().min(1, "Nomor HP wajib diisi.").max(30, "Nomor HP maksimal 30 karakter."),
  address: z.string().trim().min(1, "Alamat wajib diisi."),
  existingPhotoUrl: z.string().trim().url("URL foto profil lama tidak valid.").optional().or(z.literal("")),
});

const PROFILE_PHOTO_BUCKET = "employee-profile-photos";
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
let profilePhotoBucketChecked = false;

function resolveProfilePhotoExtension(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || mimeType === "image/jpeg") return "jpg";
  if (lowerName.endsWith(".png") || mimeType === "image/png") return "png";
  if (lowerName.endsWith(".webp") || mimeType === "image/webp") return "webp";
  return null;
}

async function ensureProfilePhotoBucket() {
  if (profilePhotoBucketChecked) return;

  const admin = createAdminClient();
  const bucketsResult = await admin.storage.listBuckets();
  if (bucketsResult.error) {
    throw new Error(`Gagal memeriksa bucket foto profil: ${bucketsResult.error.message}`);
  }

  const exists = bucketsResult.data.some((bucket) => bucket.name === PROFILE_PHOTO_BUCKET);
  if (!exists) {
    const createResult = await admin.storage.createBucket(PROFILE_PHOTO_BUCKET, {
      public: true,
      fileSizeLimit: `${PROFILE_PHOTO_MAX_BYTES}`,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (createResult.error) {
      throw new Error(`Gagal membuat bucket foto profil: ${createResult.error.message}`);
    }
  }

  profilePhotoBucketChecked = true;
}

export async function updateMyPersonalProfile(formData: FormData) {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();

  if (!roleRow.employeeId) {
    return { error: "Akun belum terhubung ke data karyawan. Hubungi HRD." };
  }

  const parsed = updateMyProfileSchema.safeParse({
    nik: formData.get("nik"),
    nickname: formData.get("nickname"),
    birthPlace: formData.get("birthPlace"),
    birthDate: formData.get("birthDate"),
    gender: formData.get("gender"),
    religion: formData.get("religion"),
    maritalStatus: formData.get("maritalStatus"),
    phoneNumber: formData.get("phoneNumber"),
    address: formData.get("address"),
    existingPhotoUrl: formData.get("existingPhotoUrl"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data profil tidak valid." };
  }

  const [existingEmployee] = await db
    .select({
      nik: employees.nik,
    })
    .from(employees)
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);

  if (!existingEmployee) {
    return { error: "Data karyawan tidak ditemukan." };
  }

  if (existingEmployee.nik && existingEmployee.nik !== parsed.data.nik) {
    return { error: "NIK sudah pernah diisi. Perubahan NIK hanya bisa dilakukan HRD." };
  }

  const nikHasConflict = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.nik, parsed.data.nik))
    .limit(1);

  if (nikHasConflict.length > 0 && nikHasConflict[0]?.id !== roleRow.employeeId) {
    return { error: "NIK sudah digunakan karyawan lain." };
  }

  const uploadedPhoto = formData.get("photoFile");
  let nextPhotoUrl = parsed.data.existingPhotoUrl || "";

  if (uploadedPhoto instanceof File && uploadedPhoto.size > 0) {
    if (!uploadedPhoto.type.startsWith("image/")) {
      return { error: "File foto profil harus berupa gambar." };
    }
    if (uploadedPhoto.size > PROFILE_PHOTO_MAX_BYTES) {
      return { error: "Ukuran foto profil maksimal 2MB." };
    }

    const fileExtension = resolveProfilePhotoExtension(uploadedPhoto.name, uploadedPhoto.type);
    if (!fileExtension) {
      return { error: "Format foto profil harus jpg, png, atau webp." };
    }

    try {
      await ensureProfilePhotoBucket();
      const admin = createAdminClient();
      const photoPath = `${roleRow.employeeId}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;
      const fileBuffer = Buffer.from(await uploadedPhoto.arrayBuffer());

      const uploadResult = await admin.storage.from(PROFILE_PHOTO_BUCKET).upload(photoPath, fileBuffer, {
        contentType: uploadedPhoto.type,
        upsert: true,
      });

      if (uploadResult.error) {
        return { error: `Gagal upload foto profil: ${uploadResult.error.message}` };
      }

      const publicUrlResult = admin.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(photoPath);
      nextPhotoUrl = publicUrlResult.data.publicUrl;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Gagal memproses upload foto profil." };
    }
  }

  if (!nextPhotoUrl) {
    return { error: "Foto profil wajib diunggah." };
  }

  await db
    .update(employees)
    .set({
      nik: existingEmployee.nik ?? parsed.data.nik,
      nickname: parsed.data.nickname,
      birthPlace: parsed.data.birthPlace,
      birthDate: parsed.data.birthDate,
      gender: parsed.data.gender,
      religion: parsed.data.religion,
      maritalStatus: parsed.data.maritalStatus,
      phoneNumber: parsed.data.phoneNumber,
      address: parsed.data.address,
      photoUrl: nextPhotoUrl,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, roleRow.employeeId));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
  return { success: "Profil pribadi berhasil diperbarui." };
}
