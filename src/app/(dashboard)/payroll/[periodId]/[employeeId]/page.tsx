import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPayrollEmployeeDetail } from "@/server/actions/payroll";
import { buildPayslipBreakdown } from "@/server/payroll-engine/build-payslip-breakdown";

type PageProps = {
  params: Promise<{
    periodId: string;
    employeeId: string;
  }>;
};

function formatCurrency(amount: number) {
  return `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}

function formatIncidentPayrollImpact(
  incidentType: string,
  payrollDeduction: string | number | null | undefined
) {
  if (incidentType === "SP1" || incidentType === "SP2") {
    return `Penalty performa -${incidentType === "SP2" ? 20 : 10}%`;
  }

  return `Potongan: ${payrollDeduction ? formatCurrency(Number(payrollDeduction)) : "-"}`;
}

export default async function PayrollEmployeeDetailPage({ params }: PageProps) {
  const { periodId, employeeId } = await params;
  const detailResult = await getPayrollEmployeeDetail(periodId, employeeId);

  if ("error" in detailResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Detail Payroll</h2>
            <p className="text-sm text-slate-500">Detail payroll tidak dapat ditampilkan.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/payroll">Kembali ke Payroll</Link>
          </Button>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {detailResult.error}
        </div>
      </div>
    );
  }

  const { detail, performance, adjustments, tickets, incidents, viewerCanReadPayrollWorkspace } = detailResult;
  const backHref = viewerCanReadPayrollWorkspace ? `/payroll?periodId=${detail.periodId}` : "/dashboard";
  const backLabel = viewerCanReadPayrollWorkspace ? "Kembali ke Payroll" : "Kembali ke Dashboard";
  const periodStartDate = detail.periodStartDate;
  const periodEndDate = detail.periodEndDate;
  if (!periodStartDate || !periodEndDate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Detail Payroll</h2>
            <p className="text-sm text-slate-500">Data periode payroll tidak lengkap.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/payroll">Kembali ke Payroll</Link>
          </Button>
        </div>
      </div>
    );
  }
  const breakdownMeta = (detail.breakdown ?? {}) as {
    fulltimeEligible?: boolean;
    disciplineEligible?: boolean;
    hasLateIncident?: boolean;
    approvedUnpaidLeaveDays?: number;
    approvedPaidLeaveDays?: number;
    unpaidLeaveDeductionAmount?: number;
    incidentDeductionAmount?: number;
    izinJamDeductionAmount?: number;
    manualAdjustmentAmount?: number;
    scheduledWorkDays?: number;
    activeEmploymentDays?: number;
    attendanceHasData?: boolean;
    attendanceRecordedWorkDays?: number;
    attendancePresentDays?: number;
    attendanceAbsenceDays?: number;
    attendanceLateDays?: number;
    attendanceFulltimeEligible?: boolean;
    attendanceDisciplineEligible?: boolean;
    disciplinePerformanceEligible?: boolean;
    rawPerformancePercent?: number;
    adjustedPerformancePercent?: number;
    spPerformancePenaltyType?: string;
    spPerformancePenaltyPercent?: number;
  };
  const rawPerformancePercent = Number(
    breakdownMeta.rawPerformancePercent ?? detail.performancePercent
  );
  const adjustedPerformancePercent = Number(
    breakdownMeta.adjustedPerformancePercent ?? detail.performancePercent
  );
  const spPerformancePenaltyPercent = Number(breakdownMeta.spPerformancePenaltyPercent ?? 0);
  const spPerformancePenaltyType = breakdownMeta.spPerformancePenaltyType ?? "NONE";

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
    incidentDeductionAmount: Number(
      breakdownMeta.incidentDeductionAmount ?? Number(detail.incidentDeductionAmount)
    ),
    unpaidLeaveDeductionAmount: Number(
      breakdownMeta.unpaidLeaveDeductionAmount ?? 0
    ),
    izinJamDeductionAmount: Number(breakdownMeta.izinJamDeductionAmount ?? 0),
    manualAdjustmentAmount: Number(
      breakdownMeta.manualAdjustmentAmount ?? Number(detail.manualAdjustmentAmount)
    ),
    takeHomePay: Number(detail.takeHomePay),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Detail Payroll</h2>
          <p className="text-sm text-slate-500">
            {detail.employeeName} · {detail.employeeCode} · {detail.periodCode}
          </p>
          <p className="text-sm text-slate-500">
            {format(periodStartDate, "yyyy-MM-dd")} s.d. {format(periodEndDate, "yyyy-MM-dd")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{detail.payrollStatus}</Badge>
          <Badge variant={detail.periodStatus === "FINALIZED" || detail.periodStatus === "PAID" || detail.periodStatus === "LOCKED" ? "default" : "secondary"}>
            {detail.periodStatus}
          </Badge>
          <Button asChild variant="outline">
            <a href={`/payroll/${detail.periodId}/${detail.employeeId}/payslip.pdf`} target="_blank" rel="noreferrer">
              Export PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{payslipBreakdown.takeHomePayLabel}</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(Number(detail.takeHomePay))}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{payslipBreakdown.totalAdditionsLabel}</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(payslipBreakdown.totalAdditions)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Total Potongan</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(payslipBreakdown.totalDeductions)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Performa</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{adjustedPerformancePercent.toFixed(2)}%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Struktur Slip</h3>
            <p className="text-sm text-slate-500">Komponen addition dan deduction yang membentuk THP.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Penambahan</h4>
              <div className="space-y-2">
                {payslipBreakdown.additions.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">{item.label}</span>
                    <span className="text-sm font-medium text-slate-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Potongan</h4>
              <div className="space-y-2">
                {payslipBreakdown.deductions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                    Tidak ada potongan pada periode ini.
                  </div>
                ) : (
                  payslipBreakdown.deductions.map((item) => (
                    <div key={item.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-600">{item.label}</span>
                      <span className="text-sm font-medium text-slate-900">{formatCurrency(item.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Snapshot Payroll</h3>
            <p className="text-sm text-slate-500">Data yang dipakai payroll saat preview/finalisasi dibentuk.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Cabang</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.branchName ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Divisi Snapshot</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.divisionName}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Jabatan Snapshot</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.positionName}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Grade Snapshot</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.gradeName ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Hari Kerja Target</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{breakdownMeta.scheduledWorkDays ?? detail.scheduledWorkDays}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Hari Aktif Kerja</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{breakdownMeta.activeEmploymentDays ?? detail.activeEmploymentDays}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Performa & Rule</h3>
            <p className="text-sm text-slate-500">Ringkasan performa final yang menjadi basis bonus kinerja atau KPI.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Performa Awal</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{rawPerformancePercent.toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Penalty SP</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {spPerformancePenaltyPercent > 0
                  ? `${spPerformancePenaltyType} -${spPerformancePenaltyPercent}%`
                  : "-"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Performa Payroll</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{adjustedPerformancePercent.toFixed(2)}%</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total Approved Point</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{Number(detail.totalApprovedPoints).toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total Target Point</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{Number(detail.totalTargetPoints).toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unpaid Leave Days</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.approvedUnpaidLeaveDays}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Paid Leave Days</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{detail.approvedPaidLeaveDays}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Data Absensi</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {breakdownMeta.attendanceHasData ? "Ada" : "Belum Ada"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Absensi Hadir</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {breakdownMeta.attendancePresentDays ?? 0} / {breakdownMeta.attendanceRecordedWorkDays ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Telat / Absen</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {breakdownMeta.attendanceLateDays ?? 0} / {breakdownMeta.attendanceAbsenceDays ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Fulltime Eligible</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{breakdownMeta.fulltimeEligible ? "Ya" : "Tidak"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Discipline Eligible</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{breakdownMeta.disciplineEligible ? "Ya" : "Tidak"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Disiplin Min 80%</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{breakdownMeta.disciplinePerformanceEligible ? "Ya" : "Tidak"}</p>
            </div>
          </div>
          {performance ? (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-900">{performance.divisionSnapshotName}</p>
              <p className="mt-1 text-sm text-slate-500">
                Target harian {performance.targetDailyPoints.toLocaleString("id-ID")} · target days {performance.targetDays}
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Adjustment Manual</h3>
            <p className="text-sm text-slate-500">Penyesuaian manual periode ini untuk karyawan terkait.</p>
          </div>
          {adjustments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
              Tidak ada adjustment manual.
            </div>
          ) : (
            <div className="space-y-2">
              {adjustments.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={item.adjustmentType === "ADDITION" ? "default" : "secondary"}>
                      {item.adjustmentType}
                    </Badge>
                    <span className="text-sm font-medium text-slate-900">{formatCurrency(Number(item.amount))}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">{format(item.createdAt, "yyyy-MM-dd HH:mm")}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Ticket Approved</h3>
            <p className="text-sm text-slate-500">Ticket yang memengaruhi target dan payroll di periode ini.</p>
          </div>
          {tickets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
              Tidak ada ticket approved dalam periode ini.
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{ticket.ticketType}</Badge>
                    <span className="text-xs text-slate-500">
                      {format(ticket.startDate, "yyyy-MM-dd")} s.d. {format(ticket.endDate, "yyyy-MM-dd")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{ticket.reason}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Impact: {ticket.payrollImpact ?? "-"} · {ticket.daysCount} hari
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Incident</h3>
            <p className="text-sm text-slate-500">Incident aktif yang berdampak pada payroll/performa periode ini.</p>
          </div>
          {incidents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
              Tidak ada incident aktif dalam periode ini.
            </div>
          ) : (
            <div className="space-y-2">
              {incidents.map((incident) => (
                <div key={incident.id} className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{incident.incidentType}</Badge>
                    <span className="text-xs text-slate-500">{format(incident.incidentDate, "yyyy-MM-dd")}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{incident.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Impact: {incident.impact} · {formatIncidentPayrollImpact(incident.incidentType, incident.payrollDeduction)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
