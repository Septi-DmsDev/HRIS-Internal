"use server";

import { db } from "@/lib/db";
import {
  employeeDivisionHistories,
  employeeScheduleAssignments,
  employees,
} from "@/lib/db/schema/employee";
import { divisions } from "@/lib/db/schema/master";
import { managerialKpiSummaries, payrollPeriods } from "@/lib/db/schema/payroll";
import {
  dailyActivityApprovalLogs,
  dailyActivityEntries,
  monthlyPointPerformances,
  pointCatalogEntries,
  pointCatalogVersions,
  activityStatusEnum,
} from "@/lib/db/schema/point";
import {
  checkRole,
  getCurrentUserRoleRow,
  getUser,
  requireAuth,
} from "@/lib/auth/session";
import {
  KPI_EMPLOYEE_GROUPS,
  POINT_EMPLOYEE_GROUPS,
  isKpiEmployeeGroup,
  type EmployeeGroup,
} from "@/lib/employee-groups";
import {
  appendToPendingDraftSchema,
  batchSubmitDraftSchema,
  dailyActivityDecisionSchema,
  dailyActivityEntrySchema,
  employeeMonthlyPerformanceInputSchema,
  monthlyPerformanceGenerationSchema,
  updatePendingActivityEntrySchema,
} from "@/lib/validations/point";
import { resolvePayrollPeriod } from "@/server/payroll-engine/resolve-payroll-period";
import { userRoles } from "@/lib/db/schema/auth";
import { calculateMonthlyPointPerformance } from "@/server/point-engine/calculate-monthly-point-performance";
import { countAssignedDaysForPeriod } from "@/server/point-engine/count-assigned-days-for-period";
import { resolvePointTargetForDivision } from "@/config/constants";
import {
  getActivePointCatalogVersion,
  getPointCatalogEntriesByVersion,
} from "@/server/services/point-catalog-service";
import {
  encodeLegacyNotes,
} from "@/lib/performance/job-id";
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { date, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { UserRole } from "@/types";

const PERFORMANCE_ACTIVITY_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "KABAG", "SPV"];
const PERFORMANCE_SELF_SERVICE_ROLES: UserRole[] = ["TEAMWORK", "MANAGERIAL"];
const PERFORMANCE_GENERATE_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD"];
const PERFORMANCE_MANAGERIAL_INPUT_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD"];
const MANAGERIAL_TARGET_ROLES: UserRole[] = ["KABAG", "SPV", "MANAGERIAL"];
const APPROVABLE_STATUSES = ["DIAJUKAN", "DIAJUKAN_ULANG"] as const;
const MUTABLE_ACTIVITY_STATUSES = ["DRAFT", "DITOLAK_SPV", "REVISI_TW"] as const;
const DIV_SCOPED_ROLES: UserRole[] = ["SPV", "KABAG"];
let hasJobIdSnapshotColumnPromise: Promise<boolean> | null = null;
let hasMonthlyInputSourceColumnPromise: Promise<boolean> | null = null;
let employeeGroupEnumValuesPromise: Promise<Set<EmployeeGroup>> | null = null;

const dailyActivityEntriesLegacy = pgTable("daily_activity_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  workDate: date("work_date", { mode: "date" }).notNull(),
  actualDivisionId: uuid("actual_division_id").references(() => divisions.id, { onDelete: "set null" }),
  pointCatalogEntryId: uuid("point_catalog_entry_id").notNull().references(() => pointCatalogEntries.id, { onDelete: "restrict" }),
  pointCatalogVersionId: uuid("point_catalog_version_id").notNull().references(() => pointCatalogVersions.id, { onDelete: "restrict" }),
  pointCatalogDivisionName: varchar("point_catalog_division_name", { length: 100 }).notNull(),
  workNameSnapshot: text("work_name_snapshot").notNull(),
  unitDescriptionSnapshot: text("unit_description_snapshot"),
  pointValueSnapshot: numeric("point_value_snapshot", { precision: 12, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  totalPoints: numeric("total_points", { precision: 14, scale: 2 }).notNull(),
  status: activityStatusEnum("status").notNull(),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function ensurePerformanceReadRole(role: UserRole) {
  return ["SUPER_ADMIN", "HRD", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL"].includes(role);
}

async function getSupportedEmployeeGroupValues() {
  if (!employeeGroupEnumValuesPromise) {
    employeeGroupEnumValuesPromise = db
      .execute(
        sql<{ enumlabel: string }>`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'employee_group'`
      )
      .then((rows) => new Set(rows.map((row) => row.enumlabel as EmployeeGroup)))
      .catch(() => new Set<EmployeeGroup>());
  }

  return employeeGroupEnumValuesPromise;
}

async function resolveQueryEmployeeGroups(preferred: readonly EmployeeGroup[], fallback: readonly EmployeeGroup[]) {
  const supported = await getSupportedEmployeeGroupValues();
  const preferredGroups = preferred.filter((group) => supported.has(group));
  if (preferredGroups.length > 0) return preferredGroups;

  const fallbackGroups = fallback.filter((group) => supported.has(group));
  if (fallbackGroups.length > 0) return fallbackGroups;

  return [...fallback];
}

async function hasJobIdSnapshotColumn() {
  if (!hasJobIdSnapshotColumnPromise) {
    hasJobIdSnapshotColumnPromise = db
      .execute(
        sql<{ has_column: boolean }>`
          select exists (
            select 1
            from information_schema.columns
            where table_name = 'daily_activity_entries'
              and column_name = 'job_id_snapshot'
          ) as has_column
        `,
      )
      .then((rows) => Boolean(rows[0]?.has_column))
      .catch(() => false);
  }

  return hasJobIdSnapshotColumnPromise;
}

async function hasMonthlyInputSourceColumn() {
  if (!hasMonthlyInputSourceColumnPromise) {
    hasMonthlyInputSourceColumnPromise = db
      .execute(
        sql<{ has_column: boolean }>`
          select exists (
            select 1
            from information_schema.columns
            where table_name = 'monthly_point_performances'
              and column_name = 'input_source'
          ) as has_column
        `,
      )
      .then((rows) => Boolean(rows[0]?.has_column))
      .catch(() => false);
  }

  return hasMonthlyInputSourceColumnPromise;
}

async function getScopedTeamworkEmployees(role: UserRole, divisionIds: string[]) {
  const employeeGroups = await resolveQueryEmployeeGroups(POINT_EMPLOYEE_GROUPS, ["TEAMWORK"]);

  if (DIV_SCOPED_ROLES.includes(role) && divisionIds.length > 0) {
    return db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        divisionId: employees.divisionId,
        divisionName: divisions.name,
        employeeGroup: employees.employeeGroup,
        employmentStatus: employees.employmentStatus,
        isActive: employees.isActive,
      })
      .from(employees)
      .leftJoin(divisions, eq(employees.divisionId, divisions.id))
      .where(
        and(
          inArray(employees.employeeGroup, employeeGroups),
          eq(employees.isActive, true),
          inArray(employees.divisionId, divisionIds)
        )
      )
      .orderBy(asc(employees.fullName));
  }

  return db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      employeeGroup: employees.employeeGroup,
      employmentStatus: employees.employmentStatus,
      isActive: employees.isActive,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(and(inArray(employees.employeeGroup, employeeGroups), eq(employees.isActive, true)))
    .orderBy(asc(employees.fullName));
}

async function getManagerialEmployeeOptions(role: UserRole) {
  if (!PERFORMANCE_MANAGERIAL_INPUT_ROLES.includes(role)) {
    return [];
  }

  const employeeGroups = await resolveQueryEmployeeGroups(KPI_EMPLOYEE_GROUPS, ["MANAGERIAL"]);

  return db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionId: employees.divisionId,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(
      and(
        inArray(employees.employeeGroup, employeeGroups),
        eq(employees.isActive, true)
      )
    )
    .orderBy(asc(employees.fullName));
}

async function getScopedActivityEntries(role: UserRole, divisionIds: string[], employeeId?: string | null) {
  const entryDivision = aliasedTable(divisions, "entry_division");
  const employeeDivision = aliasedTable(divisions, "employee_division");
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const baseQuery = db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      pointCatalogEntryId: dailyActivityEntries.pointCatalogEntryId,
      jobIdSnapshot: hasSnapshotColumn ? dailyActivityEntries.jobIdSnapshot : pointCatalogEntries.externalCode,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      employeeDivisionId: employees.divisionId,
      employeeDivisionName: employeeDivision.name,
      workDate: dailyActivityEntries.workDate,
      actualDivisionId: dailyActivityEntries.actualDivisionId,
      actualDivisionName: entryDivision.name,
      workNameSnapshot: dailyActivityEntries.workNameSnapshot,
      pointCatalogDivisionName: dailyActivityEntries.pointCatalogDivisionName,
      pointValueSnapshot: dailyActivityEntries.pointValueSnapshot,
      quantity: dailyActivityEntries.quantity,
      totalPoints: dailyActivityEntries.totalPoints,
      status: dailyActivityEntries.status,
      notes: dailyActivityEntries.notes,
      submittedAt: dailyActivityEntries.submittedAt,
      approvedAt: dailyActivityEntries.approvedAt,
      rejectedAt: dailyActivityEntries.rejectedAt,
      createdAt: dailyActivityEntries.createdAt,
    })
    .from(dailyActivityEntries)
    .leftJoin(employees, eq(dailyActivityEntries.employeeId, employees.id))
    .leftJoin(pointCatalogEntries, eq(dailyActivityEntries.pointCatalogEntryId, pointCatalogEntries.id))
    .leftJoin(entryDivision, eq(dailyActivityEntries.actualDivisionId, entryDivision.id))
    .leftJoin(employeeDivision, eq(employees.divisionId, employeeDivision.id));

  if (DIV_SCOPED_ROLES.includes(role) && divisionIds.length > 0) {
    return baseQuery
      .where(inArray(employees.divisionId, divisionIds))
      .orderBy(desc(dailyActivityEntries.workDate), desc(dailyActivityEntries.createdAt));
  }

  if (PERFORMANCE_SELF_SERVICE_ROLES.includes(role) && employeeId) {
    return baseQuery
      .where(eq(dailyActivityEntries.employeeId, employeeId))
      .orderBy(desc(dailyActivityEntries.workDate), desc(dailyActivityEntries.createdAt));
  }

  return baseQuery.orderBy(desc(dailyActivityEntries.workDate), desc(dailyActivityEntries.createdAt));
}

