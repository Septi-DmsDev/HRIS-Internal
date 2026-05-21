"use server";

import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema/employee";
import { userRoles } from "@/lib/db/schema/auth";
import { attendanceTicketAuditLogs, attendanceTickets, leaveQuotas } from "@/lib/db/schema/hr";
import { checkRole, getCurrentUserRoleRow, getUser, requireAuth } from "@/lib/auth/session";
import { createTicketSchema, ticketDecisionSchema } from "@/lib/validations/hr";
import { and, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types";
import { divisions } from "@/lib/db/schema/master";
import { resolveLeaveQuotaEligibility } from "@/server/ticketing-engine/resolve-leave-quota-eligibility";
import { revokeEmployeeSystemAccess } from "@/server/services/employee-access-service";

const APPROVER_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "SPV", "KABAG"];
const SELF_SERVICE_TICKET_ROLES: UserRole[] = ["KABAG", "SPV", "MANAGERIAL", "FINANCE", "TEAMWORK", "PAYROLL_VIEWER"];
const TICKET_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL", "FINANCE", "PAYROLL_VIEWER"];
const DIV_SCOPED_ROLES: UserRole[] = ["SPV", "KABAG"];
const SPV_REVIEW_SUBMITTER_ROLES: UserRole[] = ["TEAMWORK"];
const DIRECT_HRD_SUBMITTER_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "SPV", "KABAG", "MANAGERIAL", "FINANCE", "PAYROLL_VIEWER"];

