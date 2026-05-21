import { NextResponse } from "next/server";
import { format } from "date-fns";
import { getPayrollEmployeeDetail, getPayrollWorkspace } from "@/server/actions/payroll";
import { buildPayslipBreakdown } from "@/server/payroll-engine/build-payslip-breakdown";
import { renderPayslipBatchPdf } from "@/server/payroll-engine/render-payslip-pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    periodId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { periodId } = await context.params;
  const workspace = await getPayrollWorkspace(periodId);

  if ("error" in workspace) {
    return NextResponse.json({ error: workspace.error }, { status: 403 });
  }

  const period = workspace.selectedPeriod;
  if (!period) {
    return NextResponse.json({ error: "Periode payroll tidak ditemukan." }, { status: 404 });
  }

  const detailResults = await Promise.all(
    workspace.results.map((row) => getPayrollEmployeeDetail(periodId, row.employeeId))
  );

  const successfulDetails = detailResults.filter(
    (result): result is Exclude<(typeof detailResults)[number], { error: string }> => !("error" in result)
  );

  const slips = successfulDetails.map((result) => {
      const detail = result.detail;
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

      return {
        employeeName: detail.employeeName ?? "-",
        employeeCode: detail.employeeCode ?? "-",
        divisionName: detail.divisionName ?? "-",
        gradeName: detail.gradeName ?? "-",
        periodCode: detail.periodCode ?? period.periodCode,
        periodLabel: `${format(period.periodStartDate, "yyyy-MM-dd")} s.d. ${format(period.periodEndDate, "yyyy-MM-dd")}`,
        additions: payslipBreakdown.additions,
        deductions: payslipBreakdown.deductions,
        totalAdditions: payslipBreakdown.totalAdditions,
        totalDeductions: payslipBreakdown.totalDeductions,
        takeHomePay: payslipBreakdown.takeHomePay,
        totalAdditionsLabel: payslipBreakdown.totalAdditionsLabel,
        takeHomePayLabel: payslipBreakdown.takeHomePayLabel,
      };
    });

  if (slips.length === 0) {
    return NextResponse.json({ error: "Belum ada data slip gaji untuk periode ini." }, { status: 404 });
  }

  const pdfBuffer = await renderPayslipBatchPdf(slips);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"slips-${period.periodCode}.pdf\"`,
    },
  });
}
