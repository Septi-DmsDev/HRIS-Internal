"use server";

import { format } from "date-fns";
import { getUser, checkRole, getCurrentUserRoleRow } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema/employee";
import { attendanceFallbackRequests, attendanceTickets, employeeAttendanceRecords, overtimeRequests } from "@/lib/db/schema/hr";
import { branches, divisions } from "@/lib/db/schema/master";
import { attendanceFallbackDecisionSchema, attendanceFallbackRequestSchema, attendanceRecordSchema } from "@/lib/validations/attendance";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types";
import { z } from "zod";
import { resolveAttendancePayrollEligibility } from "@/server/attendance-engine/resolve-attendance-payroll-eligibility";
import { resolvePayrollPeriod } from "@/server/payroll-engine/resolve-payroll-period";

const ATTENDANCE_MANAGE_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD"];
const ATTENDANCE_SELF_SERVICE_ROLES: UserRole[] = ["TEAMWORK", "MANAGERIAL", "SPV", "KABAG", "FINANCE", "PAYROLL_VIEWER"];

function normalizeDateInput(value?: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function getAttendanceWorkspace(selectedDateInput?: string) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const roleRow = await getCurrentUserRoleRow();
  const selectedDate = normalizeDateInput(selectedDateInput);
  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.fullName));

  const records = await db
    .select({
      id: employeeAttendanceRecords.id,
      employeeId: employeeAttendanceRecords.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      divisionName: divisions.name,
      attendanceDate: employeeAttendanceRecords.attendanceDate,
      attendanceStatus: employeeAttendanceRecords.attendanceStatus,
      checkInTime: employeeAttendanceRecords.checkInTime,
      checkOutTime: employeeAttendanceRecords.checkOutTime,
      punctualityStatus: employeeAttendanceRecords.punctualityStatus,
      source: employeeAttendanceRecords.source,
      rawPayload: employeeAttendanceRecords.rawPayload,
      notes: employeeAttendanceRecords.notes,
      updatedAt: employeeAttendanceRecords.updatedAt,
    })
    .from(employeeAttendanceRecords)
    .innerJoin(employees, eq(employeeAttendanceRecords.employeeId, employees.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employeeAttendanceRecords.attendanceDate, selectedDate))
    .orderBy(asc(employees.fullName), desc(employeeAttendanceRecords.updatedAt));

  const fallbackRequests = await db
    .select({
      id: attendanceFallbackRequests.id,
      employeeId: attendanceFallbackRequests.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      divisionName: divisions.name,
      attendanceDate: attendanceFallbackRequests.attendanceDate,
      photoUrl: attendanceFallbackRequests.photoUrl,
      latitude: attendanceFallbackRequests.latitude,
      longitude: attendanceFallbackRequests.longitude,
      distanceMeters: attendanceFallbackRequests.distanceMeters,
      radiusMetersSnapshot: attendanceFallbackRequests.radiusMetersSnapshot,
      geofenceMatched: attendanceFallbackRequests.geofenceMatched,
      fingerprintFailureReason: attendanceFallbackRequests.fingerprintFailureReason,
      developerModeDisabledConfirmed: attendanceFallbackRequests.developerModeDisabledConfirmed,
      status: attendanceFallbackRequests.status,
      reviewNotes: attendanceFallbackRequests.reviewNotes,
      reviewedAt: attendanceFallbackRequests.reviewedAt,
      createdAt: attendanceFallbackRequests.createdAt,
    })
    .from(attendanceFallbackRequests)
    .innerJoin(employees, eq(attendanceFallbackRequests.employeeId, employees.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(attendanceFallbackRequests.attendanceDate, selectedDate))
    .orderBy(desc(attendanceFallbackRequests.createdAt));

  return {
    role: roleRow.role as UserRole,
    selectedDate: format(selectedDate, "yyyy-MM-dd"),
    employees: employeeRows,
    records,
    fallbackRequests,
  };
}

function resolvePayrollPeriodWindow(now: Date): { periodStart: Date; periodEnd: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDate();

  if (day >= 26) {
    return {
      periodStart: new Date(today.getFullYear(), today.getMonth(), 26),
      periodEnd: new Date(today.getFullYear(), today.getMonth() + 1, 25),
    };
  }

  return {
    periodStart: new Date(today.getFullYear(), today.getMonth() - 1, 26),
    periodEnd: new Date(today.getFullYear(), today.getMonth(), 25),
  };
}