async function getScopedMonthlyPerformance(role: UserRole, divisionIds: string[], employeeId?: string | null) {
  const employeeDivision = aliasedTable(divisions, "employee_division");
  const hasInputSourceColumn = await hasMonthlyInputSourceColumn();
  const baseQuery = db
    .select({
      id: monthlyPointPerformances.id,
      employeeId: monthlyPointPerformances.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      employeeDivisionId: employees.divisionId,
      employeeDivisionName: employeeDivision.name,
      periodStartDate: monthlyPointPerformances.periodStartDate,
      periodEndDate: monthlyPointPerformances.periodEndDate,
      divisionSnapshotName: monthlyPointPerformances.divisionSnapshotName,
      targetDailyPoints: monthlyPointPerformances.targetDailyPoints,
      targetDays: monthlyPointPerformances.targetDays,
      totalTargetPoints: monthlyPointPerformances.totalTargetPoints,
      totalApprovedPoints: monthlyPointPerformances.totalApprovedPoints,
      performancePercent: monthlyPointPerformances.performancePercent,
      inputSource: hasInputSourceColumn
        ? monthlyPointPerformances.inputSource
        : sql<"GENERATED">`'GENERATED'`,
      status: monthlyPointPerformances.status,
      calculatedAt: monthlyPointPerformances.calculatedAt,
    })
    .from(monthlyPointPerformances)
    .leftJoin(employees, eq(monthlyPointPerformances.employeeId, employees.id))
    .leftJoin(employeeDivision, eq(employees.divisionId, employeeDivision.id));

  const rows = await (async () => {
    if (PERFORMANCE_SELF_SERVICE_ROLES.includes(role) && employeeId) {
      return baseQuery
        .where(eq(monthlyPointPerformances.employeeId, employeeId))
        .orderBy(desc(monthlyPointPerformances.periodStartDate), asc(employees.fullName));
    }

    if (DIV_SCOPED_ROLES.includes(role) && divisionIds.length > 0) {
      return baseQuery
        .where(inArray(employees.divisionId, divisionIds))
        .orderBy(desc(monthlyPointPerformances.periodStartDate), asc(employees.fullName));
    }

    return baseQuery.orderBy(desc(monthlyPointPerformances.periodStartDate), asc(employees.fullName));
  })();

  return Promise.all(rows.map(async (row) => {
    const [targetDays, divisionSnapshot] = await Promise.all([
      resolveTargetDaysForPeriod(row.employeeId, row.periodStartDate, row.periodEndDate),
      resolveDivisionSnapshotForPeriod(row.employeeId, row.periodStartDate),
    ]);
    const targetDailyPoints =
      divisionSnapshot.divisionDailyPointTarget ??
      resolvePointTargetForDivision(divisionSnapshot.divisionSnapshotName);
    const totalTargetPoints = targetDailyPoints * targetDays;
    const totalApprovedPoints = toNumber(row.totalApprovedPoints);
    const performancePercent = totalTargetPoints > 0
      ? ((totalApprovedPoints / totalTargetPoints) * 100).toFixed(2)
      : "0.00";

    return {
      ...row,
      divisionSnapshotName: divisionSnapshot.divisionSnapshotName,
      targetDailyPoints,
      targetDays,
      totalTargetPoints,
      performancePercent,
    };
  }));
}

async function assertActivityScope(role: UserRole, divisionIds: string[], employeeId: string) {
  if (!DIV_SCOPED_ROLES.includes(role)) return true;
  if (divisionIds.length === 0) return false;

  const [employeeRow] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  return divisionIds.includes(employeeRow?.divisionId ?? "");
}

async function resolveDivisionSnapshotForPeriod(employeeId: string, periodStartDate: Date) {
  const divisionAlias = aliasedTable(divisions, "snapshot_division");
  const [historyRow] = await db
    .select({
      divisionId: employeeDivisionHistories.newDivisionId,
      divisionName: divisionAlias.name,
      divisionDailyPointTarget: divisionAlias.dailyPointTarget,
    })
    .from(employeeDivisionHistories)
    .leftJoin(divisionAlias, eq(employeeDivisionHistories.newDivisionId, divisionAlias.id))
    .where(
      and(
        eq(employeeDivisionHistories.employeeId, employeeId),
        lte(employeeDivisionHistories.effectiveDate, periodStartDate)
      )
    )
    .orderBy(desc(employeeDivisionHistories.effectiveDate))
    .limit(1);

  if (historyRow) {
    return {
      divisionSnapshotId: historyRow.divisionId,
      divisionSnapshotName: historyRow.divisionName ?? "UNKNOWN",
      divisionDailyPointTarget: historyRow.divisionDailyPointTarget ?? null,
    };
  }

  const [employeeRow] = await db
    .select({
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      divisionDailyPointTarget: divisions.dailyPointTarget,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  return {
    divisionSnapshotId: employeeRow?.divisionId ?? null,
    divisionSnapshotName: employeeRow?.divisionName ?? "UNKNOWN",
    divisionDailyPointTarget: employeeRow?.divisionDailyPointTarget ?? null,
  };
}

async function resolveTargetDaysForPeriod(employeeId: string, periodStartDate: Date, periodEndDate: Date) {
  const assignmentRows = await db
    .select({
      effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
      effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
    })
    .from(employeeScheduleAssignments)
    .where(
      and(
        eq(employeeScheduleAssignments.employeeId, employeeId),
        lte(employeeScheduleAssignments.effectiveStartDate, periodEndDate),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, periodStartDate)
        )
      )
    )
    .orderBy(asc(employeeScheduleAssignments.effectiveStartDate));

  if (!assignmentRows.length) {
    return 0;
  }

  return countAssignedDaysForPeriod({
    periodStartDate,
    periodEndDate,
    assignments: assignmentRows,
  });
}

