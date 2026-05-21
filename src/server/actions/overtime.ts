"use server";

import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checkRole, getCurrentUserRoleRow, getUser, requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { employeeScheduleAssignments, workScheduleDays, employees } from "@/lib/db/schema/employee";
import { attendanceTickets, overtimeDraftEntries, overtimeRequests } from "@/lib/db/schema/hr";
import { divisions } from "@/lib/db/schema/master";
import { pointCatalogEntries } from "@/lib/db/schema/point";
import { resolvePayrollPeriod } from "@/server/payroll-engine/resolve-payroll-period";
import { getActivePointCatalogVersion } from "@/server/services/point-catalog-service";
import { KPI_EMPLOYEE_GROUPS, POINT_EMPLOYEE_GROUPS } from "@/lib/employee-groups";
import {
  overtimeDeleteSchema,
  overtimeDecisionSchema,
  overtimeRequestSchema,
  overtimeDraftSubmitSchema,
  spvScheduleOvertimeSchema,
  spvSelfOvertimeRequestSchema,
} from "@/lib/validations/overtime";
import type { UserRole } from "@/types";
import type { EmployeeGroup } from "@/lib/employee-groups";

const OVERTIME_APPROVER_ROLES: UserRole[] = ["SUPER_ADMIN", "SPV", "HRD"];
const OVERTIME_SUBMITTER_ROLES: UserRole[] = ["TEAMWORK", "MANAGERIAL"];
const OVERTIME_MONITOR_ROLES: UserRole[] = ["HRD"];
const DIV_SCOPED_ROLES: UserRole[] = ["SPV", "KABAG"];

const OVERTIME_TYPE_CONFIG = {
  OVERTIME_1H: { overtimeHours: 1, breakHours: 0, baseAmount: 11_000, mealAmount: 0 },
  OVERTIME_2H: { overtimeHours: 2, breakHours: 0, baseAmount: 22_000, mealAmount: 0 },
  OVERTIME_3H: { overtimeHours: 3, breakHours: 0, baseAmount: 33_000, mealAmount: 10_000 },
  LEMBUR_FULLDAY: { overtimeHours: 8, breakHours: 1, baseAmount: 100_000, mealAmount: 20_000 },
  PATCH_ABSENCE_3H: { overtimeHours: 3, breakHours: 0, baseAmount: 11_000, mealAmount: 30_000 },
} as const;

type OvertimeType = keyof typeof OVERTIME_TYPE_CONFIG;
type OvertimePlacement = "BEFORE_SHIFT" | "AFTER_SHIFT";
let hasOvertimeRequestsTablePromise: Promise<boolean> | null = null;
let hasOvertimeDraftEntriesTablePromise: Promise<boolean> | null = null;
let hasOvertimePlacementColumnPromise: Promise<boolean> | null = null;

async function hasOvertimeRequestsTable() {
  if (!hasOvertimeRequestsTablePromise) {
    hasOvertimeRequestsTablePromise = db
      .execute(
        sql<{ has_table: boolean }>`
          select exists (
            select 1
            from information_schema.tables
            where table_name = 'overtime_requests'
          ) as has_table
        `
      )
      .then((rows) => Boolean(rows[0]?.has_table))
      .catch(() => false);
  }
  return hasOvertimeRequestsTablePromise;
}

async function ensureOvertimeTableReady() {
  const ready = await hasOvertimeRequestsTable();
  if (!ready) {
    return {
      error:
        "Modul overtime belum siap di database. Jalankan migration `supabase/migrations/0014_overtime_requests.sql` terlebih dahulu.",
    } as const;
  }
  if (!hasOvertimeDraftEntriesTablePromise) {
    hasOvertimeDraftEntriesTablePromise = db
      .execute(
        sql<{ has_table: boolean }>`
          select exists (
            select 1
            from information_schema.tables
            where table_name = 'overtime_draft_entries'
          ) as has_table
        `
      )
      .then((rows) => Boolean(rows[0]?.has_table))
      .catch(() => false);
  }
  const draftReady = await hasOvertimeDraftEntriesTablePromise;
  if (!draftReady) {
    return {
      error:
        "Modul draft overtime belum siap di database. Jalankan migration `supabase/migrations/0015_overtime_draft_entries.sql` terlebih dahulu.",
    } as const;
  }
  return null;
}

