"use server";

import {
  BONUS_FULLTIME_DEFAULT,
  GAJI_POKOK_REGULER_DEFAULT,
  GAJI_TRAINING_DEFAULT,
} from "@/config/constants";
import { getCurrentUserRoleRow, getUser, requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  employeeDivisionHistories,
  employeeGradeHistories,
  employeePositionHistories,
  employeeScheduleAssignments,
  employees,
  workScheduleDays,
} from "@/lib/db/schema/employee";
import { attendanceTickets, employeeAttendanceRecords, incidentLogs, overtimeRequests } from "@/lib/db/schema/hr";
import { branches, divisions, employeeGroupConfigs, grades, positions } from "@/lib/db/schema/master";
import {
  employeeSalaryConfigs,
  gradeCompensationConfigs,
  managerialKpiSummaries,
  payrollAdjustments,
  payrollAuditLogs,
  payrollEmployeeSnapshots,
  payrollPeriods,
  payrollResults,
  recurringPayrollAdjustments,
} from "@/lib/db/schema/payroll";
import {
  dailyActivityApprovalLogs,
  dailyActivityEntries,
  monthlyPointPerformances,
} from "@/lib/db/schema/point";
import {
  createPayrollPeriodSchema,
  deletePayrollAdjustmentSchema,
  updatePayrollAdjustmentSchema,
  managerialKpiSummarySchema,
  payrollAdjustmentSchema,
  gradeCompensationConfigSchema,
  payrollPeriodActionSchema,
  salaryConfigSchema,
  type AdjustmentCategory,
} from "@/lib/validations/payroll";
import { calculateManagerialPayroll } from "@/server/payroll-engine/calculate-managerial-payroll";
import { calculateTeamworkPayroll } from "@/server/payroll-engine/calculate-teamwork-payroll";
import { resolveAttendancePayrollEligibility } from "@/server/attendance-engine/resolve-attendance-payroll-eligibility";
import { resolveDisciplineBonus } from "@/server/payroll-engine/resolve-discipline-bonus";
import { resolvePayrollPeriod } from "@/server/payroll-engine/resolve-payroll-period";
import { resolvePayrollStatusTransition } from "@/server/payroll-engine/resolve-payroll-status-transition";
import { resolveSpPerformancePenalty } from "@/server/payroll-engine/resolve-sp-performance-penalty";
import { resolveTenureAllowanceAmount } from "@/server/payroll-engine/resolve-tenure-allowance";
import { countTargetDaysForPeriod } from "@/server/point-engine/count-target-days-for-period";
import { isKpiEmployeeGroup, isPointBasedEmployeeGroup } from "@/lib/employee-groups";
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PayrollPeriodStatus, UserRole } from "@/types";
import {
  canReadPayrollEmployeeDetail,
  isRecurringAdjustmentCategory,
  isRecurringAdjustmentReason,
  resolveAdjustmentTypeForCategory,
} from "./payroll.helpers";

const PAYROLL_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "FINANCE", "PAYROLL_VIEWER"];
const PAYROLL_WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "FINANCE"];
const APPROVED_TICKET_STATUSES = ["AUTO_APPROVED", "APPROVED_SPV", "APPROVED_HRD"] as const;
const LOCKABLE_ACTIVITY_STATUSES = ["DISETUJUI_SPV", "OVERRIDE_HRD"] as const;

type PayrollReadAccess =
  | { error: string }
  | {
      roleRow: Awaited<ReturnType<typeof getCurrentUserRoleRow>>;
      role: UserRole;
    };

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function roundCurrency(amount: number) {
  return Number(amount.toFixed(2));
}

function resolveTieredBonusAmount(
  performancePercent: number,
  bonus80: number,
  bonus90: number,
  bonus100: number
) {
  // Returns the nominal payout for the achieved tier, not a multiplier base.
  if (performancePercent >= 100) return bonus100;
  if (performancePercent >= 90) return bonus90;
  if (performancePercent >= 80) return bonus80;
  return 0;
}

function normalizeDate(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function countCalendarDaysInclusive(start: Date, end: Date) {
  const cursorStart = normalizeDate(start);
  const cursorEnd = normalizeDate(end);
  const diff = cursorEnd.getTime() - cursorStart.getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

function countSundaysInclusive(start: Date, end: Date) {
  const cursorStart = normalizeDate(start);
  const cursorEnd = normalizeDate(end);
  let sundays = 0;
  for (let cursor = new Date(cursorStart); cursor <= cursorEnd; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getDay() === 0) sundays += 1;
  }
  return sundays;
}

function countOverlapDays(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const overlapStart = normalizeDate(start) > normalizeDate(rangeStart) ? normalizeDate(start) : normalizeDate(rangeStart);
  const overlapEnd = normalizeDate(end) < normalizeDate(rangeEnd) ? normalizeDate(end) : normalizeDate(rangeEnd);
  if (overlapStart > overlapEnd) return 0;
  return countCalendarDaysInclusive(overlapStart, overlapEnd);
}

function resolveTrainingGraduationBonusProrationRatio(input: {
  trainingGraduationDate: Date | string | null | undefined;
  periodStartDate: Date;
  periodEndDate: Date;
  scheduledWorkDays: number;
  assignments: Array<{
    effectiveStartDate: string | Date;
    effectiveEndDate: string | Date | null;
    workingDays: number[];
  }>;
}) {
  if (!input.trainingGraduationDate || input.scheduledWorkDays <= 0) {
    return 1;
  }

  const graduationDate = normalizeDate(input.trainingGraduationDate);
  const periodStart = normalizeDate(input.periodStartDate);
  const periodEnd = normalizeDate(input.periodEndDate);
  if (graduationDate < periodStart || graduationDate > periodEnd) {
    return 1;
  }

  const remainingScheduledWorkDays = countTargetDaysForPeriod({
    periodStartDate: graduationDate,
    periodEndDate: periodEnd,
    assignments: input.assignments,
  });

  if (remainingScheduledWorkDays <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, remainingScheduledWorkDays / input.scheduledWorkDays));
}

function isTrainingGraduatedWithinPeriod(input: {
  trainingGraduationDate: Date | string | null | undefined;
  periodStartDate: Date;
  periodEndDate: Date;
}) {
  if (!input.trainingGraduationDate) return false;
  const graduationDate = normalizeDate(input.trainingGraduationDate);
  return graduationDate >= normalizeDate(input.periodStartDate) && graduationDate <= normalizeDate(input.periodEndDate);
}

function isSpIncidentType(incidentType: string) {
  return incidentType === "SP1" || incidentType === "SP2";
}

