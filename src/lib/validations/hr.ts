import { z } from "zod";

export const createTicketSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid.").optional().or(z.literal("")),
  ticketType: z.enum([
    "CUTI",
    "CUTI_TAHUNAN",
    "CUTI_BULANAN",
    "CUTI_HAMIL_LAHIR",
    "CUTI_NIKAH",
    "SAKIT",
    "IZIN",
    "IZIN_ACARA",
    "IZIN_JAM",
    "MENINGGAL",
    "EMERGENCY",
    "RESIGN",
  ]),
  startDate: z.coerce.date({ message: "Tanggal mulai wajib diisi." }),
  endDate: z.coerce.date({ message: "Tanggal akhir wajib diisi." }),
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter."),
  attachmentUrl: z.string().trim().url().optional().or(z.literal("")),
  izinHours: z.coerce.number().int().min(1).max(8).optional(),
}).superRefine((v, ctx) => {
  if (v.endDate < v.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Tanggal akhir tidak boleh sebelum tanggal mulai." });
  }

  if (v.ticketType === "IZIN_JAM") {
    if (!v.izinHours || v.izinHours < 1 || v.izinHours > 8) {
      ctx.addIssue({ code: "custom", path: ["izinHours"], message: "Izin jam harus diisi antara 1–8 jam." });
    }
  }

  const daysCount = Math.max(1, Math.ceil((v.endDate.getTime() - v.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const needsAttachment = v.ticketType === "SAKIT" && daysCount > 1;

  if (needsAttachment && !v.attachmentUrl?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["attachmentUrl"],
      message: "Surat dokter wajib dilampirkan untuk sakit lebih dari 1 hari.",
    });
  }
});

export const ticketDecisionSchema = z.object({
  ticketId: z.string().uuid("Tiket tidak valid."),
  notes: z.string().trim().optional().transform((v) => v || undefined),
  rejectionReason: z.string().trim().optional().transform((v) => v || undefined),
  payrollImpact: z.enum(["UNPAID", "PAID_QUOTA_MONTHLY", "PAID_QUOTA_ANNUAL"]).optional(),
});

export const createReviewSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid."),
  periodStartDate: z.coerce.date({ message: "Periode awal wajib diisi." }),
  periodEndDate: z.coerce.date({ message: "Periode akhir wajib diisi." }),
  sopQualityScore: z.coerce.number().int().min(1).max(5),
  instructionScore: z.coerce.number().int().min(1).max(5),
  attendanceDisciplineScore: z.coerce.number().int().min(1).max(5),
  initiativeTeamworkScore: z.coerce.number().int().min(1).max(5),
  processMissScore: z.coerce.number().int().min(1).max(5),
  reviewNotes: z.string().trim().optional().transform((v) => v || undefined),
});

export const createIncidentSchema = z.object({
  employeeId: z.string().uuid("Karyawan tidak valid."),
  incidentType: z.enum(["KOMPLAIN", "MISS_PROSES", "TELAT", "AREA_KOTOR", "PELANGGARAN", "SP1", "SP2", "PENGHARGAAN"]),
  incidentDate: z.coerce.date({ message: "Tanggal kejadian wajib diisi." }),
  description: z.string().trim().min(5, "Deskripsi minimal 5 karakter."),
  impact: z.enum(["REVIEW_ONLY", "PAYROLL_POTENTIAL", "NONE"]).default("REVIEW_ONLY"),
  payrollDeduction: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional().transform((v) => v || undefined),
});

export const deleteIncidentSchema = z.object({
  incidentId: z.string().uuid("Incident tidak valid."),
});

export const alphaActionSchema = z.object({
  alphaEventId: z.string().uuid("Event ALPHA tidak valid."),
  notes: z.string().trim().optional().transform((v) => v || undefined),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export const IZIN_JAM_DEDUCTION_PER_HOUR = 5_000;
export type TicketDecisionInput = z.infer<typeof ticketDecisionSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type DeleteIncidentInput = z.infer<typeof deleteIncidentSchema>;
export type AlphaActionInput = z.infer<typeof alphaActionSchema>;