async function hasOvertimePlacementColumn() {
  if (!hasOvertimePlacementColumnPromise) {
    hasOvertimePlacementColumnPromise = db
      .execute(
        sql<{ has_column: boolean }>`
          select exists (
            select 1
            from information_schema.columns
            where table_name = 'overtime_requests'
              and column_name = 'overtime_placement'
          ) as has_column
        `
      )
      .then((rows) => Boolean(rows[0]?.has_column))
      .catch(() => false);
  }
  return hasOvertimePlacementColumnPromise;
}

type OvertimeRequestRow = {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string | null;
  divisionName: string | null;
  requestDate: Date;
  overtimeType: OvertimeType;
  overtimePlacement: OvertimePlacement;
  overtimeHours: number;
  breakHours: number;
  baseAmount: string | number;
  mealAmount: string | number;
  totalAmount: string | number;
  periodCode: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  employeeGroup: EmployeeGroup | null;
  reviewNotes: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  draftTotalPoints: number;
  draftItems: {
    id: string;
    jobId: string;
    workName: string;
    quantity: number;
    pointValue: number;
    totalPoints: number;
    notes: string | null;
  }[];
};

type ScopedEmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionName: string | null;
  employeeGroup: EmployeeGroup;
};

type OvertimeCatalogEntry = {
  id: string;
  externalCode: string | null;
  workName: string;
  pointValue: string | number;
  unitDescription: string | null;
};

function resolvePeriodCodeFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getScopedOvertimeRows(role: UserRole, divisionIds: string[]) {
  const hasPlacementColumn = await hasOvertimePlacementColumn();
  const baseQuery = db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      employeeCode: employees.employeeCode,
      employeeName: employees.fullName,
      divisionName: divisions.name,
      requestDate: overtimeRequests.requestDate,
      overtimeType: overtimeRequests.overtimeType,
      overtimePlacement: hasPlacementColumn
        ? overtimeRequests.overtimePlacement
        : sql<OvertimePlacement>`'AFTER_SHIFT'`.as("overtime_placement"),
      overtimeHours: overtimeRequests.overtimeHours,
      breakHours: overtimeRequests.breakHours,
      baseAmount: overtimeRequests.baseAmount,
      mealAmount: overtimeRequests.mealAmount,
      totalAmount: overtimeRequests.totalAmount,
      periodCode: overtimeRequests.periodCode,
      reason: overtimeRequests.reason,
      status: overtimeRequests.status,
      employeeGroup: employees.employeeGroup,
      reviewNotes: overtimeRequests.reviewNotes,
      approvedAt: overtimeRequests.approvedAt,
      rejectedAt: overtimeRequests.rejectedAt,
      createdAt: overtimeRequests.createdAt,
    })
    .from(overtimeRequests)
    .leftJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id));

  if (DIV_SCOPED_ROLES.includes(role)) {
    if (divisionIds.length === 0) return [];
    const rows = (await baseQuery
      .where(inArray(employees.divisionId, divisionIds))
      .orderBy(desc(overtimeRequests.requestDate), desc(overtimeRequests.createdAt))) as Omit<OvertimeRequestRow, "draftTotalPoints" | "draftItems">[];
    return withDraftMeta(rows);
  }

  const rows = (await baseQuery.orderBy(desc(overtimeRequests.requestDate), desc(overtimeRequests.createdAt))) as Omit<OvertimeRequestRow, "draftTotalPoints" | "draftItems">[];
  return withDraftMeta(rows);
}

