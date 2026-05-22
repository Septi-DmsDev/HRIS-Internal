"use server";

import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import {
  dailyActivityEntries,
  divisionPointTargetRules,
  pointCatalogEntries,
  pointCatalogVersions,
} from "@/lib/db/schema/point";
import {
  checkRole,
  getCurrentUserRole,
  requireAuth,
} from "@/lib/auth/session";
import {
  pointCatalogSyncSchema,
  upsertCatalogEntrySchema,
  type PointCatalogSyncInput,
} from "@/lib/validations/point";
import { parseMasterPointWorkbook } from "@/server/point-engine/parse-master-point-workbook";
import {
  getActivePointCatalogVersion,
  getDivisionTargetRulesByVersion,
  getPointCatalogEntriesByVersion,
} from "@/server/services/point-catalog-service";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type CatalogEntryRow = {
  id: string;
  divisionName: string;
  externalCode: string | null;
  workName: string;
  pointValue: string;
  unitDescription: string | null;
};

export async function getPointCatalogOverview() {
  await requireAuth();
  const role = await getCurrentUserRole();
  const canManageCatalog = role === "HRD" || role === "SUPER_ADMIN";

  const versions = await db
    .select()
    .from(pointCatalogVersions)
    .orderBy(desc(pointCatalogVersions.importedAt));

  const activeVersion = (await getActivePointCatalogVersion()) ?? versions[0] ?? null;

  if (!activeVersion) {
    return {
      canManageCatalog,
      versions: [],
      activeVersion: null,
      entrySummary: { totalEntries: 0, totalDivisions: 0 },
      resolvedTargets: [] as Array<{
        divisionName: string;
        targetPoints: number;
        source: "DEFAULT" | "OVERRIDE";
      }>,
      latestEntries: [] as CatalogEntryRow[],
    };
  }

  const [entries, rules] = await Promise.all([
    getPointCatalogEntriesByVersion(activeVersion.id),
    getDivisionTargetRulesByVersion(activeVersion.id),
  ]);

  const defaultRule = rules.find((rule) => rule.isDefault);
  const overrideMap = new Map(
    rules
      .filter((rule) => !rule.isDefault)
      .map((rule) => [rule.divisionName.toUpperCase(), rule.targetPoints])
  );

  const divisions = [...new Set(entries.map((entry) => entry.divisionName.toUpperCase()))].sort();
  const resolvedTargets = divisions.map((divisionName) => {
    const targetPoints = overrideMap.get(divisionName) ?? defaultRule?.targetPoints ?? 0;
    return {
      divisionName,
      targetPoints,
      source: overrideMap.has(divisionName) ? ("OVERRIDE" as const) : ("DEFAULT" as const),
    };
  });

  return {
    canManageCatalog,
    versions,
    activeVersion,
    entrySummary: {
      totalEntries: entries.length,
      totalDivisions: divisions.length,
    },
    resolvedTargets,
    latestEntries: entries,
  };
}

export async function syncPointCatalogFromWorkbook(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = pointCatalogSyncSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input sinkronisasi tidak valid." };
  }

  const syncInput = parsed.data as PointCatalogSyncInput;
  let workbookBuffer: Buffer;
  try {
    workbookBuffer = await readFile(syncInput.workbookPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { error: "Workbook tidak ditemukan pada path yang diberikan." };
    }
    throw error;
  }
  const parsedWorkbook = parseMasterPointWorkbook({
    buffer: workbookBuffer,
    versionCode: syncInput.versionCode,
    effectiveStartDate: syncInput.effectiveStartDate.toISOString().slice(0, 10),
    sourceFileName: syncInput.workbookPath.split(/[/\\]/).pop(),
  });

  try {
    await db.transaction(async (tx) => {
      if (syncInput.activateVersion) {
        await tx
          .update(pointCatalogVersions)
          .set({
            status: "ARCHIVED",
            updatedAt: new Date(),
            effectiveEndDate: syncInput.effectiveStartDate,
          })
          .where(eq(pointCatalogVersions.status, "ACTIVE"));
      }

      const [version] = await tx
        .insert(pointCatalogVersions)
        .values({
          code: parsedWorkbook.version.code,
          sourceFileName: parsedWorkbook.version.sourceFileName,
          notes: syncInput.notes,
          status: syncInput.activateVersion ? "ACTIVE" : "DRAFT",
          effectiveStartDate: syncInput.effectiveStartDate,
        })
        .returning({ id: pointCatalogVersions.id });

      await tx.insert(divisionPointTargetRules).values(
        parsedWorkbook.targetRules.map((rule) => ({
          versionId: version.id,
          divisionCode: rule.divisionCode,
          divisionName: rule.divisionName,
          targetPoints: rule.targetPoints,
          isDefault: rule.isDefault,
        }))
      );

      await tx.insert(pointCatalogEntries).values(
        parsedWorkbook.entries.map((entry) => ({
          versionId: version.id,
          divisionCode: entry.divisionCode,
          divisionName: entry.divisionName,
          externalRowNumber: entry.externalRowNumber,
          externalCode: entry.externalCode,
          workName: entry.workName,
          pointValue: entry.pointValue,
          unitDescription: entry.unitDescription,
        }))
      );
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return { error: "Kode versi katalog sudah ada. Gunakan kode versi lain." };
    }
    throw error;
  }

  revalidatePath("/performance");
  return {
    success: true,
    importedVersionCode: parsedWorkbook.version.code,
    importedEntries: parsedWorkbook.entries.length,
    importedDivisions: parsedWorkbook.discoveredDivisions.length,
  };
}