export async function getPerformanceWorkspace() {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!ensurePerformanceReadRole(role)) {
    return {
      role,
      canManageActivities: false,
      canGenerateMonthly: false,
      activeVersion: null,
      employeeOptions: [],
      managerialEmployeeOptions: [],
      divisionOptions: [],
      catalogEntries: [],
      activityEntries: [],
      monthlyPerformances: [],
    };
  }

  const isSelfService = PERFORMANCE_SELF_SERVICE_ROLES.includes(role);

  // TEAMWORK tanpa employeeId tidak bisa melihat apapun
  if (isSelfService && !roleRow.employeeId) {
    return {
      role,
      canManageActivities: false,
      canGenerateMonthly: false,
      activeVersion: null,
      employeeOptions: [],
      managerialEmployeeOptions: [],
      divisionOptions: [],
      catalogEntries: [],
      activityEntries: [],
      monthlyPerformances: [],
    };
  }

  const activeVersion = await getActivePointCatalogVersion();
  const [employeeOptions, managerialEmployeeOptions, divisionOptions, activityEntries, monthlyPerformances, catalogEntries] =
    await Promise.all([
      // TEAMWORK tidak butuh dropdown karyawan lain — hanya diri sendiri
      isSelfService
        ? Promise.resolve([])
        : getScopedTeamworkEmployees(role, roleRow.divisionIds),
      getManagerialEmployeeOptions(role),
      // TEAMWORK ambil divisi aktual dari data employee mereka sendiri
      isSelfService
        ? db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(eq(divisions.isActive, true)).orderBy(asc(divisions.name))
        : DIV_SCOPED_ROLES.includes(role) && roleRow.divisionIds.length > 0
          ? db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(inArray(divisions.id, roleRow.divisionIds)).orderBy(asc(divisions.name))
          : db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(eq(divisions.isActive, true)).orderBy(asc(divisions.name)),
      getScopedActivityEntries(role, roleRow.divisionIds, roleRow.employeeId),
      getScopedMonthlyPerformance(role, roleRow.divisionIds, roleRow.employeeId),
      activeVersion ? getPointCatalogEntriesByVersion(activeVersion.id) : Promise.resolve([]),
    ]);

  return {
    role,
    canManageActivities: PERFORMANCE_ACTIVITY_ROLES.includes(role),
    canGenerateMonthly: PERFORMANCE_GENERATE_ROLES.includes(role),
    activeVersion,
    employeeOptions,
    managerialEmployeeOptions,
    divisionOptions,
    catalogEntries,
    activityEntries,
    monthlyPerformances,
  };
}

export async function saveDailyActivityEntry(input: unknown) {
  const authError = await checkRole([...PERFORMANCE_ACTIVITY_ROLES, ...PERFORMANCE_SELF_SERVICE_ROLES]);
  if (authError) return authError;

  const parsed = dailyActivityEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input aktivitas tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  // TEAMWORK/MANAGERIAL hanya boleh input untuk diri sendiri
  if (PERFORMANCE_SELF_SERVICE_ROLES.includes(role)) {
    if (!roleRow.employeeId) return { error: "Akun Anda belum terhubung ke data karyawan. Hubungi HRD." };
    parsed.data.employeeId = roleRow.employeeId;
  }

  const inScope = await assertActivityScope(role, roleRow.divisionIds, parsed.data.employeeId);
  if (!inScope) {
    return { error: "Akses ditolak untuk karyawan di luar scope divisi Anda." };
  }

  const activeVersion = await getActivePointCatalogVersion();
  if (!activeVersion) {
    return { error: "Belum ada versi katalog poin aktif." };
  }
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const [employeeRow] = await db
    .select({
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      divisionDailyPointTarget: divisions.dailyPointTarget,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!employeeRow?.divisionId || !employeeRow?.divisionName) {
    return { error: "Divisi karyawan tidak ditemukan." };
  }
  const employeeDivisionName = employeeRow.divisionName;

  const catalogEntries = await db
    .select()
    .from(pointCatalogEntries)
    .where(
      and(
        eq(pointCatalogEntries.versionId, activeVersion.id),
        eq(pointCatalogEntries.isActive, true)
      )
    )
    .orderBy(asc(pointCatalogEntries.createdAt));

  const entry = catalogEntries.find(
    (item) => item.divisionName.toUpperCase() === employeeDivisionName.toUpperCase()
  );
  if (!entry) {
    return { error: `Belum ada katalog poin aktif untuk divisi ${employeeDivisionName}.` };
  }

  const totalPoints = Number(parsed.data.totalPoints.toFixed(2));
  const manualJobIdSnapshot = entry.externalCode?.trim() || "MANUAL_TOTAL";
  const values = {
    employeeId: parsed.data.employeeId,
    workDate: parsed.data.workDate,
    actualDivisionId: employeeRow.divisionId,
    pointCatalogEntryId: entry.id,
    pointCatalogVersionId: activeVersion.id,
    pointCatalogDivisionName: entry.divisionName,
    workNameSnapshot: "INPUT TOTAL HARIAN",
    unitDescriptionSnapshot: "poin",
    pointValueSnapshot: totalPoints.toFixed(2),
    quantity: "1.00",
    totalPoints: totalPoints.toFixed(2),
    notes: hasSnapshotColumn
      ? (parsed.data.notes ?? null)
      : encodeLegacyNotes(manualJobIdSnapshot, parsed.data.notes),
    updatedByUserId: user?.id ?? null,
  };

  try {
    if (parsed.data.id) {
      const [existingEntry] = hasSnapshotColumn
        ? await db
            .select()
            .from(dailyActivityEntries)
            .where(eq(dailyActivityEntries.id, parsed.data.id))
            .limit(1)
        : await db
            .select()
            .from(dailyActivityEntriesLegacy)
            .where(eq(dailyActivityEntriesLegacy.id, parsed.data.id))
            .limit(1);

      if (!existingEntry) return { error: "Aktivitas tidak ditemukan." };
      if (!MUTABLE_ACTIVITY_STATUSES.includes(existingEntry.status as (typeof MUTABLE_ACTIVITY_STATUSES)[number])) {
        return { error: "Aktivitas yang sudah diajukan atau disetujui tidak bisa diedit." };
      }

      if (hasSnapshotColumn) {
        await db
          .update(dailyActivityEntries)
          .set({
            ...values,
            jobIdSnapshot: manualJobIdSnapshot,
            status: existingEntry.status === "DRAFT" ? "DRAFT" : "REVISI_TW",
            updatedAt: new Date(),
          })
          .where(eq(dailyActivityEntries.id, parsed.data.id));
      } else {
        await db
          .update(dailyActivityEntriesLegacy)
          .set({
            ...values,
            status: existingEntry.status === "DRAFT" ? "DRAFT" : "REVISI_TW",
            updatedAt: new Date(),
          })
          .where(eq(dailyActivityEntriesLegacy.id, parsed.data.id));
      }
    } else {
      if (hasSnapshotColumn) {
        await db.insert(dailyActivityEntries).values({
          ...values,
          jobIdSnapshot: manualJobIdSnapshot,
          createdByUserId: user?.id ?? parsed.data.employeeId,
          status: "DRAFT",
        });
      } else {
        await db.insert(dailyActivityEntriesLegacy).values({
          ...values,
          createdByUserId: user?.id ?? parsed.data.employeeId,
          status: "DRAFT",
        });
      }
    }
  } catch (error) {
    const dbError = error as {
      code?: string;
      message?: string;
      detail?: string;
      cause?: { code?: string; message?: string; detail?: string };
    };
    const code = dbError.code ?? dbError.cause?.code;
    if (code === "23503") return { error: "Relasi aktivitas tidak valid." };
    if (code === "23502") return { error: "Data aktivitas belum lengkap. Cek field wajib pada konfigurasi database." };
    if (code === "22P02") return { error: "Format nilai aktivitas tidak valid." };
    throw error;
  }

  revalidatePath("/performance");
  return { success: true };
}

export async function submitDailyActivityEntry(input: unknown) {
  const authError = await checkRole([...PERFORMANCE_ACTIVITY_ROLES, ...PERFORMANCE_SELF_SERVICE_ROLES]);
  if (authError) return authError;

  const parsed = dailyActivityDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Aktivitas tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const [existingEntry] = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId))
    .limit(1);

  if (!existingEntry) return { error: "Aktivitas tidak ditemukan." };

  // TEAMWORK hanya boleh submit entry milik sendiri
  if (PERFORMANCE_SELF_SERVICE_ROLES.includes(role)) {
    if (!roleRow.employeeId || existingEntry.employeeId !== roleRow.employeeId) {
      return { error: "Anda hanya dapat mengajukan aktivitas milik sendiri." };
    }
  } else {
    const inScope = await assertActivityScope(role, roleRow.divisionIds, existingEntry.employeeId);
    if (!inScope) return { error: "Akses ditolak untuk aktivitas di luar scope divisi Anda." };
  }

  if (!MUTABLE_ACTIVITY_STATUSES.includes(existingEntry.status as (typeof MUTABLE_ACTIVITY_STATUSES)[number])) {
    return { error: "Aktivitas tidak berada pada status yang dapat diajukan." };
  }

  const nextStatus = existingEntry.status === "DRAFT" ? "DIAJUKAN" : "DIAJUKAN_ULANG";
  const logAction = existingEntry.status === "DRAFT" ? "SUBMIT" : "RESUBMIT";

  await db.transaction(async (tx) => {
    await tx
      .update(dailyActivityEntries)
      .set({
        status: nextStatus,
        submittedAt: new Date(),
        updatedByUserId: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId));

    await tx.insert(dailyActivityApprovalLogs).values({
      activityEntryId: parsed.data.activityEntryId,
      action: logAction,
      actorUserId: user?.id ?? existingEntry.employeeId,
      actorRole: role,
      notes: parsed.data.notes,
    });
  });

  revalidatePath("/performance");
  return { success: true };
}