async function withDraftMeta(rows: Omit<OvertimeRequestRow, "draftTotalPoints" | "draftItems">[]): Promise<OvertimeRequestRow[]> {
  if (rows.length === 0) return [];
  const requestIds = rows.map((row) => row.id);
  const draftRows = await db
    .select({
      id: overtimeDraftEntries.id,
      overtimeRequestId: overtimeDraftEntries.overtimeRequestId,
      jobId: overtimeDraftEntries.jobId,
      workName: overtimeDraftEntries.workName,
      quantity: overtimeDraftEntries.quantity,
      pointValue: overtimeDraftEntries.pointValue,
      totalPoints: overtimeDraftEntries.totalPoints,
      notes: overtimeDraftEntries.notes,
    })
    .from(overtimeDraftEntries)
    .where(inArray(overtimeDraftEntries.overtimeRequestId, requestIds))
    .orderBy(overtimeDraftEntries.createdAt);

  const grouped = new Map<string, OvertimeRequestRow["draftItems"]>();
  for (const item of draftRows) {
    const entry = {
      id: item.id,
      jobId: item.jobId,
      workName: item.workName,
      quantity: Number(item.quantity),
      pointValue: Number(item.pointValue),
      totalPoints: Number(item.totalPoints),
      notes: item.notes ?? null,
    };
    const list = grouped.get(item.overtimeRequestId) ?? [];
    list.push(entry);
    grouped.set(item.overtimeRequestId, list);
  }

  return rows.map((row) => {
    const draftItems = grouped.get(row.id) ?? [];
    const draftTotalPoints = Number(draftItems.reduce((sum, item) => sum + item.totalPoints, 0).toFixed(2));
    return { ...row, draftItems, draftTotalPoints };
  });
}