function resolvePeriodWindowByCode(periodCode?: string) {
  if (!periodCode) return resolvePayrollPeriodWindow(new Date());
  const resolved = resolvePayrollPeriod(periodCode);
  return {
    periodStart: resolved.periodStartDate,
    periodEnd: resolved.periodEndDate,
  };
}

function toDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export async function getAttendanceOverrideWorkspace(selectedDateInput?: string) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const selectedDate = normalizeDateInput(selectedDateInput);
  const dateKey = format(selectedDate, "yyyy-MM-dd");

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.fullName));

  const records = await db
    .select({
      id: employeeAttendanceRecords.id,
      employeeId: employeeAttendanceRecords.employeeId,
      attendanceStatus: employeeAttendanceRecords.attendanceStatus,
      checkInTime: employeeAttendanceRecords.checkInTime,
      checkOutTime: employeeAttendanceRecords.checkOutTime,
      punctualityStatus: employeeAttendanceRecords.punctualityStatus,
      notes: employeeAttendanceRecords.notes,
      source: employeeAttendanceRecords.source,
      updatedAt: employeeAttendanceRecords.updatedAt,
    })
    .from(employeeAttendanceRecords)
    .where(eq(employeeAttendanceRecords.attendanceDate, selectedDate))
    .orderBy(desc(employeeAttendanceRecords.updatedAt));

  return {
    selectedDate: dateKey,
    employees: employeeRows,
    records,
  };
}

export async function getAttendancePeriodOverrideWorkspace() {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const { periodStart, periodEnd } = resolvePayrollPeriodWindow(new Date());
  const start = toDateOnly(periodStart);
  const end = toDateOnly(periodEnd);

  let workingDaysInPeriod = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0) workingDaysInPeriod += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.fullName));

  const employeeIds = employeeRows.map((e) => e.id);
  const attendanceRows = employeeIds.length
    ? await db
        .select({
          employeeId: employeeAttendanceRecords.employeeId,
          attendanceStatus: employeeAttendanceRecords.attendanceStatus,
          punctualityStatus: employeeAttendanceRecords.punctualityStatus,
        })
        .from(employeeAttendanceRecords)
        .where(
          and(
            inArray(employeeAttendanceRecords.employeeId, employeeIds),
            gte(employeeAttendanceRecords.attendanceDate, start),
            lte(employeeAttendanceRecords.attendanceDate, end)
          )
        )
    : [];

  const recapMap = new Map<string, { hadir: number; telat: number; alpha: number; cuti: number; izinSakit: number }>();
  for (const row of attendanceRows) {
    const current = recapMap.get(row.employeeId) ?? { hadir: 0, telat: 0, alpha: 0, cuti: 0, izinSakit: 0 };
    if (row.attendanceStatus === "HADIR") current.hadir += 1;
    if (row.attendanceStatus === "HADIR" && row.punctualityStatus === "TELAT") current.telat += 1;
    if (row.attendanceStatus === "ALPA") current.alpha += 1;
    if (row.attendanceStatus === "CUTI") current.cuti += 1;
    if (row.attendanceStatus === "IZIN" || row.attendanceStatus === "SAKIT") current.izinSakit += 1;
    recapMap.set(row.employeeId, current);
  }

  return {
    periodStart: toDateKey(start),
    periodEnd: toDateKey(end),
    workingDaysInPeriod,
    employees: employeeRows,
    totals: employeeRows.map((employee) => {
      const totals = recapMap.get(employee.id) ?? { hadir: 0, telat: 0, alpha: 0, cuti: 0, izinSakit: 0 };
      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        divisionName: employee.divisionName ?? "-",
        ...totals,
      };
    }),
  };
}

