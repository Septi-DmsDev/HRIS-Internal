"use server";

import { db } from "@/lib/db";
import {
  employeeDivisionHistories,
  employeeCompetencies,
  employeeEducationHistories,
  employeeGradeHistories,
  employeeHobbies,
  employees,
  employeePositionHistories,
  employeeScheduleAssignments,
  employeeStatusHistories,
  employeeSupervisorHistories,
  workSchedules,
} from "@/lib/db/schema/employee";
import { attendanceTickets } from "@/lib/db/schema/hr";
import { branches, divisions, grades, positions } from "@/lib/db/schema/master";
import { upsertEmployeeLogin } from "@/server/actions/users";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkRole,
  getCurrentUserRole,
  getCurrentUserRoleRow,
  getUser,
  requireAuth,
} from "@/lib/auth/session";
import { userRoles } from "@/lib/db/schema/auth";
import { payrollEmployeeSnapshots, payrollResults, recurringPayrollAdjustments } from "@/lib/db/schema/payroll";
import {
  isKpiEmployeeGroup,
  isPointBasedEmployeeGroup,
  resolveEmployeeGroupFromTrainingDate,
  type EmployeeGroup,
} from "@/lib/employee-groups";
import {
  employeeDivisionHistoryDeleteSchema,
  employeeGradeHistoryDeleteSchema,
  employeeOrganizationBulkUpdateSchema,
  employeePositionHistoryDeleteSchema,
  employeeSchema,
  type EmployeeInput,
  type EmployeeOrganizationBulkUpdateInput,
} from "@/lib/validations/employee";
import { aliasedTable, and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import type { UserRole } from "@/types";
import { revokeEmployeeSystemAccess } from "@/server/services/employee-access-service";

const EMPLOYEE_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "KABAG", "SPV", "FINANCE"];
const DIV_SCOPED_ROLES: UserRole[] = ["SPV", "KABAG"];
const DEFAULT_EMPLOYEE_LOGIN_PASSWORD = "12345678";