export async function getOvertimeWorkspace() {
  await requireAuth();
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const canSubmit = OVERTIME_SUBMITTER_ROLES.includes(role);
  const canApprove = OVERTIME_APPROVER_ROLES.includes(role);
  const canMonitor = OVERTIME_MONITOR_ROLES.includes(role);
  const canSpvManage = role === "SPV";
  if (!canSubmit && !canApprove && !canMonitor) {
    return { error: "Akses ditolak." };
  }

  const allRows = canApprove || canMonitor ? await getScopedOvertimeRows(role, roleRow.divisionIds) : [];
  const hasPlacementColumn = await hasOvertimePlacementColumn();

  const myRows = canSubmit && roleRow.employeeId
    ? ((await db
      .select({
        id: overtimeRequests.id,
        employeeId: overtimeRequests.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: employees.fullName,
        divisionName: divisions.name,
        requestDate: overtimeRequests.requestDate,
        overtimeType: overtimeRequests.overtimeType,
        overtimePlacement: hasPlacementColumn
          ? overtimeRequests.overtimePlacement
          : sql<OvertimePlacement>`'AFTER_SHIFT'`.as("overtime_placement"),
        overtimeHours: overtimeRequests.overtimeHours,
        breakHours: overtimeRequests.breakHours,
        baseAmount: overtimeRequests.baseAmount,
        mealAmount: overtimeRequests.mealAmount,
        totalAmount: overtimeRequests.totalAmount,
        periodCode: overtimeRequests.periodCode,
        reason: overtimeRequests.reason,
        status: overtimeRequests.status,
        employeeGroup: employees.employeeGroup,
        reviewNotes: overtimeRequests.reviewNotes,
        approvedAt: overtimeRequests.approvedAt,
        rejectedAt: overtimeRequests.rejectedAt,
        createdAt: overtimeRequests.createdAt,
      })
      .from(overtimeRequests)
      .leftJoin(employees, eq(overtimeRequests.employeeId, employees.id))
      .leftJoin(divisions, eq(employees.divisionId, divisions.id))
      .where(eq(overtimeRequests.employeeId, roleRow.employeeId))
      .orderBy(desc(overtimeRequests.requestDate), desc(overtimeRequests.createdAt))) as Omit<OvertimeRequestRow, "draftTotalPoints" | "draftItems">[])
    : [];
  const myRowsWithDraft = await withDraftMeta(myRows);
  const pendingRows = allRows.filter((row) => row.status === "PENDING");
  const pendingRowsScoped = role === "HRD"
    ? pendingRows
    : pendingRows.filter((row) => row.employeeGroup !== "MANAGERIAL");

  let scopedEmployees: ScopedEmployeeOption[] = [];
  if (canSpvManage) {
    if (roleRow.divisionIds.length > 0) {
      scopedEmployees = await db
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          divisionName: divisions.name,
          employeeGroup: employees.employeeGroup,
        })
        .from(employees)
        .leftJoin(divisions, eq(employees.divisionId, divisions.id))
        .where(
          and(
            inArray(employees.divisionId, roleRow.divisionIds),
            inArray(employees.employeeGroup, [...POINT_EMPLOYEE_GROUPS, ...KPI_EMPLOYEE_GROUPS]),
            eq(employees.isActive, true),
          )
        )
        .orderBy(employees.fullName);
    }
  }

  let overtimeCatalogEntries: OvertimeCatalogEntry[] = [];
  if (canSubmit && roleRow.employeeId) {
    const [employeeRow] = await db
      .select({ divisionName: divisions.name })
      .from(employees)
      .leftJoin(divisions, eq(employees.divisionId, divisions.id))
      .where(eq(employees.id, roleRow.employeeId))
      .limit(1);

    const activeVersion = await getActivePointCatalogVersion();
    if (activeVersion && employeeRow?.divisionName) {
      const catalogRows = await db
        .select({
          id: pointCatalogEntries.id,
          externalCode: pointCatalogEntries.externalCode,
          workName: pointCatalogEntries.workName,
          pointValue: pointCatalogEntries.pointValue,
          unitDescription: pointCatalogEntries.unitDescription,
          divisionName: pointCatalogEntries.divisionName,
          externalRowNumber: pointCatalogEntries.externalRowNumber,
        })
        .from(pointCatalogEntries)
        .where(
          and(
            eq(pointCatalogEntries.versionId, activeVersion.id),
            eq(pointCatalogEntries.isActive, true),
          )
        )
        .orderBy(pointCatalogEntries.externalRowNumber);

      overtimeCatalogEntries = catalogRows
        .filter((row) => row.divisionName.toUpperCase() === employeeRow.divisionName!.toUpperCase())
        .map((row) => ({
          id: row.id,
          externalCode: row.externalCode ?? null,
          workName: row.workName,
          pointValue: row.pointValue,
          unitDescription: row.unitDescription ?? null,
        }));
    }
  }

  return {
    role,
    canSubmit,
    canApprove,
    canMonitor,
    canSpvManage,
    isManagerial: role === "MANAGERIAL",
    scopedEmployees,
    overtimeCatalogEntries,
    myRequests: myRowsWithDraft,
    pendingRequests: pendingRowsScoped,
    processedRequests: allRows.filter((row) => row.status !== "PENDING"),
  };
}

export async function submitOvertimeDraft(input: unknown) {
  const authError = await checkRole(["TEAMWORK", "MANAGERIAL"]);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = overtimeDraftSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Draft lembur tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const user = await getUser();
  const actorUserId = user?.id ?? roleRow.userId;
  if (!roleRow.employeeId) return { error: "Akun Anda belum terhubung ke data karyawan." };

  const [requestRow] = await db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      status: overtimeRequests.status,
      requestDate: overtimeRequests.requestDate,
    })
    .from(overtimeRequests)
    .where(eq(overtimeRequests.id, parsed.data.requestId))
    .limit(1);

  if (!requestRow) return { error: "Request lembur tidak ditemukan." };
  if (requestRow.employeeId !== roleRow.employeeId) return { error: "Anda hanya boleh mengisi draft lembur milik sendiri." };
  if (requestRow.status !== "APPROVED") return { error: "Draft lembur hanya bisa diisi untuk jadwal yang sudah approved." };

  await db.transaction(async (tx) => {
    await tx.delete(overtimeDraftEntries).where(eq(overtimeDraftEntries.overtimeRequestId, requestRow.id));
    await tx.insert(overtimeDraftEntries).values(
      parsed.data.items.map((item) => ({
        overtimeRequestId: requestRow.id,
        employeeId: roleRow.employeeId!,
        workDate: requestRow.requestDate,
        jobId: item.jobId.trim(),
        workName: item.workName.trim(),
        quantity: item.quantity.toFixed(2),
        pointValue: item.pointValue.toFixed(2),
        totalPoints: (item.quantity * item.pointValue).toFixed(2),
        notes: item.notes?.trim() || null,
        createdByUserId: actorUserId,
      }))
    );
  });

  revalidatePath("/overtime");
  return { success: true };
}

