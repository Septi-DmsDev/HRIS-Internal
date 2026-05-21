import type { EmployeeGroup } from "@/lib/employee-groups";
import { isKpiEmployeeGroup } from "@/lib/employee-groups";
import { getPayslipLabels } from "@/lib/payslip-labels";

type PayslipBreakdownInput = {
  employeeGroup: EmployeeGroup;
  baseSalaryPaid: number;
  gradeAllowancePaid: number;
  tenureAllowancePaid: number;
  dailyAllowancePaid: number;
  overtimeAmount: number;
  bonusFulltimeAmount: number;
  bonusDisciplineAmount: number;
  bonusKinerjaAmount: number;
  bonusPrestasiAmount: number;
  bonusTeamAmount: number;
  incidentDeductionAmount: number;
  unpaidLeaveDeductionAmount: number;
  izinJamDeductionAmount?: number;
  manualAdjustmentAmount: number;
  takeHomePay: number;
};

type PayslipItem = {
  key: string;
  label: string;
  amount: number;
};

function positiveItems(items: PayslipItem[]) {
  return items.filter((item) => item.amount > 0);
}

export function buildPayslipBreakdown(input: PayslipBreakdownInput) {
  const labels = getPayslipLabels(input.employeeGroup);

  const isKpi = isKpiEmployeeGroup(input.employeeGroup);

  // Untuk mitra/training/borongan: baseSalaryPaid + bonusKinerjaAmount digabung jadi satu baris "Komisi/Fee"
  const baseSalaryLine: PayslipItem = isKpi
    ? { key: "baseSalaryPaid", label: labels.baseSalaryPaid, amount: input.baseSalaryPaid }
    : { key: "baseSalaryPaid", label: labels.baseSalaryPaid, amount: input.baseSalaryPaid + input.bonusKinerjaAmount };

  const additions = positiveItems([
    baseSalaryLine,
    // gradeAllowancePaid hanya untuk managerial/karyawan tetap
    ...(isKpi ? [{ key: "gradeAllowancePaid", label: labels.gradeAllowancePaid, amount: input.gradeAllowancePaid }] : []),
    { key: "tenureAllowancePaid", label: labels.tenureAllowancePaid, amount: input.tenureAllowancePaid },
    { key: "dailyAllowancePaid", label: labels.dailyAllowancePaid, amount: input.dailyAllowancePaid },
    { key: "overtimeAmount", label: labels.overtimeAmount, amount: input.overtimeAmount },
    { key: "bonusFulltimeAmount", label: labels.bonusFulltimeAmount, amount: input.bonusFulltimeAmount },
    { key: "bonusDisciplineAmount", label: labels.bonusDisciplineAmount, amount: input.bonusDisciplineAmount },
    // bonusKinerjaAmount hanya tampil sebagai baris terpisah untuk karyawan KPI (managerial/karyawan tetap)
    ...(isKpi ? [{ key: "bonusKinerjaAmount", label: labels.bonusKinerjaAmount, amount: input.bonusKinerjaAmount }] : []),
    { key: "bonusPrestasiAmount", label: labels.bonusPrestasiAmount, amount: input.bonusPrestasiAmount },
    { key: "bonusTeamAmount", label: labels.bonusTeamAmount, amount: input.bonusTeamAmount },
    {
      key: "manualAdjustmentAmount",
      label: labels.manualAddition,
      amount: input.manualAdjustmentAmount > 0 ? input.manualAdjustmentAmount : 0,
    },
  ]);

  const deductions = positiveItems([
    { key: "incidentDeductionAmount", label: labels.incidentDeductionAmount, amount: input.incidentDeductionAmount },
    { key: "unpaidLeaveDeductionAmount", label: labels.unpaidLeaveDeductionAmount, amount: input.unpaidLeaveDeductionAmount },
    { key: "izinJamDeductionAmount", label: "Potongan Izin Jam", amount: input.izinJamDeductionAmount ?? 0 },
    {
      key: "manualAdjustmentAmount",
      label: labels.manualDeduction,
      amount: input.manualAdjustmentAmount < 0 ? Math.abs(input.manualAdjustmentAmount) : 0,
    },
  ]);

  return {
    additions,
    deductions,
    totalAdditions: additions.reduce((sum, item) => sum + item.amount, 0),
    totalDeductions: deductions.reduce((sum, item) => sum + item.amount, 0),
    takeHomePay: input.takeHomePay,
    totalAdditionsLabel: labels.totalAdditions,
    takeHomePayLabel: labels.takeHomePay,
  };
}