async function hasEmployeeGroupBaseSalaryColumn() {
  const rows = await db.execute(sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'employee_group_configs'
        and column_name = 'base_salary_amount'
    ) as "exists"
  `);
  return Boolean(rows[0]?.exists);
}

async function assertPayrollReadAccess(): Promise<PayrollReadAccess> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  if (!PAYROLL_READ_ROLES.includes(role)) {
    return { error: "Akses payroll ditolak." };
  }
  return { roleRow, role };
}

async function assertPayrollWriteAccess(): Promise<PayrollReadAccess> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  if (!PAYROLL_WRITE_ROLES.includes(role)) {
    return { error: "Akses payroll ditolak." };
  }
  return { roleRow, role };
}

export async function getPayrollWorkspace(selectedPeriodId?: string) {
  const access = await assertPayrollReadAccess();
  if ("error" in access) return access;

  const periods = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStartDate: payrollPeriods.periodStartDate,
      periodEndDate: payrollPeriods.periodEndDate,
      status: payrollPeriods.status,
      notes: payrollPeriods.notes,
      previewGeneratedAt: payrollPeriods.previewGeneratedAt,
      finalizedAt: payrollPeriods.finalizedAt,
      paidAt: payrollPeriods.paidAt,
      lockedAt: payrollPeriods.lockedAt,
      createdAt: payrollPeriods.createdAt,
    })
    .from(payrollPeriods)
    .orderBy(desc(payrollPeriods.periodStartDate));

  const activePeriodId = periods.find((period) => period.id === selectedPeriodId)?.id ?? periods[0]?.id ?? null;
  const selectedPeriod = periods.find((period) => period.id === activePeriodId) ?? null;

  const results = activePeriodId
    ? await db
        .select({
          id: payrollResults.id,
          employeeId: payrollResults.employeeId,
          employeeName: payrollEmployeeSnapshots.employeeNameSnapshot,
          employeeCode: payrollEmployeeSnapshots.employeeCodeSnapshot,
          branchName: payrollEmployeeSnapshots.branchSnapshotName,
          divisionName: payrollEmployeeSnapshots.divisionSnapshotName,
          positionName: payrollEmployeeSnapshots.positionSnapshotName,
          gradeName: payrollEmployeeSnapshots.gradeSnapshotName,
          employeeGroup: payrollEmployeeSnapshots.employeeGroupSnapshot,
          payrollStatus: payrollEmployeeSnapshots.payrollStatusSnapshot,
          performancePercent: payrollResults.performancePercent,
          approvedUnpaidLeaveDays: payrollResults.approvedUnpaidLeaveDays,
          baseSalaryPaid: payrollResults.baseSalaryPaid,
          gradeAllowancePaid: payrollResults.gradeAllowancePaid,
          tenureAllowancePaid: payrollResults.tenureAllowancePaid,
          overtimeAmount: payrollResults.overtimeAmount,
          bonusKinerjaAmount: payrollResults.bonusKinerjaAmount,
          bonusPrestasiAmount: payrollResults.bonusPrestasiAmount,
          bonusFulltimeAmount: payrollResults.bonusFulltimeAmount,
          bonusDisciplineAmount: payrollResults.bonusDisciplineAmount,
          bonusTeamAmount: payrollResults.bonusTeamAmount,
          incidentDeductionAmount: payrollResults.incidentDeductionAmount,
          manualAdjustmentAmount: payrollResults.manualAdjustmentAmount,
          totalAdditionAmount: payrollResults.totalAdditionAmount,
          totalDeductionAmount: payrollResults.totalDeductionAmount,
          takeHomePay: payrollResults.takeHomePay,
          status: payrollResults.status,
        })
        .from(payrollResults)
        .leftJoin(payrollEmployeeSnapshots, eq(payrollResults.snapshotId, payrollEmployeeSnapshots.id))
        .where(eq(payrollResults.periodId, activePeriodId))
        .orderBy(asc(payrollEmployeeSnapshots.employeeNameSnapshot))
    : [];

  const periodAdjustmentRows = activePeriodId
    ? await db
        .select({
          id: payrollAdjustments.id,
          employeeId: payrollAdjustments.employeeId,
          employeeName: employees.fullName,
          adjustmentType: payrollAdjustments.adjustmentType,
          amount: payrollAdjustments.amount,
          reason: payrollAdjustments.reason,
          createdAt: payrollAdjustments.createdAt,
        })
        .from(payrollAdjustments)
        .leftJoin(employees, eq(payrollAdjustments.employeeId, employees.id))
        .where(eq(payrollAdjustments.periodId, activePeriodId))
        .orderBy(desc(payrollAdjustments.createdAt))
    : [];

  const recurringAdjustmentRows = activePeriodId
    ? await db
        .select({
          id: recurringPayrollAdjustments.id,
          employeeId: recurringPayrollAdjustments.employeeId,
          employeeName: employees.fullName,
          adjustmentType: recurringPayrollAdjustments.adjustmentType,
          amount: recurringPayrollAdjustments.amount,
          reason: recurringPayrollAdjustments.reason,
          createdAt: recurringPayrollAdjustments.createdAt,
        })
        .from(recurringPayrollAdjustments)
        .leftJoin(employees, eq(recurringPayrollAdjustments.employeeId, employees.id))
        .where(
          and(
            eq(recurringPayrollAdjustments.isActive, true),
            eq(employees.isActive, true)
          )
        )
        .orderBy(desc(recurringPayrollAdjustments.createdAt))
    : [];

  const adjustments = [
    ...recurringAdjustmentRows.map((row) => ({ ...row, source: "RECURRING" as const })),
    ...periodAdjustmentRows
      .filter((row) => !isRecurringAdjustmentReason(row.reason))
      .map((row) => ({ ...row, source: "PERIOD" as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const hasGroupBaseSalaryColumn = await hasEmployeeGroupBaseSalaryColumn();
  const salaryConfigs = hasGroupBaseSalaryColumn
    ? await db
        .select({
          employeeId: employees.id,
          employeeCode: employees.employeeCode,
          employeeName: employees.fullName,
          positionName: positions.name,
          divisionName: divisions.name,
          trainingGraduationDate: employees.trainingGraduationDate,
          employeeGroup: employees.employeeGroup,
          employeeGroupBaseSalaryAmount: employeeGroupConfigs.baseSalaryAmount,
          payrollStatus: employees.payrollStatus,
          baseSalaryAmount: employeeSalaryConfigs.baseSalaryAmount,
          gradeAllowanceAmount: employeeSalaryConfigs.gradeAllowanceAmount,
          tenureAllowanceAmount: employeeSalaryConfigs.tenureAllowanceAmount,
          dailyAllowanceAmount: employeeSalaryConfigs.dailyAllowanceAmount,
          performanceBonusBaseAmount: employeeSalaryConfigs.performanceBonusBaseAmount,
          achievementBonus140Amount: employeeSalaryConfigs.achievementBonus140Amount,
          achievementBonus165Amount: employeeSalaryConfigs.achievementBonus165Amount,
          fulltimeBonusAmount: employeeSalaryConfigs.fulltimeBonusAmount,
          disciplineBonusAmount: employeeSalaryConfigs.disciplineBonusAmount,
          teamBonusAmount: employeeSalaryConfigs.teamBonusAmount,
          overtimeRateAmount: employeeSalaryConfigs.overtimeRateAmount,
          notes: employeeSalaryConfigs.notes,
          updatedAt: employeeSalaryConfigs.updatedAt,
        })
        .from(employees)
        .leftJoin(positions, eq(employees.positionId, positions.id))
        .leftJoin(divisions, eq(employees.divisionId, divisions.id))
        .leftJoin(employeeGroupConfigs, eq(employees.employeeGroup, employeeGroupConfigs.employeeGroup))
        .leftJoin(employeeSalaryConfigs, eq(employees.id, employeeSalaryConfigs.employeeId))
        .where(
          and(
            eq(employees.isActive, true),
            inArray(employees.payrollStatus, ["TRAINING", "REGULER", "FINAL_PAYROLL"])
          )
        )
        .orderBy(asc(employees.fullName))
    : await db
        .select({
          employeeId: employees.id,
          employeeCode: employees.employeeCode,
          employeeName: employees.fullName,
          positionName: positions.name,
          divisionName: divisions.name,
          trainingGraduationDate: employees.trainingGraduationDate,
          employeeGroup: employees.employeeGroup,
          employeeGroupBaseSalaryAmount: sql<string | null>`null`,
          payrollStatus: employees.payrollStatus,
          baseSalaryAmount: employeeSalaryConfigs.baseSalaryAmount,
          gradeAllowanceAmount: employeeSalaryConfigs.gradeAllowanceAmount,
          tenureAllowanceAmount: employeeSalaryConfigs.tenureAllowanceAmount,
          dailyAllowanceAmount: employeeSalaryConfigs.dailyAllowanceAmount,
          performanceBonusBaseAmount: employeeSalaryConfigs.performanceBonusBaseAmount,
          achievementBonus140Amount: employeeSalaryConfigs.achievementBonus140Amount,
          achievementBonus165Amount: employeeSalaryConfigs.achievementBonus165Amount,
          fulltimeBonusAmount: employeeSalaryConfigs.fulltimeBonusAmount,
          disciplineBonusAmount: employeeSalaryConfigs.disciplineBonusAmount,
          teamBonusAmount: employeeSalaryConfigs.teamBonusAmount,
          overtimeRateAmount: employeeSalaryConfigs.overtimeRateAmount,
          notes: employeeSalaryConfigs.notes,
          updatedAt: employeeSalaryConfigs.updatedAt,
        })
        .from(employees)
        .leftJoin(positions, eq(employees.positionId, positions.id))
        .leftJoin(divisions, eq(employees.divisionId, divisions.id))
        .leftJoin(employeeSalaryConfigs, eq(employees.id, employeeSalaryConfigs.employeeId))
        .where(
          and(
            eq(employees.isActive, true),
            inArray(employees.payrollStatus, ["TRAINING", "REGULER", "FINAL_PAYROLL"])
          )
        )
        .orderBy(asc(employees.fullName));

  const tenureReferenceDate = selectedPeriod?.periodEndDate ?? new Date();
  const salaryConfigsWithAutoTenure = salaryConfigs.map((row) => ({
    ...row,
    baseSalaryAmount: row.baseSalaryAmount ?? row.employeeGroupBaseSalaryAmount,
    tenureAllowanceAmount: resolveTenureAllowanceAmount(row.trainingGraduationDate, tenureReferenceDate).toFixed(2),
  }));

  const managerialKpiRows = activePeriodId
    ? await db
        .select({
          id: managerialKpiSummaries.id,
          employeeId: managerialKpiSummaries.employeeId,
          employeeCode: employees.employeeCode,
          employeeName: employees.fullName,
          divisionName: divisions.name,
          performancePercent: managerialKpiSummaries.performancePercent,
          status: managerialKpiSummaries.status,
          notes: managerialKpiSummaries.notes,
          updatedAt: managerialKpiSummaries.updatedAt,
        })
        .from(managerialKpiSummaries)
        .leftJoin(employees, eq(managerialKpiSummaries.employeeId, employees.id))
        .leftJoin(divisions, eq(employees.divisionId, divisions.id))
        .where(eq(managerialKpiSummaries.periodId, activePeriodId))
        .orderBy(asc(employees.fullName))
    : [];

  const gradeCompensations = await db
    .select({
      gradeId: grades.id,
      gradeName: grades.name,
      allowanceAmount: gradeCompensationConfigs.allowanceAmount,
      bonusKinerja80: gradeCompensationConfigs.bonusKinerja80,
      bonusKinerja90: gradeCompensationConfigs.bonusKinerja90,
      bonusKinerja100: gradeCompensationConfigs.bonusKinerja100,
      bonusKinerjaTeam80: gradeCompensationConfigs.bonusKinerjaTeam80,
      bonusKinerjaTeam90: gradeCompensationConfigs.bonusKinerjaTeam90,
      bonusKinerjaTeam100: gradeCompensationConfigs.bonusKinerjaTeam100,
      bonusDisiplin80: gradeCompensationConfigs.bonusDisiplin80,
      bonusDisiplin90: gradeCompensationConfigs.bonusDisiplin90,
      bonusDisiplin100: gradeCompensationConfigs.bonusDisiplin100,
      bonusPrestasi140: gradeCompensationConfigs.bonusPrestasi140,
      bonusPrestasi165: gradeCompensationConfigs.bonusPrestasi165,
      isActive: gradeCompensationConfigs.isActive,
    })
    .from(grades)
    .leftJoin(gradeCompensationConfigs, eq(gradeCompensationConfigs.gradeId, grades.id))
    .where(eq(grades.isActive, true))
    .orderBy(asc(grades.name));

  return {
    role: access.role,
    canManage: PAYROLL_WRITE_ROLES.includes(access.role),
    activePeriodId,
    selectedPeriod,
    periods,
    results,
    adjustments,
    salaryConfigs: salaryConfigsWithAutoTenure,
    gradeCompensations,
    managerialKpiRows,
  };
}

export async function getPayrollEmployeeDetail(periodId: string, employeeId: string) {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const viewerCanReadPayrollWorkspace = PAYROLL_READ_ROLES.includes(role);

  if (!canReadPayrollEmployeeDetail(role, roleRow.employeeId, employeeId)) {
    return { error: "Akses payroll ditolak." };
  }

  const [detail] = await db
    .select({
      periodId: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStartDate: payrollPeriods.periodStartDate,
      periodEndDate: payrollPeriods.periodEndDate,
      periodStatus: payrollPeriods.status,
      resultId: payrollResults.id,
      resultStatus: payrollResults.status,
      performancePercent: payrollResults.performancePercent,
      totalApprovedPoints: payrollResults.totalApprovedPoints,
      totalTargetPoints: payrollResults.totalTargetPoints,
      approvedUnpaidLeaveDays: payrollResults.approvedUnpaidLeaveDays,
      approvedPaidLeaveDays: payrollResults.approvedPaidLeaveDays,
      incidentDeductionAmount: payrollResults.incidentDeductionAmount,
      manualAdjustmentAmount: payrollResults.manualAdjustmentAmount,
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
      totalAdditionAmount: payrollResults.totalAdditionAmount,
      totalDeductionAmount: payrollResults.totalDeductionAmount,
      takeHomePay: payrollResults.takeHomePay,
      breakdown: payrollResults.breakdown,
      managerialKpiSummaryId: payrollResults.managerialKpiSummaryId,
      snapshotId: payrollEmployeeSnapshots.id,
      employeeId: payrollEmployeeSnapshots.employeeId,
      employeeCode: payrollEmployeeSnapshots.employeeCodeSnapshot,
      employeeName: payrollEmployeeSnapshots.employeeNameSnapshot,
      branchName: payrollEmployeeSnapshots.branchSnapshotName,
      divisionName: payrollEmployeeSnapshots.divisionSnapshotName,
      positionName: payrollEmployeeSnapshots.positionSnapshotName,
      gradeName: payrollEmployeeSnapshots.gradeSnapshotName,
      employeeGroup: payrollEmployeeSnapshots.employeeGroupSnapshot,
      employmentStatus: payrollEmployeeSnapshots.employmentStatusSnapshot,
      payrollStatus: payrollEmployeeSnapshots.payrollStatusSnapshot,
      baseSalaryConfigured: payrollEmployeeSnapshots.baseSalaryAmount,
      gradeAllowanceConfigured: payrollEmployeeSnapshots.gradeAllowanceAmount,
      tenureAllowanceConfigured: payrollEmployeeSnapshots.tenureAllowanceAmount,
      performanceBonusBaseConfigured: payrollEmployeeSnapshots.performanceBonusBaseAmount,
      achievementBonus140Configured: payrollEmployeeSnapshots.achievementBonus140Amount,
      achievementBonus165Configured: payrollEmployeeSnapshots.achievementBonus165Amount,
      fulltimeBonusConfigured: payrollEmployeeSnapshots.fulltimeBonusAmount,
      disciplineBonusConfigured: payrollEmployeeSnapshots.disciplineBonusAmount,
      teamBonusConfigured: payrollEmployeeSnapshots.teamBonusAmount,
      scheduledWorkDays: payrollEmployeeSnapshots.scheduledWorkDays,
      activeEmploymentDays: payrollEmployeeSnapshots.activeEmploymentDays,
      calculatedAt: payrollResults.calculatedAt,
      finalizedAt: payrollResults.finalizedAt,
    })
    .from(payrollResults)
    .leftJoin(payrollPeriods, eq(payrollResults.periodId, payrollPeriods.id))
    .leftJoin(payrollEmployeeSnapshots, eq(payrollResults.snapshotId, payrollEmployeeSnapshots.id))
    .where(and(eq(payrollResults.periodId, periodId), eq(payrollResults.employeeId, employeeId)))
    .limit(1);

  if (!detail) {
    return { error: "Detail payroll tidak ditemukan." };
  }

  const periodStartDate = detail.periodStartDate;
  const periodEndDate = detail.periodEndDate;
  if (!periodStartDate || !periodEndDate) {
    return { error: "Data periode payroll tidak lengkap." };
  }

  const [performance] = await db
    .select({
      id: monthlyPointPerformances.id,
      divisionSnapshotName: monthlyPointPerformances.divisionSnapshotName,
      targetDailyPoints: monthlyPointPerformances.targetDailyPoints,
      targetDays: monthlyPointPerformances.targetDays,
      totalTargetPoints: monthlyPointPerformances.totalTargetPoints,
      totalApprovedPoints: monthlyPointPerformances.totalApprovedPoints,
      performancePercent: monthlyPointPerformances.performancePercent,
      status: monthlyPointPerformances.status,
      calculatedAt: monthlyPointPerformances.calculatedAt,
    })
    .from(monthlyPointPerformances)
    .where(
      and(
        eq(monthlyPointPerformances.employeeId, employeeId),
        eq(monthlyPointPerformances.periodStartDate, periodStartDate),
        eq(monthlyPointPerformances.periodEndDate, periodEndDate)
      )
    )
    .limit(1);

  const [managerialKpi] = await db
    .select({
      id: managerialKpiSummaries.id,
      performancePercent: managerialKpiSummaries.performancePercent,
      notes: managerialKpiSummaries.notes,
      status: managerialKpiSummaries.status,
      validatedAt: managerialKpiSummaries.validatedAt,
    })
    .from(managerialKpiSummaries)
    .where(and(eq(managerialKpiSummaries.periodId, periodId), eq(managerialKpiSummaries.employeeId, employeeId)))
    .limit(1);

  const adjustments = await db
    .select({
      id: payrollAdjustments.id,
      adjustmentType: payrollAdjustments.adjustmentType,
      amount: payrollAdjustments.amount,
      reason: payrollAdjustments.reason,
      createdAt: payrollAdjustments.createdAt,
    })
    .from(payrollAdjustments)
    .where(and(eq(payrollAdjustments.periodId, periodId), eq(payrollAdjustments.employeeId, employeeId)))
    .orderBy(desc(payrollAdjustments.createdAt));

  const tickets = await db
    .select({
      id: attendanceTickets.id,
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      status: attendanceTickets.status,
      payrollImpact: attendanceTickets.payrollImpact,
      reason: attendanceTickets.reason,
    })
    .from(attendanceTickets)
    .where(
      and(
        eq(attendanceTickets.employeeId, employeeId),
        inArray(attendanceTickets.status, APPROVED_TICKET_STATUSES),
        lte(attendanceTickets.startDate, periodEndDate),
        gte(attendanceTickets.endDate, periodStartDate)
      )
    )
    .orderBy(desc(attendanceTickets.startDate));

  const incidents = await db
    .select({
      id: incidentLogs.id,
      incidentType: incidentLogs.incidentType,
      incidentDate: incidentLogs.incidentDate,
      impact: incidentLogs.impact,
      payrollDeduction: incidentLogs.payrollDeduction,
      description: incidentLogs.description,
      notes: incidentLogs.notes,
    })
    .from(incidentLogs)
    .where(
      and(
        eq(incidentLogs.employeeId, employeeId),
        eq(incidentLogs.isActive, true),
        gte(incidentLogs.incidentDate, periodStartDate),
        lte(incidentLogs.incidentDate, periodEndDate)
      )
    )
    .orderBy(desc(incidentLogs.incidentDate));

  return {
    role,
    viewerCanReadPayrollWorkspace,
    detail,
    performance: performance ?? null,
    managerialKpi: managerialKpi ?? null,
    adjustments,
    tickets,
    incidents,
  };
}

export async function upsertEmployeeSalaryConfig(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = salaryConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Konfigurasi salary tidak valid." };
  }

  const [employee] = await db
    .select({
      id: employees.id,
      employeeGroup: employees.employeeGroup,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!employee) return { error: "Karyawan tidak ditemukan." };
  if (!employee.isActive) {
    return { error: "Salary config payroll hanya dapat diatur untuk karyawan aktif." };
  }

  const payload = {
    employeeId: parsed.data.employeeId,
    baseSalaryAmount: parsed.data.baseSalaryAmount?.toFixed(2) ?? null,
    gradeAllowanceAmount: parsed.data.gradeAllowanceAmount?.toFixed(2) ?? null,
    tenureAllowanceAmount: parsed.data.tenureAllowanceAmount?.toFixed(2) ?? null,
    dailyAllowanceAmount: parsed.data.dailyAllowanceAmount?.toFixed(2) ?? null,
    performanceBonusBaseAmount: parsed.data.performanceBonusBaseAmount?.toFixed(2) ?? null,
    achievementBonus140Amount: parsed.data.achievementBonus140Amount?.toFixed(2) ?? null,
    achievementBonus165Amount: parsed.data.achievementBonus165Amount?.toFixed(2) ?? null,
    fulltimeBonusAmount: parsed.data.fulltimeBonusAmount?.toFixed(2) ?? null,
    disciplineBonusAmount: parsed.data.disciplineBonusAmount?.toFixed(2) ?? null,
    teamBonusAmount: parsed.data.teamBonusAmount?.toFixed(2) ?? null,
    overtimeRateAmount: parsed.data.overtimeRateAmount?.toFixed(2) ?? null,
    notes: parsed.data.notes || null,
  };

  const [existingConfig] = await db
    .select({ id: employeeSalaryConfigs.id })
    .from(employeeSalaryConfigs)
    .where(eq(employeeSalaryConfigs.employeeId, parsed.data.employeeId))
    .limit(1);

  if (existingConfig) {
    await db
      .update(employeeSalaryConfigs)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(eq(employeeSalaryConfigs.employeeId, parsed.data.employeeId));
  } else {
    await db.insert(employeeSalaryConfigs).values(payload);
  }

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function syncSalaryConfigWithEmployeeGroupMaster() {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const hasGroupBaseSalaryColumn = await hasEmployeeGroupBaseSalaryColumn();
  if (!hasGroupBaseSalaryColumn) {
    return { error: "Kolom gaji pokok kelompok belum tersedia. Jalankan migration 0028 terlebih dahulu." };
  }

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeGroup: employees.employeeGroup,
      trainingGraduationDate: employees.trainingGraduationDate,
      payrollStatus: employees.payrollStatus,
    })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        inArray(employees.payrollStatus, ["TRAINING", "REGULER", "FINAL_PAYROLL"])
      )
    );

  const groupRows = await db
    .select({
      employeeGroup: employeeGroupConfigs.employeeGroup,
      baseSalaryAmount: employeeGroupConfigs.baseSalaryAmount,
    })
    .from(employeeGroupConfigs);
  const groupBaseSalaryMap = new Map(groupRows.map((row) => [row.employeeGroup, toNumber(row.baseSalaryAmount)]));

  if (employeeRows.length === 0) {
    return { success: true, message: "Tidak ada karyawan aktif untuk disinkronkan." };
  }

  const existingRows = await db
    .select({
      id: employeeSalaryConfigs.id,
      employeeId: employeeSalaryConfigs.employeeId,
    })
    .from(employeeSalaryConfigs)
    .where(inArray(employeeSalaryConfigs.employeeId, employeeRows.map((row) => row.id)));
  const existingSet = new Set(existingRows.map((row) => row.employeeId));

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const employee of employeeRows) {
      const baseSalaryAmount = groupBaseSalaryMap.get(employee.employeeGroup)
        || (employee.payrollStatus === "TRAINING" ? GAJI_TRAINING_DEFAULT : GAJI_POKOK_REGULER_DEFAULT);
      const tenureAllowanceAmount = resolveTenureAllowanceAmount(
        employee.trainingGraduationDate,
        now
      );

      if (existingSet.has(employee.id)) {
        await tx
          .update(employeeSalaryConfigs)
          .set({
            baseSalaryAmount: baseSalaryAmount.toFixed(2),
            tenureAllowanceAmount: tenureAllowanceAmount.toFixed(2),
            updatedAt: now,
          })
          .where(eq(employeeSalaryConfigs.employeeId, employee.id));
      } else {
        await tx.insert(employeeSalaryConfigs).values({
          employeeId: employee.id,
          baseSalaryAmount: baseSalaryAmount.toFixed(2),
          tenureAllowanceAmount: tenureAllowanceAmount.toFixed(2),
          fulltimeBonusAmount: (
            employee.payrollStatus === "TRAINING"
              ? 0
              : BONUS_FULLTIME_DEFAULT
          ).toFixed(2),
        });
      }
    }
  });

  revalidatePath("/finance");
  revalidatePath("/payroll");
  return {
    success: true,
    message: `Sync selesai untuk ${employeeRows.length} karyawan aktif.`,
  };
}

export async function upsertGradeCompensationConfig(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = gradeCompensationConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Konfigurasi kompensasi grade tidak valid." };
  }

  const [grade] = await db
    .select({ id: grades.id, isActive: grades.isActive })
    .from(grades)
    .where(eq(grades.id, parsed.data.gradeId))
    .limit(1);

  if (!grade) return { error: "Grade tidak ditemukan." };
  if (!grade.isActive) return { error: "Hanya grade aktif yang dapat diatur." };

  const payload = {
    gradeId: parsed.data.gradeId,
    allowanceAmount: parsed.data.allowanceAmount?.toFixed(2) ?? null,
    bonusKinerja80: parsed.data.bonusKinerja80?.toFixed(2) ?? null,
    bonusKinerja90: parsed.data.bonusKinerja90?.toFixed(2) ?? null,
    bonusKinerja100: parsed.data.bonusKinerja100?.toFixed(2) ?? null,
    bonusKinerjaTeam80: parsed.data.bonusKinerjaTeam80?.toFixed(2) ?? null,
    bonusKinerjaTeam90: parsed.data.bonusKinerjaTeam90?.toFixed(2) ?? null,
    bonusKinerjaTeam100: parsed.data.bonusKinerjaTeam100?.toFixed(2) ?? null,
    bonusDisiplin80: parsed.data.bonusDisiplin80?.toFixed(2) ?? null,
    bonusDisiplin90: parsed.data.bonusDisiplin90?.toFixed(2) ?? null,
    bonusDisiplin100: parsed.data.bonusDisiplin100?.toFixed(2) ?? null,
    bonusPrestasi140: parsed.data.bonusPrestasi140?.toFixed(2) ?? null,
    bonusPrestasi165: parsed.data.bonusPrestasi165?.toFixed(2) ?? null,
    isActive: parsed.data.isActive ?? true,
  };

  const [existing] = await db
    .select({ id: gradeCompensationConfigs.id })
    .from(gradeCompensationConfigs)
    .where(eq(gradeCompensationConfigs.gradeId, parsed.data.gradeId))
    .limit(1);

  if (existing) {
    await db
      .update(gradeCompensationConfigs)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(gradeCompensationConfigs.gradeId, parsed.data.gradeId));
  } else {
    await db.insert(gradeCompensationConfigs).values(payload);
  }

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function upsertManagerialKpiSummary(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = managerialKpiSummarySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input KPI karyawan tetap tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "PAID" || period.status === "LOCKED") {
    return { error: "Periode payroll yang sudah paid/locked tidak bisa diubah lagi." };
  }

  const [employee] = await db
    .select({
      id: employees.id,
      employeeGroup: employees.employeeGroup,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!employee) return { error: "Karyawan tidak ditemukan." };
  if (!employee.isActive) return { error: "Karyawan nonaktif tidak dapat diset KPI payroll." };
  if (employee.employeeGroup !== "MANAGERIAL") {
    return { error: "KPI hanya berlaku untuk kelompok karyawan tetap." };
  }

  const [existing] = await db
    .select({ id: managerialKpiSummaries.id })
    .from(managerialKpiSummaries)
    .where(
      and(
        eq(managerialKpiSummaries.periodId, parsed.data.periodId),
        eq(managerialKpiSummaries.employeeId, parsed.data.employeeId)
      )
    )
    .limit(1);

  const payload = {
    periodId: parsed.data.periodId,
    employeeId: parsed.data.employeeId,
    performancePercent: parsed.data.performancePercent.toFixed(2),
    notes: parsed.data.notes || null,
    status: "VALIDATED" as const,
    validatedByUserId: user.id,
    validatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(managerialKpiSummaries)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(eq(managerialKpiSummaries.id, existing.id));
  } else {
    await db.insert(managerialKpiSummaries).values(payload);
  }

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function createPayrollPeriod(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = createPayrollPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input periode payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const { periodCode, periodStartDate, periodEndDate } = resolvePayrollPeriod(parsed.data.periodCode);

  const [existingPeriod] = await db
    .select({ id: payrollPeriods.id })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.periodCode, periodCode))
    .limit(1);

  if (existingPeriod) {
    return { error: "Periode payroll sudah ada." };
  }

  const [period] = await db
    .insert(payrollPeriods)
    .values({
      periodCode,
      periodStartDate,
      periodEndDate,
      notes: parsed.data.notes,
      createdByUserId: user.id,
    })
    .returning({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
    });

  await db.insert(payrollAuditLogs).values({
    periodId: period.id,
    action: "CREATE_PERIOD",
    actorUserId: user.id,
    actorRole: access.role,
    notes: parsed.data.notes ?? `Periode ${period.periodCode} dibuat.`,
    payload: { periodCode },
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true, periodId: period.id };
}

function encodeAdjustmentReason(
  category: AdjustmentCategory,
  description?: string,
  tenorMonthsRemaining?: number
): string {
  if (category === "CICILAN") {
    return `CICILAN::${tenorMonthsRemaining ?? 0}::${description ?? ""}`;
  }
  return description ? `${category}::${description}` : category;
}

function normalizeDivisionToken(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function isCsmDivision(divisionName: string | null | undefined) {
  return normalizeDivisionToken(divisionName).includes("CSM");
}

function isPrintingDivision(divisionName: string | null | undefined) {
  return normalizeDivisionToken(divisionName).includes("PRINTING");
}

export async function addPayrollAdjustment(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adjustment payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const { periodId, employeeId, category, amount, description, tenorMonthsRemaining } = parsed.data;

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "PAID" || period.status === "LOCKED") {
    return { error: "Adjustment tidak bisa ditambahkan pada periode yang sudah paid/locked." };
  }

  const [employee] = await db
    .select({
      id: employees.id,
      employeeGroup: employees.employeeGroup,
      isActive: employees.isActive,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) return { error: "Karyawan tidak ditemukan." };

  // Business rule: GANTI_RUGI_TEAM — managerial only
  if (category === "GANTI_RUGI_TEAM" && !isKpiEmployeeGroup(employee.employeeGroup)) {
    return { error: "Ganti Rugi Team hanya berlaku untuk karyawan tetap." };
  }

  const csmBonusCategories: AdjustmentCategory[] = [
    "BONUS_OMSET_1_CSM",
    "BONUS_OMSET_2_CSM",
    "BONUS_OMSET_3_CSM",
    "BONUS_KINERJA_CSM_TERTINGGI",
  ];

  if (csmBonusCategories.includes(category) && !isCsmDivision(employee.divisionName)) {
    return { error: "Kategori bonus ini hanya berlaku untuk karyawan divisi CSM." };
  }

  if (category === "BONUS_COUNTER_MESIN" && !isPrintingDivision(employee.divisionName)) {
    return { error: "Bonus Counter Mesin hanya berlaku untuk karyawan divisi Printing." };
  }

  // Business rule: GANTI_RUGI_PERSONAL / GANTI_RUGI_TEAM — max once per employee per period
  if (
    category === "GANTI_RUGI_PERSONAL"
    || category === "GANTI_RUGI_TEAM"
    || csmBonusCategories.includes(category)
    || category === "BONUS_COUNTER_MESIN"
  ) {
    const [existing] = await db
      .select({ id: payrollAdjustments.id })
      .from(payrollAdjustments)
      .where(
        and(
          eq(payrollAdjustments.periodId, periodId),
          eq(payrollAdjustments.employeeId, employeeId),
          like(payrollAdjustments.reason, `${category}%`)
        )
      )
      .limit(1);
    if (existing) {
      return { error: "Kategori adjustment ini sudah ada untuk karyawan ini di periode ini." };
    }
  }

  // Business rule: KASBON — max Rp 300.000 per employee per period
  if (category === "KASBON") {
    const existingKasbon = await db
      .select({ amount: payrollAdjustments.amount })
      .from(payrollAdjustments)
      .where(
        and(
          eq(payrollAdjustments.periodId, periodId),
          eq(payrollAdjustments.employeeId, employeeId),
          like(payrollAdjustments.reason, "KASBON%")
        )
      );
    const existingTotal = existingKasbon.reduce((acc, row) => acc + Number(row.amount), 0);
    const remaining = 300000 - existingTotal;
    if (amount > remaining) {
      return {
        error: `Total kasbon melebihi batas Rp 300.000/periode. Sisa: Rp ${remaining.toLocaleString("id-ID")}.`,
      };
    }
  }

  // CICILAN requires tenor
  if (category === "CICILAN" && !tenorMonthsRemaining) {
    return { error: "Sisa tenor cicilan wajib diisi." };
  }

  if (isRecurringAdjustmentCategory(category) && !employee.isActive) {
    return { error: "Adjustment recurring hanya berlaku untuk karyawan aktif." };
  }

  const adjustmentType = resolveAdjustmentTypeForCategory(category);
  const reason = encodeAdjustmentReason(category, description, tenorMonthsRemaining);
  const isRecurring = isRecurringAdjustmentCategory(category);

  await db.transaction(async (tx) => {
    if (isRecurring) {
      const [existingRecurring] = await tx
        .select({ id: recurringPayrollAdjustments.id })
        .from(recurringPayrollAdjustments)
        .where(
          and(
            eq(recurringPayrollAdjustments.employeeId, employeeId),
            eq(recurringPayrollAdjustments.category, category),
            eq(recurringPayrollAdjustments.isActive, true)
          )
        )
        .limit(1);

      if (existingRecurring) {
        await tx
          .update(recurringPayrollAdjustments)
          .set({
            adjustmentType,
            amount: amount.toFixed(2),
            reason,
            appliedByUserId: user.id,
            appliedByRole: access.role,
            updatedAt: new Date(),
          })
          .where(eq(recurringPayrollAdjustments.id, existingRecurring.id));
      } else {
        await tx.insert(recurringPayrollAdjustments).values({
          employeeId,
          adjustmentType,
          category,
          amount: amount.toFixed(2),
          reason,
          appliedByUserId: user.id,
          appliedByRole: access.role,
        });
      }
    } else {
      await tx.insert(payrollAdjustments).values({
        periodId,
        employeeId,
        adjustmentType,
        amount: amount.toFixed(2),
        reason,
        appliedByUserId: user.id,
        appliedByRole: access.role,
      });
    }

    await tx.insert(payrollAuditLogs).values({
      periodId,
      employeeId,
      action: "ADD_ADJUSTMENT",
      actorUserId: user.id,
      actorRole: access.role,
      notes: reason,
      payload: { category, adjustmentType, amount, recurring: isRecurring },
    });
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function updatePayrollAdjustment(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = updatePayrollAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data update tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const { periodId, adjustmentId, source, amount, description, tenorMonthsRemaining } = parsed.data;

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "PAID" || period.status === "LOCKED") {
    return { error: "Adjustment tidak bisa diubah pada periode yang sudah paid/locked." };
  }

  if (source === "PERIOD") {
    const [existing] = await db
      .select({
        id: payrollAdjustments.id,
        reason: payrollAdjustments.reason,
        employeeId: payrollAdjustments.employeeId,
      })
      .from(payrollAdjustments)
      .where(eq(payrollAdjustments.id, adjustmentId))
      .limit(1);

    if (!existing) return { error: "Adjustment tidak ditemukan." };

    const category = (existing.reason.split("::")[0] ?? "") as AdjustmentCategory;

    if (category === "KASBON") {
      const otherKasbon = await db
        .select({ amount: payrollAdjustments.amount })
        .from(payrollAdjustments)
        .where(
          and(
            eq(payrollAdjustments.periodId, periodId),
            eq(payrollAdjustments.employeeId, existing.employeeId),
            like(payrollAdjustments.reason, "KASBON%"),
            ne(payrollAdjustments.id, adjustmentId)
          )
        );
      const existingTotal = otherKasbon.reduce((acc, row) => acc + Number(row.amount), 0);
      const remaining = 300000 - existingTotal;
      if (amount > remaining) {
        return { error: `Total kasbon melebihi batas Rp 300.000/periode. Sisa: Rp ${remaining.toLocaleString("id-ID")}.` };
      }
    }

    const newReason = encodeAdjustmentReason(category, description, tenorMonthsRemaining);

    await db.transaction(async (tx) => {
      await tx
        .update(payrollAdjustments)
        .set({ amount: amount.toFixed(2), reason: newReason })
        .where(eq(payrollAdjustments.id, adjustmentId));

      await tx.insert(payrollAuditLogs).values({
        periodId,
        employeeId: existing.employeeId,
        action: "ADD_ADJUSTMENT",
        actorUserId: user.id,
        actorRole: access.role,
        notes: newReason,
        payload: { event: "UPDATE_ADJUSTMENT", adjustmentId, category, amount, source },
      });
    });
  } else {
    const [existing] = await db
      .select({
        id: recurringPayrollAdjustments.id,
        reason: recurringPayrollAdjustments.reason,
        employeeId: recurringPayrollAdjustments.employeeId,
        category: recurringPayrollAdjustments.category,
      })
      .from(recurringPayrollAdjustments)
      .where(
        and(
          eq(recurringPayrollAdjustments.id, adjustmentId),
          eq(recurringPayrollAdjustments.isActive, true)
        )
      )
      .limit(1);

    if (!existing) return { error: "Adjustment recurring tidak ditemukan." };

    const category = existing.category as AdjustmentCategory;
    const newReason = encodeAdjustmentReason(category, description, tenorMonthsRemaining);

    await db.transaction(async (tx) => {
      await tx
        .update(recurringPayrollAdjustments)
        .set({
          amount: amount.toFixed(2),
          reason: newReason,
          appliedByUserId: user.id,
          appliedByRole: access.role,
          updatedAt: new Date(),
        })
        .where(eq(recurringPayrollAdjustments.id, adjustmentId));

      await tx.insert(payrollAuditLogs).values({
        periodId,
        employeeId: existing.employeeId,
        action: "ADD_ADJUSTMENT",
        actorUserId: user.id,
        actorRole: access.role,
        notes: newReason,
        payload: { event: "UPDATE_ADJUSTMENT", adjustmentId, category, amount, source, recurring: true },
      });
    });
  }

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function deletePayrollAdjustment(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = deletePayrollAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adjustment payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const { periodId, adjustmentId, source } = parsed.data;

  const [period] = await db
    .select({ id: payrollPeriods.id, status: payrollPeriods.status })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (source === "PERIOD" && (period.status === "PAID" || period.status === "LOCKED")) {
    return { error: "Adjustment periode yang sudah paid/locked tidak bisa dihapus." };
  }

  if (source === "RECURRING") {
    const [adjustment] = await db
      .select({
        id: recurringPayrollAdjustments.id,
        employeeId: recurringPayrollAdjustments.employeeId,
        adjustmentType: recurringPayrollAdjustments.adjustmentType,
        amount: recurringPayrollAdjustments.amount,
        reason: recurringPayrollAdjustments.reason,
        category: recurringPayrollAdjustments.category,
      })
      .from(recurringPayrollAdjustments)
      .where(
        and(
          eq(recurringPayrollAdjustments.id, adjustmentId),
          eq(recurringPayrollAdjustments.isActive, true)
        )
      )
      .limit(1);

    if (!adjustment) return { error: "Adjustment recurring tidak ditemukan." };

    await db.transaction(async (tx) => {
      await tx
        .update(recurringPayrollAdjustments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(recurringPayrollAdjustments.id, adjustment.id));

      await tx.insert(payrollAuditLogs).values({
        periodId,
        employeeId: adjustment.employeeId,
        action: "ADD_ADJUSTMENT",
        actorUserId: user.id,
        actorRole: access.role,
        notes: adjustment.reason,
        payload: {
          event: "DELETE_ADJUSTMENT",
          source,
          adjustmentId,
          category: adjustment.category,
          adjustmentType: adjustment.adjustmentType,
          amount: Number(adjustment.amount),
          recurring: true,
        },
      });
    });
  } else {
    const [adjustment] = await db
      .select({
        id: payrollAdjustments.id,
        employeeId: payrollAdjustments.employeeId,
        adjustmentType: payrollAdjustments.adjustmentType,
        amount: payrollAdjustments.amount,
        reason: payrollAdjustments.reason,
      })
      .from(payrollAdjustments)
      .where(and(eq(payrollAdjustments.id, adjustmentId), eq(payrollAdjustments.periodId, periodId)))
      .limit(1);

    if (!adjustment) return { error: "Adjustment periode tidak ditemukan." };

    await db.transaction(async (tx) => {
      await tx.delete(payrollAdjustments).where(eq(payrollAdjustments.id, adjustment.id));

      await tx.insert(payrollAuditLogs).values({
        periodId,
        employeeId: adjustment.employeeId,
        action: "ADD_ADJUSTMENT",
        actorUserId: user.id,
        actorRole: access.role,
        notes: adjustment.reason,
        payload: {
          event: "DELETE_ADJUSTMENT",
          source,
          adjustmentId,
          adjustmentType: adjustment.adjustmentType,
          amount: Number(adjustment.amount),
          recurring: false,
        },
      });
    });
  }

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

type GeneratePayrollPreviewOptions = {
  revalidate?: boolean;
};

export async function generatePayrollPreview(input: unknown, options: GeneratePayrollPreviewOptions = {}) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollPeriodActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periode payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStartDate: payrollPeriods.periodStartDate,
      periodEndDate: payrollPeriods.periodEndDate,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "PAID" || period.status === "LOCKED") {
    return { error: "Periode payroll yang sudah paid/locked tidak bisa digenerate ulang." };
  }

  const periodStartDate = normalizeDate(period.periodStartDate);
  const periodEndDate = normalizeDate(period.periodEndDate);
  const periodDayCount = countCalendarDaysInclusive(periodStartDate, periodEndDate);

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      startDate: employees.startDate,
      branchId: employees.branchId,
      branchName: branches.name,
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      positionId: employees.positionId,
      positionName: positions.name,
      gradeId: employees.gradeId,
      gradeName: grades.name,
      employeeGroup: employees.employeeGroup,
      employmentStatus: employees.employmentStatus,
      payrollStatus: employees.payrollStatus,
      trainingGraduationDate: employees.trainingGraduationDate,
      isActive: employees.isActive,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(grades, eq(employees.gradeId, grades.id))
    .where(
      and(
        eq(employees.isActive, true),
        inArray(employees.payrollStatus, ["TRAINING", "REGULER", "FINAL_PAYROLL"])
      )
    )
    .orderBy(asc(employees.fullName));

  const employeeIds = employeeRows.map((row) => row.id);

  const salaryConfigRows = employeeIds.length > 0
    ? await db
        .select()
        .from(employeeSalaryConfigs)
        .where(inArray(employeeSalaryConfigs.employeeId, employeeIds))
    : [];

  const salaryConfigMap = new Map(salaryConfigRows.map((row) => [row.employeeId, row]));
  const hasGroupBaseSalaryColumn = await hasEmployeeGroupBaseSalaryColumn();
  const employeeGroupBaseSalaryMap = hasGroupBaseSalaryColumn
    ? new Map(
        (
          await db
            .select({
              employeeGroup: employeeGroupConfigs.employeeGroup,
              baseSalaryAmount: employeeGroupConfigs.baseSalaryAmount,
            })
            .from(employeeGroupConfigs)
        ).map((row) => [row.employeeGroup, toNumber(row.baseSalaryAmount)])
      )
    : new Map();
  const gradeCompensationRows = await db
    .select()
    .from(gradeCompensationConfigs)
    .where(eq(gradeCompensationConfigs.isActive, true));
  const gradeCompensationMap = new Map(gradeCompensationRows.map((row) => [row.gradeId, row]));

  const performanceRows = await db
    .select()
    .from(monthlyPointPerformances)
    .where(
      and(
        eq(monthlyPointPerformances.periodStartDate, period.periodStartDate),
        eq(monthlyPointPerformances.periodEndDate, period.periodEndDate)
      )
    );
  const performanceMap = new Map(performanceRows.map((row) => [row.employeeId, row]));

  const managerialKpiRows = employeeIds.length > 0
    ? await db
        .select()
        .from(managerialKpiSummaries)
        .where(
          and(
            eq(managerialKpiSummaries.periodId, parsed.data.periodId),
            inArray(managerialKpiSummaries.employeeId, employeeIds),
            eq(managerialKpiSummaries.status, "VALIDATED")
          )
        )
    : [];
  const managerialKpiMap = new Map(managerialKpiRows.map((row) => [row.employeeId, row]));

  const ticketRows = employeeIds.length > 0
    ? await db
        .select()
        .from(attendanceTickets)
        .where(
          and(
            inArray(attendanceTickets.employeeId, employeeIds),
            inArray(attendanceTickets.status, APPROVED_TICKET_STATUSES),
            lte(attendanceTickets.startDate, period.periodEndDate),
            gte(attendanceTickets.endDate, period.periodStartDate)
          )
        )
    : [];
  const ticketsByEmployee = new Map<string, typeof ticketRows>();
  for (const row of ticketRows) {
    const current = ticketsByEmployee.get(row.employeeId) ?? [];
    current.push(row);
    ticketsByEmployee.set(row.employeeId, current);
  }

  const incidentRows = employeeIds.length > 0
    ? await db
        .select()
        .from(incidentLogs)
        .where(
          and(
            inArray(incidentLogs.employeeId, employeeIds),
            eq(incidentLogs.isActive, true),
            gte(incidentLogs.incidentDate, period.periodStartDate),
            lte(incidentLogs.incidentDate, period.periodEndDate)
          )
        )
    : [];
  const incidentsByEmployee = new Map<string, typeof incidentRows>();
  for (const row of incidentRows) {
    const current = incidentsByEmployee.get(row.employeeId) ?? [];
    current.push(row);
    incidentsByEmployee.set(row.employeeId, current);
  }

  const attendanceRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: employeeAttendanceRecords.employeeId,
          attendanceDate: employeeAttendanceRecords.attendanceDate,
          attendanceStatus: employeeAttendanceRecords.attendanceStatus,
          punctualityStatus: employeeAttendanceRecords.punctualityStatus,
        })
        .from(employeeAttendanceRecords)
        .where(
          and(
            inArray(employeeAttendanceRecords.employeeId, employeeIds),
            gte(employeeAttendanceRecords.attendanceDate, period.periodStartDate),
            lte(employeeAttendanceRecords.attendanceDate, period.periodEndDate)
          )
        )
    : [];
  const attendanceByEmployee = new Map<string, typeof attendanceRows>();
  for (const row of attendanceRows) {
    const current = attendanceByEmployee.get(row.employeeId) ?? [];
    current.push(row);
    attendanceByEmployee.set(row.employeeId, current);
  }

  const approvedOvertimeRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: overtimeRequests.employeeId,
          totalAmount: overtimeRequests.totalAmount,
        })
        .from(overtimeRequests)
        .where(
          and(
            inArray(overtimeRequests.employeeId, employeeIds),
            eq(overtimeRequests.status, "APPROVED"),
            gte(overtimeRequests.requestDate, period.periodStartDate),
            lte(overtimeRequests.requestDate, period.periodEndDate),
          )
        )
    : [];
  const overtimeByEmployee = new Map<string, number>();
  for (const row of approvedOvertimeRows) {
    const current = overtimeByEmployee.get(row.employeeId) ?? 0;
    overtimeByEmployee.set(row.employeeId, roundCurrency(current + toNumber(row.totalAmount)));
  }

  const periodAdjustmentRows = await db
    .select({
      employeeId: payrollAdjustments.employeeId,
      adjustmentType: payrollAdjustments.adjustmentType,
      amount: payrollAdjustments.amount,
      reason: payrollAdjustments.reason,
    })
    .from(payrollAdjustments)
    .where(eq(payrollAdjustments.periodId, parsed.data.periodId));
  const recurringAdjustmentRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: recurringPayrollAdjustments.employeeId,
          adjustmentType: recurringPayrollAdjustments.adjustmentType,
          amount: recurringPayrollAdjustments.amount,
          reason: recurringPayrollAdjustments.reason,
        })
        .from(recurringPayrollAdjustments)
        .where(
          and(
            inArray(recurringPayrollAdjustments.employeeId, employeeIds),
            eq(recurringPayrollAdjustments.isActive, true)
          )
        )
    : [];
  const adjustmentRows = [
    ...periodAdjustmentRows.filter((row) => !isRecurringAdjustmentReason(row.reason)),
    ...recurringAdjustmentRows,
  ];
  const adjustmentsByEmployee = new Map<string, typeof adjustmentRows>();
  for (const row of adjustmentRows) {
    const current = adjustmentsByEmployee.get(row.employeeId) ?? [];
    current.push(row);
    adjustmentsByEmployee.set(row.employeeId, current);
  }

  // ── Bulk-fetch history snapshots (replaces ~900 per-employee queries) ──────
  // Gunakan tanggal hari ini (saat preview di-generate) agar mutasi yang baru
  // masuk ke snapshot — bukan periodStartDate yang bisa melewatkan mutasi mid-period.
  const snapshotAsOfDate = normalizeDate(new Date());

  const divHistoryRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: employeeDivisionHistories.employeeId,
          divisionId: employeeDivisionHistories.newDivisionId,
          divisionName: divisions.name,
          effectiveDate: employeeDivisionHistories.effectiveDate,
          createdAt: employeeDivisionHistories.createdAt,
        })
        .from(employeeDivisionHistories)
        .leftJoin(divisions, eq(employeeDivisionHistories.newDivisionId, divisions.id))
        .where(and(
          inArray(employeeDivisionHistories.employeeId, employeeIds),
          lte(employeeDivisionHistories.effectiveDate, snapshotAsOfDate)
        ))
    : [];
  const latestDivByEmployee = new Map<string, { divisionId: string | null; divisionName: string | null; effectiveDate: Date; createdAt: Date }>();
  for (const row of divHistoryRows) {
    const existing = latestDivByEmployee.get(row.employeeId);
    if (
      !existing ||
      row.createdAt > existing.createdAt ||
      (row.createdAt.getTime() === existing.createdAt.getTime() && row.effectiveDate > existing.effectiveDate)
    ) {
      latestDivByEmployee.set(row.employeeId, {
        divisionId: row.divisionId,
        divisionName: row.divisionName,
        effectiveDate: row.effectiveDate,
        createdAt: row.createdAt,
      });
    }
  }

  const posHistoryRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: employeePositionHistories.employeeId,
          positionId: employeePositionHistories.newPositionId,
          positionName: positions.name,
          effectiveDate: employeePositionHistories.effectiveDate,
          createdAt: employeePositionHistories.createdAt,
        })
        .from(employeePositionHistories)
        .leftJoin(positions, eq(employeePositionHistories.newPositionId, positions.id))
        .where(and(
          inArray(employeePositionHistories.employeeId, employeeIds),
          lte(employeePositionHistories.effectiveDate, snapshotAsOfDate)
        ))
    : [];
  const latestPosByEmployee = new Map<string, { positionId: string | null; positionName: string | null; effectiveDate: Date; createdAt: Date }>();
  for (const row of posHistoryRows) {
    const existing = latestPosByEmployee.get(row.employeeId);
    if (
      !existing ||
      row.createdAt > existing.createdAt ||
      (row.createdAt.getTime() === existing.createdAt.getTime() && row.effectiveDate > existing.effectiveDate)
    ) {
      latestPosByEmployee.set(row.employeeId, {
        positionId: row.positionId,
        positionName: row.positionName,
        effectiveDate: row.effectiveDate,
        createdAt: row.createdAt,
      });
    }
  }

  const gradeHistoryRows = employeeIds.length > 0
    ? await db
        .select({
          employeeId: employeeGradeHistories.employeeId,
          gradeId: employeeGradeHistories.newGradeId,
          gradeName: grades.name,
          effectiveDate: employeeGradeHistories.effectiveDate,
          createdAt: employeeGradeHistories.createdAt,
        })
        .from(employeeGradeHistories)
        .leftJoin(grades, eq(employeeGradeHistories.newGradeId, grades.id))
        .where(and(
          inArray(employeeGradeHistories.employeeId, employeeIds),
          lte(employeeGradeHistories.effectiveDate, snapshotAsOfDate)
        ))
    : [];
  const latestGradeByEmployee = new Map<string, { gradeId: string | null; gradeName: string | null; effectiveDate: Date; createdAt: Date }>();
  for (const row of gradeHistoryRows) {
    const existing = latestGradeByEmployee.get(row.employeeId);
    if (
      !existing ||
      row.createdAt > existing.createdAt ||
      (row.createdAt.getTime() === existing.createdAt.getTime() && row.effectiveDate > existing.effectiveDate)
    ) {
      latestGradeByEmployee.set(row.employeeId, {
        gradeId: row.gradeId,
        gradeName: row.gradeName,
        effectiveDate: row.effectiveDate,
        createdAt: row.createdAt,
      });
    }
  }

  // ── Bulk-fetch schedule assignments + work days ───────────────────────────
  const allAssignments = employeeIds.length > 0
    ? await db
        .select({
          employeeId: employeeScheduleAssignments.employeeId,
          scheduleId: employeeScheduleAssignments.scheduleId,
          effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
          effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
        })
        .from(employeeScheduleAssignments)
        .where(and(
          inArray(employeeScheduleAssignments.employeeId, employeeIds),
          lte(employeeScheduleAssignments.effectiveStartDate, periodEndDate),
          or(
            gte(employeeScheduleAssignments.effectiveEndDate, periodStartDate),
            isNull(employeeScheduleAssignments.effectiveEndDate)
          )
        ))
    : [];

  const allScheduleIds = [...new Set(allAssignments.map((a) => a.scheduleId))];
  const allWorkDayRows = allScheduleIds.length > 0
    ? await db
        .select({
          scheduleId: workScheduleDays.scheduleId,
          dayOfWeek: workScheduleDays.dayOfWeek,
          isWorkingDay: workScheduleDays.isWorkingDay,
        })
        .from(workScheduleDays)
        .where(inArray(workScheduleDays.scheduleId, allScheduleIds))
    : [];

  const workingDaysBySchedule = new Map<string, number[]>();
  for (const row of allWorkDayRows) {
    if (!row.isWorkingDay) continue;
    const current = workingDaysBySchedule.get(row.scheduleId) ?? [];
    current.push(row.dayOfWeek);
    workingDaysBySchedule.set(row.scheduleId, current);
  }

  const assignmentsByEmployee = new Map<string, typeof allAssignments>();
  for (const row of allAssignments) {
    const current = assignmentsByEmployee.get(row.employeeId) ?? [];
    current.push(row);
    assignmentsByEmployee.set(row.employeeId, current);
  }

  const computedRows: Array<{
    snapshot: typeof payrollEmployeeSnapshots.$inferInsert;
    result: typeof payrollResults.$inferInsert;
  }> = [];
  const missingManagerialKpi: string[] = [];

  for (const employee of employeeRows) {
    // Business alignment: active employment days in payroll snapshot always follows
    // the full calendar span of the payroll period (26-25), regardless of start date.
    const activeEmploymentDays = periodDayCount;

    // Division snapshot — from pre-fetched bulk data
    const divHistory = latestDivByEmployee.get(employee.id);
    const divisionSnapshot = {
      divisionSnapshotId: divHistory?.divisionId ?? employee.divisionId,
      divisionSnapshotName: divHistory?.divisionName ?? employee.divisionName ?? "UNKNOWN",
    };

    // Position snapshot
    const posHistory = latestPosByEmployee.get(employee.id);
    const positionSnapshot = {
      positionSnapshotId: posHistory?.positionId ?? employee.positionId,
      positionSnapshotName: posHistory?.positionName ?? employee.positionName ?? "UNKNOWN",
    };

    // Grade snapshot
    const gradeHistory = latestGradeByEmployee.get(employee.id);
    const gradeSnapshot = {
      gradeSnapshotId: gradeHistory?.gradeId ?? employee.gradeId,
      gradeSnapshotName: gradeHistory?.gradeName ?? employee.gradeName ?? null,
    };

    // Scheduled work days — from pre-fetched bulk data.
    // Fallback rule: if no schedule is assigned, target days use
    // active calendar days minus Sundays in the payroll period.
    const employeeAssignments = assignmentsByEmployee.get(employee.id) ?? [];
    const scheduledWorkDays = employeeAssignments.length > 0
      ? countTargetDaysForPeriod({
          periodStartDate,
          periodEndDate,
          assignments: employeeAssignments.map((a) => ({
            effectiveStartDate: a.effectiveStartDate,
            effectiveEndDate: a.effectiveEndDate,
            workingDays: workingDaysBySchedule.get(a.scheduleId) ?? [],
          })),
        })
      : Math.max(activeEmploymentDays - countSundaysInclusive(periodStartDate, periodEndDate), 0);

    const salaryConfig = salaryConfigMap.get(employee.id);
    const configuredBaseSalaryAmount = toNumber(salaryConfig?.baseSalaryAmount)
      || employeeGroupBaseSalaryMap.get(employee.employeeGroup)
      || (employee.payrollStatus === "TRAINING" ? GAJI_TRAINING_DEFAULT : GAJI_POKOK_REGULER_DEFAULT);
    const gradeCompensation = gradeSnapshot.gradeSnapshotId
      ? gradeCompensationMap.get(gradeSnapshot.gradeSnapshotId)
      : undefined;
    const gradeAllowanceAmount = toNumber(salaryConfig?.gradeAllowanceAmount)
      || toNumber(gradeCompensation?.allowanceAmount);
    const tenureAllowanceAmount = resolveTenureAllowanceAmount(
      employee.trainingGraduationDate,
      periodEndDate
    );
    const fulltimeBonusAmount = salaryConfig?.fulltimeBonusAmount != null
      ? toNumber(salaryConfig.fulltimeBonusAmount)
      : employee.payrollStatus === "TRAINING"
        ? 0
        : BONUS_FULLTIME_DEFAULT;
    const trainingGraduationBonusProrationRatio = resolveTrainingGraduationBonusProrationRatio({
      trainingGraduationDate: employee.trainingGraduationDate,
      periodStartDate,
      periodEndDate,
      scheduledWorkDays,
      assignments: employeeAssignments.map((a) => ({
        effectiveStartDate: a.effectiveStartDate,
        effectiveEndDate: a.effectiveEndDate,
        workingDays: workingDaysBySchedule.get(a.scheduleId) ?? [],
      })),
    });
    const fulltimeBonusProratedAmount = roundCurrency(
      fulltimeBonusAmount * trainingGraduationBonusProrationRatio
    );
    const graduatedWithinPeriod = isTrainingGraduatedWithinPeriod({
      trainingGraduationDate: employee.trainingGraduationDate,
      periodStartDate,
      periodEndDate,
    });
    const shouldApplyMidPeriodTrainingFeeRule = graduatedWithinPeriod && trainingGraduationBonusProrationRatio > 0;
    const baseSalaryAmount = shouldApplyMidPeriodTrainingFeeRule
      ? GAJI_TRAINING_DEFAULT
      : configuredBaseSalaryAmount;
    const trainingGraduationSalaryRemainderAmount = shouldApplyMidPeriodTrainingFeeRule
      ? roundCurrency((GAJI_POKOK_REGULER_DEFAULT - GAJI_TRAINING_DEFAULT) * trainingGraduationBonusProrationRatio)
      : 0;

    const performance = performanceMap.get(employee.id);
    const managerialKpi = managerialKpiMap.get(employee.id);
    const employeeTickets = ticketsByEmployee.get(employee.id) ?? [];
    const approvedUnpaidLeaveDays = employeeTickets
      .filter((ticket) => ticket.payrollImpact === "UNPAID")
      .reduce(
        (sum, ticket) => sum + countOverlapDays(ticket.startDate, ticket.endDate, periodStartDate, periodEndDate),
        0
      );
    const approvedPaidLeaveDays = employeeTickets
      .filter((ticket) => ticket.payrollImpact === "PAID_QUOTA_MONTHLY" || ticket.payrollImpact === "PAID_QUOTA_ANNUAL")
      .reduce(
        (sum, ticket) => sum + countOverlapDays(ticket.startDate, ticket.endDate, periodStartDate, periodEndDate),
        0
      );

    const employeeIncidents = incidentsByEmployee.get(employee.id) ?? [];
    const incidentTypes = employeeIncidents.map((incident) => incident.incidentType);
    const incidentDeductionAmount = roundCurrency(
      employeeIncidents
        .filter((incident) => !isSpIncidentType(incident.incidentType))
        .reduce((sum, incident) => sum + toNumber(incident.payrollDeduction), 0)
    );
    const spPenaltyMultiplier = 1;

    const employeeAdjustments = adjustmentsByEmployee.get(employee.id) ?? [];
    const manualAdjustmentAmountBase = roundCurrency(
      employeeAdjustments.reduce((sum, adjustment) => {
        const signedAmount = toNumber(adjustment.amount)
          * (adjustment.adjustmentType === "ADDITION" ? 1 : -1);
        return sum + signedAmount;
      }, 0)
    );
    const manualAdjustmentAmount = roundCurrency(
      manualAdjustmentAmountBase + trainingGraduationSalaryRemainderAmount
    );
    const overtimeAmount = roundCurrency(overtimeByEmployee.get(employee.id) ?? 0);

    const hasApprovedAbsence = approvedUnpaidLeaveDays + approvedPaidLeaveDays > 0;
    const attendanceSummary = resolveAttendancePayrollEligibility({
      scheduledWorkDays,
      records: attendanceByEmployee.get(employee.id) ?? [],
    });
    // Gunakan performancePercent tersimpan langsung — tidak dihitung ulang dari
    // totalApprovedPoints/totalTargetPoints agar input HRD tetap valid meski targetDays = 0.
    const teamworkPerformancePercent = performance
      ? toNumber(performance.performancePercent)
      : 0;
    // Karyawan tetap: utamakan managerialKpiSummaries (validated finance), fallback ke
    // monthly_point_performances (input HRD) agar tidak 0 ketika period dibuat setelah input.
    const managerialPerformancePercent = managerialKpi
      ? toNumber(managerialKpi.performancePercent)
      : toNumber(performance?.performancePercent);
    const isKpiEmployee = isKpiEmployeeGroup(employee.employeeGroup);
    const isPointEmployee = isPointBasedEmployeeGroup(employee.employeeGroup);
    const rawPerformancePercent =
      isKpiEmployee
        ? managerialPerformancePercent
        : teamworkPerformancePercent;
    const spPerformancePenalty = resolveSpPerformancePenalty(rawPerformancePercent, incidentTypes);
    const performancePercent = spPerformancePenalty.adjustedPerformancePercent;
    const performanceBonusByGrade = resolveTieredBonusAmount(
      performancePercent,
      toNumber(gradeCompensation?.bonusKinerja80),
      toNumber(gradeCompensation?.bonusKinerja90),
      toNumber(gradeCompensation?.bonusKinerja100)
    );
    const teamBonusByGrade = resolveTieredBonusAmount(
      performancePercent,
      toNumber(gradeCompensation?.bonusKinerjaTeam80),
      toNumber(gradeCompensation?.bonusKinerjaTeam90),
      toNumber(gradeCompensation?.bonusKinerjaTeam100)
    );
    const configuredDisciplineBonusAmount = toNumber(salaryConfig?.disciplineBonusAmount);
    const disciplineBonusTier80Amount = configuredDisciplineBonusAmount
      || toNumber(gradeCompensation?.bonusDisiplin80);
    const disciplineBonusTier90Amount = configuredDisciplineBonusAmount
      || toNumber(gradeCompensation?.bonusDisiplin90);
    const disciplineBonusTier100Amount = configuredDisciplineBonusAmount
      || toNumber(gradeCompensation?.bonusDisiplin100);
    const achievementBonus140Amount = toNumber(salaryConfig?.achievementBonus140Amount)
      || toNumber(gradeCompensation?.bonusPrestasi140);
    const achievementBonus165Amount = toNumber(salaryConfig?.achievementBonus165Amount)
      || toNumber(gradeCompensation?.bonusPrestasi165);
    const performanceBonusBaseAmountRaw = toNumber(salaryConfig?.performanceBonusBaseAmount)
      || performanceBonusByGrade;
    const performanceBonusBaseAmount = shouldApplyMidPeriodTrainingFeeRule
      ? roundCurrency(performanceBonusBaseAmountRaw * trainingGraduationBonusProrationRatio)
      : performanceBonusBaseAmountRaw;
    const teamBonusAmount = toNumber(salaryConfig?.teamBonusAmount)
      || teamBonusByGrade;
    const fulltimeEligible = attendanceSummary.fulltimeEligible && !hasApprovedAbsence;
    const {
      disciplineBonusAmount: disciplineBonusBaseAmount,
      disciplineEligible,
      disciplinePercent,
    } = resolveDisciplineBonus({
      ruleEnabled: attendanceSummary.hasAttendanceData,
      lateDays: attendanceSummary.lateDays,
      bonusTier80Amount: disciplineBonusTier80Amount,
      bonusTier90Amount: disciplineBonusTier90Amount,
      bonusTier100Amount: disciplineBonusTier100Amount,
    });
    const disciplineBonusAmount = roundCurrency(
      disciplineBonusBaseAmount * trainingGraduationBonusProrationRatio
    );

    if (isKpiEmployee && !managerialKpi) {
      missingManagerialKpi.push(employee.fullName);
      // Lanjutkan komputasi dengan performancePercent = 0 (bonus kinerja/disiplin/tim = 0)
    }

    const payrollCalc = isKpiEmployee
      ? calculateManagerialPayroll({
          baseSalaryAmount,
          periodDayCount,
          activeEmploymentDays,
          scheduledWorkDays,
          unpaidLeaveDays: approvedUnpaidLeaveDays,
          performancePercent,
          performanceBonusBaseAmount,
          fulltimeBonusAmount: fulltimeBonusProratedAmount,
          disciplineBonusAmount,
          teamBonusAmount,
          fulltimeEligible,
          disciplineEligible,
          spPenaltyMultiplier,
          incidentDeductionAmount,
          manualAdjustmentAmount,
        })
      : calculateTeamworkPayroll({
          payrollStatus: employee.payrollStatus,
          baseSalaryAmount,
          periodDayCount,
          activeEmploymentDays,
          scheduledWorkDays,
          presentDays: attendanceSummary.presentDays,
          unpaidLeaveDays: approvedUnpaidLeaveDays,
          performancePercent,
          performanceBonusBaseAmount,
          achievementBonus140Amount,
          achievementBonus165Amount,
          fulltimeBonusAmount: fulltimeBonusProratedAmount,
          disciplineBonusAmount,
          teamBonusAmount,
          fulltimeEligible,
          disciplineEligible,
          spPenaltyMultiplier,
          incidentDeductionAmount,
          manualAdjustmentAmount,
        });

    const takeHomePay = roundCurrency(
      payrollCalc.takeHomePay + gradeAllowanceAmount + tenureAllowanceAmount + overtimeAmount
    );
    const totalAdditionAmount = roundCurrency(
      gradeAllowanceAmount +
        tenureAllowanceAmount +
        overtimeAmount +
        payrollCalc.performanceBonusAmount +
        payrollCalc.achievementBonusAmount +
        payrollCalc.fulltimeBonusPaid +
        payrollCalc.disciplineBonusPaid +
        payrollCalc.teamBonusPaid +
        Math.max(manualAdjustmentAmount, 0)
    );
    const totalDeductionAmount = roundCurrency(
      payrollCalc.unpaidLeaveDeductionAmount +
        payrollCalc.incidentDeductionAmount +
        Math.abs(Math.min(manualAdjustmentAmount, 0))
    );

    computedRows.push({
      snapshot: {
        periodId: parsed.data.periodId,
        employeeId: employee.id,
        employeeCodeSnapshot: employee.employeeCode,
        employeeNameSnapshot: employee.fullName,
        branchSnapshotId: employee.branchId,
        branchSnapshotName: employee.branchName,
        divisionSnapshotId: divisionSnapshot.divisionSnapshotId,
        divisionSnapshotName: divisionSnapshot.divisionSnapshotName,
        positionSnapshotId: positionSnapshot.positionSnapshotId,
        positionSnapshotName: positionSnapshot.positionSnapshotName,
        gradeSnapshotId: gradeSnapshot.gradeSnapshotId,
        gradeSnapshotName: gradeSnapshot.gradeSnapshotName,
        employeeGroupSnapshot: employee.employeeGroup,
        employmentStatusSnapshot: employee.employmentStatus,
        payrollStatusSnapshot: employee.payrollStatus,
        baseSalaryAmount: baseSalaryAmount.toFixed(2),
        gradeAllowanceAmount: gradeAllowanceAmount.toFixed(2),
        tenureAllowanceAmount: tenureAllowanceAmount.toFixed(2),
        dailyAllowanceAmount: "0.00",
        performanceBonusBaseAmount: performanceBonusBaseAmount.toFixed(2),
        achievementBonus140Amount: achievementBonus140Amount.toFixed(2),
        achievementBonus165Amount: achievementBonus165Amount.toFixed(2),
        fulltimeBonusAmount: fulltimeBonusProratedAmount.toFixed(2),
        disciplineBonusAmount: disciplineBonusAmount.toFixed(2),
        teamBonusAmount: teamBonusAmount.toFixed(2),
        overtimeRateAmount: "0.00",
        scheduledWorkDays,
        activeEmploymentDays,
      },
      result: {
        periodId: parsed.data.periodId,
        employeeId: employee.id,
        snapshotId: "" as string,
        monthlyPerformanceId: isPointEmployee ? (performance?.id ?? null) : null,
        managerialKpiSummaryId: isKpiEmployee ? (managerialKpi?.id ?? null) : null,
        performancePercent: performancePercent.toFixed(2),
        totalApprovedPoints:
          isPointEmployee ? toNumber(performance?.totalApprovedPoints).toFixed(2) : "0.00",
        totalTargetPoints:
          isPointEmployee ? toNumber(performance?.totalTargetPoints).toFixed(2) : "0.00",
        approvedUnpaidLeaveDays,
        approvedPaidLeaveDays,
        incidentDeductionAmount: payrollCalc.incidentDeductionAmount.toFixed(2),
        spPenaltyMultiplier: spPenaltyMultiplier.toFixed(2),
        manualAdjustmentAmount: manualAdjustmentAmount.toFixed(2),
        baseSalaryPaid: payrollCalc.baseSalaryPaid.toFixed(2),
        gradeAllowancePaid: gradeAllowanceAmount.toFixed(2),
        tenureAllowancePaid: tenureAllowanceAmount.toFixed(2),
        dailyAllowancePaid: "0.00",
        overtimeAmount: overtimeAmount.toFixed(2),
        bonusFulltimeAmount: payrollCalc.fulltimeBonusPaid.toFixed(2),
        bonusDisciplineAmount: payrollCalc.disciplineBonusPaid.toFixed(2),
        bonusKinerjaAmount: payrollCalc.performanceBonusAmount.toFixed(2),
        bonusPrestasiAmount: payrollCalc.achievementBonusAmount.toFixed(2),
        bonusTeamAmount: payrollCalc.teamBonusPaid.toFixed(2),
        totalAdditionAmount: totalAdditionAmount.toFixed(2),
        totalDeductionAmount: totalDeductionAmount.toFixed(2),
        takeHomePay: takeHomePay.toFixed(2),
        breakdown: {
          fulltimeEligible,
          disciplineEligible,
          attendanceHasData: attendanceSummary.hasAttendanceData,
          attendanceRecordedWorkDays: attendanceSummary.recordedWorkDays,
          attendancePresentDays: attendanceSummary.presentDays,
          attendanceAbsenceDays: attendanceSummary.absenceDays,
          attendanceLateDays: attendanceSummary.lateDays,
          attendanceFulltimeEligible: attendanceSummary.fulltimeEligible,
          attendanceDisciplineEligible: attendanceSummary.disciplineEligible,
          disciplinePercent,
          trainingGraduationBonusProrationRatio,
          trainingGraduationSalaryRemainderAmount,
          midPeriodTrainingFeeRuleApplied: shouldApplyMidPeriodTrainingFeeRule,
          approvedUnpaidLeaveDays,
          approvedPaidLeaveDays,
          unpaidLeaveDeductionAmount: payrollCalc.unpaidLeaveDeductionAmount,
          incidentDeductionAmount: payrollCalc.incidentDeductionAmount,
          manualAdjustmentAmount,
          scheduledWorkDays,
          activeEmploymentDays,
          rawPerformancePercent,
          adjustedPerformancePercent: performancePercent,
          spPerformancePenaltyType: spPerformancePenalty.penaltyType,
          spPerformancePenaltyPercent: spPerformancePenalty.penaltyPercent,
          performanceSource: isKpiEmployee ? "MANAGERIAL_KPI" : "MONTHLY_POINT_PERFORMANCE",
        },
        status: "DRAFT" satisfies PayrollPeriodStatus,
      },
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(payrollResults).where(eq(payrollResults.periodId, parsed.data.periodId));
    await tx.delete(payrollEmployeeSnapshots).where(eq(payrollEmployeeSnapshots.periodId, parsed.data.periodId));

    if (computedRows.length > 0) {
      // Batch insert all snapshots, then batch insert all results
      const insertedSnapshots = await tx
        .insert(payrollEmployeeSnapshots)
        .values(computedRows.map((row) => row.snapshot))
        .returning({ id: payrollEmployeeSnapshots.id, employeeId: payrollEmployeeSnapshots.employeeId });

      const snapshotIdByEmployee = new Map(insertedSnapshots.map((s) => [s.employeeId, s.id]));

      await tx.insert(payrollResults).values(
        computedRows.map((row) => ({
          ...row.result,
          snapshotId: snapshotIdByEmployee.get(row.snapshot.employeeId) ?? "",
        }))
      );
    }

    await tx
      .update(payrollPeriods)
      .set({
        status: "DRAFT",
        previewGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollPeriods.id, parsed.data.periodId));

    await tx.insert(payrollAuditLogs).values({
      periodId: parsed.data.periodId,
      action: "GENERATE_PREVIEW",
      actorUserId: user.id,
      actorRole: access.role,
      notes: `Preview payroll ${period.periodCode} digenerate.`,
      payload: {
        generatedEmployees: computedRows.length,
      },
    });
  });

  if (options.revalidate !== false) {
    revalidatePath("/payroll");
    revalidatePath("/finance");
  }
  return {
    success: true,
    generatedEmployees: computedRows.length,
    warning: missingManagerialKpi.length > 0
      ? `KPI belum diisi untuk: ${missingManagerialKpi.slice(0, 5).join(", ")}${missingManagerialKpi.length > 5 ? ` dan ${missingManagerialKpi.length - 5} lainnya` : ""}. Bonus kinerja/disiplin/tim bernilai 0 sampai KPI dilengkapi.`
      : undefined,
  };
}

export async function finalizePayroll(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollPeriodActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periode payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStartDate: payrollPeriods.periodStartDate,
      periodEndDate: payrollPeriods.periodEndDate,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "PAID" || period.status === "LOCKED") {
    return { error: "Periode payroll yang sudah paid/locked tidak bisa difinalisasi ulang." };
  }

  const [resultCount] = await db
    .select({ count: count() })
    .from(payrollResults)
    .where(eq(payrollResults.periodId, parsed.data.periodId));

  if (!Number(resultCount?.count ?? 0)) {
    return { error: "Belum ada preview payroll untuk periode ini." };
  }

  const lockableActivities = await db
    .select({ id: dailyActivityEntries.id })
    .from(dailyActivityEntries)
    .where(
      and(
        gte(dailyActivityEntries.workDate, period.periodStartDate),
        lte(dailyActivityEntries.workDate, period.periodEndDate),
        inArray(dailyActivityEntries.status, LOCKABLE_ACTIVITY_STATUSES)
      )
    );

  await db.transaction(async (tx) => {
    await tx
      .update(payrollResults)
      .set({
        status: "FINALIZED",
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollResults.periodId, parsed.data.periodId));

    await tx
      .update(payrollPeriods)
      .set({
        status: "FINALIZED",
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollPeriods.id, parsed.data.periodId));

    await tx
      .update(monthlyPointPerformances)
      .set({
        status: "LOCKED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(monthlyPointPerformances.periodStartDate, period.periodStartDate),
          eq(monthlyPointPerformances.periodEndDate, period.periodEndDate)
        )
      );

    if (lockableActivities.length > 0) {
      const activityIds = lockableActivities.map((activity) => activity.id);

      await tx
        .update(dailyActivityEntries)
        .set({
          status: "DIKUNCI_PAYROLL",
          lockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(dailyActivityEntries.id, activityIds));

      await tx.insert(dailyActivityApprovalLogs).values(
        activityIds.map((activityId) => ({
          activityEntryId: activityId,
          action: "LOCK_PAYROLL" as const,
          actorUserId: user.id,
          actorRole: access.role,
          notes: `Dikunci payroll ${period.periodCode}`,
        }))
      );
    }

    await tx.insert(payrollAuditLogs).values({
      periodId: parsed.data.periodId,
      action: "FINALIZE",
      actorUserId: user.id,
      actorRole: access.role,
      notes: `Payroll ${period.periodCode} difinalisasi.`,
      payload: {
        lockedActivities: lockableActivities.length,
      },
    });
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function markPayrollPaid(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollPeriodActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periode payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };

  const transition = resolvePayrollStatusTransition(period.status as PayrollPeriodStatus, "mark_paid");
  if (!transition.allowed) {
    return { error: transition.reason ?? "Periode payroll tidak bisa ditandai PAID." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payrollPeriods)
      .set({
        status: transition.nextStatus,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollPeriods.id, parsed.data.periodId));

    await tx
      .update(payrollResults)
      .set({
        status: transition.nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(payrollResults.periodId, parsed.data.periodId));

    await tx
      .update(managerialKpiSummaries)
      .set({
        status: "LOCKED",
        updatedAt: new Date(),
      })
      .where(eq(managerialKpiSummaries.periodId, parsed.data.periodId));

    await tx.insert(payrollAuditLogs).values({
      periodId: parsed.data.periodId,
      action: "MARK_PAID",
      actorUserId: user.id,
      actorRole: access.role,
      notes: `Payroll ${period.periodCode} ditandai PAID.`,
      payload: { nextStatus: transition.nextStatus },
    });
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function lockPayrollPeriod(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollPeriodActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periode payroll tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };

  const transition = resolvePayrollStatusTransition(period.status as PayrollPeriodStatus, "lock");
  if (!transition.allowed) {
    return { error: transition.reason ?? "Periode payroll tidak bisa dikunci." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payrollPeriods)
      .set({
        status: transition.nextStatus,
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payrollPeriods.id, parsed.data.periodId));

    await tx
      .update(payrollResults)
      .set({
        status: transition.nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(payrollResults.periodId, parsed.data.periodId));

    await tx.insert(payrollAuditLogs).values({
      periodId: parsed.data.periodId,
      action: "LOCK",
      actorUserId: user.id,
      actorRole: access.role,
      notes: `Payroll ${period.periodCode} dikunci.`,
      payload: { nextStatus: transition.nextStatus },
    });
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function deletePayrollPeriod(input: unknown) {
  const access = await assertPayrollWriteAccess();
  if ("error" in access) return access;

  const parsed = payrollPeriodActionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periode payroll tidak valid." };
  }

  const [period] = await db
    .select({
      id: payrollPeriods.id,
      periodCode: payrollPeriods.periodCode,
      periodStartDate: payrollPeriods.periodStartDate,
      periodEndDate: payrollPeriods.periodEndDate,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.id, parsed.data.periodId))
    .limit(1);

  if (!period) return { error: "Periode payroll tidak ditemukan." };
  if (period.status === "LOCKED") {
    return { error: "Periode yang sudah dikunci (LOCKED) tidak bisa dihapus." };
  }

  await db.transaction(async (tx) => {
    // Buka kunci aktivitas harian yang dikunci saat finalisasi (hanya berlaku jika FINALIZED/PAID)
    await tx
      .update(dailyActivityEntries)
      .set({ status: "DISETUJUI_SPV", lockedAt: null, updatedAt: new Date() })
      .where(
        and(
          gte(dailyActivityEntries.workDate, period.periodStartDate),
          lte(dailyActivityEntries.workDate, period.periodEndDate),
          eq(dailyActivityEntries.status, "DIKUNCI_PAYROLL")
        )
      );

    // Buka kunci performa bulanan
    await tx
      .update(monthlyPointPerformances)
      .set({ status: "FINALIZED", updatedAt: new Date() })
      .where(
        and(
          eq(monthlyPointPerformances.periodStartDate, period.periodStartDate),
          eq(monthlyPointPerformances.periodEndDate, period.periodEndDate),
          eq(monthlyPointPerformances.status, "LOCKED")
        )
      );

    // Hapus periode — cascade menghapus snapshots, results, adjustments, audit_logs
    await tx.delete(payrollPeriods).where(eq(payrollPeriods.id, parsed.data.periodId));
  });

  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}