function buildOvertimeInsertData(params: {
  employeeId: string;
  requestDate: Date;
  overtimeType: OvertimeType;
  overtimePlacement?: OvertimePlacement;
  reason: string;
  actorUserId: string;
  autoApproved?: boolean;
}) {
  const cfg = OVERTIME_TYPE_CONFIG[params.overtimeType];
  const periodCode = resolvePeriodCodeFromDate(params.requestDate);
  const period = resolvePayrollPeriod(periodCode);
  const totalAmount = cfg.baseAmount + cfg.mealAmount;

  return {
    employeeId: params.employeeId,
    requestDate: params.requestDate,
    overtimeType: params.overtimeType,
    overtimePlacement:
      params.overtimeType === "OVERTIME_3H"
        ? (params.overtimePlacement ?? "AFTER_SHIFT")
        : "AFTER_SHIFT",
    overtimeHours: cfg.overtimeHours,
    breakHours: cfg.breakHours,
    baseAmount: cfg.baseAmount.toFixed(2),
    mealAmount: cfg.mealAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    periodCode,
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
    reason: params.reason,
    status: params.autoApproved ? "APPROVED" as const : "PENDING" as const,
    requestedByUserId: params.actorUserId,
    approvedByUserId: params.autoApproved ? params.actorUserId : null,
    approvedAt: params.autoApproved ? new Date() : null,
  };
}

export async function submitOvertimeRequest(input: unknown) {
  const authError = await checkRole(OVERTIME_SUBMITTER_ROLES);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = overtimeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input overtime tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const user = await getUser();
  const actorUserId = user?.id ?? roleRow.userId;
  if (!roleRow.employeeId) {
    return { error: "Akun Anda belum terhubung ke data karyawan." };
  }

  const overtimeType = parsed.data.overtimeType as OvertimeType;
  const periodCode = resolvePeriodCodeFromDate(parsed.data.requestDate);
  const period = resolvePayrollPeriod(periodCode);

  if (overtimeType === "PATCH_ABSENCE_3H") {
    const [approvedAbsence] = await db
      .select({ count: sql<number>`count(*)` })
      .from(attendanceTickets)
      .where(
        and(
          eq(attendanceTickets.employeeId, roleRow.employeeId),
          inArray(attendanceTickets.ticketType, ["IZIN", "SAKIT", "CUTI"]),
          inArray(attendanceTickets.status, ["APPROVED_SPV", "APPROVED_HRD", "AUTO_APPROVED", "LOCKED"]),
          lte(attendanceTickets.startDate, period.periodEndDate),
          gte(attendanceTickets.endDate, period.periodStartDate),
        )
      );

    if ((approvedAbsence?.count ?? 0) === 0) {
      return { error: "Penambalan hanya bisa diajukan jika ada tiket IZIN/SAKIT/CUTI approved pada periode yang sama." };
    }

    const [existingPatchCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.employeeId, roleRow.employeeId),
          eq(overtimeRequests.periodCode, periodCode),
          eq(overtimeRequests.overtimeType, "PATCH_ABSENCE_3H"),
          or(eq(overtimeRequests.status, "PENDING"), eq(overtimeRequests.status, "APPROVED"))
        )
      );

    if ((existingPatchCount?.count ?? 0) >= 3) {
      return { error: "Penambalan overtime 3 jam maksimal 3x per periode kerja." };
    }
  }

  await db.insert(overtimeRequests).values({
    ...buildOvertimeInsertData({
      employeeId: roleRow.employeeId,
      requestDate: parsed.data.requestDate,
      overtimeType,
      overtimePlacement: parsed.data.overtimePlacement,
      reason: parsed.data.reason,
      actorUserId,
    }),
  });

  revalidatePath("/overtime");
  return { success: true };
}