async function getOrCreateActiveVersion(): Promise<string> {
  const existing = await getActivePointCatalogVersion();
  if (existing) return existing.id;

  const today = new Date().toISOString().slice(0, 10);
  const [newVersion] = await db
    .insert(pointCatalogVersions)
    .values({
      code: `catalog-${today}`,
      status: "ACTIVE",
      effectiveStartDate: new Date(today),
      notes: "Dibuat otomatis dari platform",
    })
    .returning({ id: pointCatalogVersions.id });
  return newVersion.id;
}

export async function upsertCatalogEntry(input: unknown) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const parsed = upsertCatalogEntrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid." };

  const { id, divisionName, workName, pointValue, unitDescription } = parsed.data;
  const normalizedDivision = divisionName.trim().toUpperCase();
  const versionId = await getOrCreateActiveVersion();

  if (id) {
    const updated = await db
      .update(pointCatalogEntries)
      .set({
        divisionName: normalizedDivision,
        workName,
        pointValue: pointValue.toFixed(2),
        unitDescription: unitDescription ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(pointCatalogEntries.id, id), eq(pointCatalogEntries.versionId, versionId)))
      .returning({ id: pointCatalogEntries.id });
    if (updated.length === 0) return { error: "Entry tidak ditemukan atau bukan bagian dari versi aktif." };
  } else {
    const existingCount = await db
      .select({ id: pointCatalogEntries.id })
      .from(pointCatalogEntries)
      .where(eq(pointCatalogEntries.versionId, versionId));
    await db.insert(pointCatalogEntries).values({
      versionId,
      divisionName: normalizedDivision,
      workName,
      pointValue: pointValue.toFixed(2),
      unitDescription: unitDescription ?? null,
      externalRowNumber: existingCount.length + 1,
    });
  }

  revalidatePath("/performance");
  return { success: true };
}

export async function deleteCatalogEntry(entryId: string) {
  const authError = await checkRole(["HRD", "SUPER_ADMIN"]);
  if (authError) return authError;

  const activeVersionId = await getOrCreateActiveVersion();
  const deleted = await db
    .delete(pointCatalogEntries)
    .where(
      and(
        eq(pointCatalogEntries.id, entryId),
        eq(pointCatalogEntries.versionId, activeVersionId)
      )
    )
    .returning({ id: pointCatalogEntries.id });

  if (deleted.length === 0) {
    return { error: "Entry tidak ditemukan atau bukan bagian dari versi aktif." };
  }

  revalidatePath("/performance");
  return { success: true };
}

export async function clearAllCatalogData() {
  const authError = await checkRole(["SUPER_ADMIN"]);
  if (authError) return authError;

  await db.transaction(async (tx) => {
    await tx.delete(dailyActivityEntries);
    await tx.delete(pointCatalogVersions);
  });

  revalidatePath("/performance");
  return { success: true };
}

