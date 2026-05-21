import { z } from "zod";

const overtimePlacementSchema = z.enum(["BEFORE_SHIFT", "AFTER_SHIFT"]);

export const overtimeRequestSchema = z.object({
  requestDate: z.coerce.date({ message: "Tanggal overtime wajib diisi." }),
  overtimeType: z.enum([
    "OVERTIME_3H",
    "LEMBUR_FULLDAY",
    "PATCH_ABSENCE_3H",
  ]),
  overtimePlacement: overtimePlacementSchema.optional().default("AFTER_SHIFT"),
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(500),
}).superRefine((value, ctx) => {
  if (value.overtimeType === "OVERTIME_3H" && !value.overtimePlacement) {
    ctx.addIssue({
      code: "custom",
      message: "Posisi overtime 3 jam wajib dipilih.",
      path: ["overtimePlacement"],
    });
  }
});

export const overtimeDecisionSchema = z.object({
  requestId: z.string().uuid("ID pengajuan overtime tidak valid."),
  action: z.enum(["APPROVE", "REJECT"]),
  reviewNotes: z.string().trim().max(500).optional(),
});

export const overtimeDeleteSchema = z.object({
  requestId: z.string().uuid("ID pengajuan overtime tidak valid."),
});

export const spvSelfOvertimeRequestSchema = z.object({
  requestDate: z.coerce.date({ message: "Tanggal lembur wajib diisi." }),
  overtimeType: z.enum([
    "OVERTIME_3H",
    "LEMBUR_FULLDAY",
  ]),
  overtimePlacement: overtimePlacementSchema.optional().default("AFTER_SHIFT"),
  reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(500),
}).superRefine((value, ctx) => {
  if (value.overtimeType === "OVERTIME_3H" && !value.overtimePlacement) {
    ctx.addIssue({
      code: "custom",
      message: "Posisi overtime 3 jam wajib dipilih.",
      path: ["overtimePlacement"],
    });
  }
});

export const spvScheduleOvertimeSchema = z.object({
  employeeId: z.string().uuid("Karyawan tujuan tidak valid."),
  requestDate: z.coerce.date({ message: "Tanggal lembur wajib diisi." }),
  overtimeType: z.enum([
    "OVERTIME_3H",
    "LEMBUR_FULLDAY",
  ]),
  overtimePlacement: overtimePlacementSchema.optional().default("AFTER_SHIFT"),
  reason: z.string().trim().min(3, "Catatan minimal 3 karakter.").max(500),
}).superRefine((value, ctx) => {
  if (value.overtimeType === "OVERTIME_3H" && !value.overtimePlacement) {
    ctx.addIssue({
      code: "custom",
      message: "Posisi overtime 3 jam wajib dipilih.",
      path: ["overtimePlacement"],
    });
  }
});

export const overtimeDraftItemSchema = z.object({
  jobId: z.string().trim().min(1, "Job ID wajib diisi.").max(100),
  workName: z.string().trim().min(1, "Jenis pekerjaan wajib diisi.").max(200),
  quantity: z.coerce.number().min(0.01, "Qty minimal 0.01."),
  pointValue: z.coerce.number().min(0, "Poin tidak valid."),
  notes: z.string().trim().max(500).optional(),
});

export const overtimeDraftSubmitSchema = z.object({
  requestId: z.string().uuid("Request lembur tidak valid."),
  items: z.array(overtimeDraftItemSchema).min(1, "Isi minimal 1 draft pekerjaan."),
});

export type OvertimeRequestInput = z.infer<typeof overtimeRequestSchema>;
export type OvertimeDecisionInput = z.infer<typeof overtimeDecisionSchema>;
export type OvertimeDeleteInput = z.infer<typeof overtimeDeleteSchema>;
export type SpvSelfOvertimeRequestInput = z.infer<typeof spvSelfOvertimeRequestSchema>;
export type SpvScheduleOvertimeInput = z.infer<typeof spvScheduleOvertimeSchema>;
export type OvertimeDraftSubmitInput = z.infer<typeof overtimeDraftSubmitSchema>;
