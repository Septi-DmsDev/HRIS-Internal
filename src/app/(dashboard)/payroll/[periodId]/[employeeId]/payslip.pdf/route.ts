import { NextResponse } from "next/server";
import { format } from "date-fns";
import { getPayrollEmployeeDetail } from "@/server/actions/payroll";
import { buildPayslipBreakdown } from "@/server/payroll-engine/build-payslip-breakdown";
import { renderPayslipPdf } from "@/server/payroll-engine/render-payslip-pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    periodId: string;
    employeeId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { periodId, employeeId } = await context.params;
  const detailResult = await getPayrollEmployeeDetail(periodId, employeeId);

  if ("error" in detailResult) {
    return NextResponse.json({ error: detailResult.error }, { status: 403 });
  }

  const { detail } = detailResult;
  if (!detail.periodStartDate || !detail.periodEndDate) {
    return NextResponse.json({ error: "Data periode payroll tidak lengkap." }, { status: 500 });
  }

  const breakdownMeta = (detail.breakdown ?? {}) as {
    unpaidLeaveDeductionAmount?: number;
    incidentDeductionAmount?: number;
    izinJamDeductionAmount?: number;
    manualAdjustmentAmount?: number;
  };

  const payslipBreakdown = buildPayslipBreakdown({
    employeeGroup: detail.employeeGroup ?? "MITRA_KERJA",
    baseSalaryPaid: Number(detail.baseSalaryPaid),
    gradeAllowancePaid: Number(detail.gradeAllowancePaid),
    tenureAllowancePaid: Number(detail.tenureAllowancePaid),
    dailyAllowancePaid: Number(detail.dailyAllowancePaid),
    overtimeAmount: Number(detail.overtimeAmount),
    bonusFulltimeAmount: Number(detail.bonusFulltimeAmount),
    bonusDisciplineAmount: Number(detail.bonusDisciplineAmount),
    bonusKinerjaAmount: Number(detail.bonusKinerjaAmount),
    bonusPrestasiAmount: Number(detail.bonusPrestasiAmount),
    bonusTeamAmount: Number(detail.bonusTeamAmount),
    incidentDeductionAmount: Number(breakdownMeta.incidentDeductionAmount ?? Number(detail.incidentDeductionAmount)),
    unpaidLeaveDeductionAmount: Number(breakdownMeta.unpaidLeaveDeductionAmount ?? 0),
    izinJamDeductionAmount: Number(breakdownMeta.izinJamDeductionAmount ?? 0),
    manualAdjustmentAmount: Number(breakdownMeta.manualAdjustmentAmount ?? Number(detail.manualAdjustmentAmount)),
    takeHomePay: Number(detail.takeHomePay),
  });

  const pdfBuffer = await renderPayslipPdf({
    employeeName: detail.employeeName ?? "-",
    employeeCode: detail.employeeCode ?? "-",
    divisionName: detail.divisionName ?? "-",
    gradeName: detail.gradeName ?? "-",
    periodCode: detail.periodCode ?? "-",
    periodLabel: `${format(detail.periodStartDate, "yyyy-MM-dd")} s.d. ${format(detail.periodEndDate, "yyyy-MM-dd")}`,
    additions: payslipBreakdown.additions,
    deductions: payslipBreakdown.deductions,
    totalAdditions: payslipBreakdown.totalAdditions,
    totalDeductions: payslipBreakdown.totalDeductions,
    takeHomePay: payslipBreakdown.takeHomePay,
    totalAdditionsLabel: payslipBreakdown.totalAdditionsLabel,
    takeHomePayLabel: payslipBreakdown.takeHomePayLabel,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"payslip-${detail.periodCode}-${detail.employeeCode}.pdf\"`,
    },
  });
}