export async function approveDailyActivityEntry(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const parsed = dailyActivityDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Aktivitas tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const [existingEntry] = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId))
    .limit(1);

  if (!existingEntry) return { error: "Aktivitas tidak ditemukan." };
  if (!APPROVABLE_STATUSES.includes(existingEntry.status as (typeof APPROVABLE_STATUSES)[number])) {
    return { error: "Aktivitas tidak berada pada status yang dapat disetujui." };
  }
  const inScope = await assertActivityScope(role, roleRow.divisionIds, existingEntry.employeeId);
  if (!inScope) return { error: "Akses ditolak untuk aktivitas di luar scope divisi Anda." };

  const nextStatus = "OVERRIDE_HRD";
  const logAction = "OVERRIDE_HRD";

  await db.transaction(async (tx) => {
    await tx
      .update(dailyActivityEntries)
      .set({
        status: nextStatus,
        approvedAt: new Date(),
        updatedByUserId: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId));

    await tx.insert(dailyActivityApprovalLogs).values({
      activityEntryId: parsed.data.activityEntryId,
      action: logAction,
      actorUserId: user?.id ?? existingEntry.employeeId,
      actorRole: role,
      notes: parsed.data.notes,
    });
  });

  revalidatePath("/performance");
  return { success: true };
}

export async function rejectDailyActivityEntry(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const parsed = dailyActivityDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Aktivitas tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const [existingEntry] = await db
    .select()
    .from(dailyActivityEntries)
    .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId))
    .limit(1);

  if (!existingEntry) return { error: "Aktivitas tidak ditemukan." };
  if (!APPROVABLE_STATUSES.includes(existingEntry.status as (typeof APPROVABLE_STATUSES)[number])) {
    return { error: "Aktivitas tidak berada pada status yang dapat ditolak." };
  }
  const inScope = await assertActivityScope(role, roleRow.divisionIds, existingEntry.employeeId);
  if (!inScope) return { error: "Akses ditolak untuk aktivitas di luar scope divisi Anda." };

  await db.transaction(async (tx) => {
    await tx
      .update(dailyActivityEntries)
      .set({
        status: "DITOLAK_SPV",
        rejectedAt: new Date(),
        updatedByUserId: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(dailyActivityEntries.id, parsed.data.activityEntryId));

    await tx.insert(dailyActivityApprovalLogs).values({
      activityEntryId: parsed.data.activityEntryId,
      action: "REJECT_SPV",
      actorUserId: user?.id ?? existingEntry.employeeId,
      actorRole: role,
      notes: parsed.data.notes,
    });
  });

  revalidatePath("/performance");
  return { success: true };
}

export async function generateMonthlyPerformance(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const parsed = monthlyPerformanceGenerationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input periode tidak valid." };
  }

  const targetEmployees = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
    })
    .from(employees)
    .where(and(inArray(employees.employeeGroup, POINT_EMPLOYEE_GROUPS), eq(employees.isActive, true)))
    .orderBy(asc(employees.fullName));

  const periodStartDate = parsed.data.periodStartDate;
  const periodEndDate = parsed.data.periodEndDate;
  const hasInputSourceColumn = await hasMonthlyInputSourceColumn();
  const manualRows = hasInputSourceColumn
    ? await db
        .select({ employeeId: monthlyPointPerformances.employeeId })
        .from(monthlyPointPerformances)
        .where(
          and(
            eq(monthlyPointPerformances.periodStartDate, periodStartDate),
            eq(monthlyPointPerformances.periodEndDate, periodEndDate),
            eq(monthlyPointPerformances.inputSource, "MANUAL_INPUT")
          )
        )
    : [];
  const manualEmployeeIds = new Set(manualRows.map((row) => row.employeeId));
  const regeneratedEmployees = targetEmployees.filter((employee) => !manualEmployeeIds.has(employee.id));

  const SUBMITTED_STATUSES = ["DIAJUKAN", "DIAJUKAN_ULANG", "DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;
  const APPROVED_STATUSES = ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;
  const employeeIds = regeneratedEmployees.map((e) => e.id);

  const activities = await (
    employeeIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            employeeId: dailyActivityEntries.employeeId,
            workDate: dailyActivityEntries.workDate,
            totalPoints: dailyActivityEntries.totalPoints,
            status: dailyActivityEntries.status,
          })
          .from(dailyActivityEntries)
          .where(
            and(
              inArray(dailyActivityEntries.employeeId, employeeIds),
              gte(dailyActivityEntries.workDate, periodStartDate),
              lte(dailyActivityEntries.workDate, periodEndDate),
              inArray(dailyActivityEntries.status, SUBMITTED_STATUSES)
            )
          )
  );

  // Per-employee: approved total dan per-hari submitted (untuk rata-rata persentase)
  const approvedSumByEmployee = new Map<string, number>();
  const submittedDaysByEmployee = new Map<string, Map<string, number>>();

  for (const activity of activities) {
    const d = activity.workDate;
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    if (!submittedDaysByEmployee.has(activity.employeeId)) {
      submittedDaysByEmployee.set(activity.employeeId, new Map());
    }
    const dayMap = submittedDaysByEmployee.get(activity.employeeId)!;
    dayMap.set(dateKey, (dayMap.get(dateKey) ?? 0) + toNumber(activity.totalPoints));

    if ((APPROVED_STATUSES as readonly string[]).includes(activity.status)) {
      approvedSumByEmployee.set(
        activity.employeeId,
        (approvedSumByEmployee.get(activity.employeeId) ?? 0) + toNumber(activity.totalPoints)
      );
    }
  }

  await db.transaction(async (tx) => {
    if (employeeIds.length > 0) {
      await tx
        .delete(monthlyPointPerformances)
        .where(
          and(
            eq(monthlyPointPerformances.periodStartDate, periodStartDate),
            eq(monthlyPointPerformances.periodEndDate, periodEndDate),
            inArray(monthlyPointPerformances.employeeId, employeeIds)
          )
        );
    }

    for (const employee of regeneratedEmployees) {
      const divisionSnapshot = await resolveDivisionSnapshotForPeriod(employee.id, periodStartDate);
      const targetDays = await resolveTargetDaysForPeriod(employee.id, periodStartDate, periodEndDate);

      const dailySubmissions = Array.from(
        submittedDaysByEmployee.get(employee.id)?.values() ?? []
      ).map((pts) => ({ totalPoints: pts }));

      const totalApprovedPoints = Number((approvedSumByEmployee.get(employee.id) ?? 0).toFixed(2));
      const calculated = calculateMonthlyPointPerformance({
        divisionName: divisionSnapshot.divisionSnapshotName,
        targetDailyPoints: divisionSnapshot.divisionDailyPointTarget,
        targetDays,
        totalApprovedPoints,
        dailySubmissions,
      });

      const monthlyPayload = {
        employeeId: employee.id,
        periodStartDate,
        periodEndDate,
        divisionSnapshotId: divisionSnapshot.divisionSnapshotId,
        divisionSnapshotName: divisionSnapshot.divisionSnapshotName,
        targetDailyPoints: calculated.targetDailyPoints,
        targetDays: calculated.targetDays,
        totalTargetPoints: calculated.totalTargetPoints,
        totalApprovedPoints: calculated.totalApprovedPoints.toFixed(2),
        performancePercent: calculated.performancePercent.toFixed(2),
        status: "FINALIZED" as const,
      };

      await tx.insert(monthlyPointPerformances).values(
        hasInputSourceColumn
          ? { ...monthlyPayload, inputSource: "GENERATED" as const }
          : monthlyPayload
      );
    }
  });

  revalidatePath("/performance");
  return { success: true, generatedEmployees: regeneratedEmployees.length, skippedManualOverrides: manualEmployeeIds.size };
}

