"use server";

import { db } from "@/lib/db";
import { workScheduleDays, workSchedules, workShiftMasters } from "@/lib/db/schema/employee";
import { checkRole, requireAuth } from "@/lib/auth/session";
import { workScheduleSchema, workShiftMasterSchema, type WorkScheduleInput } from "@/lib/validations/employee";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function normalizeWorkScheduleInput(input: WorkScheduleInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    isActive: input.isActive,
    days: [...input.days].sort((left, right) => left.dayOfWeek - right.dayOfWeek),
  };
}

export async function getWorkSchedules() {
  await requireAuth();

  const schedules = await db.select().from(workSchedules).orderBy(asc(workSchedules.name));
  const days = await db.select().from(workScheduleDays).orderBy(asc(workScheduleDays.dayOfWeek));

  return schedules.map((schedule) => ({
    ...schedule,
    days: days
      .filter((day) => day.scheduleId === schedule.id)
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek),
  }));
}

export async function getActiveWorkSchedules() {
  await requireAuth();
  return db
    .select({
      id: workSchedules.id,
      code: workSchedules.code,
      name: workSchedules.name,
    })
    .from(workSchedules)
    .where(eq(workSchedules.isActive, true))
    .orderBy(asc(workSchedules.name));
}

export async function getWorkShiftMasters() {
  await requireAuth();
  return db.select().from(workShiftMasters).orderBy(asc(workShiftMasters.sortOrder), asc(workShiftMasters.name));
}

export async function createWorkShiftMaster(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = workShiftMasterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input shift tidak valid." };
  }

  try {
    await db.insert(workShiftMasters).values({
      code: parsed.data.code,
      name: parsed.data.name,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      breakStart: parsed.data.breakStart ?? null,
      breakEnd: parsed.data.breakEnd ?? null,
      checkOutStart: parsed.data.checkOutStart ?? null,
      checkInToleranceMinutes: parsed.data.checkInToleranceMinutes,
      breakToleranceMinutes: parsed.data.breakToleranceMinutes,
      checkOutToleranceMinutes: parsed.data.checkOutToleranceMinutes,
      isOvernight: parsed.data.isOvernight,
      applicableDivisionCodes: parsed.data.applicableDivisionCodes,
      notes: parsed.data.notes,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: "Kode shift sudah digunakan, pakai kode lain." };
    throw error;
  }

  revalidatePath("/master");
  return { success: true };
}

export async function updateWorkShiftMaster(id: string, input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = workShiftMasterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input shift tidak valid." };
  }

  try {
    const result = await db
      .update(workShiftMasters)
      .set({
        code: parsed.data.code,
        name: parsed.data.name,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        breakStart: parsed.data.breakStart ?? null,
        breakEnd: parsed.data.breakEnd ?? null,
        checkOutStart: parsed.data.checkOutStart ?? null,
        checkInToleranceMinutes: parsed.data.checkInToleranceMinutes,
        breakToleranceMinutes: parsed.data.breakToleranceMinutes,
        checkOutToleranceMinutes: parsed.data.checkOutToleranceMinutes,
        isOvernight: parsed.data.isOvernight,
        applicableDivisionCodes: parsed.data.applicableDivisionCodes,
        notes: parsed.data.notes,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(workShiftMasters.id, id))
      .returning({ id: workShiftMasters.id });

    if (!result.length) {
      return { error: "Shift tidak ditemukan." };
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: "Kode shift sudah digunakan, pakai kode lain." };
    throw error;
  }

  revalidatePath("/master");
  return { success: true };
}

export async function deleteWorkShiftMaster(id: string) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  await db.delete(workShiftMasters).where(eq(workShiftMasters.id, id));
  revalidatePath("/master");
  return { success: true };
}

export async function createWorkSchedule(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = workScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input jadwal kerja tidak valid." };
  }

  const normalized = normalizeWorkScheduleInput(parsed.data);

  try {
    await db.transaction(async (tx) => {
      const [schedule] = await tx
        .insert(workSchedules)
        .values({
          code: normalized.code,
          name: normalized.name,
          description: normalized.description,
          isActive: normalized.isActive,
        })
        .returning({ id: workSchedules.id });

      await tx.insert(workScheduleDays).values(
        normalized.days.map((day) => ({
          scheduleId: schedule.id,
          dayOfWeek: day.dayOfWeek,
          dayStatus: day.dayStatus,
          isWorkingDay: day.isWorkingDay,
          startTime: day.startTime,
          endTime: day.endTime,
          breakStart: day.breakStart ?? null,
          breakEnd: day.breakEnd ?? null,
          breakToleranceMinutes: day.breakToleranceMinutes,
          checkInToleranceMinutes: day.checkInToleranceMinutes,
          checkOutStart: day.checkOutStart ?? null,
          checkOutToleranceMinutes: day.checkOutToleranceMinutes,
          targetPoints: day.targetPoints,
        }))
      );
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: "Kode jadwal sudah digunakan, pakai kode lain." };
    throw error;
  }

  revalidatePath("/master");
  revalidatePath("/employees");
  return { success: true };
}

export async function updateWorkSchedule(id: string, input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = workScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input jadwal kerja tidak valid." };
  }

  const normalized = normalizeWorkScheduleInput(parsed.data);

  try {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(workSchedules)
        .set({
          code: normalized.code,
          name: normalized.name,
          description: normalized.description,
          isActive: normalized.isActive,
          updatedAt: new Date(),
        })
        .where(eq(workSchedules.id, id))
        .returning({ id: workSchedules.id });

      if (!result.length) {
        throw new Error("WORK_SCHEDULE_NOT_FOUND");
      }

      await tx.delete(workScheduleDays).where(eq(workScheduleDays.scheduleId, id));
      await tx.insert(workScheduleDays).values(
        normalized.days.map((day) => ({
          scheduleId: id,
          dayOfWeek: day.dayOfWeek,
          dayStatus: day.dayStatus,
          isWorkingDay: day.isWorkingDay,
          startTime: day.startTime,
          endTime: day.endTime,
          breakStart: day.breakStart ?? null,
          breakEnd: day.breakEnd ?? null,
          breakToleranceMinutes: day.breakToleranceMinutes,
          checkInToleranceMinutes: day.checkInToleranceMinutes,
          checkOutStart: day.checkOutStart ?? null,
          checkOutToleranceMinutes: day.checkOutToleranceMinutes,
          targetPoints: day.targetPoints,
        }))
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WORK_SCHEDULE_NOT_FOUND") {
      return { error: "Jadwal kerja tidak ditemukan." };
    }

    const code = (error as { code?: string }).code;
    if (code === "23505") return { error: "Kode jadwal sudah digunakan, pakai kode lain." };
    throw error;
  }

  revalidatePath("/master");
  revalidatePath("/employees");
  return { success: true };
}

export async function deleteWorkSchedule(id: string) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  try {
    await db.delete(workSchedules).where(eq(workSchedules.id, id));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23503") {
      return { error: "Jadwal kerja tidak dapat dihapus karena masih dipakai profil karyawan." };
    }
    throw error;
  }

  revalidatePath("/master");
  revalidatePath("/employees");
  return { success: true };
}