type EmployeeDetailRow = {
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
  bpjsKetenagakerjaanNumber: string | null;
  bpjsKetenagakerjaanActive: boolean;
  bpjsKesehatanNumber: string | null;
  bpjsKesehatanActive: boolean;
  address: string | null;
  startDate: Date;
  branchId: string;
  branchName: string | null;
  divisionId: string;
  divisionName: string | null;
  positionId: string;
  positionName: string | null;
  jobdesk: string | null;
  gradeId: string;
  gradeName: string | null;
  employeeGroup: EmployeeGroup;
  employmentStatus:
    | "TRAINING"
    | "REGULER"
    | "DIALIHKAN_TRAINING"
    | "TIDAK_LOLOS"
    | "NONAKTIF"
    | "RESIGN";
  payrollStatus: "TRAINING" | "REGULER" | "FINAL_PAYROLL" | "NONAKTIF";
  supervisorEmployeeId: string | null;
  supervisorName: string | null;
  trainingGraduationDate: Date | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EmployeeListRow = {
  id: string;
  employeeCode: string;
  nik: string | null;
  fullName: string;
  nickname: string | null;
  phoneNumber: string | null;
  bpjsKetenagakerjaanNumber: string | null;
  bpjsKetenagakerjaanActive: boolean;
  bpjsKesehatanNumber: string | null;
  bpjsKesehatanActive: boolean;
  startDate: Date;
  branchId: string;
  branchName: string | null;
  divisionId: string;
  divisionName: string | null;
  positionId: string;
  positionName: string | null;
  gradeId: string;
  gradeName: string | null;
  employeeGroup: EmployeeGroup;
  employmentStatus:
    | "TRAINING"
    | "REGULER"
    | "DIALIHKAN_TRAINING"
    | "TIDAK_LOLOS"
    | "NONAKTIF"
    | "RESIGN";
  payrollStatus: "TRAINING" | "REGULER" | "FINAL_PAYROLL" | "NONAKTIF";
  supervisorEmployeeId: string | null;
  supervisorName: string | null;
  trainingGraduationDate: Date | null;
  isActive: boolean;
};

function ensureEmployeeReadRole(role: UserRole) {
  if (!EMPLOYEE_READ_ROLES.includes(role)) {
    redirect("/dashboard");
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
}

function oneDayBefore(date: Date) {
  const previousDay = startOfDay(date);
  previousDay.setDate(previousDay.getDate() - 1);
  return previousDay;
}

const BRANCH_EMPLOYEE_CODE_PREFIX: Record<string, string> = {
  TEKNOS: "TKN",
  WPI: "WPI",
  MAHARATU: "MHR",
};

function resolveEmployeeCodePrefix(branchName: string | null | undefined) {
  const normalized = branchName?.trim().toUpperCase();
  if (!normalized) return "EMP";
  return BRANCH_EMPLOYEE_CODE_PREFIX[normalized] ?? (normalized.replace(/[^A-Z]/g, "").slice(0, 3) || "EMP");
}

async function getNextGeneratedEmployeeCode(branchId: string) {
  const [branch] = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);

  const prefix = resolveEmployeeCodePrefix(branch?.name);
  const rows = await db
    .select({ employeeCode: employees.employeeCode })
    .from(employees)
    .where(eq(employees.branchId, branchId));

  let maxSequence = 0;
  for (const row of rows) {
    const value = row.employeeCode?.trim() ?? "";
    if (!value.startsWith(`${prefix}-`)) continue;
    const sequence = Number.parseInt(value.slice(prefix.length + 1), 10);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return `${prefix}-${String(maxSequence + 1).padStart(4, "0")}`;
}

type EmployeePersistInput = Omit<EmployeeInput, "supervisorEmployeeId"> & {
  supervisorEmployeeId?: string | null;
};

function resolvePersistedEmployeeGroup(input: EmployeePersistInput): EmployeeGroup {
  if (!isPointBasedEmployeeGroup(input.employeeGroup)) {
    return input.employeeGroup;
  }

  return resolveEmployeeGroupFromTrainingDate(input.trainingGraduationDate);
}

function toEmployeeRecord(input: EmployeePersistInput) {
  return {
    employeeCode: input.employeeCode,
    nik: input.nik,
    fullName: input.fullName,
    nickname: input.nickname,
    photoUrl: input.photoUrl,
    birthPlace: input.birthPlace,
    birthDate: input.birthDate,
    gender: input.gender,
    religion: input.religion,
    maritalStatus: input.maritalStatus,
    phoneNumber: input.phoneNumber,
    bpjsKetenagakerjaanNumber: input.bpjsKetenagakerjaanNumber,
    bpjsKetenagakerjaanActive: Boolean(input.bpjsKetenagakerjaanActive && input.bpjsKetenagakerjaanNumber),
    bpjsKesehatanNumber: input.bpjsKesehatanNumber,
    bpjsKesehatanActive: Boolean(input.bpjsKesehatanActive && input.bpjsKesehatanNumber),
    address: input.address,
    startDate: input.startDate,
    branchId: input.branchId,
    divisionId: input.divisionId,
    positionId: input.positionId,
    jobdesk: input.jobdesk,
    gradeId: input.gradeId,
    employeeGroup: resolvePersistedEmployeeGroup(input),
    employmentStatus: input.employmentStatus,
    payrollStatus: input.payrollStatus,
    supervisorEmployeeId: input.supervisorEmployeeId ?? undefined,
    trainingGraduationDate: input.trainingGraduationDate,
    isActive: input.isActive,
    notes: input.notes,
  };
}

function normalizeImportHeader(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ").replace(/\./g, "").replace(/_/g, " ");
}

function normalizeImportEmail(username: string): string {
  const value = username.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  return `${value.replace(/\s+/g, ".")}@hris.internal`;
}

function matchBranchId(branchRows: Array<{ id: string; name: string }>, rawBranchName: string) {
  const normalized = normalizeImportHeader(rawBranchName);
  const exact = branchRows.find((branch) => normalizeImportHeader(branch.name) === normalized);
  if (exact) return exact.id;

  const fuzzy = branchRows.find((branch) => {
    const normalizedBranch = normalizeImportHeader(branch.name);
    return normalizedBranch.includes(normalized) || normalized.includes(normalizedBranch);
  });
  if (fuzzy) return fuzzy.id;

  return branchRows.length === 1 ? branchRows[0]?.id ?? null : null;
}

function parseImportDate(value: unknown): Date | undefined {
  if (value instanceof Date) return toDateOnlyUtc(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return toDateOnlyUtc(new Date(parsed.y, parsed.m - 1, parsed.d));
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return toDateOnlyUtc(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const slashMatch = normalized.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return toDateOnlyUtc(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return toDateOnlyUtc(parsed);
}


function parseImportGender(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return undefined;
  if (["L", "LAKI-LAKI", "LAKI LAKI", "PRIA", "MALE"].includes(normalized)) return "Laki-laki";
  if (["P", "PEREMPUAN", "WANITA", "FEMALE"].includes(normalized)) return "Perempuan";
  return String(value).trim() || undefined;
}

function unwrapDbError(error: unknown) {
  let current = error as {
    code?: string;
    message?: string;
    detail?: string;
    constraint?: string;
    cause?: unknown;
  };

  for (let depth = 0; depth < 4 && current?.cause; depth += 1) {
    current = current.cause as typeof current;
  }

  return {
    code: current?.code,
    message: current?.message,
    detail: current?.detail,
    constraint: current?.constraint,
  };
}

async function persistEmployeeRecord(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: EmployeePersistInput
) {
  const effectiveDate = input.effectiveDate ?? input.startDate;
  const [employee] = await tx
    .insert(employees)
    .values(toEmployeeRecord(input))
    .returning({ id: employees.id });

  await tx.insert(employeeDivisionHistories).values({
    employeeId: employee.id,
    previousDivisionId: null,
    newDivisionId: input.divisionId,
    effectiveDate,
    notes: "Data awal karyawan",
  });

  await tx.insert(employeePositionHistories).values({
    employeeId: employee.id,
    previousPositionId: null,
    newPositionId: input.positionId,
    effectiveDate,
    notes: "Data awal karyawan",
  });

  await tx.insert(employeeGradeHistories).values({
    employeeId: employee.id,
    previousGradeId: null,
    newGradeId: input.gradeId,
    effectiveDate,
    notes: "Data awal karyawan",
  });

  await tx.insert(employeeSupervisorHistories).values({
    employeeId: employee.id,
    previousSupervisorEmployeeId: null,
    newSupervisorEmployeeId: input.supervisorEmployeeId ?? null,
    effectiveDate,
    notes: "Data awal karyawan",
  });

  await tx.insert(employeeStatusHistories).values({
    employeeId: employee.id,
    previousEmploymentStatus: null,
    newEmploymentStatus: input.employmentStatus,
    previousPayrollStatus: null,
    newPayrollStatus: input.payrollStatus,
    effectiveDate,
    notes: "Status awal karyawan",
  });

  if (input.scheduleId) {
    await tx.insert(employeeScheduleAssignments).values({
      employeeId: employee.id,
      scheduleId: input.scheduleId,
      effectiveStartDate: effectiveDate,
      notes: "Jadwal awal karyawan",
    });
  }

  return employee.id;
}

export async function getEmployees() {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  ensureEmployeeReadRole(role);

  const supervisor = aliasedTable(employees, "supervisor");
  const baseQuery = db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      nik: employees.nik,
      fullName: employees.fullName,
      nickname: employees.nickname,
      phoneNumber: employees.phoneNumber,
      bpjsKetenagakerjaanNumber: employees.bpjsKetenagakerjaanNumber,
      bpjsKetenagakerjaanActive: employees.bpjsKetenagakerjaanActive,
      bpjsKesehatanNumber: employees.bpjsKesehatanNumber,
      bpjsKesehatanActive: employees.bpjsKesehatanActive,
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
      supervisorEmployeeId: employees.supervisorEmployeeId,
      supervisorName: supervisor.fullName,
      trainingGraduationDate: employees.trainingGraduationDate,
      isActive: employees.isActive,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(grades, eq(employees.gradeId, grades.id))
    .leftJoin(supervisor, eq(employees.supervisorEmployeeId, supervisor.id));

  if (DIV_SCOPED_ROLES.includes(role)) {
    if (roleRow.divisionIds.length === 0) return [];
    const rows = (await baseQuery
      .where(inArray(employees.divisionId, roleRow.divisionIds))
      .orderBy(asc(employees.startDate), asc(employees.fullName))) as EmployeeListRow[];
    return rows.map((row) => ({
      ...row,
      employeeGroup: isPointBasedEmployeeGroup(row.employeeGroup)
        ? resolveEmployeeGroupFromTrainingDate(row.trainingGraduationDate)
        : row.employeeGroup,
    }));
  }

  const rows = (await baseQuery.orderBy(asc(employees.startDate), asc(employees.fullName))) as EmployeeListRow[];
  return rows.map((row) => ({
    ...row,
    employeeGroup: isPointBasedEmployeeGroup(row.employeeGroup)
      ? resolveEmployeeGroupFromTrainingDate(row.trainingGraduationDate)
      : row.employeeGroup,
  }));
}

export async function getEmployeeFormOptions() {
  await requireAuth();
  const role = await getCurrentUserRole();
  ensureEmployeeReadRole(role);

  const [branchRows, divisionRows, positionRows, gradeRows, scheduleRows, supervisorRows] =
    await Promise.all([
      db
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(eq(branches.isActive, true))
        .orderBy(asc(branches.name)),
      db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
        .where(eq(divisions.isActive, true))
        .orderBy(asc(divisions.name)),
      db
        .select({
          id: positions.id,
          name: positions.name,
          employeeGroup: positions.employeeGroup,
        })
        .from(positions)
        .where(eq(positions.isActive, true))
        .orderBy(asc(positions.name)),
      db
        .select({ id: grades.id, name: grades.name, code: grades.code })
        .from(grades)
        .where(eq(grades.isActive, true))
        .orderBy(asc(grades.name)),
      db
        .select({ id: workSchedules.id, name: workSchedules.name, code: workSchedules.code })
        .from(workSchedules)
        .where(eq(workSchedules.isActive, true))
        .orderBy(asc(workSchedules.name)),
      db
        .select({ id: employees.id, fullName: employees.fullName })
        .from(employees)
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.fullName)),
    ]);

  return {
    branches: branchRows,
    divisions: divisionRows,
    positions: positionRows,
    grades: gradeRows,
    schedules: scheduleRows,
    supervisors: supervisorRows,
    canManage: role === "HRD" || role === "SUPER_ADMIN",
    isSuperAdmin: role === "SUPER_ADMIN",
  };
}

export async function getEmployeesForExport() {
  await requireAuth();
  const role = await getCurrentUserRole();
  if (role !== "HRD" && role !== "SUPER_ADMIN") {
    return { error: "Akses ditolak. Hanya HRD dan Super Admin yang dapat export data karyawan." } as const;
  }

  const rows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      branchName: branches.name,
      divisionName: divisions.name,
      fullName: employees.fullName,
      birthPlace: employees.birthPlace,
      birthDate: employees.birthDate,
      gender: employees.gender,
      religion: employees.religion,
      maritalStatus: employees.maritalStatus,
      address: employees.address,
      phoneNumber: employees.phoneNumber,
      startDate: employees.startDate,
      trainingGraduationDate: employees.trainingGraduationDate,
      userId: userRoles.userId,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(userRoles, eq(userRoles.employeeId, employees.id))
    .orderBy(asc(divisions.name), asc(employees.fullName));

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map((data?.users ?? []).map((user) => [user.id, user.email ?? ""]));

  return rows.map((row) => ({
    employeeCode: row.employeeCode ?? "-",
    cabang: row.branchName ?? "-",
    divisi: row.divisionName ?? "-",
    nama: row.fullName ?? "-",
    tempatLahir: row.birthPlace ?? "-",
    tglLahir: row.birthDate,
    jenisKelamin: row.gender ?? "-",
    agama: row.religion ?? "-",
    status: row.maritalStatus ?? "-",
    alamat: row.address ?? "-",
    noTelp: row.phoneNumber ?? "-",
    email: row.userId ? emailMap.get(row.userId) ?? "-" : "-",
    masukKerja: row.startDate,
    lolosTraining: row.trainingGraduationDate,
  }));
}

export async function getDivisionManagementOptions() {
  await requireAuth();
  const role = await getCurrentUserRole();
  if (role !== "HRD" && role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const [branchRows, divisionRows, positionRows, gradeRows] = await Promise.all([
    db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name)),
    db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(eq(divisions.isActive, true)).orderBy(asc(divisions.name)),
    db
      .select({ id: positions.id, name: positions.name, employeeGroup: positions.employeeGroup })
      .from(positions)
      .where(eq(positions.isActive, true))
      .orderBy(asc(positions.name)),
    db.select({ id: grades.id, name: grades.name, code: grades.code }).from(grades).where(eq(grades.isActive, true)).orderBy(asc(grades.name)),
  ]);

  return {
    branches: branchRows,
    divisions: divisionRows,
    positions: positionRows,
    grades: gradeRows,
  };
}

export async function getEmployeeById(id: string) {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  ensureEmployeeReadRole(role);

  const supervisor = aliasedTable(employees, "supervisor");
  const employeeDetailQuery = db
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
      bpjsKetenagakerjaanNumber: employees.bpjsKetenagakerjaanNumber,
      bpjsKetenagakerjaanActive: employees.bpjsKetenagakerjaanActive,
      bpjsKesehatanNumber: employees.bpjsKesehatanNumber,
      bpjsKesehatanActive: employees.bpjsKesehatanActive,
      address: employees.address,
      startDate: employees.startDate,
      branchId: employees.branchId,
      branchName: branches.name,
      divisionId: employees.divisionId,
      divisionName: divisions.name,
      positionId: employees.positionId,
      positionName: positions.name,
      jobdesk: employees.jobdesk,
      gradeId: employees.gradeId,
      gradeName: grades.name,
      employeeGroup: employees.employeeGroup,
      employmentStatus: employees.employmentStatus,
      payrollStatus: employees.payrollStatus,
      supervisorEmployeeId: employees.supervisorEmployeeId,
      supervisorName: supervisor.fullName,
      trainingGraduationDate: employees.trainingGraduationDate,
      isActive: employees.isActive,
      notes: employees.notes,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(positions, eq(employees.positionId, positions.id))
    .leftJoin(grades, eq(employees.gradeId, grades.id))
    .leftJoin(supervisor, eq(employees.supervisorEmployeeId, supervisor.id));

  if (DIV_SCOPED_ROLES.includes(role) && roleRow.divisionIds.length === 0) {
    return null;
  }

  const employeeRows = (await employeeDetailQuery
    .where(eq(employees.id, id))
    .orderBy(asc(employees.fullName))) as EmployeeDetailRow[];
  const employeeRow = employeeRows[0];

  if (!employeeRow) return null;
  if (DIV_SCOPED_ROLES.includes(role) && !roleRow.divisionIds.includes(employeeRow.divisionId ?? "")) {
    return null;
  }

  const previousDivision = aliasedTable(divisions, "previous_division");
  const nextDivision = aliasedTable(divisions, "new_division");
  const previousPosition = aliasedTable(positions, "previous_position");
  const nextPosition = aliasedTable(positions, "new_position");
  const previousGrade = aliasedTable(grades, "previous_grade");
  const nextGrade = aliasedTable(grades, "new_grade");
  const previousSupervisor = aliasedTable(employees, "previous_supervisor");
  const nextSupervisor = aliasedTable(employees, "new_supervisor");

  const [currentScheduleAssignment, divisionHistoryRows, positionHistoryRows, gradeHistoryRows, supervisorHistoryRows, statusHistoryRows, resignHistoryRows, hobbyRows, educationRows, competencyRows] =
    await Promise.all([
      db
        .select({
          id: employeeScheduleAssignments.id,
          scheduleId: employeeScheduleAssignments.scheduleId,
          scheduleName: workSchedules.name,
          scheduleCode: workSchedules.code,
          effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
          effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
        })
        .from(employeeScheduleAssignments)
        .leftJoin(workSchedules, eq(employeeScheduleAssignments.scheduleId, workSchedules.id))
        .where(eq(employeeScheduleAssignments.employeeId, id))
        .orderBy(desc(employeeScheduleAssignments.effectiveStartDate)),
      db
        .select({
          id: employeeDivisionHistories.id,
          effectiveDate: employeeDivisionHistories.effectiveDate,
          createdAt: employeeDivisionHistories.createdAt,
          notes: employeeDivisionHistories.notes,
          previousDivisionName: previousDivision.name,
          newDivisionName: nextDivision.name,
        })
        .from(employeeDivisionHistories)
        .leftJoin(previousDivision, eq(employeeDivisionHistories.previousDivisionId, previousDivision.id))
        .leftJoin(nextDivision, eq(employeeDivisionHistories.newDivisionId, nextDivision.id))
        .where(eq(employeeDivisionHistories.employeeId, id))
        .orderBy(desc(employeeDivisionHistories.createdAt), desc(employeeDivisionHistories.effectiveDate)),
      db
        .select({
          id: employeePositionHistories.id,
          effectiveDate: employeePositionHistories.effectiveDate,
          createdAt: employeePositionHistories.createdAt,
          notes: employeePositionHistories.notes,
          previousPositionName: previousPosition.name,
          newPositionName: nextPosition.name,
        })
        .from(employeePositionHistories)
        .leftJoin(previousPosition, eq(employeePositionHistories.previousPositionId, previousPosition.id))
        .leftJoin(nextPosition, eq(employeePositionHistories.newPositionId, nextPosition.id))
        .where(eq(employeePositionHistories.employeeId, id))
        .orderBy(desc(employeePositionHistories.createdAt), desc(employeePositionHistories.effectiveDate)),
      db
        .select({
          id: employeeGradeHistories.id,
          effectiveDate: employeeGradeHistories.effectiveDate,
          createdAt: employeeGradeHistories.createdAt,
          notes: employeeGradeHistories.notes,
          previousGradeName: previousGrade.name,
          newGradeName: nextGrade.name,
        })
        .from(employeeGradeHistories)
        .leftJoin(previousGrade, eq(employeeGradeHistories.previousGradeId, previousGrade.id))
        .leftJoin(nextGrade, eq(employeeGradeHistories.newGradeId, nextGrade.id))
        .where(eq(employeeGradeHistories.employeeId, id))
        .orderBy(desc(employeeGradeHistories.createdAt), desc(employeeGradeHistories.effectiveDate)),
      db
        .select({
          id: employeeSupervisorHistories.id,
          effectiveDate: employeeSupervisorHistories.effectiveDate,
          createdAt: employeeSupervisorHistories.createdAt,
          notes: employeeSupervisorHistories.notes,
          previousSupervisorName: previousSupervisor.fullName,
          newSupervisorName: nextSupervisor.fullName,
        })
        .from(employeeSupervisorHistories)
        .leftJoin(
          previousSupervisor,
          eq(employeeSupervisorHistories.previousSupervisorEmployeeId, previousSupervisor.id)
        )
        .leftJoin(nextSupervisor, eq(employeeSupervisorHistories.newSupervisorEmployeeId, nextSupervisor.id))
        .where(eq(employeeSupervisorHistories.employeeId, id))
        .orderBy(desc(employeeSupervisorHistories.createdAt), desc(employeeSupervisorHistories.effectiveDate)),
      db
        .select({
          id: employeeStatusHistories.id,
          effectiveDate: employeeStatusHistories.effectiveDate,
          notes: employeeStatusHistories.notes,
          previousEmploymentStatus: employeeStatusHistories.previousEmploymentStatus,
          newEmploymentStatus: employeeStatusHistories.newEmploymentStatus,
          previousPayrollStatus: employeeStatusHistories.previousPayrollStatus,
          newPayrollStatus: employeeStatusHistories.newPayrollStatus,
        })
        .from(employeeStatusHistories)
        .where(eq(employeeStatusHistories.employeeId, id))
        .orderBy(desc(employeeStatusHistories.effectiveDate)),
      db
        .select({
          id: attendanceTickets.id,
          effectiveDate: attendanceTickets.startDate,
          status: attendanceTickets.status,
          reason: attendanceTickets.reason,
          reviewNotes: attendanceTickets.reviewNotes,
          rejectionReason: attendanceTickets.rejectionReason,
          createdAt: attendanceTickets.createdAt,
        })
        .from(attendanceTickets)
        .where(
          and(
            eq(attendanceTickets.employeeId, id),
            eq(attendanceTickets.ticketType, "RESIGN")
          )
        )
        .orderBy(desc(attendanceTickets.createdAt)),
      db
        .select({
          id: employeeHobbies.id,
          hobbyName: employeeHobbies.hobbyName,
          notes: employeeHobbies.notes,
          createdAt: employeeHobbies.createdAt,
        })
        .from(employeeHobbies)
        .where(eq(employeeHobbies.employeeId, id))
        .orderBy(desc(employeeHobbies.createdAt)),
      db
        .select({
          id: employeeEducationHistories.id,
          institutionName: employeeEducationHistories.institutionName,
          degree: employeeEducationHistories.degree,
          major: employeeEducationHistories.major,
          startYear: employeeEducationHistories.startYear,
          endYear: employeeEducationHistories.endYear,
          notes: employeeEducationHistories.notes,
          createdAt: employeeEducationHistories.createdAt,
        })
        .from(employeeEducationHistories)
        .where(eq(employeeEducationHistories.employeeId, id))
        .orderBy(desc(employeeEducationHistories.createdAt)),
      db
        .select({
          id: employeeCompetencies.id,
          competencyName: employeeCompetencies.competencyName,
          level: employeeCompetencies.level,
          issuer: employeeCompetencies.issuer,
          certifiedAt: employeeCompetencies.certifiedAt,
          attachmentUrl: employeeCompetencies.attachmentUrl,
          notes: employeeCompetencies.notes,
          createdAt: employeeCompetencies.createdAt,
        })
        .from(employeeCompetencies)
        .where(eq(employeeCompetencies.employeeId, id))
        .orderBy(desc(employeeCompetencies.createdAt)),
    ]);

  return {
    isSuperAdmin: role === "SUPER_ADMIN",
    employee: employeeRow,
    currentScheduleAssignment: currentScheduleAssignment[0] ?? null,
    scheduleHistory: currentScheduleAssignment,
    histories: {
      divisions: divisionHistoryRows,
      positions: positionHistoryRows,
      grades: gradeHistoryRows,
      supervisors: supervisorHistoryRows,
      statuses: statusHistoryRows,
      resigns: resignHistoryRows,
    },
    profileEnrichment: {
      hobbies: hobbyRows,
      educationHistories: educationRows,
      competencies: competencyRows,
    },
  };
}

export async function createEmployee(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const rawInput = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const branchId = typeof rawInput.branchId === "string" ? rawInput.branchId : "";
    const nextUid = branchId ? await getNextGeneratedEmployeeCode(branchId) : "EMP-0001";
    const parsed = employeeSchema.safeParse({
      ...rawInput,
      employeeCode: nextUid,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Input karyawan tidak valid." };
    }

    try {
      const result = await db.transaction(async (tx) => {
        return persistEmployeeRecord(tx, parsed.data);
      });

      revalidatePath("/employees");
      return { success: true, employeeId: result };
    } catch (error) {
      const { code, message, detail, constraint } = unwrapDbError(error);
      if (code === "23505") {
        // Retry when generated UID collides due to concurrent create.
        continue;
      }
      if (code === "23503") return { error: "Referensi karyawan tidak valid atau sudah tidak aktif." };
      throw new Error([message, detail, constraint].filter(Boolean).join(" | ") || "Gagal membuat data karyawan.");
    }
  }

  return { error: "Gagal generate UID unik. Coba ulangi tambah karyawan." };
}

type ImportOutcome = {
  rowNumber: number;
  name: string;
  success: boolean;
  message?: string;
};

export async function importEmployeesFromXlsx(formData: FormData) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "File xlsx tidak ditemukan." };

  let rows: unknown[][];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  } catch {
    return { error: "Gagal membaca file xlsx. Pastikan format file valid." };
  }

  if (rows.length < 2) return { error: "File tidak memiliki data." };

  const header = (rows[0] as unknown[]).map((value) => normalizeImportHeader(String(value ?? "")));
  const cabangIdx = header.findIndex((value) => value === "CABANG");
  const namaIdx = header.findIndex((value) => value === "NAMA");
  const nikIdx = header.findIndex(
    (value) => value === "NIK" || value === "ID KARYAWAN" || value === "EMPLOYEE CODE"
  );
  const usernameIdx = header.findIndex((value) => value === "USERNAME");
  const passwordIdx = header.findIndex((value) => value === "PASSWORD");
  const tempatLahirIdx = header.findIndex((value) => value === "TEMPAT LAHIR");
  const tglLahirIdx = header.findIndex((value) => value === "TGL LAHIR");
  const jenisKelaminIdx = header.findIndex((value) => value === "JENIS KELAMIN");
  const agamaIdx = header.findIndex((value) => value === "AGAMA");
  const statusIdx = header.findIndex((value) => value === "STATUS");
  const alamatIdx = header.findIndex((value) => value === "ALAMAT");
  const noTelpIdx = header.findIndex((value) => value === "NO TELP");
  const emailIdx = header.findIndex((value) => value === "EMAIL");
  const masukKerjaIdx = header.findIndex((value) => value === "MASUK KERJA");
  const lolosTrainingIdx = header.findIndex((value) => value === "LOLOS TRAINING");

  if (
    cabangIdx === -1 ||
    namaIdx === -1 ||
    nikIdx === -1 ||
    usernameIdx === -1 ||
    passwordIdx === -1 ||
    masukKerjaIdx === -1
  ) {
    return {
      error:
        "Header kolom tidak sesuai. Pastikan ada kolom: CABANG, NAMA, NIK/ID KARYAWAN, Username, Password, MASUK KERJA.",
    };
  }

  const [branchRows, divisionRows, positionRows, gradeRows, supervisorRows] = await Promise.all([
    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.isActive, true))
      .orderBy(asc(branches.name)),
    db
      .select({ id: divisions.id, branchId: divisions.branchId })
      .from(divisions)
      .where(eq(divisions.isActive, true))
      .orderBy(asc(divisions.name)),
    db
      .select({ id: positions.id, employeeGroup: positions.employeeGroup })
      .from(positions)
      .where(eq(positions.isActive, true))
      .orderBy(asc(positions.name)),
    db
      .select({ id: grades.id })
      .from(grades)
      .where(eq(grades.isActive, true))
      .orderBy(asc(grades.name)),
    db
      .select({ id: employees.id, employeeGroup: employees.employeeGroup })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.fullName)),
  ]);

  const divisionByBranchId = new Map(
    divisionRows
      .filter((division): division is { id: string; branchId: string | null } => Boolean(division.id))
      .map((division) => [division.branchId ?? "__global__", division.id] as const)
  );
  const fallbackDivisionId = divisionRows[0]?.id ?? null;
  const fallbackPosition =
    positionRows.find((position) => isPointBasedEmployeeGroup(position.employeeGroup)) ?? positionRows[0] ?? null;
  const fallbackGradeId = gradeRows[0]?.id ?? null;
  const fallbackSupervisorEmployeeId =
    supervisorRows.find((employee) => isKpiEmployeeGroup(employee.employeeGroup))?.id ?? null;
  const importEmployeeGroup = "MITRA_KERJA" as const;

  if (!fallbackDivisionId || !fallbackPosition || !fallbackGradeId) {
    return {
      error:
        "Master data belum lengkap. Pastikan ada divisi, jabatan, dan grade aktif sebelum import.",
    };
  }
  // Pre-fetch existing employees for upsert matching (fullName + birthDate)
  const existingForUpsert = await db
    .select({ id: employees.id, fullName: employees.fullName, birthDate: employees.birthDate })
    .from(employees);
  const existingByNameBirth = new Map<string, string>();
  for (const row of existingForUpsert) {
    if (row.birthDate) {
      const key = `${row.fullName.toLowerCase().trim()}|${row.birthDate.toISOString().slice(0, 10)}`;
      existingByNameBirth.set(key, row.id);
    }
  }

  const outcomes: ImportOutcome[] = [];
  let importedEmployees = 0;
  let importedLogins = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] as unknown[];
    const rowNumber = index + 1;
    const branchName = String(row[cabangIdx] ?? "").trim();
    const fullName = String(row[namaIdx] ?? "").trim();
    const employeeCode = String(row[nikIdx] ?? "").trim();
    const username = String(row[usernameIdx] ?? "").trim();
    const password = String(row[passwordIdx] ?? "").trim();
    const branchId = matchBranchId(branchRows, branchName);

    if (!branchName || !fullName || !employeeCode || !username || !password) {
      outcomes.push({ rowNumber, name: fullName || "-", success: false, message: "Kolom wajib belum lengkap." });
      continue;
    }

    if (!branchId) {
      outcomes.push({ rowNumber, name: fullName, success: false, message: `Cabang "${branchName}" tidak ditemukan.` });
      continue;
    }

    const startDate = parseImportDate(row[masukKerjaIdx]);
    if (!startDate) {
      outcomes.push({ rowNumber, name: fullName, success: false, message: "Tanggal masuk kerja tidak valid." });
      continue;
    }

    // LOLOS TRAINING di Excel adalah tanggal lulus training (bukan boolean)
    const trainingGraduationDate = lolosTrainingIdx >= 0 ? parseImportDate(row[lolosTrainingIdx]) : undefined;
    const trainingPassed = Boolean(trainingGraduationDate);
    const employmentStatus: EmployeeInput["employmentStatus"] = trainingPassed ? "REGULER" : "TRAINING";
    const payrollStatus: EmployeeInput["payrollStatus"] = trainingPassed ? "REGULER" : "TRAINING";

    const divisionId = divisionByBranchId.get(branchId) ?? fallbackDivisionId;
    const employeeInput: EmployeePersistInput = {
      employeeCode,
      nik: nikIdx >= 0 ? (String(row[nikIdx] ?? "").trim() || undefined) : undefined,
      fullName,
      nickname: undefined,
      photoUrl: undefined,
      // Data diri: dipetakan ke kolom DB yang sebenarnya
      birthPlace: tempatLahirIdx >= 0 ? (String(row[tempatLahirIdx] ?? "").trim() || undefined) : undefined,
      birthDate: tglLahirIdx >= 0 ? parseImportDate(row[tglLahirIdx]) : undefined,
      gender: jenisKelaminIdx >= 0 ? (parseImportGender(row[jenisKelaminIdx]) || undefined) : undefined,
      religion: agamaIdx >= 0 ? (String(row[agamaIdx] ?? "").trim() || undefined) : undefined,
      // STATUS di Excel adalah status pernikahan (bukan employment status)
      maritalStatus: statusIdx >= 0 ? (String(row[statusIdx] ?? "").trim() || undefined) : undefined,
      phoneNumber: noTelpIdx >= 0 ? (String(row[noTelpIdx] ?? "").trim() || undefined) : undefined,
      bpjsKetenagakerjaanNumber: undefined,
      bpjsKetenagakerjaanActive: false,
      bpjsKesehatanNumber: undefined,
      bpjsKesehatanActive: false,
      address: alamatIdx >= 0 ? (String(row[alamatIdx] ?? "").trim() || undefined) : undefined,
      startDate,
      branchId,
      divisionId,
      positionId: fallbackPosition.id,
      jobdesk: undefined,
      gradeId: fallbackGradeId,
      scheduleId: undefined,
      employeeGroup: importEmployeeGroup,
      employmentStatus,
      payrollStatus,
      supervisorEmployeeId: fallbackSupervisorEmployeeId,
      effectiveDate: startDate,
      trainingGraduationDate,
      isActive: true,
      notes: undefined,
    };
    const persistedEmployeeGroup = resolvePersistedEmployeeGroup(employeeInput);
    const loginRole: UserRole = isKpiEmployeeGroup(persistedEmployeeGroup) ? "MANAGERIAL" : "TEAMWORK";

    // Check for upsert match by fullName + birthDate
    const birthDateForMatch = tglLahirIdx >= 0 ? parseImportDate(row[tglLahirIdx]) : undefined;
    const upsertKey = birthDateForMatch
      ? `${fullName.toLowerCase().trim()}|${birthDateForMatch.toISOString().slice(0, 10)}`
      : null;
    const upsertTargetId = upsertKey ? (existingByNameBirth.get(upsertKey) ?? null) : null;

    const rawEmail = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "";
    const loginEmail = normalizeImportEmail(rawEmail || username);

    let employeeId: string;
    let isUpsert = false;

    if (upsertTargetId) {
      // UPDATE existing employee personal + branch data
      isUpsert = true;
      try {
        await db
          .update(employees)
          .set({
            employeeCode: employeeInput.employeeCode,
            fullName,
            branchId,
            birthPlace: employeeInput.birthPlace ?? null,
            birthDate: employeeInput.birthDate,
            gender: employeeInput.gender ?? null,
            religion: employeeInput.religion ?? null,
            maritalStatus: employeeInput.maritalStatus ?? null,
            phoneNumber: employeeInput.phoneNumber ?? null,
            address: employeeInput.address ?? null,
            startDate: employeeInput.startDate,
            trainingGraduationDate: employeeInput.trainingGraduationDate,
            employmentStatus: employeeInput.employmentStatus,
            payrollStatus: employeeInput.payrollStatus,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, upsertTargetId));
        employeeId = upsertTargetId;
      } catch (error) {
        const dbError = unwrapDbError(error);
        outcomes.push({ rowNumber, name: fullName, success: false, message: dbError.message || "Gagal update data karyawan." });
        continue;
      }
    } else {
      // INSERT new employee
      try {
        employeeId = await db.transaction(async (tx) => persistEmployeeRecord(tx, employeeInput));
      } catch (error) {
        const dbError = unwrapDbError(error);
        const details = [dbError.message, dbError.detail, dbError.constraint].filter(Boolean).join(" | ");
        outcomes.push({
          rowNumber,
          name: fullName,
          success: false,
          message:
            dbError.code === "23505"
              ? "ID karyawan atau data unik sudah dipakai."
              : dbError.code === "23503"
                ? "Referensi master tidak valid."
              : details || "Gagal membuat data karyawan.",
        });
        continue;
      }
    }

    importedEmployees += 1;

    // Handle auth: skip if upsert and no password provided
    if (!isUpsert || password) {
      const loginResult = await upsertEmployeeLogin({
        employeeId,
        email: loginEmail,
        password: password || undefined,
        role: loginRole,
      });
      if (loginResult && "error" in loginResult) {
        outcomes.push({
          rowNumber,
          name: fullName,
          success: false,
          message: `Data karyawan tersimpan, tetapi akun login gagal: ${loginResult.error}`,
        });
        continue;
      }
      importedLogins += 1;
    }

    outcomes.push({ rowNumber, name: fullName, success: true, message: isUpsert ? "Diperbarui (upsert)" : undefined });
  }

  if (importedEmployees === 0) {
    const firstFailure = outcomes.find((outcome) => !outcome.success);
    return {
      error: firstFailure
        ? `Tidak ada data berhasil diimpor. Baris ${firstFailure.rowNumber} (${firstFailure.name}): ${firstFailure.message}`
        : "Tidak ada data berhasil diimpor.",
      outcomes,
    };
  }

  revalidatePath("/employees");

  return {
    success: true,
    importedEmployees,
    importedLogins,
    outcomes,
  };
}