export async function submitSpvOvertimeRequest(input: unknown) {
  const authError = await checkRole(["SPV"]);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = spvSelfOvertimeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input lembur SPV tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const user = await getUser();
  const actorUserId = user?.id ?? roleRow.userId;
  if (!roleRow.employeeId) {
    return { error: "Akun SPV belum terhubung ke data karyawan." };
  }

  await db.insert(overtimeRequests).values(
    buildOvertimeInsertData({
      employeeId: roleRow.employeeId,
      requestDate: parsed.data.requestDate,
      overtimeType: parsed.data.overtimeType,
      overtimePlacement: parsed.data.overtimePlacement,
      reason: parsed.data.reason,
      actorUserId,
      autoApproved: true,
    })
  );

  revalidatePath("/overtime");
  return { success: true };
}

export async function scheduleDivisionOvertime(input: unknown) {
  const authError = await checkRole(["SPV"]);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = spvScheduleOvertimeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data atur lembur tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const user = await getUser();
  const actorUserId = user?.id ?? roleRow.userId;

  const [targetEmployee] = await db
    .select({
      id: employees.id,
      divisionId: employees.divisionId,
      employeeGroup: employees.employeeGroup,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!targetEmployee || !targetEmployee.isActive) {
    return { error: "Karyawan tujuan tidak ditemukan atau sudah nonaktif." };
  }
  if (!roleRow.divisionIds.includes(targetEmployee.divisionId)) {
    return { error: "Karyawan tujuan di luar scope divisi SPV." };
  }
  if (![...POINT_EMPLOYEE_GROUPS, ...KPI_EMPLOYEE_GROUPS].includes(targetEmployee.employeeGroup as (typeof POINT_EMPLOYEE_GROUPS)[number] | (typeof KPI_EMPLOYEE_GROUPS)[number])) {
    return { error: "Atur lembur hanya untuk karyawan aktif yang relevan." };
  }

  await db.insert(overtimeRequests).values(
    buildOvertimeInsertData({
      employeeId: targetEmployee.id,
      requestDate: parsed.data.requestDate,
      overtimeType: parsed.data.overtimeType,
      overtimePlacement: parsed.data.overtimePlacement,
      reason: `Terjadwal SPV: ${parsed.data.reason}`,
      actorUserId,
      autoApproved: true,
    })
  );

  revalidatePath("/overtime");
  return { success: true };
}

async function queryShiftForDate(employeeId: string, date: string): Promise<{ startTime: string; endTime: string } | null> {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (isNaN(parsedDate.getTime())) return null;
  const dayOfWeek = parsedDate.getDay();

  const [assignment] = await db
    .select({ scheduleId: employeeScheduleAssignments.scheduleId })
    .from(employeeScheduleAssignments)
    .where(
      and(
        eq(employeeScheduleAssignments.employeeId, employeeId),
        lte(employeeScheduleAssignments.effectiveStartDate, parsedDate),
        or(
          isNull(employeeScheduleAssignments.effectiveEndDate),
          gte(employeeScheduleAssignments.effectiveEndDate, parsedDate)
        )
      )
    )
    .orderBy(desc(employeeScheduleAssignments.effectiveStartDate))
    .limit(1);
  if (!assignment) return null;

  const [dayConfig] = await db
    .select({
      startTime: workScheduleDays.startTime,
      endTime: workScheduleDays.endTime,
      isWorkingDay: workScheduleDays.isWorkingDay,
    })
    .from(workScheduleDays)
    .where(
      and(
        eq(workScheduleDays.scheduleId, assignment.scheduleId),
        eq(workScheduleDays.dayOfWeek, dayOfWeek)
      )
    )
    .limit(1);
  if (!dayConfig?.isWorkingDay || !dayConfig.startTime || !dayConfig.endTime) return null;

  return { startTime: dayConfig.startTime, endTime: dayConfig.endTime };
}

export async function getMyShiftForDate(date: string): Promise<{ startTime: string; endTime: string } | null> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) return null;
  return queryShiftForDate(roleRow.employeeId, date);
}