export async function inputEmployeeMonthlyPerformance(input: unknown) {
  const authError = await checkRole(PERFORMANCE_MANAGERIAL_INPUT_ROLES);
  if (authError) return authError;

  const parsed = employeeMonthlyPerformanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input performa bulanan tidak valid." };
  }

  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };

  const resolvedPeriod = resolvePayrollPeriod(parsed.data.periodCode);
  const [period] = await db
    .select({
      id: payrollPeriods.id,
      status: payrollPeriods.status,
    })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.periodCode, resolvedPeriod.periodCode))
    .limit(1);

  if (period && (period.status === "PAID" || period.status === "LOCKED")) {
    return { error: "Periode payroll yang sudah paid/locked tidak bisa diubah lagi." };
  }

  const [employee] = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employeeCode: employees.employeeCode,
      employeeGroup: employees.employeeGroup,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!employee || !employee.isActive) {
    return { error: "Karyawan tidak ditemukan atau sudah tidak aktif." };
  }


  let managerialKpiSynced = false;
  const hasInputSourceColumn = await hasMonthlyInputSourceColumn();

  await db.transaction(async (tx) => {
    const divisionSnapshot = await resolveDivisionSnapshotForPeriod(employee.id, resolvedPeriod.periodStartDate);
    const targetDays = await resolveTargetDaysForPeriod(
      employee.id,
      resolvedPeriod.periodStartDate,
      resolvedPeriod.periodEndDate
    );
    const targetDailyPoints =
      divisionSnapshot.divisionDailyPointTarget
      ?? resolvePointTargetForDivision(divisionSnapshot.divisionSnapshotName);
    const totalTargetPoints = targetDailyPoints * targetDays;
    const totalApprovedPoints = Number(
      ((totalTargetPoints * parsed.data.performancePercent) / 100).toFixed(2)
    );

    await tx
      .delete(monthlyPointPerformances)
      .where(
        and(
          eq(monthlyPointPerformances.employeeId, employee.id),
          eq(monthlyPointPerformances.periodStartDate, resolvedPeriod.periodStartDate),
          eq(monthlyPointPerformances.periodEndDate, resolvedPeriod.periodEndDate)
        )
      );

    const monthlyPayload = {
      employeeId: employee.id,
      periodStartDate: resolvedPeriod.periodStartDate,
      periodEndDate: resolvedPeriod.periodEndDate,
      divisionSnapshotId: divisionSnapshot.divisionSnapshotId,
      divisionSnapshotName: divisionSnapshot.divisionSnapshotName,
      targetDailyPoints,
      targetDays,
      totalTargetPoints,
      totalApprovedPoints: totalApprovedPoints.toFixed(2),
      performancePercent: parsed.data.performancePercent.toFixed(2),
      status: "FINALIZED" as const,
    };

    await tx.insert(monthlyPointPerformances).values(
      hasInputSourceColumn
        ? { ...monthlyPayload, inputSource: "MANUAL_INPUT" as const }
        : monthlyPayload
    );

    if (isKpiEmployeeGroup(employee.employeeGroup) && period) {
      const [existing] = await tx
        .select({ id: managerialKpiSummaries.id })
        .from(managerialKpiSummaries)
        .where(
          and(
            eq(managerialKpiSummaries.periodId, period.id),
            eq(managerialKpiSummaries.employeeId, employee.id)
          )
        )
        .limit(1);

      const payload = {
        periodId: period.id,
        employeeId: employee.id,
        performancePercent: parsed.data.performancePercent.toFixed(2),
        notes: parsed.data.notes ?? "Input performa bulanan dari menu Performa.",
        status: "VALIDATED" as const,
        validatedByUserId: user.id,
        validatedAt: new Date(),
      };

      if (existing) {
        await tx
          .update(managerialKpiSummaries)
          .set({
            ...payload,
            updatedAt: new Date(),
          })
          .where(eq(managerialKpiSummaries.id, existing.id));
      } else {
        await tx.insert(managerialKpiSummaries).values(payload);
      }
      managerialKpiSynced = true;
    }
  });

  revalidatePath("/performance");
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return {
    success: true,
    periodCode: resolvedPeriod.periodCode,
    employeeName: `${employee.fullName} (${employee.employeeCode})`,
    employeeGroup: employee.employeeGroup,
    performancePercent: parsed.data.performancePercent,
    payrollPeriodReady: Boolean(period),
    managerialKpiSynced,
  };
}

export async function deleteMonthlyPerformance(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Input tidak valid." };

  const [row] = await db
    .select({ id: monthlyPointPerformances.id, status: monthlyPointPerformances.status })
    .from(monthlyPointPerformances)
    .where(eq(monthlyPointPerformances.id, parsed.data.id))
    .limit(1);

  if (!row) return { error: "Data performa bulanan tidak ditemukan." };
  if (row.status === "LOCKED") return { error: "Data yang sudah LOCKED tidak dapat dihapus." };

  await db.delete(monthlyPointPerformances).where(eq(monthlyPointPerformances.id, parsed.data.id));

  revalidatePath("/performance");
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

export async function deleteMonthlyPerformanceByPeriod(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const parsed = z
    .object({
      periodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal awal tidak valid."),
      periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal akhir tidak valid."),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const periodStartDate = new Date(`${parsed.data.periodStartDate}T00:00:00`);
  const periodEndDate = new Date(`${parsed.data.periodEndDate}T00:00:00`);

  const rows = await db
    .select({ id: monthlyPointPerformances.id, status: monthlyPointPerformances.status })
    .from(monthlyPointPerformances)
    .where(
      and(
        eq(monthlyPointPerformances.periodStartDate, periodStartDate),
        eq(monthlyPointPerformances.periodEndDate, periodEndDate)
      )
    );

  if (rows.length === 0) {
    return { error: "Data performa bulanan untuk periode tersebut tidak ditemukan." };
  }

  const lockedCount = rows.filter((row) => row.status === "LOCKED").length;
  if (lockedCount > 0) {
    return { error: `Periode mengandung ${lockedCount} data LOCKED dan tidak bisa dihapus massal.` };
  }

  await db
    .delete(monthlyPointPerformances)
    .where(
      and(
        eq(monthlyPointPerformances.periodStartDate, periodStartDate),
        eq(monthlyPointPerformances.periodEndDate, periodEndDate)
      )
    );

  revalidatePath("/performance");
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true, deletedCount: rows.length };
}

export type TwActivityItem = {
  id: string;
  workDate: Date;
  pointCatalogEntryId: string;
  jobIdSnapshot: string | null;
  notes: string | null;
  workNameSnapshot: string;
  pointValueSnapshot: string | number;
  quantity: string | number;
  totalPoints: string | number;
  status: string;
  submittedAt: Date | null;
  rejectedAt: Date | null;
};

export type TwCatalogEntry = {
  id: string;
  externalCode: string | null;
  workName: string;
  pointValue: string | number;
  unitDescription: string | null;
};

export async function getTwPerformanceData(): Promise<{
  error?: string;
  catalogEntries: TwCatalogEntry[];
  activities: TwActivityItem[];
  divisionName: string | null;
}> {
  const authError = await checkRole(PERFORMANCE_SELF_SERVICE_ROLES);
  if (authError) return { error: authError.error ?? "Akses ditolak.", catalogEntries: [], activities: [], divisionName: null };

  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) {
    return { error: "Akun belum terhubung ke data karyawan. Hubungi HRD.", catalogEntries: [], activities: [], divisionName: null };
  }

  const [emp] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);

  let divisionName: string | null = null;
  if (emp?.divisionId) {
    const [div] = await db
      .select({ name: divisions.name })
      .from(divisions)
      .where(eq(divisions.id, emp.divisionId))
      .limit(1);
    divisionName = div?.name ?? null;
  }

  const activeVersion = await getActivePointCatalogVersion();
  let catalogEntries: TwCatalogEntry[] = [];
  if (activeVersion && divisionName) {
    const rows = await db
      .select({
        id: pointCatalogEntries.id,
        externalCode: pointCatalogEntries.externalCode,
        workName: pointCatalogEntries.workName,
        pointValue: pointCatalogEntries.pointValue,
        unitDescription: pointCatalogEntries.unitDescription,
        divisionName: pointCatalogEntries.divisionName,
      })
      .from(pointCatalogEntries)
      .where(
        and(
          eq(pointCatalogEntries.versionId, activeVersion.id),
          eq(pointCatalogEntries.isActive, true)
        )
      )
      .orderBy(asc(pointCatalogEntries.externalRowNumber));
    catalogEntries = rows
      .filter((e) => e.divisionName.toUpperCase() === divisionName!.toUpperCase())
      .map((e) => ({
        id: e.id,
        externalCode: e.externalCode ?? null,
        workName: e.workName,
        pointValue: e.pointValue,
        unitDescription: e.unitDescription ?? null,
      }));
  }
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const activities = await db
    .select({
      id: dailyActivityEntries.id,
      workDate: dailyActivityEntries.workDate,
      pointCatalogEntryId: dailyActivityEntries.pointCatalogEntryId,
      jobIdSnapshot: hasSnapshotColumn ? dailyActivityEntries.jobIdSnapshot : pointCatalogEntries.externalCode,
      notes: dailyActivityEntries.notes,
      workNameSnapshot: dailyActivityEntries.workNameSnapshot,
      pointValueSnapshot: dailyActivityEntries.pointValueSnapshot,
      quantity: dailyActivityEntries.quantity,
      totalPoints: dailyActivityEntries.totalPoints,
      status: dailyActivityEntries.status,
      submittedAt: dailyActivityEntries.submittedAt,
      rejectedAt: dailyActivityEntries.rejectedAt,
    })
    .from(dailyActivityEntries)
    .leftJoin(pointCatalogEntries, eq(dailyActivityEntries.pointCatalogEntryId, pointCatalogEntries.id))
    .where(eq(dailyActivityEntries.employeeId, roleRow.employeeId))
    .orderBy(desc(dailyActivityEntries.workDate), desc(dailyActivityEntries.createdAt));

  return { catalogEntries, activities, divisionName };
}