export async function updateEmployee(id: string, input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input karyawan tidak valid." };
  }

  let shouldRevokeAccess = false;

  try {
    await db.transaction(async (tx) => {
      const [existingEmployee] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
      if (!existingEmployee) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }

      const effectiveDate = parsed.data.effectiveDate ?? startOfDay(new Date());
      await tx
        .update(employees)
        .set({
          ...toEmployeeRecord(parsed.data),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, id));

      shouldRevokeAccess = parsed.data.employmentStatus === "RESIGN" || parsed.data.isActive === false;

      if (existingEmployee.divisionId !== parsed.data.divisionId) {
        await tx.insert(employeeDivisionHistories).values({
          employeeId: id,
          previousDivisionId: existingEmployee.divisionId,
          newDivisionId: parsed.data.divisionId,
          effectiveDate,
          notes: "Perubahan divisi",
        });
      }

      if (existingEmployee.positionId !== parsed.data.positionId) {
        await tx.insert(employeePositionHistories).values({
          employeeId: id,
          previousPositionId: existingEmployee.positionId,
          newPositionId: parsed.data.positionId,
          effectiveDate,
          notes: "Perubahan jabatan",
        });
      }

      if (existingEmployee.gradeId !== parsed.data.gradeId) {
        await tx.insert(employeeGradeHistories).values({
          employeeId: id,
          previousGradeId: existingEmployee.gradeId,
          newGradeId: parsed.data.gradeId,
          effectiveDate,
          notes: "Perubahan grade",
        });
      }

      if (existingEmployee.supervisorEmployeeId !== (parsed.data.supervisorEmployeeId ?? null)) {
        await tx.insert(employeeSupervisorHistories).values({
          employeeId: id,
          previousSupervisorEmployeeId: existingEmployee.supervisorEmployeeId,
          newSupervisorEmployeeId: parsed.data.supervisorEmployeeId ?? null,
          effectiveDate,
          notes: "Perubahan supervisor",
        });
      }

      if (
        existingEmployee.employmentStatus !== parsed.data.employmentStatus ||
        existingEmployee.payrollStatus !== parsed.data.payrollStatus
      ) {
        await tx.insert(employeeStatusHistories).values({
          employeeId: id,
          previousEmploymentStatus: existingEmployee.employmentStatus,
          newEmploymentStatus: parsed.data.employmentStatus,
          previousPayrollStatus: existingEmployee.payrollStatus,
          newPayrollStatus: parsed.data.payrollStatus,
          effectiveDate,
          notes: "Perubahan status karyawan",
        });
      }

      const [currentAssignment] = await tx
        .select({
          id: employeeScheduleAssignments.id,
          scheduleId: employeeScheduleAssignments.scheduleId,
          effectiveStartDate: employeeScheduleAssignments.effectiveStartDate,
          effectiveEndDate: employeeScheduleAssignments.effectiveEndDate,
        })
        .from(employeeScheduleAssignments)
        .where(eq(employeeScheduleAssignments.employeeId, id))
        .orderBy(desc(employeeScheduleAssignments.effectiveStartDate));

      const previousScheduleId = currentAssignment?.effectiveEndDate ? null : currentAssignment?.scheduleId ?? null;
      const nextScheduleId = parsed.data.scheduleId ?? null;

      if (previousScheduleId !== nextScheduleId) {
        if (currentAssignment && !currentAssignment.effectiveEndDate) {
          await tx
            .update(employeeScheduleAssignments)
            .set({ effectiveEndDate: oneDayBefore(effectiveDate) })
            .where(eq(employeeScheduleAssignments.id, currentAssignment.id));
        }

        if (nextScheduleId) {
          await tx.insert(employeeScheduleAssignments).values({
            employeeId: id,
            scheduleId: nextScheduleId,
            effectiveStartDate: effectiveDate,
            notes: "Perubahan jadwal kerja",
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return { error: "Data karyawan tidak ditemukan." };
    }

    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: "ID karyawan sudah digunakan, pakai kode lain." };
    if (code === "23503") return { error: "Referensi karyawan tidak valid atau sudah tidak aktif." };
    throw error;
  }

  if (shouldRevokeAccess) {
    await revokeEmployeeSystemAccess(id);
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  revalidatePath("/users");
  return { success: true };
}

export async function toggleEmployeeBpjs(
  id: string,
  type: "KT" | "KS",
  enabled: boolean
) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const [existing] = await db
    .select({
      id: employees.id,
      bpjsKetenagakerjaanNumber: employees.bpjsKetenagakerjaanNumber,
      bpjsKesehatanNumber: employees.bpjsKesehatanNumber,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  if (!existing) return { error: "Data karyawan tidak ditemukan." };

  if (type === "KT" && enabled && !existing.bpjsKetenagakerjaanNumber?.trim()) {
    return { error: "Isi nomor BPJS KT di form edit karyawan sebelum mengaktifkan toggle." };
  }

  if (type === "KS" && enabled && !existing.bpjsKesehatanNumber?.trim()) {
    return { error: "Isi nomor BPJS KS di form edit karyawan sebelum mengaktifkan toggle." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const actorRole = roleRow.role as UserRole;
  if (!user) return { error: "Sesi tidak valid." };

  await db
    .update(employees)
    .set(
      type === "KT"
        ? { bpjsKetenagakerjaanActive: enabled, updatedAt: new Date() }
        : { bpjsKesehatanActive: enabled, updatedAt: new Date() }
    )
    .where(eq(employees.id, id));

  if (type === "KS") {
    if (enabled) {
      const [existingRecurring] = await db
        .select({ id: recurringPayrollAdjustments.id })
        .from(recurringPayrollAdjustments)
        .where(
          and(
            eq(recurringPayrollAdjustments.employeeId, id),
            eq(recurringPayrollAdjustments.category, "BPJS")
          )
        )
        .limit(1);

      if (existingRecurring) {
        await db
          .update(recurringPayrollAdjustments)
          .set({
            adjustmentType: "DEDUCTION",
            amount: "52000",
            reason: "BPJS::BPJS KS otomatis dari toggle karyawan",
            isActive: true,
            appliedByUserId: user.id,
            appliedByRole: actorRole,
            updatedAt: new Date(),
          })
          .where(eq(recurringPayrollAdjustments.id, existingRecurring.id));
      } else {
        await db.insert(recurringPayrollAdjustments).values({
          employeeId: id,
          adjustmentType: "DEDUCTION",
          category: "BPJS",
          amount: "52000",
          reason: "BPJS::BPJS KS otomatis dari toggle karyawan",
          isActive: true,
          appliedByUserId: user.id,
          appliedByRole: actorRole,
        });
      }
    } else {
      await db
        .update(recurringPayrollAdjustments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(recurringPayrollAdjustments.employeeId, id),
            eq(recurringPayrollAdjustments.category, "BPJS"),
            eq(recurringPayrollAdjustments.isActive, true)
          )
        );
    }
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  revalidatePath("/finance");
  revalidatePath("/payroll");
  return { success: true };
}

function resolveBulkNotes(input: EmployeeOrganizationBulkUpdateInput) {
  const notes = input.notes?.trim();
  return notes && notes.length > 0 ? notes : "Mutasi massal struktur organisasi";
}

let employeeGroupEnumValuesPromise: Promise<Set<EmployeeGroup>> | null = null;
async function resolveEmployeeGroupEnumValues() {
  if (!employeeGroupEnumValuesPromise) {
    employeeGroupEnumValuesPromise = db
      .execute(
        sql<{ enumlabel: string }>`select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'employee_group'`
      )
      .then((rows) => new Set(rows.map((row) => row.enumlabel as EmployeeGroup)));
  }
  return employeeGroupEnumValuesPromise;
}

export async function bulkUpdateEmployeeOrganization(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = employeeOrganizationBulkUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input mutasi massal tidak valid." };
  }

  const payload = parsed.data;
  const effectiveDate = payload.effectiveDate ?? startOfDay(new Date());
  const notes = resolveBulkNotes(payload);
  const supportedEmployeeGroups = await resolveEmployeeGroupEnumValues();

  if (payload.employeeGroup && !supportedEmployeeGroups.has(payload.employeeGroup)) {
    return {
      error:
        `Nilai kelompok karyawan "${payload.employeeGroup}" belum tersedia di database. ` +
        "Jalankan migrasi enum employee_group terbaru (contoh: 0021_employee_group_expansion.sql).",
    };
  }

  try {
    await db.transaction(async (tx) => {
      for (const employeeId of payload.employeeIds) {
        const [existingEmployee] = await tx
          .select({
            id: employees.id,
            branchId: employees.branchId,
            divisionId: employees.divisionId,
            positionId: employees.positionId,
            gradeId: employees.gradeId,
            employeeGroup: employees.employeeGroup,
            trainingGraduationDate: employees.trainingGraduationDate,
          })
          .from(employees)
          .where(eq(employees.id, employeeId))
          .limit(1);

        if (!existingEmployee) continue;

        const nextBranchId = payload.branchId ?? existingEmployee.branchId;
        const nextDivisionId = payload.divisionId ?? existingEmployee.divisionId;
        const nextPositionId = payload.positionId ?? existingEmployee.positionId;
        const nextGradeId = payload.gradeId ?? existingEmployee.gradeId;
        const nextEmployeeGroup = payload.employeeGroup ?? existingEmployee.employeeGroup;
        const persistedEmployeeGroup = isPointBasedEmployeeGroup(nextEmployeeGroup)
          ? resolveEmployeeGroupFromTrainingDate(existingEmployee.trainingGraduationDate)
          : nextEmployeeGroup;

        await tx
          .update(employees)
          .set({
            branchId: nextBranchId,
            divisionId: nextDivisionId,
            positionId: nextPositionId,
            gradeId: nextGradeId,
            employeeGroup: persistedEmployeeGroup,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, employeeId));

        if (existingEmployee.divisionId !== nextDivisionId) {
          await tx.insert(employeeDivisionHistories).values({
            employeeId,
            previousDivisionId: existingEmployee.divisionId,
            newDivisionId: nextDivisionId,
            effectiveDate,
            notes,
          });
        }

        if (existingEmployee.positionId !== nextPositionId) {
          await tx.insert(employeePositionHistories).values({
            employeeId,
            previousPositionId: existingEmployee.positionId,
            newPositionId: nextPositionId,
            effectiveDate,
            notes,
          });
        }

        if (existingEmployee.gradeId !== nextGradeId) {
          await tx.insert(employeeGradeHistories).values({
            employeeId,
            previousGradeId: existingEmployee.gradeId,
            newGradeId: nextGradeId,
            effectiveDate,
            notes,
          });
        }
      }
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "22P02") {
      return {
        error:
          "Nilai enum tidak cocok dengan schema database (kemungkinan employee_group belum update). " +
          "Jalankan migration terbaru lalu coba lagi.",
      };
    }
    if (code === "23503") {
      return {
        error:
          "Referensi branch/division/position/grade tidak valid di database. Periksa data master atau sinkronisasi environment.",
      };
    }
    throw error;
  }

  revalidatePath("/positioning");
  revalidatePath("/employees");
  return { success: true };
}

export async function deleteEmployeePositionHistory(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = employeePositionHistoryDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input hapus histori jabatan tidak valid." };
  }

  const { employeeId, historyId } = parsed.data;

  const [target] = await db
    .select({
      id: employeePositionHistories.id,
      employeeId: employeePositionHistories.employeeId,
    })
    .from(employeePositionHistories)
    .where(eq(employeePositionHistories.id, historyId))
    .limit(1);

  if (!target || target.employeeId !== employeeId) {
    return { error: "Histori jabatan tidak ditemukan." };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employeePositionHistories)
    .where(eq(employeePositionHistories.employeeId, employeeId));

  if ((countRow?.count ?? 0) <= 1) {
    return { error: "Histori jabatan terakhir tidak boleh dihapus." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(employeePositionHistories).where(eq(employeePositionHistories.id, historyId));

    const [latestPositionHistory] = await tx
      .select({
        newPositionId: employeePositionHistories.newPositionId,
      })
      .from(employeePositionHistories)
      .where(eq(employeePositionHistories.employeeId, employeeId))
      .orderBy(desc(employeePositionHistories.createdAt), desc(employeePositionHistories.effectiveDate))
      .limit(1);

    if (latestPositionHistory) {
      await tx
        .update(employees)
        .set({
          positionId: latestPositionHistory.newPositionId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));
    }
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteEmployeeDivisionHistory(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = employeeDivisionHistoryDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input hapus histori divisi tidak valid." };
  }

  const { employeeId, historyId } = parsed.data;

  const [target] = await db
    .select({
      id: employeeDivisionHistories.id,
      employeeId: employeeDivisionHistories.employeeId,
    })
    .from(employeeDivisionHistories)
    .where(eq(employeeDivisionHistories.id, historyId))
    .limit(1);

  if (!target || target.employeeId !== employeeId) {
    return { error: "Histori divisi tidak ditemukan." };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employeeDivisionHistories)
    .where(eq(employeeDivisionHistories.employeeId, employeeId));

  if ((countRow?.count ?? 0) <= 1) {
    return { error: "Histori divisi terakhir tidak boleh dihapus." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(employeeDivisionHistories).where(eq(employeeDivisionHistories.id, historyId));

    const [latestDivisionHistory] = await tx
      .select({
        newDivisionId: employeeDivisionHistories.newDivisionId,
      })
      .from(employeeDivisionHistories)
      .where(eq(employeeDivisionHistories.employeeId, employeeId))
      .orderBy(desc(employeeDivisionHistories.createdAt), desc(employeeDivisionHistories.effectiveDate))
      .limit(1);

    if (latestDivisionHistory) {
      await tx
        .update(employees)
        .set({
          divisionId: latestDivisionHistory.newDivisionId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));
    }
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteEmployeeGradeHistory(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = employeeGradeHistoryDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input hapus histori grade tidak valid." };
  }

  const { employeeId, historyId } = parsed.data;

  const [target] = await db
    .select({
      id: employeeGradeHistories.id,
      employeeId: employeeGradeHistories.employeeId,
    })
    .from(employeeGradeHistories)
    .where(eq(employeeGradeHistories.id, historyId))
    .limit(1);

  if (!target || target.employeeId !== employeeId) {
    return { error: "Histori grade tidak ditemukan." };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employeeGradeHistories)
    .where(eq(employeeGradeHistories.employeeId, employeeId));

  if ((countRow?.count ?? 0) <= 1) {
    return { error: "Histori grade terakhir tidak boleh dihapus." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(employeeGradeHistories).where(eq(employeeGradeHistories.id, historyId));

    const [latestGradeHistory] = await tx
      .select({
        newGradeId: employeeGradeHistories.newGradeId,
      })
      .from(employeeGradeHistories)
      .where(eq(employeeGradeHistories.employeeId, employeeId))
      .orderBy(desc(employeeGradeHistories.createdAt), desc(employeeGradeHistories.effectiveDate))
      .limit(1);

    if (latestGradeHistory) {
      await tx
        .update(employees)
        .set({
          gradeId: latestGradeHistory.newGradeId,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));
    }
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  revalidatePath("/payroll");
  return { success: true };
}

export async function deleteEmployee(id: string) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const [existing] = await db
    .select({
      id: employees.id,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);

  if (!existing) {
    return { error: "Data karyawan tidak ditemukan." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({
        isActive: false,
        employmentStatus: "NONAKTIF",
        payrollStatus: "NONAKTIF",
      })
      .where(eq(employees.id, id));
  });

  await revokeEmployeeSystemAccess(id);

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  revalidatePath("/users");
  return { success: true };
}

export async function purgeAllEmployees() {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  // Get user IDs for non-admin roles so we can delete their Supabase Auth accounts
  const rolesToDelete: UserRole[] = ["TEAMWORK", "MANAGERIAL", "SPV", "KABAG", "PAYROLL_VIEWER"];
  const usersToDelete = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.role, rolesToDelete));

  // payroll_results and payroll_employee_snapshots have RESTRICT FK on employees —
  // must delete them before deleting employees
  await db.delete(payrollResults);
  await db.delete(payrollEmployeeSnapshots);

  // Delete all employees (CASCADE handles all other related tables)
  await db.delete(employees);

  // Delete Supabase Auth accounts for non-admin users
  const admin = createAdminClient();
  for (const { userId } of usersToDelete) {
    await admin.auth.admin.deleteUser(userId);
  }

  revalidatePath("/employees");
  return { success: true, deletedAuthAccounts: usersToDelete.length };
}

export async function createMissingEmployeeAccounts(defaultPassword: string) {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  if (!defaultPassword || defaultPassword.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }

  // Find active employees who don't have a user_roles entry (no auth account)
  const employeesWithoutAccount = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      phoneNumber: employees.phoneNumber,
      employeeGroup: employees.employeeGroup,
    })
    .from(employees)
    .leftJoin(userRoles, eq(employees.id, userRoles.employeeId))
    .where(and(eq(employees.isActive, true), isNull(userRoles.employeeId)));

  if (employeesWithoutAccount.length === 0) {
    return { success: true, createdCount: 0, message: "Semua karyawan aktif sudah memiliki akun login." };
  }

  const admin = createAdminClient();
  let createdCount = 0;
  const errors: string[] = [];

  for (const emp of employeesWithoutAccount) {
    const username = emp.fullName.trim().toLowerCase().replace(/\s+/g, ".");
    const email = `${username}@hris.internal`;
    const role: UserRole = isKpiEmployeeGroup(emp.employeeGroup) ? "MANAGERIAL" : "TEAMWORK";

    const result = await upsertEmployeeLogin({
      employeeId: emp.id,
      email,
      password: defaultPassword,
      role,
    });

    if (result && "error" in result) {
      errors.push(`${emp.fullName}: ${result.error}`);
    } else {
      createdCount++;
    }
  }

  revalidatePath("/employees");
  return {
    success: true,
    createdCount,
    totalMissing: employeesWithoutAccount.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function revokeResignedEmployeesAccess() {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const targets = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        inArray(employees.employmentStatus, ["RESIGN", "NONAKTIF"]),
        eq(employees.isActive, false)
      )
    );

  let revokedCount = 0;
  for (const target of targets) {
    const result = await revokeEmployeeSystemAccess(target.id);
    if (result.roleRevoked) revokedCount += 1;
  }

  revalidatePath("/users");
  revalidatePath("/employees");
  return { success: true, totalCandidates: targets.length, revokedCount };
}

export async function syncEmployeeRoles() {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  // Ambil semua karyawan aktif yang sudah punya user_roles, dengan role TEAMWORK atau MANAGERIAL
  // (tidak sentuh SPV, KABAG, HRD, FINANCE, SUPER_ADMIN, PAYROLL_VIEWER)
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeGroup: employees.employeeGroup,
      trainingGraduationDate: employees.trainingGraduationDate,
      userRoleId: userRoles.id,
      currentRole: userRoles.role,
    })
    .from(employees)
    .innerJoin(userRoles, eq(userRoles.employeeId, employees.id))
    .where(
      and(
        eq(employees.isActive, true),
        inArray(userRoles.role, ["TEAMWORK", "MANAGERIAL"])
      )
    );

  let updatedCount = 0;
  for (const row of rows) {
    const resolvedGroup = isPointBasedEmployeeGroup(row.employeeGroup)
      ? resolveEmployeeGroupFromTrainingDate(row.trainingGraduationDate)
      : row.employeeGroup;
    const expectedRole: UserRole = isKpiEmployeeGroup(resolvedGroup) ? "MANAGERIAL" : "TEAMWORK";
    if (expectedRole !== row.currentRole) {
      await db
        .update(userRoles)
        .set({ role: expectedRole })
        .where(eq(userRoles.id, row.userRoleId));
      updatedCount++;
    }
  }

  revalidatePath("/users");
  revalidatePath("/employees");
  return { success: true, updatedCount, totalChecked: rows.length };
}

function normalizeUsernameFromLegacyCode(value: string) {
  const base = value.trim().toLowerCase();
  if (!base) return "";
  const sanitized = base
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
  return sanitized.slice(0, 50);
}

function resolveUniqueLoginEmail(baseUsername: string, usedEmails: Set<string>) {
  const normalizedBase = baseUsername || "user";
  let username = normalizedBase;
  let suffix = 1;

  while (true) {
    const email = `${username}@hris.internal`;
    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }
    suffix += 1;
    username = `${normalizedBase}.${suffix}`;
  }
}

export async function regenerateEmployeeUidsAndResetLogins() {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  const employeeRows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      startDate: employees.startDate,
      trainingGraduationDate: employees.trainingGraduationDate,
      employeeGroup: employees.employeeGroup,
      userId: userRoles.userId,
      userRole: userRoles.role,
    })
    .from(employees)
    .leftJoin(userRoles, eq(userRoles.employeeId, employees.id));

  if (employeeRows.length === 0) {
    return { success: true, totalEmployees: 0, updatedLogins: 0, createdLogins: 0 };
  }

  const sortedRows = [...employeeRows].sort((a, b) => {
    const startDiff = a.startDate.getTime() - b.startDate.getTime();
    if (startDiff !== 0) return startDiff;

    const aGraduated = Boolean(a.trainingGraduationDate);
    const bGraduated = Boolean(b.trainingGraduationDate);
    if (aGraduated !== bGraduated) return aGraduated ? -1 : 1;

    if (a.trainingGraduationDate && b.trainingGraduationDate) {
      const trainingDiff = a.trainingGraduationDate.getTime() - b.trainingGraduationDate.getTime();
      if (trainingDiff !== 0) return trainingDiff;
    }

    return a.fullName.localeCompare(b.fullName);
  });

  const assignedUidByEmployeeId = new Map<string, string>();
  sortedRows.forEach((row, index) => {
    assignedUidByEmployeeId.set(row.id, String(index + 1).padStart(4, "0"));
  });

  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const usedEmails = new Set((authUsers?.users ?? []).map((user) => (user.email ?? "").toLowerCase()).filter(Boolean));

  let updatedLogins = 0;
  let createdLogins = 0;

  for (const row of sortedRows) {
    const assignedUid = assignedUidByEmployeeId.get(row.id)!;
    const preferredUsername = normalizeUsernameFromLegacyCode(row.employeeCode) || `user.${assignedUid}`;
    const nextEmail = resolveUniqueLoginEmail(preferredUsername, usedEmails);
    const nextRole: UserRole = row.userRole
      ? (row.userRole as UserRole)
      : isKpiEmployeeGroup(row.employeeGroup)
        ? "MANAGERIAL"
        : "TEAMWORK";

    if (row.userId) {
      const { error } = await admin.auth.admin.updateUserById(row.userId, {
        email: nextEmail,
        password: DEFAULT_EMPLOYEE_LOGIN_PASSWORD,
      });
      if (error) {
        return { error: `Gagal update login ${row.fullName}: ${error.message}` };
      }

      await db
        .update(userRoles)
        .set({ role: nextRole, updatedAt: new Date() })
        .where(eq(userRoles.userId, row.userId));
      updatedLogins += 1;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: nextEmail,
        password: DEFAULT_EMPLOYEE_LOGIN_PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user?.id) {
        return { error: `Gagal membuat login ${row.fullName}: ${error?.message ?? "Unknown error"}` };
      }

      await db.insert(userRoles).values({
        userId: data.user.id,
        role: nextRole,
        employeeId: row.id,
      });
      createdLogins += 1;
    }
  }

  await db.transaction(async (tx) => {
    for (const row of sortedRows) {
      await tx
        .update(employees)
        .set({
          employeeCode: `TMP-${row.id.replace(/-/g, "").slice(0, 20)}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, row.id));
    }

    for (const row of sortedRows) {
      await tx
        .update(employees)
        .set({
          employeeCode: assignedUidByEmployeeId.get(row.id)!,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, row.id));
    }
  });

  revalidatePath("/employees");
  revalidatePath("/users");
  revalidatePath("/settings");
  revalidatePath("/dashboard");

  return {
    success: true,
    totalEmployees: sortedRows.length,
    updatedLogins,
    createdLogins,
    defaultPassword: DEFAULT_EMPLOYEE_LOGIN_PASSWORD,
  };
}