export async function getAttendancePeriodRecapWorkspace(periodCode?: string) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const { periodStart, periodEnd } = resolvePeriodWindowByCode(periodCode);
  const start = toDateOnly(periodStart);
  const end = toDateOnly(periodEnd);

  let workingDaysInPeriod = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0) workingDaysInPeriod += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      divisionName: divisions.name,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.fullName));

  const employeeIds = employeeRows.map((row) => row.id);
  if (employeeIds.length === 0) {
    return {
      periodStart: toDateKey(start),
      periodEnd: toDateKey(end),
      workingDaysInPeriod,
      rows: [],
    };
  }

  const attendanceRows = await db
    .select({
      employeeId: employeeAttendanceRecords.employeeId,
      attendanceStatus: employeeAttendanceRecords.attendanceStatus,
      punctualityStatus: employeeAttendanceRecords.punctualityStatus,
      attendanceDate: employeeAttendanceRecords.attendanceDate,
    })
    .from(employeeAttendanceRecords)
    .where(
      and(
        inArray(employeeAttendanceRecords.employeeId, employeeIds),
        gte(employeeAttendanceRecords.attendanceDate, start),
        lte(employeeAttendanceRecords.attendanceDate, end)
      )
    );

  const izinJamRows = await db
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
        lte(attendanceTickets.startDate, end),
        gte(attendanceTickets.endDate, start)
      )
    )
    .groupBy(attendanceTickets.employeeId);

  const overtimeRows = await db
    .select({
      employeeId: overtimeRequests.employeeId,
      overtimeHours: sql<number>`coalesce(sum(case when ${overtimeRequests.status} = 'APPROVED' and ${overtimeRequests.overtimeType} in ('OVERTIME_1H','OVERTIME_2H','OVERTIME_3H','PATCH_ABSENCE_3H') then ${overtimeRequests.overtimeHours} else 0 end), 0)`,
      lemburDays: sql<number>`coalesce(sum(case when ${overtimeRequests.status} = 'APPROVED' and ${overtimeRequests.overtimeType} = 'LEMBUR_FULLDAY' then 1 else 0 end), 0)`,
    })
    .from(overtimeRequests)
    .where(
      and(
        inArray(overtimeRequests.employeeId, employeeIds),
        gte(overtimeRequests.requestDate, start),
        lte(overtimeRequests.requestDate, end)
      )
    )
    .groupBy(overtimeRequests.employeeId);

  const attendanceMap = new Map<string, Array<{ attendanceStatus: "HADIR" | "ALPA" | "IZIN" | "SAKIT" | "CUTI" | "OFF"; punctualityStatus: "TEPAT_WAKTU" | "TELAT" | null; attendanceDate: Date }>>();
  for (const row of attendanceRows) {
    const current = attendanceMap.get(row.employeeId) ?? [];
    current.push({
      attendanceStatus: row.attendanceStatus,
      punctualityStatus: row.punctualityStatus,
      attendanceDate: row.attendanceDate,
    });
    attendanceMap.set(row.employeeId, current);
  }

  const izinJamMap = new Map(izinJamRows.map((row) => [row.employeeId, Number(row.totalHours ?? 0)]));
  const overtimeMap = new Map(overtimeRows.map((row) => [row.employeeId, { overtimeHours: Number(row.overtimeHours ?? 0), lemburDays: Number(row.lemburDays ?? 0) }]));

  const rows = employeeRows.map((employee) => {
    const records = attendanceMap.get(employee.id) ?? [];
    const hadir = records.filter((item) => item.attendanceStatus === "HADIR").length;
    const telat = records.filter((item) => item.attendanceStatus === "HADIR" && item.punctualityStatus === "TELAT").length;
    const izinSakit = records.filter((item) => item.attendanceStatus === "IZIN" || item.attendanceStatus === "SAKIT").length;
    const cuti = records.filter((item) => item.attendanceStatus === "CUTI").length;
    const alpha = records.filter((item) => item.attendanceStatus === "ALPA").length;
    const eligibility = resolveAttendancePayrollEligibility({
      scheduledWorkDays: workingDaysInPeriod,
      records,
    });
    const totalKehadiran = hadir + alpha + cuti + izinSakit;
    const overtime = overtimeMap.get(employee.id) ?? { overtimeHours: 0, lemburDays: 0 };

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      divisionName: employee.divisionName ?? "-",
      hadir,
      telat,
      izinJamHours: izinJamMap.get(employee.id) ?? 0,
      izinSakit,
      cuti,
      alpha,
      overtimeHours: overtime.overtimeHours,
      lemburDays: overtime.lemburDays,
      fulltimeEligible: totalKehadiran >= workingDaysInPeriod && eligibility.hasAttendanceData,
    };
  });

  return {
    periodStart: toDateKey(start),
    periodEnd: toDateKey(end),
    workingDaysInPeriod,
    rows,
  };
}

const attendancePeriodOverrideSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid."),
  periodCode: z.string().regex(/^\d{4}-\d{2}$/, "Periode tidak valid.").optional(),
  hadir: z.coerce.number().int().min(0),
  telat: z.coerce.number().int().min(0),
  alpha: z.coerce.number().int().min(0),
  cuti: z.coerce.number().int().min(0),
  izinSakit: z.coerce.number().int().min(0),
  notes: z.string().trim().max(300).optional(),
});