export async function batchSubmitDraft(input: unknown) {
  const authError = await checkRole(PERFORMANCE_SELF_SERVICE_ROLES);
  if (authError) return { error: authError.error ?? "Akses ditolak." };

  const parsed = batchSubmitDraftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) return { error: "Akun belum terhubung ke data karyawan." };

  const [emp] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);
  if (!emp?.divisionId) return { error: "Data divisi karyawan tidak ditemukan." };

  const activeVersion = await getActivePointCatalogVersion();
  if (!activeVersion) return { error: "Belum ada versi katalog poin aktif." };
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const catalogIds = [...new Set(parsed.data.items.map((i) => i.pointCatalogEntryId))];
  const catalogRows = await db
    .select()
    .from(pointCatalogEntries)
    .where(
      and(
        inArray(pointCatalogEntries.id, catalogIds),
        eq(pointCatalogEntries.versionId, activeVersion.id),
        eq(pointCatalogEntries.isActive, true)
      )
    );
  if (catalogRows.length !== catalogIds.length) {
    return { error: "Salah satu katalog pekerjaan tidak valid atau tidak aktif." };
  }
  const catalogMap = new Map(catalogRows.map((r) => [r.id, r]));

  const existing = await db
    .select({ id: dailyActivityEntries.id, status: dailyActivityEntries.status })
    .from(dailyActivityEntries)
    .where(
      and(
        eq(dailyActivityEntries.employeeId, roleRow.employeeId),
        eq(dailyActivityEntries.workDate, parsed.data.workDate)
      )
    );

  const hasPending = existing.some((e) => ["DIAJUKAN", "DIAJUKAN_ULANG"].includes(e.status));
  if (hasPending) return { error: "Ada draft yang sedang menunggu review HRD untuk tanggal ini." };

  const hasRejectedOrRevision = existing.some((e) => e.status === "DITOLAK_SPV" || e.status === "REVISI_TW");
  const nextStatus = hasRejectedOrRevision ? "DIAJUKAN_ULANG" : "DIAJUKAN";
  const logAction = hasRejectedOrRevision ? "RESUBMIT" : "SUBMIT";

  await db.transaction(async (tx) => {
    const deletableIds = existing
      .filter((e) => ["DRAFT", "DITOLAK_SPV", "REVISI_TW"].includes(e.status))
      .map((e) => e.id);
    if (deletableIds.length > 0) {
      await tx.delete(dailyActivityEntries).where(inArray(dailyActivityEntries.id, deletableIds));
    }

    for (const item of parsed.data.items) {
      const entry = catalogMap.get(item.pointCatalogEntryId)!;
      const pointValue = toNumber(entry.pointValue);
      const totalPoints = Number((pointValue * item.quantity).toFixed(2));
      const snapshotValue = item.jobId ?? entry.externalCode ?? null;
      let insertedId: string;
      if (hasSnapshotColumn) {
        const [inserted] = await tx
          .insert(dailyActivityEntries)
          .values({
            employeeId: roleRow.employeeId!,
            workDate: parsed.data.workDate,
            actualDivisionId: emp.divisionId!,
            pointCatalogEntryId: entry.id,
            pointCatalogVersionId: activeVersion.id,
            pointCatalogDivisionName: entry.divisionName,
            jobIdSnapshot: snapshotValue,
            workNameSnapshot: entry.workName,
            unitDescriptionSnapshot: entry.unitDescription,
            pointValueSnapshot: pointValue.toFixed(2),
            quantity: item.quantity.toFixed(2),
            totalPoints: totalPoints.toFixed(2),
            status: nextStatus,
            submittedAt: new Date(),
            createdByUserId: user?.id ?? roleRow.employeeId!,
          })
          .returning({ id: dailyActivityEntries.id });
        insertedId = inserted.id;
      } else {
        const [inserted] = await tx
          .insert(dailyActivityEntriesLegacy)
          .values({
            employeeId: roleRow.employeeId!,
            workDate: parsed.data.workDate,
            actualDivisionId: emp.divisionId!,
            pointCatalogEntryId: entry.id,
            pointCatalogVersionId: activeVersion.id,
            pointCatalogDivisionName: entry.divisionName,
            workNameSnapshot: entry.workName,
            unitDescriptionSnapshot: entry.unitDescription,
          pointValueSnapshot: pointValue.toFixed(2),
          quantity: item.quantity.toFixed(2),
          totalPoints: totalPoints.toFixed(2),
          status: nextStatus,
          submittedAt: new Date(),
          createdByUserId: user?.id ?? roleRow.employeeId!,
          notes: encodeLegacyNotes(snapshotValue),
        })
          .returning({ id: dailyActivityEntriesLegacy.id });
        insertedId = inserted.id;
      }

      await tx.insert(dailyActivityApprovalLogs).values({
        activityEntryId: insertedId,
        action: logAction,
        actorUserId: user?.id ?? roleRow.employeeId!,
        actorRole: roleRow.role as UserRole,
      });
    }
  });

  revalidatePath("/performance");
  return { success: true };
}

/**
 * Menambahkan job ID baru ke draft yang sudah dalam status DIAJUKAN/DIAJUKAN_ULANG.
 * Tidak menghapus entri existing — hanya INSERT entri baru di samping yang sudah ada.
 * Digunakan ketika tim ingin melengkapi job ID yang ketinggalan setelah submit.
 */