export async function getEmployeeShiftForDate(
  employeeId: string,
  date: string
): Promise<{ startTime: string; endTime: string } | null> {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  if ((roleRow.role as UserRole) !== "SPV") return null;

  const [emp] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp || !roleRow.divisionIds.includes(emp.divisionId)) return null;

  return queryShiftForDate(employeeId, date);
}

export async function decideOvertimeRequest(input: unknown) {
  const authError = await checkRole(OVERTIME_APPROVER_ROLES);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = overtimeDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Keputusan overtime tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const user = await getUser();
  const actorUserId = user?.id ?? roleRow.userId;

  const [existing] = await db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      status: overtimeRequests.status,
      employeeDivisionId: employees.divisionId,
      employeeGroup: employees.employeeGroup,
    })
    .from(overtimeRequests)
    .leftJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .where(eq(overtimeRequests.id, parsed.data.requestId))
    .limit(1);

  if (!existing) return { error: "Pengajuan overtime tidak ditemukan." };
  if (existing.status !== "PENDING") return { error: "Pengajuan overtime sudah diproses." };

  if (existing.employeeGroup === "MANAGERIAL" && role !== "HRD") {
    return { error: "Pengajuan overtime managerial hanya dapat diproses oleh HRD." };
  }

  if (DIV_SCOPED_ROLES.includes(role)) {
    if (!existing.employeeDivisionId || !roleRow.divisionIds.includes(existing.employeeDivisionId)) {
      return { error: "Akses ditolak untuk karyawan di luar scope divisi Anda." };
    }
  }

  if (parsed.data.action === "APPROVE") {
    await db
      .update(overtimeRequests)
      .set({
        status: "APPROVED",
        reviewNotes: parsed.data.reviewNotes?.trim() || null,
        approvedByUserId: actorUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(overtimeRequests.id, parsed.data.requestId));
  } else {
    if (!parsed.data.reviewNotes?.trim()) {
      return { error: "Alasan penolakan wajib diisi." };
    }
    await db
      .update(overtimeRequests)
      .set({
        status: "REJECTED",
        reviewNotes: parsed.data.reviewNotes.trim(),
        rejectedByUserId: actorUserId,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(overtimeRequests.id, parsed.data.requestId));
  }

  revalidatePath("/overtime");
  return { success: true };
}

export async function deleteOvertimeRequest(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD", "SPV", "KABAG", "TEAMWORK", "MANAGERIAL"]);
  if (authError) return authError;
  const tableError = await ensureOvertimeTableReady();
  if (tableError) return tableError;

  const parsed = overtimeDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Request hapus overtime tidak valid." };
  }

  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const [existing] = await db
    .select({
      id: overtimeRequests.id,
      employeeId: overtimeRequests.employeeId,
      employeeDivisionId: employees.divisionId,
    })
    .from(overtimeRequests)
    .leftJoin(employees, eq(overtimeRequests.employeeId, employees.id))
    .where(eq(overtimeRequests.id, parsed.data.requestId))
    .limit(1);

  if (!existing) return { error: "Pengajuan overtime tidak ditemukan." };

  if (role === "TEAMWORK" || role === "MANAGERIAL") {
    if (!roleRow.employeeId || existing.employeeId !== roleRow.employeeId) {
      return { error: "Anda hanya boleh menghapus pengajuan overtime milik sendiri." };
    }
  }

  if (DIV_SCOPED_ROLES.includes(role)) {
    if (!existing.employeeDivisionId || !roleRow.divisionIds.includes(existing.employeeDivisionId)) {
      return { error: "Akses ditolak untuk karyawan di luar scope divisi Anda." };
    }
  }

  await db.delete(overtimeRequests).where(eq(overtimeRequests.id, existing.id));

  revalidatePath("/overtime");
  return { success: true };
}