export async function overrideAttendancePeriodTotals(input: unknown) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const parsed = attendancePeriodOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input override periode tidak valid." };
  }

  const { periodStart, periodEnd } = resolvePeriodWindowByCode(parsed.data.periodCode);
  const start = toDateOnly(periodStart);
  const end = toDateOnly(periodEnd);
  const user = await getUser();

  const [employee] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);
  if (!employee?.isActive) return { error: "Karyawan tidak aktif atau tidak ditemukan." };

  let workingDaysInPeriod = 0;
  const workingDates: Date[] = [];
  const allDates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    allDates.push(new Date(cursor));
    if (cursor.getDay() !== 0) {
      workingDaysInPeriod += 1;
      workingDates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const { hadir, telat, alpha, cuti, izinSakit } = parsed.data;
  const usedDays = hadir + alpha + cuti + izinSakit;
  if (telat > hadir) return { error: "Jumlah telat tidak boleh lebih besar dari hadir." };
  if (usedDays > workingDaysInPeriod) {
    return {
      error: `Total input kehadiran tidak boleh melebihi hari kerja periode (${workingDaysInPeriod} hari, Minggu diabaikan).`,
    };
  }

  const statuses: Array<{ attendanceStatus: "HADIR" | "ALPA" | "CUTI" | "IZIN" | "OFF"; punctualityStatus: "TEPAT_WAKTU" | "TELAT" | null }> = [];
  for (let i = 0; i < telat; i += 1) statuses.push({ attendanceStatus: "HADIR", punctualityStatus: "TELAT" });
  for (let i = 0; i < hadir - telat; i += 1) statuses.push({ attendanceStatus: "HADIR", punctualityStatus: "TEPAT_WAKTU" });
  for (let i = 0; i < alpha; i += 1) statuses.push({ attendanceStatus: "ALPA", punctualityStatus: null });
  for (let i = 0; i < cuti; i += 1) statuses.push({ attendanceStatus: "CUTI", punctualityStatus: null });
  for (let i = 0; i < izinSakit; i += 1) statuses.push({ attendanceStatus: "IZIN", punctualityStatus: null });
  await db.transaction(async (tx) => {
    await tx
      .delete(employeeAttendanceRecords)
      .where(
        and(
          eq(employeeAttendanceRecords.employeeId, parsed.data.employeeId),
          gte(employeeAttendanceRecords.attendanceDate, start),
          lte(employeeAttendanceRecords.attendanceDate, end)
        )
      );

    const workingMap = new Map<string, { attendanceStatus: "HADIR" | "ALPA" | "CUTI" | "IZIN" | "OFF"; punctualityStatus: "TEPAT_WAKTU" | "TELAT" | null }>();
    workingDates.forEach((date, index) => {
      workingMap.set(toDateKey(date), statuses[index] ?? { attendanceStatus: "OFF", punctualityStatus: null });
    });

    await tx.insert(employeeAttendanceRecords).values(
      allDates.map((date) => {
        const key = toDateKey(date);
        const isSunday = date.getDay() === 0;
        const state = isSunday ? { attendanceStatus: "OFF" as const, punctualityStatus: null } : (workingMap.get(key) ?? { attendanceStatus: "OFF" as const, punctualityStatus: null });
        return {
          employeeId: parsed.data.employeeId,
          attendanceDate: date,
          attendanceStatus: state.attendanceStatus,
          checkInTime: null,
          checkOutTime: null,
          punctualityStatus: state.punctualityStatus,
          source: "MANUAL" as const,
          recordedByUserId: user?.id ?? null,
          notes: parsed.data.notes || "Override total periode oleh HRD/Admin",
          updatedAt: new Date(),
        };
      })
    );
  });

  revalidatePath("/tickets");
  revalidatePath("/absensi");
  revalidatePath("/payroll");
  return { success: true };
}