export async function appendToPendingDraft(input: unknown) {
  const authError = await checkRole(PERFORMANCE_SELF_SERVICE_ROLES);
  if (authError) return { error: authError.error ?? "Akses ditolak." };

  const parsed = appendToPendingDraftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) return { error: "Akun belum terhubung ke data karyawan." };

  const [emp] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);
  if (!emp?.divisionId) return { error: "Data divisi karyawan tidak ditemukan." };

  const activeVersion = await getActivePointCatalogVersion();
  if (!activeVersion) return { error: "Belum ada versi katalog poin aktif." };
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const catalogIds = [...new Set(parsed.data.items.map((i) => i.pointCatalogEntryId))];
  const catalogRows = await db
    .select()
    .from(pointCatalogEntries)
    .where(
      and(
        inArray(pointCatalogEntries.id, catalogIds),
        eq(pointCatalogEntries.versionId, activeVersion.id),
        eq(pointCatalogEntries.isActive, true)
      )
    );
  if (catalogRows.length !== catalogIds.length) {
    return { error: "Salah satu katalog pekerjaan tidak valid atau tidak aktif." };
  }
  const catalogMap = new Map(catalogRows.map((r) => [r.id, r]));

  const existing = await db
    .select({ id: dailyActivityEntries.id, status: dailyActivityEntries.status })
    .from(dailyActivityEntries)
    .where(
      and(
        eq(dailyActivityEntries.employeeId, roleRow.employeeId),
        eq(dailyActivityEntries.workDate, parsed.data.workDate)
      )
    );

  // Harus ada entri pending supaya append valid
  const hasPending = existing.some((e) => ["DIAJUKAN", "DIAJUKAN_ULANG"].includes(e.status));
  if (!hasPending) {
    return { error: "Tidak ada draft pending untuk tanggal ini. Gunakan Submit Draft biasa." };
  }

  // Status entri baru mengikuti status dominan yang sudah ada
  const hasResubmit = existing.some((e) => e.status === "DIAJUKAN_ULANG");
  const nextStatus = hasResubmit ? "DIAJUKAN_ULANG" : "DIAJUKAN";

  await db.transaction(async (tx) => {
    for (const item of parsed.data.items) {
      const entry = catalogMap.get(item.pointCatalogEntryId)!;
      const pointValue = toNumber(entry.pointValue);
      const totalPoints = Number((pointValue * item.quantity).toFixed(2));
      const snapshotValue = item.jobId ?? entry.externalCode ?? null;
      let insertedId: string;
      if (hasSnapshotColumn) {
        const [inserted] = await tx
          .insert(dailyActivityEntries)
          .values({
            employeeId: roleRow.employeeId!,
            workDate: parsed.data.workDate,
            actualDivisionId: emp.divisionId!,
            pointCatalogEntryId: entry.id,
            pointCatalogVersionId: activeVersion.id,
            pointCatalogDivisionName: entry.divisionName,
            jobIdSnapshot: snapshotValue,
            workNameSnapshot: entry.workName,
            unitDescriptionSnapshot: entry.unitDescription,
            pointValueSnapshot: pointValue.toFixed(2),
            quantity: item.quantity.toFixed(2),
            totalPoints: totalPoints.toFixed(2),
            status: nextStatus,
            submittedAt: new Date(),
            createdByUserId: user?.id ?? roleRow.employeeId!,
          })
          .returning({ id: dailyActivityEntries.id });
        insertedId = inserted.id;
      } else {
        const [inserted] = await tx
          .insert(dailyActivityEntriesLegacy)
          .values({
            employeeId: roleRow.employeeId!,
            workDate: parsed.data.workDate,
            actualDivisionId: emp.divisionId!,
            pointCatalogEntryId: entry.id,
            pointCatalogVersionId: activeVersion.id,
            pointCatalogDivisionName: entry.divisionName,
            workNameSnapshot: entry.workName,
            unitDescriptionSnapshot: entry.unitDescription,
            pointValueSnapshot: pointValue.toFixed(2),
            quantity: item.quantity.toFixed(2),
            totalPoints: totalPoints.toFixed(2),
            status: nextStatus,
            submittedAt: new Date(),
            createdByUserId: user?.id ?? roleRow.employeeId!,
            notes: encodeLegacyNotes(snapshotValue),
          })
          .returning({ id: dailyActivityEntriesLegacy.id });
        insertedId = inserted.id;
      }

      await tx.insert(dailyActivityApprovalLogs).values({
        activityEntryId: insertedId,
        action: "SUBMIT",
        actorUserId: user?.id ?? roleRow.employeeId!,
        actorRole: roleRow.role as UserRole,
      });
    }
  });

  revalidatePath("/performance");
  return { success: true };
}

export type SpvPendingActivityItem = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeCode: string | null;
  employeeDivisionName: string | null;
  workDate: Date;
  externalCode: string | null;
  jobIdSnapshot: string | null;
  workNameSnapshot: string;
  pointValueSnapshot: string | number;
  quantity: string | number;
  totalPoints: string | number;
  status: string;
  notes: string | null;
  submittedAt: Date | null;
};

export async function getSpvPendingActivities(): Promise<{ activities: SpvPendingActivityItem[] }> {
  const authError = await checkRole(["SPV", "KABAG"]);
  if (authError) return { activities: [] };

  const roleRow = await getCurrentUserRoleRow();
  if (roleRow.divisionIds.length === 0) return { activities: [] };
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const entryDivision = aliasedTable(divisions, "entry_division");
  const employeeDivision = aliasedTable(divisions, "employee_division");

  const rows = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      employeeDivisionName: employeeDivision.name,
      workDate: dailyActivityEntries.workDate,
      externalCode: pointCatalogEntries.externalCode,
      jobIdSnapshot: hasSnapshotColumn ? dailyActivityEntries.jobIdSnapshot : pointCatalogEntries.externalCode,
      workNameSnapshot: dailyActivityEntries.workNameSnapshot,
      pointValueSnapshot: dailyActivityEntries.pointValueSnapshot,
      quantity: dailyActivityEntries.quantity,
      totalPoints: dailyActivityEntries.totalPoints,
      status: dailyActivityEntries.status,
      notes: dailyActivityEntries.notes,
      submittedAt: dailyActivityEntries.submittedAt,
    })
    .from(dailyActivityEntries)
    .leftJoin(employees, eq(dailyActivityEntries.employeeId, employees.id))
    .leftJoin(entryDivision, eq(dailyActivityEntries.actualDivisionId, entryDivision.id))
    .leftJoin(employeeDivision, eq(employees.divisionId, employeeDivision.id))
    .leftJoin(pointCatalogEntries, eq(dailyActivityEntries.pointCatalogEntryId, pointCatalogEntries.id))
    .where(
      and(
        inArray(employees.divisionId, roleRow.divisionIds),
        inArray(dailyActivityEntries.status, ["DIAJUKAN", "DIAJUKAN_ULANG"])
      )
    )
    .orderBy(desc(dailyActivityEntries.submittedAt), desc(dailyActivityEntries.workDate));

  return { activities: rows };
}

export type TeamPerformanceDivision = {
  id: string;
  name: string;
};

export type TeamPerformanceEmployee = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionId: string;
};

export type TeamPerformanceApprovedActivity = {
  id: string;
  employeeId: string;
  workDate: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  externalCode: string | null;
  notes: string | null;
  jobIdSnapshot: string | null;
  workNameSnapshot: string;
  quantity: string | number;
  pointValueSnapshot: string | number;
  totalPoints: string | number;
  status: string;
};

export async function getTeamPerformanceWorkspace() {
  const authError = await checkRole(["SUPER_ADMIN", "HRD", "KABAG", "SPV"]);
  if (authError) {
    return {
      error: authError.error ?? "Akses ditolak.",
      periodStartDate: null as Date | null,
      periodEndDate: null as Date | null,
      divisions: [] as TeamPerformanceDivision[],
      employees: [] as TeamPerformanceEmployee[],
      approvedActivities: [] as TeamPerformanceApprovedActivity[],
    };
  }

  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const scopedDivisionIds =
    DIV_SCOPED_ROLES.includes(role) && roleRow.divisionIds.length > 0
      ? roleRow.divisionIds
      : null;

  const today = new Date();
  const periodCode = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const period = resolvePayrollPeriod(periodCode);
  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const divisionRows = await db
    .select({
      id: divisions.id,
      name: divisions.name,
    })
    .from(divisions)
    .where(
      scopedDivisionIds
        ? inArray(divisions.id, scopedDivisionIds)
        : eq(divisions.isActive, true)
    )
    .orderBy(asc(divisions.name));

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionId: employees.divisionId,
    })
    .from(employees)
    .where(
      scopedDivisionIds
        ? and(
            inArray(employees.employeeGroup, POINT_EMPLOYEE_GROUPS),
            eq(employees.isActive, true),
            inArray(employees.divisionId, scopedDivisionIds)
          )
        : and(inArray(employees.employeeGroup, POINT_EMPLOYEE_GROUPS), eq(employees.isActive, true))
    )
    .orderBy(asc(employees.fullName));
  if (employeeRows.length === 0) {
    return {
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
      divisions: divisionRows,
      employees: [],
      approvedActivities: [],
    };
  }

  const approvedStatuses = ["DISETUJUI_SPV", "OVERRIDE_HRD", "DIKUNCI_PAYROLL"] as const;
  const employeeIds = employeeRows.map((row) => row.id);

  const approvedActivityRows = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      workDate: dailyActivityEntries.workDate,
      submittedAt: dailyActivityEntries.submittedAt,
      approvedAt: dailyActivityEntries.approvedAt,
      externalCode: pointCatalogEntries.externalCode,
      notes: dailyActivityEntries.notes,
      jobIdSnapshot: hasSnapshotColumn ? dailyActivityEntries.jobIdSnapshot : pointCatalogEntries.externalCode,
      workNameSnapshot: dailyActivityEntries.workNameSnapshot,
      quantity: dailyActivityEntries.quantity,
      pointValueSnapshot: dailyActivityEntries.pointValueSnapshot,
      totalPoints: dailyActivityEntries.totalPoints,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .leftJoin(pointCatalogEntries, eq(dailyActivityEntries.pointCatalogEntryId, pointCatalogEntries.id))
    .where(
      and(
        inArray(dailyActivityEntries.employeeId, employeeIds),
        gte(dailyActivityEntries.workDate, period.periodStartDate),
        lte(dailyActivityEntries.workDate, period.periodEndDate),
        inArray(dailyActivityEntries.status, approvedStatuses)
      )
    )
    .orderBy(desc(dailyActivityEntries.workDate), asc(dailyActivityEntries.workNameSnapshot));

  return {
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
    divisions: divisionRows,
    employees: employeeRows,
    approvedActivities: approvedActivityRows,
  };
}

