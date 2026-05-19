import { getMyDashboard } from "@/server/actions/me";
import { db } from "@/lib/db";
import { employeeAlerts, leaveQuotas } from "@/lib/db/schema/hr";
import { buildPayslipBreakdown } from "@/server/payroll-engine/build-payslip-breakdown";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Settings,
  Ticket,
  TrendingUp,
  XCircle,
} from "lucide-react";
import TakeHomePayCard from "./TakeHomePayCard";

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return `Rp ${num.toLocaleString("id-ID")}`;
}

function formatPercent(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return `${num.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? "bg-teal-50" : "bg-slate-50"}`}>
          <Icon size={15} className={accent ? "text-teal-600" : "text-slate-400"} />
        </div>
      </div>
      <p className={`text-2xl font-extrabold tracking-tight ${accent ? "text-teal-600" : "text-slate-800"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function QuickLinkCard({
  label,
  description,
  href,
  icon: Icon,
  color,
}: {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:border-teal-200 transition-all duration-150"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors">
          {label}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </Link>
  );
}


export default async function EmployeeDashboard() {
  const data = await getMyDashboard();

  // If not linked to employee, show warning
  if (data.emptyReason) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex gap-4">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Akun Belum Terhubung</p>
            <p className="text-sm text-amber-700 mt-1">{data.emptyReason}</p>
          </div>
        </div>
      </div>
    );
  }

  const { employee, latestPerformance, latestPayroll, incidentSummary, teamworkActivitySummary, role } = data;

  // Fetch leave quota
  const currentYear = new Date().getFullYear();
  let leaveQuota = null;
  let alerts: {
    id: string;
    alertType: string;
    title: string;
    message: string;
    createdAt: Date;
  }[] = [];
  if (employee?.id) {
    const quotaRows = await db
      .select()
      .from(leaveQuotas)
      .where(
        and(
          eq(leaveQuotas.employeeId, employee.id),
          eq(leaveQuotas.year, currentYear)
        )
      )
      .limit(1);
    leaveQuota = quotaRows[0] ?? null;
    alerts = await db
      .select({
        id: employeeAlerts.id,
        alertType: employeeAlerts.alertType,
        title: employeeAlerts.title,
        message: employeeAlerts.message,
        createdAt: employeeAlerts.createdAt,
      })
      .from(employeeAlerts)
      .where(eq(employeeAlerts.employeeId, employee.id))
      .orderBy(desc(employeeAlerts.createdAt))
      .limit(5);
  }

  const isTeamwork = role === "TEAMWORK";

  const performancePercent = latestPerformance
    ? formatPercent(latestPerformance.performancePercent)
    : "—";

  const performanceSub = latestPerformance
    ? isTeamwork
      ? `MINGGUAN: ${latestPerformance.weeklyPercent}%  |  HARIAN: ${latestPerformance.dailyPercent}%`
      : `PERIODE: ${latestPerformance.periodEndDate.toISOString().slice(0, 7)}`
    : "Belum ada data";

  const approvedPoints = latestPerformance
    ? `${Math.round(parseFloat(latestPerformance.totalApprovedPoints ?? "0")).toLocaleString("id-ID")} / ${latestPerformance.totalTargetPoints.toLocaleString("id-ID")}`
    : "—";

  const approvedPointsSub = latestPerformance
    ? `PROGRESS: ${latestPerformance.progressPercent}%`
    : "Belum ada data";

  const takeHomePay = latestPayroll
    ? formatCurrency(latestPayroll.takeHomePay)
    : "—";

  const breakdownMeta = (latestPayroll?.breakdown ?? {}) as {
    unpaidLeaveDeductionAmount?: number;
    incidentDeductionAmount?: number;
    manualAdjustmentAmount?: number;
  };

  const thpBreakdown =
    latestPayroll && employee
      ? buildPayslipBreakdown({
          employeeGroup: employee.employeeGroup,
          baseSalaryPaid: Number(latestPayroll.baseSalaryPaid),
          gradeAllowancePaid: Number(latestPayroll.gradeAllowancePaid),
          tenureAllowancePaid: Number(latestPayroll.tenureAllowancePaid),
          dailyAllowancePaid: Number(latestPayroll.dailyAllowancePaid),
          overtimeAmount: Number(latestPayroll.overtimeAmount),
          bonusFulltimeAmount: Number(latestPayroll.bonusFulltimeAmount),
          bonusDisciplineAmount: Number(latestPayroll.bonusDisciplineAmount),
          bonusKinerjaAmount: Number(latestPayroll.bonusKinerjaAmount),
          bonusPrestasiAmount: Number(latestPayroll.bonusPrestasiAmount),
          bonusTeamAmount: Number(latestPayroll.bonusTeamAmount),
          incidentDeductionAmount: Number(
            breakdownMeta.incidentDeductionAmount ?? Number(latestPayroll.incidentDeductionAmount)
          ),
          unpaidLeaveDeductionAmount: Number(breakdownMeta.unpaidLeaveDeductionAmount ?? 0),
          manualAdjustmentAmount: Number(
            breakdownMeta.manualAdjustmentAmount ?? Number(latestPayroll.manualAdjustmentAmount)
          ),
          takeHomePay: Number(latestPayroll.takeHomePay),
        })
      : null;

  const activeIncidents = incidentSummary?.activeCount ?? 0;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Stats Row */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Ringkasan Bulan Ini
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Performa"
            value={performancePercent}
            sub={performanceSub}
            accent
            icon={TrendingUp}
          />
          <StatCard
            label="Poin Disetujui"
            value={approvedPoints}
            sub={approvedPointsSub}
            icon={BarChart3}
          />
          <TakeHomePayCard
            value={takeHomePay}
            sub={latestPayroll ? latestPayroll.periodCode : "Belum ada data payroll"}
            breakdown={thpBreakdown}
          />
          <StatCard
            label="Incident Aktif"
            value={activeIncidents}
            sub={
              incidentSummary?.latestIncidentType
                ? `Terakhir: ${incidentSummary.latestIncidentType}`
                : "Tidak ada catatan"
            }
            icon={AlertTriangle}
          />
        </div>
      </section>

      {/* Middle Row: Activity + Leave Quota */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Status */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity size={15} className="text-teal-500" />
              Status Aktivitas
            </h3>
            <Link
              href="/performance"
              className="text-xs text-teal-600 hover:text-teal-800 font-semibold transition-colors"
            >
              Lihat semua →
            </Link>
          </div>

          {teamworkActivitySummary ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-amber-600" />
                  <span className="text-xs font-medium text-amber-900">Perlu Disubmit</span>
                </div>
                <span className="text-sm font-bold text-amber-700">
                  {teamworkActivitySummary.needsSubmitCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-blue-600" />
                  <span className="text-xs font-medium text-blue-900">Menunggu Persetujuan</span>
                </div>
                <span className="text-sm font-bold text-blue-700">
                  {teamworkActivitySummary.pendingApprovalCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-teal-50 border border-teal-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-teal-600" />
                  <span className="text-xs font-medium text-teal-900">Disetujui</span>
                </div>
                <span className="text-sm font-bold text-teal-700">
                  {teamworkActivitySummary.approvedCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-red-50 border border-red-100">
                <div className="flex items-center gap-2">
                  <XCircle size={13} className="text-red-500" />
                  <span className="text-xs font-medium text-red-900">Ditolak</span>
                </div>
                <span className="text-sm font-bold text-red-600">
                  {teamworkActivitySummary.rejectedCount}
                </span>
              </div>
              {teamworkActivitySummary.approvedPoints != null && (
                <div className="pt-1 border-t border-slate-100 mt-3">
                  <p className="text-xs text-slate-500">
                    Total poin disetujui:{" "}
                    <span className="font-bold text-teal-700">
                      {parseFloat(String(teamworkActivitySummary.approvedPoints)).toFixed(0)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              Tidak ada data aktivitas dalam 30 hari terakhir.
            </p>
          )}
        </div>

        {/* Leave Quota */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Ticket size={15} className="text-teal-500" />
              Kuota Cuti & Izin
            </h3>
            <Link
              href="/tickets"
              className="text-xs text-teal-600 hover:text-teal-800 font-semibold transition-colors"
            >
              Buat tiket →
            </Link>
          </div>

          {leaveQuota ? (
            <div className="space-y-5">
              {/* Monthly quota */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Kuota Bulanan
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {leaveQuota.monthlyQuotaUsed} / {leaveQuota.monthlyQuotaTotal} digunakan
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        leaveQuota.monthlyQuotaTotal > 0
                          ? (leaveQuota.monthlyQuotaUsed / leaveQuota.monthlyQuotaTotal) * 100
                          : 0
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Sisa:{" "}
                  <span className="font-semibold text-slate-600">
                    {leaveQuota.monthlyQuotaTotal - leaveQuota.monthlyQuotaUsed} hari
                  </span>
                </p>
              </div>

              {/* Annual quota */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Kuota Tahunan
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    {leaveQuota.annualQuotaUsed} / {leaveQuota.annualQuotaTotal} digunakan
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        leaveQuota.annualQuotaTotal > 0
                          ? (leaveQuota.annualQuotaUsed / leaveQuota.annualQuotaTotal) * 100
                          : 0
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Sisa:{" "}
                  <span className="font-semibold text-slate-600">
                    {leaveQuota.annualQuotaTotal - leaveQuota.annualQuotaUsed} hari
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-400 pt-1 border-t border-slate-100">
                Tahun {leaveQuota.year}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              Data kuota cuti untuk tahun {currentYear} belum tersedia.
            </p>
          )}
        </div>
      </section>

      {/* Quick Links */}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h3 className="text-sm font-bold text-red-900 mb-3">Peringatan HRD</h3>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-md border border-red-200 bg-white px-3 py-2">
                <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                <p className="text-xs text-slate-600">{alert.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Akses Cepat
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <QuickLinkCard
            label="Input Aktivitas"
            description="Catat kegiatan harian"
            href="/performance"
            icon={BarChart3}
            color="bg-teal-50 text-teal-600"
          />
          <QuickLinkCard
            label="Tiket Izin"
            description="Ajukan cuti atau sakit"
            href="/tickets"
            icon={Ticket}
            color="bg-blue-50 text-blue-600"
          />
          <QuickLinkCard
            label="Jadwal Saya"
            description="Lihat jadwal kerja"
            href="/schedule"
            icon={Calendar}
            color="bg-violet-50 text-violet-600"
          />
          <QuickLinkCard
            label="Pengaturan"
            description="Atur profil akun"
            href="/settings"
            icon={Settings}
            color="bg-slate-100 text-slate-600"
          />
        </div>
      </section>
    </div>
  );
}