export async function upsertAttendanceRecord(input: unknown) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const parsed = attendanceRecordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input absensi tidak valid." };
  }

  const user = await getUser();
  const [employee] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, parsed.data.employeeId))
    .limit(1);

  if (!employee?.isActive) {
    return { error: "Karyawan tidak aktif atau tidak ditemukan." };
  }

  const punctualityStatus = parsed.data.attendanceStatus === "HADIR"
    ? parsed.data.punctualityStatus
    : null;
  const payload = {
    employeeId: parsed.data.employeeId,
    attendanceDate: parsed.data.attendanceDate,
    attendanceStatus: parsed.data.attendanceStatus,
    checkInTime: parsed.data.checkInTime ?? null,
    checkOutTime: parsed.data.checkOutTime ?? null,
    punctualityStatus,
    source: "MANUAL" as const,
    recordedByUserId: user?.id ?? null,
    notes: parsed.data.notes ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: employeeAttendanceRecords.id })
    .from(employeeAttendanceRecords)
    .where(
      and(
        eq(employeeAttendanceRecords.employeeId, parsed.data.employeeId),
        eq(employeeAttendanceRecords.attendanceDate, parsed.data.attendanceDate)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(employeeAttendanceRecords)
      .set(payload)
      .where(eq(employeeAttendanceRecords.id, existing.id));
  } else {
    await db.insert(employeeAttendanceRecords).values(payload);
  }

  revalidatePath("/absensi");
  revalidatePath("/payroll");
  revalidatePath("/tickets");
  return { success: true };
}

export async function submitAttendanceFallbackRequest(input: unknown) {
  const authError = await checkRole(ATTENDANCE_SELF_SERVICE_ROLES);
  if (authError) return authError;

  const parsed = attendanceFallbackRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input fallback absensi tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) {
    return { error: "Akun Anda belum terhubung ke data karyawan." };
  }

  const [employee] = await db
    .select({
      id: employees.id,
      isActive: employees.isActive,
      branchLat: branches.latitude,
      branchLon: branches.longitude,
      radiusMeters: branches.maxAttendanceRadiusMeters,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(eq(employees.id, roleRow.employeeId))
    .limit(1);

  if (!employee?.isActive) {
    return { error: "Data karyawan tidak aktif atau tidak ditemukan." };
  }

  const branchLat = employee.branchLat != null ? Number(employee.branchLat) : null;
  const branchLon = employee.branchLon != null ? Number(employee.branchLon) : null;
  const radiusMeters = employee.radiusMeters ?? 150;
  let distanceMeters: number | null = null;
  let geofenceMatched = false;

  if (branchLat != null && branchLon != null) {
    distanceMeters = haversineMeters(branchLat, branchLon, parsed.data.latitude, parsed.data.longitude);
    geofenceMatched = distanceMeters <= radiusMeters;
  }

  const [existing] = await db
    .select({ id: attendanceFallbackRequests.id, status: attendanceFallbackRequests.status })
    .from(attendanceFallbackRequests)
    .where(
      and(
        eq(attendanceFallbackRequests.employeeId, roleRow.employeeId),
        eq(attendanceFallbackRequests.attendanceDate, parsed.data.attendanceDate)
      )
    )
    .limit(1);

  const payload = {
    employeeId: roleRow.employeeId,
    attendanceDate: parsed.data.attendanceDate,
    photoUrl: parsed.data.photoUrl,
    latitude: String(parsed.data.latitude),
    longitude: String(parsed.data.longitude),
    branchLatitudeSnapshot: branchLat != null ? String(branchLat) : null,
    branchLongitudeSnapshot: branchLon != null ? String(branchLon) : null,
    radiusMetersSnapshot: radiusMeters,
    distanceMeters,
    geofenceMatched,
    fingerprintFailureReason: parsed.data.fingerprintFailureReason,
    developerModeDisabledConfirmed: parsed.data.developerModeDisabledConfirmed,
    status: "PENDING" as const,
    createdByUserId: user?.id ?? roleRow.userId,
    updatedAt: new Date(),
  };

  if (existing && existing.status === "APPROVED") {
    return { error: "Request fallback untuk tanggal ini sudah disetujui." };
  }

  if (existing) {
    await db
      .update(attendanceFallbackRequests)
      .set(payload)
      .where(eq(attendanceFallbackRequests.id, existing.id));
  } else {
    await db.insert(attendanceFallbackRequests).values(payload);
  }

  revalidatePath("/absensi");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function approveAttendanceFallbackRequest(input: unknown) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const parsed = attendanceFallbackDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input approval fallback tidak valid." };
  }

  const user = await getUser();
  const [request] = await db
    .select()
    .from(attendanceFallbackRequests)
    .where(eq(attendanceFallbackRequests.id, parsed.data.requestId))
    .limit(1);

  if (!request) return { error: "Request fallback tidak ditemukan." };
  if (request.status === "APPROVED") return { error: "Request sudah disetujui." };

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceFallbackRequests)
      .set({
        status: "APPROVED",
        reviewedByUserId: user?.id ?? null,
        reviewedAt: new Date(),
        reviewNotes: parsed.data.reviewNotes ?? request.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(attendanceFallbackRequests.id, request.id));

    const [existingAttendance] = await tx
      .select({ id: employeeAttendanceRecords.id })
      .from(employeeAttendanceRecords)
      .where(
        and(
          eq(employeeAttendanceRecords.employeeId, request.employeeId),
          eq(employeeAttendanceRecords.attendanceDate, request.attendanceDate)
        )
      )
      .limit(1);

    const attendancePayload = {
      employeeId: request.employeeId,
      attendanceDate: request.attendanceDate,
      attendanceStatus: "HADIR" as const,
      punctualityStatus: "TEPAT_WAKTU" as const,
      source: "MANUAL" as const,
      recordedByUserId: user?.id ?? null,
      notes: `Approved fallback fingerprint. ${parsed.data.reviewNotes ?? ""}`.trim(),
      updatedAt: new Date(),
    };

    if (existingAttendance) {
      await tx
        .update(employeeAttendanceRecords)
        .set(attendancePayload)
        .where(eq(employeeAttendanceRecords.id, existingAttendance.id));
    } else {
      await tx.insert(employeeAttendanceRecords).values(attendancePayload);
    }
  });

  revalidatePath("/absensi");
  revalidatePath("/payroll");
  return { success: true };
}