export async function batchDecideDraftActivities(input: {
  ids: string[];
  action: "approve" | "reject";
  notes?: string;
}) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    return { error: "Tidak ada aktivitas yang dipilih." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const entries = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(inArray(dailyActivityEntries.id, input.ids));

  if (entries.length === 0) return { error: "Aktivitas tidak ditemukan." };

  const notApprovable = entries.filter(
    (e) => !APPROVABLE_STATUSES.includes(e.status as (typeof APPROVABLE_STATUSES)[number])
  );
  if (notApprovable.length > 0) {
    return { error: "Beberapa aktivitas tidak berada pada status yang dapat diproses." };
  }

  const uniqueEmployeeIds = [...new Set(entries.map((e) => e.employeeId))];
  for (const empId of uniqueEmployeeIds) {
    const inScope = await assertActivityScope(role, roleRow.divisionIds, empId);
    if (!inScope) return { error: "Akses ditolak untuk aktivitas di luar scope divisi Anda." };
  }

  const isApprove = input.action === "approve";
  const nextStatus = isApprove ? "OVERRIDE_HRD" : "DITOLAK_SPV";
  const logAction = (isApprove ? "OVERRIDE_HRD" : "REJECT_SPV") as "OVERRIDE_HRD" | "REJECT_SPV";

  await db.transaction(async (tx) => {
    await tx
      .update(dailyActivityEntries)
      .set({
        status: nextStatus,
        ...(isApprove ? { approvedAt: new Date() } : { rejectedAt: new Date() }),
        updatedByUserId: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(dailyActivityEntries.id, input.ids));

    await tx.insert(dailyActivityApprovalLogs).values(
      entries.map((entry) => ({
        activityEntryId: entry.id,
        action: logAction,
        actorUserId: user?.id ?? entry.employeeId,
        actorRole: role,
        notes: input.notes,
      }))
    );
  });

  revalidatePath("/performance");
  return { success: true, count: entries.length };
}

/**
 * Edit satu entri performa yang masih DIAJUKAN atau DIAJUKAN_ULANG.
 * Karyawan hanya bisa edit entri milik sendiri.
 * Bidang yang bisa diubah: jenis pekerjaan (catalog), job ID, dan qty.
 */
export async function updatePendingActivityEntry(input: unknown) {
  const authError = await checkRole(PERFORMANCE_SELF_SERVICE_ROLES);
  if (authError) return { error: authError.error ?? "Akses ditolak." };

  const parsed = updatePendingActivityEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) return { error: "Akun belum terhubung ke data karyawan." };

  const hasSnapshotColumn = await hasJobIdSnapshotColumn();

  const [existing] = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(eq(dailyActivityEntries.id, parsed.data.id))
    .limit(1);

  if (!existing) return { error: "Aktivitas tidak ditemukan." };
  if (existing.employeeId !== roleRow.employeeId) {
    return { error: "Anda hanya dapat mengedit aktivitas milik sendiri." };
  }
  if (!["DIAJUKAN", "DIAJUKAN_ULANG"].includes(existing.status)) {
    return { error: "Hanya aktivitas yang sedang direview HRD yang dapat diedit." };
  }

  const activeVersion = await getActivePointCatalogVersion();
  if (!activeVersion) return { error: "Belum ada versi katalog poin aktif." };

  const [catalogRow] = await db
    .select()
    .from(pointCatalogEntries)
    .where(
      and(
        eq(pointCatalogEntries.id, parsed.data.pointCatalogEntryId),
        eq(pointCatalogEntries.versionId, activeVersion.id),
        eq(pointCatalogEntries.isActive, true)
      )
    )
    .limit(1);
  if (!catalogRow) return { error: "Katalog pekerjaan tidak valid atau tidak aktif." };

  const pointValue = toNumber(catalogRow.pointValue);
  const totalPoints = Number((pointValue * parsed.data.quantity).toFixed(2));
  const snapshotValue = parsed.data.jobId ?? catalogRow.externalCode ?? null;

  if (hasSnapshotColumn) {
    await db
      .update(dailyActivityEntries)
      .set({
        pointCatalogEntryId: catalogRow.id,
        pointCatalogDivisionName: catalogRow.divisionName,
        jobIdSnapshot: snapshotValue,
        workNameSnapshot: catalogRow.workName,
        unitDescriptionSnapshot: catalogRow.unitDescription,
        pointValueSnapshot: pointValue.toFixed(2),
        quantity: parsed.data.quantity.toFixed(2),
        totalPoints: totalPoints.toFixed(2),
      })
      .where(eq(dailyActivityEntries.id, parsed.data.id));
  } else {
    await db
      .update(dailyActivityEntriesLegacy)
      .set({
        pointCatalogEntryId: catalogRow.id,
        pointCatalogDivisionName: catalogRow.divisionName,
        workNameSnapshot: catalogRow.workName,
        unitDescriptionSnapshot: catalogRow.unitDescription,
        pointValueSnapshot: pointValue.toFixed(2),
        quantity: parsed.data.quantity.toFixed(2),
        totalPoints: totalPoints.toFixed(2),
        notes: encodeLegacyNotes(snapshotValue),
      })
      .where(eq(dailyActivityEntriesLegacy.id, parsed.data.id));
  }

  revalidatePath("/performance");
  return { success: true };
}

export async function returnActivityToRevision(input: { ids: string[]; notes?: string }) {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    return { error: "Tidak ada aktivitas yang dipilih." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const entries = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(inArray(dailyActivityEntries.id, input.ids));

  if (entries.length === 0) return { error: "Aktivitas tidak ditemukan." };

  const notReturnable = entries.filter((e) => e.status !== "OVERRIDE_HRD");
  if (notReturnable.length > 0) {
    return { error: "Hanya aktivitas berstatus 'Disetujui HRD' yang dapat dikembalikan ke revisi." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(dailyActivityEntries)
      .set({
        status: "REVISI_TW",
        approvedAt: null,
        updatedByUserId: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(dailyActivityEntries.id, input.ids));

    await tx.insert(dailyActivityApprovalLogs).values(
      entries.map((entry) => ({
        activityEntryId: entry.id,
        action: "RETURN_TO_REVISION" as const,
        actorUserId: user?.id ?? entry.employeeId,
        actorRole: role,
        notes: input.notes,
      }))
    );
  });

  revalidatePath("/performance");
  return { success: true, count: entries.length };
}

export async function deleteActivityEntry(activityEntryId: string) {
  const authError = await checkRole([...PERFORMANCE_ACTIVITY_ROLES, ...PERFORMANCE_SELF_SERVICE_ROLES]);
  if (authError) return authError;

  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const [existingEntry] = await db
    .select({
      id: dailyActivityEntries.id,
      employeeId: dailyActivityEntries.employeeId,
      status: dailyActivityEntries.status,
    })
    .from(dailyActivityEntries)
    .where(eq(dailyActivityEntries.id, activityEntryId))
    .limit(1);

  if (!existingEntry) return { error: "Aktivitas tidak ditemukan." };
  const deletableStatuses = ["DRAFT", "DIAJUKAN", "DIAJUKAN_ULANG"] as const;
  if (!deletableStatuses.includes(existingEntry.status as (typeof deletableStatuses)[number])) {
    return { error: "Hanya aktivitas berstatus DRAFT atau DIAJUKAN yang dapat dihapus." };
  }

  if (PERFORMANCE_SELF_SERVICE_ROLES.includes(role)) {
    if (!roleRow.employeeId || existingEntry.employeeId !== roleRow.employeeId) {
      return { error: "Anda hanya dapat menghapus aktivitas milik sendiri." };
    }
  } else {
    const inScope = await assertActivityScope(role, roleRow.divisionIds, existingEntry.employeeId);
    if (!inScope) return { error: "Akses ditolak untuk aktivitas di luar scope divisi Anda." };
  }

  await db.delete(dailyActivityEntries).where(eq(dailyActivityEntries.id, activityEntryId));

  revalidatePath("/performance");
  return { success: true };
}
