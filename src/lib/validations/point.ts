import { z } from "zod";

export const pointCatalogSyncSchema = z.object({
  workbookPath: z.string().trim().min(1, "Path workbook wajib diisi."),
  versionCode: z.string().trim().min(1, "Kode versi wajib diisi.").max(50),
  effectiveStartDate: z.coerce.date({ message: "Tanggal efektif wajib diisi." }),
  notes: z.string().trim().optional().transform((value) => value || undefined),
  activateVersion: z.boolean().default(true),
});

export type PointCatalogSyncInput = z.infer<typeof pointCatalogSyncSchema>;

export const dailyActivityEntrySchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid("Karyawan tidak valid."),
  workDate: z.coerce.date({ message: "Tanggal kerja wajib diisi." }),
  totalPoints: z.coerce.number().positive("Total poin harus lebih besar dari 0."),
  notes: z.string().trim().optional().transform((value) => value || undefined),
});

export const dailyActivityDecisionSchema = z.object({
  activityEntryId: z.string().uuid("Aktivitas tidak valid."),
  notes: z.string().trim().optional().transform((value) => value || undefined),
});

export const monthlyPerformanceGenerationSchema = z.object({
  periodStartDate: z.coerce.date({ message: "Tanggal awal periode wajib diisi." }),
  periodEndDate: z.coerce.date({ message: "Tanggal akhir periode wajib diisi." }),
}).superRefine((value, ctx) => {
  if (value.periodEndDate < value.periodStartDate) {
    ctx.addIssue({
      code: "custom",
      path: ["periodEndDate"],
      message: "Tanggal akhir periode tidak boleh lebih awal dari tanggal awal.",
    });
  }
});

export const managerialMonthlyPerformanceInputSchema = z.object({
  periodCode: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Periode wajib format YYYY-MM."),
  performancePercent: z.coerce.number().min(0, "Persentase minimal 0%.").max(200, "Persentase maksimal 200%."),
  notes: z.string().trim().optional().transform((value) => value || undefined),
});

export const employeeMonthlyPerformanceInputSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid."),
  periodCode: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Periode wajib format YYYY-MM."),
  performancePercent: z.coerce.number().min(0, "Persentase minimal 0%.").max(200, "Persentase maksimal 200%."),
  notes: z.string().trim().optional().transform((value) => value || undefined),
});

export const upsertCatalogEntrySchema = z.object({
  id: z.string().uuid().optional(),
  divisionName: z.string().trim().min(1, "Divisi wajib diisi."),
  workName: z.string().trim().min(1, "Nama pekerjaan wajib diisi."),
  pointValue: z.coerce.number().positive("Nilai poin harus lebih besar dari 0."),
  unitDescription: z.string().trim().optional().transform((v) => v || undefined),
});

export type UpsertCatalogEntryInput = z.infer<typeof upsertCatalogEntrySchema>;

export const batchSubmitDraftSchema = z.object({
  workDate: z.coerce.date({ message: "Tanggal kerja wajib diisi." }),
  items: z
    .array(
      z.object({
        pointCatalogEntryId: z.string().uuid("Katalog pekerjaan tidak valid."),
        jobId: z.string().trim().optional().transform((value) => value || undefined),
        quantity: z.coerce.number().positive("Qty harus lebih besar dari 0."),
      })
    )
    .min(1, "Tambahkan minimal 1 aktivitas."),
});

export type DailyActivityEntryInput = z.infer<typeof dailyActivityEntrySchema>;
export type DailyActivityDecisionInput = z.infer<typeof dailyActivityDecisionSchema>;
export type MonthlyPerformanceGenerationInput = z.infer<typeof monthlyPerformanceGenerationSchema>;
export type ManagerialMonthlyPerformanceInput = z.infer<typeof managerialMonthlyPerformanceInputSchema>;
export type EmployeeMonthlyPerformanceInput = z.infer<typeof employeeMonthlyPerformanceInputSchema>;
export type BatchSubmitDraftInput = z.infer<typeof batchSubmitDraftSchema>;

// Schema untuk menambah job ID ke draft yang sudah pending (tanpa hapus entri existing)
export const appendToPendingDraftSchema = batchSubmitDraftSchema;
export type AppendToPendingDraftInput = z.infer<typeof appendToPendingDraftSchema>;

// Schema untuk edit satu entri pending (DIAJUKAN/DIAJUKAN_ULANG)
export const updatePendingActivityEntrySchema = z.object({
  id: z.string().uuid("ID aktivitas tidak valid."),
  pointCatalogEntryId: z.string().uuid("Katalog pekerjaan tidak valid."),
  jobId: z.string().trim().optional().transform((v) => v || undefined),
  quantity: z.coerce.number().positive("Qty harus lebih besar dari 0."),
});
export type UpdatePendingActivityEntryInput = z.infer<typeof updatePendingActivityEntrySchema>;