export async function rejectAttendanceFallbackRequest(input: unknown) {
  const authError = await checkRole(ATTENDANCE_MANAGE_ROLES);
  if (authError) return authError;

  const parsed = attendanceFallbackDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input reject fallback tidak valid." };
  }

  const user = await getUser();
  const [request] = await db
    .select()
    .from(attendanceFallbackRequests)
    .where(eq(attendanceFallbackRequests.id, parsed.data.requestId))
    .limit(1);

  if (!request) return { error: "Request fallback tidak ditemukan." };
  if (request.status === "REJECTED") return { error: "Request sudah ditolak." };

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceFallbackRequests)
      .set({
        status: "REJECTED",
        reviewedByUserId: user?.id ?? null,
        reviewedAt: new Date(),
        reviewNotes: parsed.data.reviewNotes ?? request.reviewNotes,
        updatedAt: new Date(),
      })
      .where(eq(attendanceFallbackRequests.id, request.id));

    const [existingAttendance] = await tx
      .select({ id: employeeAttendanceRecords.id })
      .from(employeeAttendanceRecords)
      .where(
        and(
          eq(employeeAttendanceRecords.employeeId, request.employeeId),
          eq(employeeAttendanceRecords.attendanceDate, request.attendanceDate)
        )
      )
      .limit(1);

    const attendancePayload = {
      employeeId: request.employeeId,
      attendanceDate: request.attendanceDate,
      attendanceStatus: "ALPA" as const,
      punctualityStatus: null,
      source: "MANUAL" as const,
      recordedByUserId: user?.id ?? null,
      notes: `Rejected fallback fingerprint. ${parsed.data.reviewNotes ?? ""}`.trim(),
      updatedAt: new Date(),
    };

    if (existingAttendance) {
      await tx
        .update(employeeAttendanceRecords)
        .set(attendancePayload)
        .where(eq(employeeAttendanceRecords.id, existingAttendance.id));
    } else {
      await tx.insert(employeeAttendanceRecords).values(attendancePayload);
    }
  });

  revalidatePath("/absensi");
  revalidatePath("/payroll");
  return { success: true };
}

export async function getMyAttendanceFallbackRequests() {
  const authError = await checkRole(ATTENDANCE_SELF_SERVICE_ROLES);
  if (authError) return [];
  const roleRow = await getCurrentUserRoleRow();
  if (!roleRow.employeeId) return [];

  return db
    .select({
      id: attendanceFallbackRequests.id,
      attendanceDate: attendanceFallbackRequests.attendanceDate,
      photoUrl: attendanceFallbackRequests.photoUrl,
      distanceMeters: attendanceFallbackRequests.distanceMeters,
      radiusMetersSnapshot: attendanceFallbackRequests.radiusMetersSnapshot,
      geofenceMatched: attendanceFallbackRequests.geofenceMatched,
      fingerprintFailureReason: attendanceFallbackRequests.fingerprintFailureReason,
      status: attendanceFallbackRequests.status,
      reviewNotes: attendanceFallbackRequests.reviewNotes,
      createdAt: attendanceFallbackRequests.createdAt,
    })
    .from(attendanceFallbackRequests)
    .where(eq(attendanceFallbackRequests.employeeId, roleRow.employeeId))
    .orderBy(desc(attendanceFallbackRequests.createdAt));
}