export async function importCatalogEntriesFromXlsx(formData: FormData) {
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

  const header = (rows[0] as unknown[]).map((h) => String(h).trim().toUpperCase());
  const divisiIdx = header.findIndex((h) => h.includes("DIVISI"));
  const pekerjaanIdx = header.findIndex(
    (h) => h.includes("JENIS") || h.includes("PEKERJAAN")
  );
  const poinIdx = header.findIndex((h) => h === "POIN" || h.includes("POIN"));
  const keteranganIdx = header.findIndex(
    (h) => h.includes("KETERANGAN") || h.includes("SATUAN")
  );

  if (divisiIdx === -1 || pekerjaanIdx === -1 || poinIdx === -1) {
    return {
      error:
        "Header kolom tidak sesuai. Pastikan ada kolom: DIVISI, JENIS PEKERJAAN, POIN.",
    };
  }

  type ParsedRow = { divisionName: string; workName: string; pointValue: number; unitDescription: string | null };
  const entries: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const divisionName = String(row[divisiIdx] ?? "").trim().toUpperCase();
    const workName = String(row[pekerjaanIdx] ?? "").trim();
    const rawPoin = row[poinIdx];
    const unitDescription =
      keteranganIdx >= 0 ? (String(row[keteranganIdx] ?? "").trim() || null) : null;

    if (!divisionName || !workName) continue;
    const pointValue =
      typeof rawPoin === "number"
        ? rawPoin
        : Number(String(rawPoin).replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(pointValue) || pointValue <= 0) continue;

    entries.push({ divisionName, workName, pointValue, unitDescription });
  }

  if (entries.length === 0) {
    return { error: "Tidak ada baris data valid yang ditemukan." };
  }

  const versionId = await getOrCreateActiveVersion();
  const importedDivisions = [...new Set(entries.map((e) => e.divisionName))];

  // Fetch existing entries untuk divisi yang diimport (untuk upsert logic)
  // Fetch semua existing entries versi aktif lalu filter di JS (simpler, aman untuk FK restrict)
  const existingEntries = await db
    .select({
      id: pointCatalogEntries.id,
      divisionName: pointCatalogEntries.divisionName,
      workName: pointCatalogEntries.workName,
      externalRowNumber: pointCatalogEntries.externalRowNumber,
    })
    .from(pointCatalogEntries)
    .where(eq(pointCatalogEntries.versionId, versionId));

  // Buat lookup key: UPPER(divisionName) + "||" + UPPER(workName)
  const existingMap = new Map<string, { id: string; externalRowNumber: number | null }>();
  for (const row of existingEntries) {
    const key = `${row.divisionName.toUpperCase()}||${row.workName.toUpperCase()}`;
    existingMap.set(key, { id: row.id, externalRowNumber: row.externalRowNumber });
  }

  const toUpdate: Array<{ id: string; pointValue: string; unitDescription: string | null }> = [];
  const toInsert: Array<{ divisionName: string; workName: string; pointValue: string; unitDescription: string | null; externalRowNumber: number }> = [];

  // Hitung max externalRowNumber untuk insert baru
  const maxRowNum = existingEntries.reduce(
    (max, row) => Math.max(max, row.externalRowNumber ?? 0),
    0
  );
  let nextRowNum = maxRowNum + 1;

  for (const e of entries) {
    const key = `${e.divisionName.toUpperCase()}||${e.workName.toUpperCase()}`;
    const existing = existingMap.get(key);
    if (existing) {
      toUpdate.push({ id: existing.id, pointValue: e.pointValue.toFixed(2), unitDescription: e.unitDescription });
    } else {
      toInsert.push({
        divisionName: e.divisionName,
        workName: e.workName,
        pointValue: e.pointValue.toFixed(2),
        unitDescription: e.unitDescription,
        externalRowNumber: nextRowNum++,
      });
    }
  }

  await db.transaction(async (tx) => {
    // Update satu per satu (tidak ada bulk update di Drizzle tanpa raw SQL)
    for (const upd of toUpdate) {
      await tx
        .update(pointCatalogEntries)
        .set({ pointValue: upd.pointValue, unitDescription: upd.unitDescription, updatedAt: new Date() })
        .where(eq(pointCatalogEntries.id, upd.id));
    }

    if (toInsert.length > 0) {
      await tx.insert(pointCatalogEntries).values(
        toInsert.map((e) => ({
          versionId,
          divisionName: e.divisionName,
          workName: e.workName,
          pointValue: e.pointValue,
          unitDescription: e.unitDescription,
          externalRowNumber: e.externalRowNumber,
        }))
      );
    }
  });

  revalidatePath("/performance");
  return {
    success: true,
    importedEntries: entries.length,
    updatedEntries: toUpdate.length,
    insertedEntries: toInsert.length,
    importedDivisions: importedDivisions.length,
  };
}
