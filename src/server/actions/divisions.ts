"use server";

import { db } from "@/lib/db";
import { divisions } from "@/lib/db/schema/master";
import { divisionSchema } from "@/lib/validations/master";
import { requireAuth, checkRole } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getDivisions() {
  await requireAuth();
  return db.select().from(divisions).orderBy(divisions.name);
}

function revalidateDivisionTargetPaths() {
  revalidatePath("/master/divisions");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/performance");
}

export async function createDivision(formData: FormData) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const raw = {
    name: formData.get("name")?.toString() ?? "",
    code: formData.get("code")?.toString() ?? "",
    branchId: formData.get("branchId")?.toString() || undefined,
    trainingPassPercent: formData.get("trainingPassPercent")?.toString() ?? "80",
    dailyPointTarget: formData.get("dailyPointTarget")?.toString() ?? "13000",
    isActive: formData.get("isActive") !== "false",
  };

  const parsed = divisionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await db.insert(divisions).values(parsed.data);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return { error: "Data dengan kode ini sudah ada, gunakan kode yang berbeda." };
    if (code === "23503") return { error: "Data referensi tidak ditemukan atau masih digunakan." };
    throw e;
  }

  revalidateDivisionTargetPaths();
  return { success: true };
}

export async function updateDivision(id: string, formData: FormData) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const raw = {
    name: formData.get("name")?.toString() ?? "",
    code: formData.get("code")?.toString() ?? "",
    branchId: formData.get("branchId")?.toString() || undefined,
    trainingPassPercent: formData.get("trainingPassPercent")?.toString() ?? "80",
    dailyPointTarget: formData.get("dailyPointTarget")?.toString() ?? "13000",
    isActive: formData.get("isActive") !== "false",
  };

  const parsed = divisionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await db
      .update(divisions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(divisions.id, id))
      .returning({ id: divisions.id });

    if (!result.length) return { error: "Data tidak ditemukan." };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return { error: "Data dengan kode ini sudah ada, gunakan kode yang berbeda." };
    if (code === "23503") return { error: "Data referensi tidak ditemukan atau masih digunakan." };
    throw e;
  }

  revalidateDivisionTargetPaths();
  return { success: true };
}

export async function deleteDivision(id: string) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  try {
    await db.delete(divisions).where(eq(divisions.id, id));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23503") return { error: "Data tidak dapat dihapus karena masih digunakan oleh data lain." };
    throw e;
  }

  revalidateDivisionTargetPaths();
  return { success: true };
}
