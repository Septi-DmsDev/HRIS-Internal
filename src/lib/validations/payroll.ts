import { z } from "zod";

export const createPayrollPeriodSchema = z.object({
  periodCode: z.string().regex(/^\d{4}-\d{2}$/, "Format periode harus YYYY-MM."),
  notes: z.string().trim().max(500).optional(),
});

export const payrollPeriodActionSchema = z.object({
  periodId: z.uuid(),
});

export const ADJUSTMENT_CATEGORIES = [
  "MANUAL_ADDITION",
  "TRANSPORT",
  "BONUS_OMSET_1_CSM",
  "BONUS_OMSET_2_CSM",
  "BONUS_OMSET_3_CSM",
  "BONUS_KINERJA_CSM_TERTINGGI",
  "BONUS_COUNTER_MESIN",
  "GANTI_RUGI_PERSONAL",
  "GANTI_RUGI_TEAM",
  "BPJS",
  "CICILAN",
  "KASBON",
] as const;

export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];

export const ADJUSTMENT_CATEGORY_LABELS: Record<AdjustmentCategory, string> = {
  MANUAL_ADDITION: "Penambahan Manual",
  TRANSPORT: "Uang Transport",
  BONUS_OMSET_1_CSM: "Bonus Omset 1 CSM",
  BONUS_OMSET_2_CSM: "Bonus Omset 2 CSM",
  BONUS_OMSET_3_CSM: "Bonus Omset 3 CSM",
  BONUS_KINERJA_CSM_TERTINGGI: "Bonus Kinerja CSM Tertinggi",
  BONUS_COUNTER_MESIN: "Bonus Counter Mesin",
  GANTI_RUGI_PERSONAL: "Ganti Rugi Personal",
  GANTI_RUGI_TEAM: "Ganti Rugi Team",
  BPJS: "BPJS",
  CICILAN: "Cicilan",
  KASBON: "Kasbon",
};

export const payrollAdjustmentSchema = z.object({
  periodId: z.uuid(),
  employeeId: z.uuid(),
  category: z.enum(ADJUSTMENT_CATEGORIES),
  amount: z.coerce.number().positive(),
  description: z.string().trim().max(300).optional(),
  tenorMonthsRemaining: z.coerce.number().int().min(1).max(120).optional(),
});

export const deletePayrollAdjustmentSchema = z.object({
  periodId: z.uuid(),
  adjustmentId: z.uuid(),
  source: z.enum(["PERIOD", "RECURRING"]),
});

export const updatePayrollAdjustmentSchema = z.object({
  periodId: z.uuid(),
  adjustmentId: z.uuid(),
  source: z.enum(["PERIOD", "RECURRING"]),
  amount: z.coerce.number().positive(),
  description: z.string().trim().max(300).optional(),
  tenorMonthsRemaining: z.coerce.number().int().min(1).max(120).optional(),
});

export const managerialKpiSummarySchema = z.object({
  periodId: z.uuid(),
  employeeId: z.uuid(),
  performancePercent: z.coerce.number().min(0).max(200),
  notes: z.string().trim().max(500).optional(),
});

const optionalMoney = z.union([z.coerce.number().min(0), z.literal("")]).transform((value) =>
  value === "" ? undefined : value
);

export const salaryConfigSchema = z.object({
  employeeId: z.uuid(),
  baseSalaryAmount: optionalMoney.optional(),
  gradeAllowanceAmount: optionalMoney.optional(),
  tenureAllowanceAmount: optionalMoney.optional(),
  dailyAllowanceAmount: optionalMoney.optional(),
  performanceBonusBaseAmount: optionalMoney.optional(),
  achievementBonus140Amount: optionalMoney.optional(),
  achievementBonus165Amount: optionalMoney.optional(),
  fulltimeBonusAmount: optionalMoney.optional(),
  disciplineBonusAmount: optionalMoney.optional(),
  teamBonusAmount: optionalMoney.optional(),
  overtimeRateAmount: optionalMoney.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const gradeCompensationConfigSchema = z.object({
  gradeId: z.uuid(),
  allowanceAmount: optionalMoney.optional(),
  bonusKinerja80: optionalMoney.optional(),
  bonusKinerja90: optionalMoney.optional(),
  bonusKinerja100: optionalMoney.optional(),
  bonusKinerjaTeam80: optionalMoney.optional(),
  bonusKinerjaTeam90: optionalMoney.optional(),
  bonusKinerjaTeam100: optionalMoney.optional(),
  bonusDisiplin80: optionalMoney.optional(),
  bonusDisiplin90: optionalMoney.optional(),
  bonusDisiplin100: optionalMoney.optional(),
  bonusPrestasi140: optionalMoney.optional(),
  bonusPrestasi165: optionalMoney.optional(),
  isActive: z.boolean().optional(),
});

export type CreatePayrollPeriodInput = z.infer<typeof createPayrollPeriodSchema>;
export type PayrollPeriodActionInput = z.infer<typeof payrollPeriodActionSchema>;
export type PayrollAdjustmentInput = z.infer<typeof payrollAdjustmentSchema>;
export type DeletePayrollAdjustmentInput = z.infer<typeof deletePayrollAdjustmentSchema>;
export type UpdatePayrollAdjustmentInput = z.infer<typeof updatePayrollAdjustmentSchema>;
export type AdjustmentCategoryInput = AdjustmentCategory;
export type ManagerialKpiSummaryInput = z.infer<typeof managerialKpiSummarySchema>;
export type SalaryConfigInput = z.infer<typeof salaryConfigSchema>;
export type GradeCompensationConfigInput = z.infer<typeof gradeCompensationConfigSchema>;