function diffDays(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function toUtcDayStart(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function diffCalendarDaysFromToday(targetDate: Date) {
  const today = new Date();
  const todayUtc = toUtcDayStart(today);
  const targetUtc = toUtcDayStart(targetDate);
  return Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

function normalizeToStartOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function hasAllowedAttachmentExtension(url: string) {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return [".jpg", ".jpeg", ".png", ".pdf"].some((ext) => clean.endsWith(ext));
}

async function getEmployeeLeaveQuota(employeeId: string, year: number) {
  const [quota] = await db
    .select()
    .from(leaveQuotas)
    .where(and(eq(leaveQuotas.employeeId, employeeId), eq(leaveQuotas.year, year)))
    .limit(1);
  return quota ?? null;
}

async function getEmployeeStartDate(employeeId: string) {
  const [emp] = await db
    .select({ startDate: employees.startDate })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return emp?.startDate ?? null;
}

async function getEmployeeDivisionId(employeeId: string) {
  const [row] = await db
    .select({ divisionId: employees.divisionId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row?.divisionId ?? null;
}

async function getEmployeeLeavePolicyProfile(employeeId: string) {
  const [row] = await db
    .select({
      employeeGroup: employees.employeeGroup,
      trainingGraduationDate: employees.trainingGraduationDate,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row ?? null;
}

function addYearsUtc(dateValue: Date, years: number) {
  return new Date(Date.UTC(dateValue.getUTCFullYear() + years, dateValue.getUTCMonth(), dateValue.getUTCDate()));
}

function getLeaveMonthlyCycleRange(anchorDate: Date) {
  const y = anchorDate.getUTCFullYear();
  const m = anchorDate.getUTCMonth();
  const d = anchorDate.getUTCDate();
  if (d >= 26) {
    return {
      start: new Date(Date.UTC(y, m, 26)),
      end: new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 25)),
    };
  }
  const prevMonth = m === 0 ? 11 : m - 1;
  const prevYear = m === 0 ? y - 1 : y;
  return {
    start: new Date(Date.UTC(prevYear, prevMonth, 26)),
    end: new Date(Date.UTC(y, m, 25)),
  };
}

async function getSubmitterRole(userId: string) {
  const [row] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);
  return (row?.role as UserRole | undefined) ?? null;
}

export async function getTickets() {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const user = await getUser();

  if (!TICKET_READ_ROLES.includes(role)) {
    return { role, tickets: [] };
  }

  const employeeDivision = divisions;
  const baseQuery = db
    .select({
      id: attendanceTickets.id,
      employeeId: attendanceTickets.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      divisionName: employeeDivision.name,
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      izinHours: attendanceTickets.izinHours,
      reason: attendanceTickets.reason,
      attachmentUrl: attendanceTickets.attachmentUrl,
      status: attendanceTickets.status,
      payrollImpact: attendanceTickets.payrollImpact,
      reviewNotes: attendanceTickets.reviewNotes,
      rejectionReason: attendanceTickets.rejectionReason,
      createdAt: attendanceTickets.createdAt,
    })
    .from(attendanceTickets)
    .leftJoin(employees, eq(attendanceTickets.employeeId, employees.id))
    .leftJoin(employeeDivision, eq(employees.divisionId, employeeDivision.id));

  // /tickets is the self-service submission/history surface.
  const rows = user
    ? await baseQuery
        .where(eq(attendanceTickets.createdByUserId, user.id))
        .orderBy(desc(attendanceTickets.createdAt))
    : await baseQuery.orderBy(desc(attendanceTickets.createdAt));

  return { role, tickets: rows };
}

export async function createTicket(input: unknown) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL", "FINANCE", "PAYROLL_VIEWER"]);
  if (authError) return authError;

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tiket tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (role === "HRD") {
    return { error: "HRD tidak dapat membuat pengajuan tiket." };
  }

  let employeeId = parsed.data.employeeId;

  if (SELF_SERVICE_TICKET_ROLES.includes(role) || (!employeeId && roleRow.employeeId)) {
    if (!roleRow.employeeId) {
      return { error: "Akun Anda belum terhubung ke data karyawan. Hubungi HRD." };
    }
    employeeId = roleRow.employeeId;
  } else if (!employeeId) {
    return { error: "Karyawan wajib dipilih." };
  }

  if (!employeeId) {
    return { error: "Karyawan wajib dipilih." };
  }

  // Skip div-scope check when submitting for self (SPV/KABAG always submit for self via SELF_SERVICE)
  if (DIV_SCOPED_ROLES.includes(role) && employeeId !== roleRow.employeeId) {
    if (roleRow.divisionIds.length === 0) {
      return { error: "Akun Anda belum terhubung ke divisi. Hubungi HRD." };
    }
    const employeeDivisionId = await getEmployeeDivisionId(employeeId);
    if (!employeeDivisionId || !roleRow.divisionIds.includes(employeeDivisionId)) {
      return { error: "Anda hanya boleh membuat tiket untuk karyawan di divisi Anda." };
    }
  }

  const { startDate, endDate } = parsed.data;
  const normalizedEndDate = parsed.data.ticketType === "RESIGN" ? startDate : endDate;
  const daysCount = diffDays(startDate, normalizedEndDate);
  const attachmentUrl = parsed.data.attachmentUrl?.trim() || null;
  const leadDays = diffCalendarDaysFromToday(startDate);
  const ticketType = parsed.data.ticketType;

  if (ticketType === "IZIN_JAM" && !parsed.data.izinHours) {
    return { error: "Jumlah jam izin wajib diisi untuk IZIN_JAM." };
  }

  if (ticketType === "IZIN_JAM" && (parsed.data.izinHours! < 1 || parsed.data.izinHours! > 8)) {
    return { error: "Izin jam maksimal 8 jam dalam sehari." };
  }

  if (
    ["CUTI_TAHUNAN", "CUTI_BULANAN", "IZIN_ACARA", "CUTI_HAMIL_LAHIR", "CUTI_NIKAH"].includes(ticketType) &&
    leadDays < 2
  ) {
    return { error: "Pengajuan wajib minimal H-2 untuk jenis tiket ini." };
  }

  if (ticketType === "RESIGN" && leadDays < 14) {
    return { error: "Pengajuan RESIGN wajib diajukan minimal 14 hari sebelum tanggal resign." };
  }

  if (ticketType === "CUTI_NIKAH" && daysCount > 5) {
    return { error: "Durasi CUTI_NIKAH maksimal 5 hari." };
  }

  if (ticketType === "CUTI_HAMIL_LAHIR" && daysCount > 90) {
    return { error: "Durasi CUTI_HAMIL_LAHIR maksimal 90 hari." };
  }

  if (ticketType === "MENINGGAL" && daysCount > 3) {
    return { error: "Durasi MENINGGAL maksimal 3 hari." };
  }

  if (attachmentUrl && !hasAllowedAttachmentExtension(attachmentUrl)) {
    return { error: "Format lampiran tidak didukung. Gunakan JPG, JPEG, PNG, atau PDF." };
  }

  if (ticketType === "SAKIT") {
    const monthStart = normalizeToStartOfMonth(startDate);
    const nextMonthStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
    const [existingSickInMonth] = await db
      .select({ id: attendanceTickets.id })
      .from(attendanceTickets)
      .where(
        and(
          eq(attendanceTickets.employeeId, employeeId),
          eq(attendanceTickets.ticketType, "SAKIT"),
          sql`${attendanceTickets.startDate} >= ${monthStart}::date`,
          sql`${attendanceTickets.startDate} < ${nextMonthStart}::date`,
          inArray(attendanceTickets.status, ["SUBMITTED", "NEED_REVIEW", "APPROVED_SPV", "APPROVED_HRD", "LOCKED"] as const)
        )
      )
      .limit(1);

    if ((daysCount >= 2 || Boolean(existingSickInMonth)) && !attachmentUrl) {
      return { error: "Lampiran bukti sakit wajib untuk durasi >=2 hari atau pengajuan sakit berulang di bulan berjalan." };
    }
  }

  if (["CUTI_TAHUNAN", "CUTI_BULANAN", "IZIN_ACARA"].includes(ticketType)) {
    const year = startDate.getUTCFullYear();
    const employeeStartDate = await getEmployeeStartDate(employeeId);
    if (!employeeStartDate) return { error: "Tanggal mulai kerja karyawan tidak ditemukan." };

    const eligible = resolveLeaveQuotaEligibility({
      startDate: employeeStartDate,
      requestedYear: year,
      today: startDate,
    }).eligible;
    if (!eligible) {
      return { error: "Masa kerja minimal 1 tahun belum terpenuhi untuk jenis pengajuan ini." };
    }

    const quota = await getEmployeeLeaveQuota(employeeId, year);
    if (!quota) {
      return { error: `Kuota cuti tahun ${year} belum tersedia. Hubungi HRD untuk generate kuota.` };
    }

    if (ticketType === "CUTI_TAHUNAN" && quota.annualQuotaUsed >= quota.annualQuotaTotal) {
      return { error: "Kuota CUTI_TAHUNAN sudah habis." };
    }
    if (ticketType === "CUTI_BULANAN" && quota.monthlyQuotaUsed >= quota.monthlyQuotaTotal) {
      return { error: "Kuota CUTI_BULANAN sudah habis." };
    }
    if (ticketType === "IZIN_ACARA" && quota.eventQuotaUsed >= quota.eventQuotaTotal) {
      return { error: "Kuota IZIN_ACARA sudah habis." };
    }
  }

  if (["CUTI_BULANAN", "CUTI_TAHUNAN"].includes(ticketType)) {
    const profile = await getEmployeeLeavePolicyProfile(employeeId);
    if (!profile) return { error: "Data karyawan tidak ditemukan." };
    if (!profile.trainingGraduationDate) {
      return { error: "Tanggal lulus training belum tersedia. Hubungi HRD." };
    }
    const eligibleDate = addYearsUtc(profile.trainingGraduationDate, 1);
    if (startDate < eligibleDate) {
      return { error: `Cuti bulanan/tahunan aktif setelah ${eligibleDate.toISOString().slice(0, 10)}.` };
    }

    if (ticketType === "CUTI_BULANAN") {
      const cycle = getLeaveMonthlyCycleRange(startDate);
      const [usedMonthly] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(attendanceTickets)
        .where(
          and(
            eq(attendanceTickets.employeeId, employeeId),
            eq(attendanceTickets.ticketType, "CUTI_BULANAN"),
            gte(attendanceTickets.startDate, cycle.start),
            lte(attendanceTickets.startDate, cycle.end),
            inArray(attendanceTickets.status, ["APPROVED_SPV", "APPROVED_HRD", "AUTO_APPROVED", "LOCKED"] as const)
          )
        );
      if (Number(usedMonthly?.cnt ?? 0) >= 1) {
        return { error: "Jatah CUTI_BULANAN periode ini sudah terpakai (maksimal 1x per periode 26-25)." };
      }
    }

    if (ticketType === "CUTI_TAHUNAN") {
      const yearStart = new Date(Date.UTC(startDate.getUTCFullYear(), 0, 1));
      const yearEnd = new Date(Date.UTC(startDate.getUTCFullYear(), 11, 31));
      const [usedAnnual] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(attendanceTickets)
        .where(
          and(
            eq(attendanceTickets.employeeId, employeeId),
            eq(attendanceTickets.ticketType, "CUTI_TAHUNAN"),
            gte(attendanceTickets.startDate, yearStart),
            lte(attendanceTickets.startDate, yearEnd),
            inArray(attendanceTickets.status, ["APPROVED_SPV", "APPROVED_HRD", "AUTO_APPROVED", "LOCKED"] as const)
          )
        );
      if (Number(usedAnnual?.cnt ?? 0) >= 3) {
        return { error: "Jatah CUTI_TAHUNAN tahun ini sudah habis (maksimal 3x per tahun)." };
      }
    }
  }

  try {
    await db.insert(attendanceTickets).values({
      employeeId,
      ticketType: parsed.data.ticketType,
      startDate,
      endDate: normalizedEndDate,
      daysCount,
      izinHours: parsed.data.ticketType === "IZIN_JAM" ? (parsed.data.izinHours ?? null) : null,
      reason: parsed.data.reason,
      attachmentUrl,
      status: "SUBMITTED",
      createdByUserId: user?.id ?? employeeId,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23503") return { error: "Karyawan tidak ditemukan." };
    throw e;
  }

  revalidatePath("/tickets");
  revalidatePath("/ticketingapproval");
  return { success: true };
}

export async function approveTicket(input: unknown) {
  const authError = await checkRole(APPROVER_ROLES);
  if (authError) return authError;

  const parsed = ticketDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const [ticket] = await db
    .select({
      id: attendanceTickets.id,
      employeeId: attendanceTickets.employeeId,
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      status: attendanceTickets.status,
      createdByUserId: attendanceTickets.createdByUserId,
    })
    .from(attendanceTickets)
    .where(eq(attendanceTickets.id, parsed.data.ticketId))
    .limit(1);

  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.status === "LOCKED") {
    return { error: "Tiket yang sudah LOCKED tidak dapat diproses lagi." };
  }

  const allowedStatuses = DIV_SCOPED_ROLES.includes(role)
    ? ["SUBMITTED", "NEED_REVIEW"]
    : ["SUBMITTED", "NEED_REVIEW", "APPROVED_SPV"];
  if (!allowedStatuses.includes(ticket.status)) {
    return { error: "Tiket tidak dalam status yang dapat disetujui." };
  }

  if (DIV_SCOPED_ROLES.includes(role)) {
    // SPV tidak boleh menyetujui tiket miliknya sendiri
    if (roleRow.employeeId && ticket.employeeId === roleRow.employeeId) {
      return { error: "Anda tidak dapat menyetujui tiket Anda sendiri." };
    }
    const submitterRole = await getSubmitterRole(ticket.createdByUserId);
    if (!submitterRole || !SPV_REVIEW_SUBMITTER_ROLES.includes(submitterRole)) {
      return { error: "Hanya tiket TEAMWORK yang diproses oleh SPV/KABAG." };
    }
    if (roleRow.divisionIds.length === 0) return { error: "Akun Anda belum terhubung ke divisi." };
    const employeeDivisionId = await getEmployeeDivisionId(ticket.employeeId);
    if (!employeeDivisionId || !roleRow.divisionIds.includes(employeeDivisionId)) {
      return { error: "Anda hanya dapat menyetujui tiket karyawan di divisi Anda." };
    }
  }

  // SPV/KABAG review only moves the ticket to HRD queue.
  if (DIV_SCOPED_ROLES.includes(role)) {
    await db
      .update(attendanceTickets)
      .set({
        status: "APPROVED_SPV",
        reviewNotes: parsed.data.notes ?? null,
        approvedByUserId: user?.id ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(attendanceTickets.id, parsed.data.ticketId));

    await db.insert(attendanceTicketAuditLogs).values({
      ticketId: ticket.id,
      employeeId: ticket.employeeId,
      action: "APPROVE_SPV",
      actorUserId: user?.id ?? roleRow.userId,
      actorRole: role,
      notes: parsed.data.notes ?? null,
      payload: {
        fromStatus: ticket.status,
        toStatus: "APPROVED_SPV",
      },
    });

    revalidatePath("/tickets");
    revalidatePath("/ticketingapproval");
    return { success: true };
  }

  if (["SUBMITTED", "NEED_REVIEW"].includes(ticket.status)) {
    const submitterRole = await getSubmitterRole(ticket.createdByUserId);
    if (!submitterRole || !DIRECT_HRD_SUBMITTER_ROLES.includes(submitterRole)) {
      return { error: "Tiket TEAMWORK harus disetujui SPV/KABAG terlebih dahulu." };
    }
  }

  let shouldRevokeAccess = false;
  await db.transaction(async (tx) => {
    let payrollImpact = parsed.data.payrollImpact ?? "UNPAID";

    if (!parsed.data.payrollImpact && !["SETENGAH_HARI", "IZIN_JAM", "RESIGN"].includes(ticket.ticketType)) {
      const year = new Date(ticket.startDate).getFullYear();
      const employeeStartDate = await getEmployeeStartDate(ticket.employeeId);
      const eligible = employeeStartDate
        ? resolveLeaveQuotaEligibility({
            startDate: employeeStartDate,
            requestedYear: year,
            today: ticket.startDate,
          }).eligible
        : false;

      if (eligible) {
        const quota = await getEmployeeLeaveQuota(ticket.employeeId, year);
        if (quota) {
          if (ticket.ticketType === "CUTI_BULANAN") {
            payrollImpact = "PAID_QUOTA_MONTHLY";
          } else if (ticket.ticketType === "CUTI_TAHUNAN") {
            const [annualUpdated] = await tx
              .update(leaveQuotas)
              .set({
                annualQuotaUsed: sql`${leaveQuotas.annualQuotaUsed} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(leaveQuotas.id, quota.id),
                  sql`${leaveQuotas.annualQuotaUsed} < ${leaveQuotas.annualQuotaTotal}`
                )
              )
              .returning({ id: leaveQuotas.id });
            if (annualUpdated) payrollImpact = "PAID_QUOTA_ANNUAL";
          } else if (ticket.ticketType === "IZIN_ACARA") {
            await tx
              .update(leaveQuotas)
              .set({
                eventQuotaUsed: sql`${leaveQuotas.eventQuotaUsed} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(leaveQuotas.id, quota.id),
                  sql`${leaveQuotas.eventQuotaUsed} < ${leaveQuotas.eventQuotaTotal}`
                )
              );
          }
        }
      }
    }

    await tx
      .update(attendanceTickets)
      .set({
        status: "APPROVED_HRD",
        payrollImpact,
        reviewNotes: parsed.data.notes,
        approvedByUserId: user?.id ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(attendanceTickets.id, parsed.data.ticketId));

    await tx.insert(attendanceTicketAuditLogs).values({
      ticketId: ticket.id,
      employeeId: ticket.employeeId,
      action: "APPROVE_HRD",
      actorUserId: user?.id ?? roleRow.userId,
      actorRole: role,
      notes: parsed.data.notes ?? null,
      payload: {
        fromStatus: ticket.status,
        toStatus: "APPROVED_HRD",
        payrollImpact,
      },
    });

    if (ticket.ticketType === "RESIGN") {
      await tx
        .update(employees)
        .set({
          isActive: false,
          employmentStatus: "RESIGN",
          payrollStatus: "NONAKTIF",
          updatedAt: new Date(),
        })
        .where(eq(employees.id, ticket.employeeId));
      shouldRevokeAccess = true;
    }
  });

  if (shouldRevokeAccess) {
    await revokeEmployeeSystemAccess(ticket.employeeId);
  }

  revalidatePath("/tickets");
  revalidatePath("/ticketingapproval");
  revalidatePath("/employees");
  revalidatePath("/users");
  return { success: true };
}

export async function rejectTicket(input: unknown) {
  const authError = await checkRole(APPROVER_ROLES);
  if (authError) return authError;

  const parsed = ticketDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };
  }

  if (!parsed.data.rejectionReason?.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const user = await getUser();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const [ticket] = await db
    .select({
      id: attendanceTickets.id,
      employeeId: attendanceTickets.employeeId,
      status: attendanceTickets.status,
      createdByUserId: attendanceTickets.createdByUserId,
    })
    .from(attendanceTickets)
    .where(eq(attendanceTickets.id, parsed.data.ticketId))
    .limit(1);

  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.status === "LOCKED") {
    return { error: "Tiket yang sudah LOCKED tidak dapat diproses lagi." };
  }

  const allowedRejectStatuses = DIV_SCOPED_ROLES.includes(role)
    ? ["SUBMITTED", "NEED_REVIEW"]
    : ["SUBMITTED", "NEED_REVIEW", "APPROVED_SPV"];
  if (!allowedRejectStatuses.includes(ticket.status)) {
    return { error: "Tiket tidak dalam status yang dapat ditolak." };
  }

  if (DIV_SCOPED_ROLES.includes(role)) {
    if (roleRow.employeeId && ticket.employeeId === roleRow.employeeId) {
      return { error: "Anda tidak dapat menolak tiket Anda sendiri." };
    }
    const submitterRole = await getSubmitterRole(ticket.createdByUserId);
    if (!submitterRole || !SPV_REVIEW_SUBMITTER_ROLES.includes(submitterRole)) {
      return { error: "Hanya tiket TEAMWORK yang diproses oleh SPV/KABAG." };
    }
    if (roleRow.divisionIds.length === 0) return { error: "Akun Anda belum terhubung ke divisi." };
    const employeeDivisionId = await getEmployeeDivisionId(ticket.employeeId);
    if (!employeeDivisionId || !roleRow.divisionIds.includes(employeeDivisionId)) {
      return { error: "Anda hanya dapat menolak tiket karyawan di divisi Anda." };
    }
  }

  if (!DIV_SCOPED_ROLES.includes(role) && ["SUBMITTED", "NEED_REVIEW"].includes(ticket.status)) {
    const submitterRole = await getSubmitterRole(ticket.createdByUserId);
    if (!submitterRole || !DIRECT_HRD_SUBMITTER_ROLES.includes(submitterRole)) {
      return { error: "Tiket TEAMWORK harus diproses SPV/KABAG terlebih dahulu." };
    }
  }

  await db
    .update(attendanceTickets)
    .set({
      status: "REJECTED",
      rejectionReason: parsed.data.rejectionReason,
      rejectedByUserId: user?.id ?? null,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(attendanceTickets.id, parsed.data.ticketId));

  await db.insert(attendanceTicketAuditLogs).values({
    ticketId: ticket.id,
    employeeId: ticket.employeeId,
    action: DIV_SCOPED_ROLES.includes(role) ? "REJECT_SPV" : "REJECT_HRD",
    actorUserId: user?.id ?? roleRow.userId,
    actorRole: role,
    notes: parsed.data.notes ?? null,
    payload: {
      fromStatus: ticket.status,
      toStatus: "REJECTED",
      rejectionReason: parsed.data.rejectionReason,
    },
  });

  revalidatePath("/tickets");
  revalidatePath("/ticketingapproval");
  return { success: true };
}

export async function cancelTicket(ticketId: string) {
  const user = await getUser();
  if (!user) return { error: "Sesi tidak valid." };
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  const [ticket] = await db
    .select()
    .from(attendanceTickets)
    .where(eq(attendanceTickets.id, ticketId))
    .limit(1);

  if (!ticket) return { error: "Tiket tidak ditemukan." };
  if (ticket.status === "LOCKED") {
    return { error: "Tiket yang sudah LOCKED tidak dapat dibatalkan." };
  }
  if (!["DRAFT", "SUBMITTED"].includes(ticket.status)) {
    return { error: "Tiket yang sudah diproses tidak bisa dibatalkan." };
  }
  if (ticket.createdByUserId !== user.id && !["SUPER_ADMIN", "HRD"].includes(role)) {
    return { error: "Hanya pembuat tiket atau HRD/Super Admin yang dapat membatalkan tiket ini." };
  }

  await db
    .update(attendanceTickets)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(attendanceTickets.id, ticketId));

  revalidatePath("/tickets");
  return { success: true };
}

// Ticket approval queue
// SPV/KABAG: SUBMITTED from their division, excluding own ticket
// HRD/SUPER_ADMIN: SUBMITTED (SPV self-tickets) + APPROVED_SPV (TW after SPV review)

export async function getTicketsForApproval() {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!["SUPER_ADMIN", "HRD", "SPV", "KABAG"].includes(role)) {
    return { role, tickets: [] };
  }

  const isDivScoped = DIV_SCOPED_ROLES.includes(role) && roleRow.divisionIds.length > 0;

  const baseQuery = db
    .select({
      id: attendanceTickets.id,
      employeeId: attendanceTickets.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      divisionName: divisions.name,
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      izinHours: attendanceTickets.izinHours,
      reason: attendanceTickets.reason,
      attachmentUrl: attendanceTickets.attachmentUrl,
      status: attendanceTickets.status,
      createdAt: attendanceTickets.createdAt,
    })
    .from(attendanceTickets)
    .leftJoin(employees, eq(attendanceTickets.employeeId, employees.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id))
    .leftJoin(userRoles, eq(attendanceTickets.createdByUserId, userRoles.userId));

  const rows = isDivScoped
    ? await baseQuery
        .where(
          and(
            inArray(attendanceTickets.status, ["SUBMITTED", "NEED_REVIEW"] as const),
            inArray(employees.divisionId, roleRow.divisionIds),
            inArray(userRoles.role, SPV_REVIEW_SUBMITTER_ROLES),
            roleRow.employeeId ? ne(attendanceTickets.employeeId, roleRow.employeeId) : undefined
          )
        )
        .orderBy(desc(attendanceTickets.createdAt))
    : await baseQuery
        .where(
          or(
            inArray(attendanceTickets.status, ["APPROVED_SPV"] as const),
            and(
              inArray(attendanceTickets.status, ["SUBMITTED", "NEED_REVIEW"] as const),
              inArray(userRoles.role, DIRECT_HRD_SUBMITTER_ROLES)
            )
          )
        )
        .orderBy(desc(attendanceTickets.createdAt));

  return { role, tickets: rows };
}

export async function getTicketsForApprovalHistory() {
  await requireAuth();
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (!["SUPER_ADMIN", "HRD", "SPV", "KABAG"].includes(role)) {
    return { role, tickets: [] };
  }

  const isDivScoped = DIV_SCOPED_ROLES.includes(role) && roleRow.divisionIds.length > 0;

  const baseQuery = db
    .select({
      id: attendanceTickets.id,
      employeeId: attendanceTickets.employeeId,
      employeeName: employees.fullName,
      employeeCode: employees.employeeCode,
      divisionName: divisions.name,
      ticketType: attendanceTickets.ticketType,
      startDate: attendanceTickets.startDate,
      endDate: attendanceTickets.endDate,
      daysCount: attendanceTickets.daysCount,
      izinHours: attendanceTickets.izinHours,
      reason: attendanceTickets.reason,
      attachmentUrl: attendanceTickets.attachmentUrl,
      status: attendanceTickets.status,
      payrollImpact: attendanceTickets.payrollImpact,
      reviewNotes: attendanceTickets.reviewNotes,
      rejectionReason: attendanceTickets.rejectionReason,
      approvedAt: attendanceTickets.approvedAt,
      rejectedAt: attendanceTickets.rejectedAt,
      createdAt: attendanceTickets.createdAt,
    })
    .from(attendanceTickets)
    .leftJoin(employees, eq(attendanceTickets.employeeId, employees.id))
    .leftJoin(divisions, eq(employees.divisionId, divisions.id));

  const rows = isDivScoped
    ? await baseQuery
        .where(
          and(
            inArray(employees.divisionId, roleRow.divisionIds),
            roleRow.employeeId ? ne(attendanceTickets.employeeId, roleRow.employeeId) : undefined
          )
        )
        .orderBy(desc(attendanceTickets.createdAt))
    : await baseQuery.orderBy(desc(attendanceTickets.createdAt));

  return { role, tickets: rows };
}

export async function generateLeaveQuota(employeeId: string, year: number) {
  const authError = await checkRole(["SUPER_ADMIN", "HRD"]);
  if (authError) return authError;

  const employeeStartDate = await getEmployeeStartDate(employeeId);
  if (!employeeStartDate) {
    return { error: "Tanggal mulai kerja karyawan tidak ditemukan." };
  }

  const eligibility = resolveLeaveQuotaEligibility({
    startDate: employeeStartDate,
    requestedYear: year,
  });
  if (!eligibility.eligible) {
    return {
      error: `Karyawan belum memenuhi syarat kuota cuti quarter rule. Efektif pada ${eligibility.effectiveDate.toISOString().slice(0, 10)}.`,
    };
  }

  const existing = await getEmployeeLeaveQuota(employeeId, year);
  if (existing) return { error: `Kuota cuti tahun ${year} sudah ada untuk karyawan ini.` };

  await db.insert(leaveQuotas).values({
    employeeId,
    year,
    monthlyQuotaTotal: 12,
    monthlyQuotaUsed: 0,
    annualQuotaTotal: 3,
    annualQuotaUsed: 0,
    eventQuotaTotal: 3,
    eventQuotaUsed: 0,
  });

  revalidatePath("/tickets");
  return { success: true };
}
