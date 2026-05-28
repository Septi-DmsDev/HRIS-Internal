import { getCurrentUserRoleRow } from "@/lib/auth/session";
import { getHrdScheduleOverview, getMySchedule } from "@/server/actions/schedule";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Info, Target } from "lucide-react";
import type { UserRole } from "@/types";
import HrdScheduleOverviewClient from "./HrdScheduleOverviewClient";

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const GRID_HEADERS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const TICKET_TYPE_LABELS: Record<string, string> = {
  CUTI: "Cuti",
  CUTI_TAHUNAN: "Cuti Tahunan",
  CUTI_BULANAN: "Cuti Bulanan",
  CUTI_HAMIL_LAHIR: "Cuti Hamil/Lahir",
  CUTI_NIKAH: "Cuti Nikah",
  SAKIT: "Sakit",
  IZIN: "Izin",
  IZIN_ACARA: "Izin Acara",
  MENINGGAL: "Meninggal",
  EMERGENCY: "Emergency",
  SETENGAH_HARI: "1/2 Hari",
  RESIGN: "Resign",
};

const TICKET_TYPE_COLORS: Record<string, string> = {
  CUTI: "bg-orange-100 text-orange-800",
  CUTI_TAHUNAN: "bg-orange-100 text-orange-800",
  CUTI_BULANAN: "bg-amber-100 text-amber-800",
  CUTI_HAMIL_LAHIR: "bg-pink-100 text-pink-800",
  CUTI_NIKAH: "bg-fuchsia-100 text-fuchsia-800",
  SAKIT: "bg-blue-100 text-blue-800",
  IZIN: "bg-yellow-100 text-yellow-800",
  IZIN_ACARA: "bg-lime-100 text-lime-800",
  MENINGGAL: "bg-neutral-200 text-neutral-800",
  EMERGENCY: "bg-red-100 text-red-800",
  SETENGAH_HARI: "bg-purple-100 text-purple-800",
  RESIGN: "bg-slate-200 text-slate-800",
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  APPROVED_SPV: "Disetujui SPV",
  APPROVED_HRD: "Disetujui HRD",
  AUTO_APPROVED: "Disetujui",
  LOCKED: "Terkunci",
  SUBMITTED: "Diajukan",
  NEED_REVIEW: "Review",
  DRAFT: "Draft",
  REJECTED: "Ditolak",
  AUTO_REJECTED: "Ditolak",
  CANCELLED: "Batal",
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  APPROVED_SPV: "bg-teal-100 text-teal-800",
  APPROVED_HRD: "bg-teal-100 text-teal-800",
  AUTO_APPROVED: "bg-teal-100 text-teal-800",
  LOCKED: "bg-teal-100 text-teal-800",
  SUBMITTED: "bg-blue-100 text-blue-700",
  NEED_REVIEW: "bg-yellow-100 text-yellow-800",
  DRAFT: "bg-slate-100 text-slate-600",
  REJECTED: "bg-red-100 text-red-700",
  AUTO_REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

function getDayBg(dayStatus: string, ticketOverride: string | null): string {
  if (ticketOverride) {
    switch (ticketOverride) {
      case "CUTI": return "bg-orange-50 border-orange-200";
      case "SAKIT": return "bg-blue-50 border-blue-200";
      case "IZIN": return "bg-yellow-50 border-yellow-200";
      case "EMERGENCY": return "bg-red-50 border-red-200";
      case "SETENGAH_HARI": return "bg-purple-50 border-purple-200";
      case "RESIGN": return "bg-slate-100 border-slate-300";
      default: return "bg-slate-50 border-slate-200";
    }
  }

  switch (dayStatus) {
    case "KERJA": return "bg-white border-slate-200";
    case "OFF": return "bg-slate-50 border-slate-200";
    case "CUTI": return "bg-orange-50 border-orange-200";
    case "SAKIT": return "bg-blue-50 border-blue-200";
    case "IZIN": return "bg-yellow-50 border-yellow-200";
    case "ALPA": return "bg-red-50 border-red-200";
    case "SETENGAH_HARI": return "bg-purple-50 border-purple-200";
    default: return "bg-white border-slate-200";
  }
}

function getDayLabel(dayStatus: string, ticketOverride: string | null): string | null {
  const status = ticketOverride ?? dayStatus;
  switch (status) {
    case "KERJA": return null;
    case "OFF": return "OFF";
    case "CUTI": return "CUTI";
    case "SAKIT": return "SAKIT";
    case "IZIN": return "IZIN";
    case "EMERGENCY": return "EMRG";
    case "ALPA": return "ALPA";
    case "SETENGAH_HARI": return "1/2 HARI";
    default: return status;
  }
}

function getDayLabelColor(dayStatus: string, ticketOverride: string | null): string {
  const status = ticketOverride ?? dayStatus;
  switch (status) {
    case "OFF": return "text-slate-400";
    case "CUTI": return "text-orange-600";
    case "SAKIT": return "text-blue-600";
    case "IZIN": return "text-yellow-700";
    case "EMERGENCY": return "text-red-600";
    case "ALPA": return "text-red-500";
    case "SETENGAH_HARI": return "text-purple-600";
    default: return "text-slate-400";
  }
}

function getDotColor(dayStatus: string, ticketOverride: string | null): string {
  if (ticketOverride) return "";
  return dayStatus === "KERJA" ? "bg-teal-400" : "";
}

function getGridOffset(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function SchedulePage({ searchParams }: PageProps) {
  const roleRow = await getCurrentUserRoleRow();
  const role = roleRow.role as UserRole;

  if (role === "HRD" || role === "SUPER_ADMIN") {
    const overview = await getHrdScheduleOverview();

    return <HrdScheduleOverviewClient overview={overview} />;
  }

  const params = await searchParams;
  const now = new Date();
  const defaultMonthDate = now.getDate() > 25
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : now;
  const defaultYear = defaultMonthDate.getFullYear();
  const defaultMonth = defaultMonthDate.getMonth() + 1;
  const year = params.year ? parseInt(params.year, 10) : defaultYear;
  const month = params.month ? parseInt(params.month, 10) : defaultMonth;
  const safeYear = Number.isNaN(year) ? defaultYear : year;
  const safeMonth = Number.isNaN(month) || month < 1 || month > 12 ? defaultMonth : month;

  const result = await getMySchedule(safeYear, safeMonth);

  if (!result) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex gap-4">
          <Info size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Jadwal Tidak Tersedia</p>
            <p className="text-sm text-amber-700 mt-1">
              Akun belum terhubung ke karyawan atau belum ada jadwal yang ditetapkan. Hubungi HRD.
            </p>
          </div>
        </div>
      </div>
    );
  }

  let prevYear = safeYear;
  let prevMonth = safeMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  let nextYear = safeYear;
  let nextMonth = safeMonth + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const prevUrl = `/schedule?year=${prevYear}&month=${prevMonth}`;
  const nextUrl = `/schedule?year=${nextYear}&month=${nextMonth}`;
  const gridOffset = result.days.length > 0 ? getGridOffset(result.days[0].dayOfWeek) : 0;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayDay = result.days.find((d) => d.date === todayStr);

  const prevMonthIdx = (safeMonth - 2 + 12) % 12;
  const prevMonthYear = safeMonth === 1 ? safeYear - 1 : safeYear;
  const periodRangeLabel = `26 ${MONTH_NAMES[prevMonthIdx].slice(0, 3)}${prevMonthYear !== safeYear ? ` ${prevMonthYear}` : ""} - 25 ${MONTH_NAMES[safeMonth - 1]} ${safeYear}`;
  const remainingPoints = Math.max(0, result.periodTotalTargetPoints - result.periodApprovedPoints);
  const targetAchieved = result.periodTotalTargetPoints > 0 && result.periodApprovedPoints >= result.periodTotalTargetPoints;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 max-w-7xl items-start">
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-3 flex items-center gap-1.5">
            <Clock size={11} />
            Jadwal Hari Ini
          </p>

          {todayDay ? (
            <>
              <p className="text-xl font-black text-red-900 leading-tight">
                {DAY_NAMES_ID[now.getDay()]}
              </p>
              <p className="text-sm font-semibold text-red-600 mb-4">
                {now.getDate()} {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
              </p>

              {todayDay.ticketOverride ? (
                <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${TICKET_TYPE_COLORS[todayDay.ticketOverride] ?? "bg-slate-100 text-slate-600"}`}>
                  {TICKET_TYPE_LABELS[todayDay.ticketOverride] ?? todayDay.ticketOverride}
                </span>
              ) : todayDay.isWorkingDay ? (
                <div className="space-y-1">
                  {todayDay.startTime && todayDay.endTime && (
                    <p className="text-2xl font-extrabold text-red-900 tracking-tight">
                      {todayDay.startTime} - {todayDay.endTime}
                    </p>
                  )}
                  {todayDay.targetPoints > 0 && (
                    <p className="text-sm text-red-500">
                      Target: <span className="font-bold text-red-800">{todayDay.targetPoints.toLocaleString("id-ID")} poin</span>
                    </p>
                  )}
                </div>
              ) : (
                <span className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-sm font-bold">
                  {getDayLabel(todayDay.dayStatus, null) ?? todayDay.dayStatus}
                </span>
              )}
            </>
          ) : (
            <p className="text-sm text-red-300 italic">Hari ini di luar periode ini</p>
          )}
        </section>

        <section className="rounded-xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-3 flex items-center gap-1.5">
            <Target size={11} />
            Target Poin Hari Ini
          </p>

          {targetAchieved ? (
            <div className="text-center py-3">
              <p className="text-4xl font-black text-teal-500">✓</p>
              <p className="text-sm font-bold text-teal-700 mt-1">Target Periode Tercapai!</p>
              <p className="text-xs text-teal-500 mt-0.5">
                {formatNum(result.periodApprovedPoints)} / {formatNum(result.periodTotalTargetPoints)} poin
              </p>
            </div>
          ) : result.dailyTargetNeeded !== null ? (
            <>
              <p className="text-4xl font-black text-orange-900 leading-none tracking-tight mb-3">
                {formatNum(result.dailyTargetNeeded)}
              </p>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-orange-500">Sisa dibutuhkan</span>
                  <span className="font-bold text-red-700">{formatNum(remainingPoints)} poin</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-orange-500">Sisa hari kerja</span>
                  <span className="font-bold text-orange-900">{result.remainingWorkingDays} hari</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-orange-300 italic">Periode sudah berakhir</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Riwayat Perizinan
          </p>

          {result.ticketHistory.length === 0 ? (
            <p className="text-sm text-slate-300 italic">Belum ada riwayat perizinan</p>
          ) : (
            <div className="space-y-2.5">
              {result.ticketHistory.slice(0, 1).map((ticket, idx) => (
                <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${TICKET_TYPE_COLORS[ticket.ticketType] ?? "bg-slate-100 text-slate-600"}`}>
                      {TICKET_TYPE_LABELS[ticket.ticketType] ?? ticket.ticketType}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${TICKET_STATUS_COLORS[ticket.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    {formatDateShort(ticket.startDate)}
                    {ticket.startDate !== ticket.endDate && ` - ${formatDateShort(ticket.endDate)}`}
                    <span className="font-normal text-slate-400 ml-1">({ticket.daysCount} hari)</span>
                  </p>
                  {ticket.reason && (
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{ticket.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={18} className="text-teal-500" />
              <h1 className="text-lg font-bold text-slate-900">Jadwal Bulan Ini</h1>
            </div>
            <p className="text-sm text-slate-500">
              {result.employeeName}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href={prevUrl}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
            >
              <ChevronLeft size={16} />
            </a>
            <div className="text-center min-w-[160px]">
              <div className="text-sm font-bold text-slate-800">
                {MONTH_NAMES[safeMonth - 1]} {safeYear}
              </div>
              <div className="text-xs text-slate-400">{periodRangeLabel}</div>
            </div>
            <a
              href={nextUrl}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
            >
              <ChevronRight size={16} />
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100">
            {GRID_HEADERS.map((day) => (
              <div key={day} className="py-1.5 text-center text-xs font-bold uppercase tracking-wide text-slate-400 border-r border-slate-100 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: gridOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[60px] border-r border-b border-slate-100 last:border-r-0 bg-slate-50/50" />
            ))}

            {result.days.map((day) => {
              const isToday = day.date === todayStr;
              const bgClass = getDayBg(day.dayStatus, day.ticketOverride);
              const label = getDayLabel(day.dayStatus, day.ticketOverride);
              const labelColor = getDayLabelColor(day.dayStatus, day.ticketOverride);
              const dotColor = getDotColor(day.dayStatus, day.ticketOverride);
              const dayNum = parseInt(day.date.slice(8, 10), 10);
              const isLastCol = getGridOffset(day.dayOfWeek) === 6;

              return (
                <div
                  key={day.date}
                  className={`min-h-[60px] p-1.5 border-r border-b border-slate-100 ${isLastCol ? "border-r-0" : ""} ${bgClass} transition-colors`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span
                      className={`text-xs font-bold leading-none ${
                        isToday
                          ? "w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[11px]"
                          : !day.isWorkingDay && !day.ticketOverride
                          ? "text-slate-300"
                          : "text-slate-700"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dotColor && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dotColor}`} />}
                  </div>

                  {label && (
                    <span className={`block text-[10px] font-bold uppercase tracking-wide ${labelColor}`}>
                      {label}
                    </span>
                  )}

                  {day.isWorkingDay && !day.ticketOverride && day.startTime && day.endTime && (
                    <span className="block text-[10px] text-slate-400 mt-0.5 leading-tight">
                      {day.startTime}-{day.endTime}
                    </span>
                  )}

                  {day.isWorkingDay && day.targetPoints > 0 && !day.ticketOverride && (
                    <span className="block text-[10px] text-teal-500 font-semibold mt-1">
                      {day.targetPoints}p
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 self-center">
            Keterangan:
          </p>
          {[
            { label: "Kerja", bg: "bg-white border-slate-200", dot: "bg-teal-400" },
            { label: "OFF", bg: "bg-slate-50 border-slate-200", dot: "" },
            { label: "Cuti", bg: "bg-orange-50 border-orange-200", dot: "" },
            { label: "Sakit", bg: "bg-blue-50 border-blue-200", dot: "" },
            { label: "Izin", bg: "bg-yellow-50 border-yellow-200", dot: "" },
            { label: "Emergency", bg: "bg-red-50 border-red-200", dot: "" },
            { label: "1/2 Hari", bg: "bg-purple-50 border-purple-200", dot: "" },
          ].map(({ label, bg, dot }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded border ${bg} flex items-center justify-center`}>
                {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
              </div>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
