import { getCurrentUserRoleRow } from "@/lib/auth/session";
import { getDashboardStats } from "@/server/actions/dashboard";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import EmployeeDashboard from "./EmployeeDashboard";
import type { UserRole } from "@/types";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "HRD", "FINANCE", "PAYROLL_VIEWER"];

const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  DIAJUKAN: "Diajukan",
  DITOLAK_SPV: "Ditolak SPV",
  REVISI_TW: "Revisi TW",
  DIAJUKAN_ULANG: "Diajukan Ulang",
  DISETUJUI_SPV: "Disetujui SPV",
  OVERRIDE_HRD: "Override HRD",
  DIKUNCI_PAYROLL: "Dikunci Payroll",
};

const ACTIVITY_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  DIAJUKAN: "bg-blue-50 text-blue-700",
  DITOLAK_SPV: "bg-red-50 text-red-700",
  REVISI_TW: "bg-amber-50 text-amber-700",
  DIAJUKAN_ULANG: "bg-orange-50 text-orange-700",
  DISETUJUI_SPV: "bg-teal-50 text-teal-700",
  OVERRIDE_HRD: "bg-violet-50 text-violet-700",
  DIKUNCI_PAYROLL: "bg-green-50 text-green-700",
};

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-extrabold tracking-tight ${
          highlight ? "text-teal-600" : "text-slate-800"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function AlertCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm hover:border-teal-200 hover:shadow-md transition-all duration-150"
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        {value > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
            {value}
          </span>
        ) : (
          <span className="text-xs text-slate-400 font-medium">Selesai</span>
        )}
        <ArrowRight
          size={14}
          className="text-slate-300 group-hover:text-teal-500 transition-colors"
        />
      </div>
    </a>
  );
}

async function AdminDashboard() {
  const stats = await getDashboardStats();

  const totalPending =
    stats.pendingApprovals.tickets +
    stats.pendingApprovals.activities +
    stats.pendingApprovals.reviews +
    stats.pendingApprovals.alpha;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Employee overview */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Karyawan
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Aktif"
            value={stats.employees.totalAktif}
            highlight
          />
          <StatCard label="Status Reguler" value={stats.employees.reguler} />
          <StatCard label="Status Training" value={stats.employees.training} />
        </div>
      </section>

      {/* Pending approvals */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
          Menunggu Tindakan
          {totalPending > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {totalPending}
            </span>
          )}
        </h2>
        <div className="space-y-2">
          <AlertCard
            label="Tiket Izin / Sakit / Cuti"
            value={stats.pendingApprovals.tickets}
            href="/ticketingapproval"
          />
          <AlertCard
            label="Aktivitas Harian Perlu Disetujui"
            value={stats.pendingApprovals.activities}
            href="/performance"
          />
          <AlertCard
            label="Review Karyawan Perlu Divalidasi"
            value={stats.pendingApprovals.reviews}
            href="/reviews"
          />
          <AlertCard
            label="Antrian Kasus ALPHA"
            value={stats.pendingApprovals.alpha}
            href="/ticketingapproval"
          />
        </div>
      </section>

      {/* Division performance */}
      {stats.divisionPerformance.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Performa per Divisi
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                    Divisi
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
                    Avg Performa
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.divisionPerformance.map((d) => {
                  const pct = d.avgPercent ?? 0;
                  const color =
                    pct >= 100
                      ? "text-teal-600 font-bold"
                      : pct >= 80
                      ? "text-amber-600 font-bold"
                      : "text-red-600 font-bold";
                  const badge =
                    pct >= 100 ? (
                      <Badge className="bg-teal-100 text-teal-800 border border-teal-200 hover:bg-teal-100 font-semibold">
                        Tercapai
                      </Badge>
                    ) : pct >= 80 ? (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 font-semibold">
                        Mendekati
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 border border-red-200 hover:bg-red-100 font-semibold">
                        Di bawah target
                      </Badge>
                    );
                  return (
                    <tr
                      key={d.divisionName}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-semibold text-slate-800">
                        {d.divisionName}
                      </td>
                      <td className={`px-5 py-3.5 text-right ${color}`}>
                        {d.avgPercent != null ? `${d.avgPercent}%` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">{badge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Activity by status */}
      {stats.activityByStatus.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Aktivitas Harian per Status
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.activityByStatus
              .sort((a, b) => b.jumlah - a.jumlah)
              .map((s) => {
                const colorClass =
                  ACTIVITY_STATUS_COLOR[s.status] ?? "bg-slate-100 text-slate-600";
                return (
                  <div
                    key={s.status}
                    className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
                  >
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colorClass}`}
                    >
                      {ACTIVITY_STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <p className="mt-2.5 text-2xl font-extrabold text-slate-800">
                      {s.jumlah}
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Incident summary */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Incident Log
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Total Incident Aktif"
            value={stats.incidentSummary.total}
          />
          <StatCard
            label="Berpotensi Potong Payroll"
            value={stats.incidentSummary.withDeduction}
            sub="dengan nilai potongan tercatat"
          />
        </div>
      </section>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ complete_profile?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;
  const showCompleteProfileBanner = resolvedSearchParams?.complete_profile === "1";

  if (ADMIN_ROLES.includes(role)) {
    return <AdminDashboard />;
  }

  return <EmployeeDashboard showCompleteProfileBanner={showCompleteProfileBanner} />;
}
