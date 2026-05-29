import Link from "next/link";
import { getPublicRecaptDivisionDetail } from "@/server/actions/recapt";

type PageProps = {
  params: Promise<{ division: string }>;
  searchParams: Promise<{ period?: string }>;
};

function shiftPeriod(periodCode: string, step: -1 | 1) {
  const [yearStr, monthStr] = periodCode.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const cursor = new Date(year, month - 1 + step, 1);
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
}

export default async function RecaptDivisionPage({ params, searchParams }: PageProps) {
  const { division } = await params;
  const query = await searchParams;
  const detail = await getPublicRecaptDivisionDetail(division, query.period);

  if ("error" in detail) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{detail.error}</p>
        <Link href="/recapt" className="mt-4 inline-block text-sm text-teal-700 hover:underline">Kembali ke daftar divisi</Link>
      </main>
    );
  }

  const currentPeriodCode = detail.periodCode ?? query.period ?? "2026-01";
  const weekGroups = (() => {
    const groups: Array<{ label: string; days: string[] }> = [];
    let currentWeek = 1;
    for (const day of detail.dayColumns) {
      if (groups.length === 0) {
        groups.push({ label: `PEKAN ${currentWeek}`, days: [day] });
        continue;
      }
      const d = new Date(`${day}T00:00:00`);
      const isMonday = d.getDay() === 1;
      if (isMonday) {
        currentWeek += 1;
        groups.push({ label: `PEKAN ${currentWeek}`, days: [day] });
      } else {
        groups[groups.length - 1].days.push(day);
      }
    }
    return groups;
  })();
  const dayLabel = (day: string) => {
    const d = new Date(`${day}T00:00:00`);
    const m = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${d.getDate()}-${m[d.getMonth()]}`;
  };

  return (
    <main className="mx-auto max-w-[95vw] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Recapt {detail.division.name}</h1>
          <p className="text-sm text-slate-500">Periode {detail.periodStart} s.d. {detail.periodEnd}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/recapt/${detail.division.slug}?period=${shiftPeriod(currentPeriodCode, -1)}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Periode Sebelumnya
          </Link>
          <form action={`/recapt/${detail.division.slug}`} className="flex items-center gap-2">
            <input
              type="month"
              name="period"
              defaultValue={currentPeriodCode}
              className="h-9 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
            />
            <button
              type="submit"
              className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              Lihat
            </button>
          </form>
          <Link
            href={`/recapt/${detail.division.slug}?period=${shiftPeriod(currentPeriodCode, 1)}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Periode Berikutnya
          </Link>
          <Link href="/recapt" className="text-sm text-teal-700 hover:underline">Kembali</Link>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[2400px] text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left">ID</th>
              <th className="px-2 py-2 text-left">Nama Karyawan</th>
              {weekGroups.map((group) => (
                <th key={group.label} colSpan={group.days.length} className="px-2 py-2 text-center">
                  {group.label}
                </th>
              ))}
              <th className="px-2 py-2 text-left">Rekap Presentase Mingguan</th>
              <th className="px-2 py-2 text-right">Total Poin Bulanan</th>
              <th className="px-2 py-2 text-right">Presentase Bulanan</th>
              <th className="px-2 py-2 text-right">Total Hadir</th>
              <th className="px-2 py-2 text-right">Telat</th>
              <th className="px-2 py-2 text-right">Izin Jam</th>
              <th className="px-2 py-2 text-right">Izin/Sakit</th>
              <th className="px-2 py-2 text-right">Cuti</th>
              <th className="px-2 py-2 text-right">Alpha</th>
              <th className="px-2 py-2 text-right">Overtime</th>
              <th className="px-2 py-2 text-right">Lembur</th>
              <th className="px-2 py-2 text-left">Indikator Fulltime Eligibility</th>
            </tr>
            <tr>
              <th className="px-2 py-2 text-left"> </th>
              <th className="px-2 py-2 text-left"> </th>
              {detail.dayColumns.map((day) => (
                <th key={day} className="px-2 py-2 text-center">{dayLabel(day)}</th>
              ))}
              <th className="px-2 py-2 text-left"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-right"> </th>
              <th className="px-2 py-2 text-left"> </th>
            </tr>
          </thead>
          <tbody>
            {detail.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="px-2 py-2 font-mono text-slate-600">{row.employeeCode}</td>
                <td className="px-2 py-2 font-medium text-slate-900">{row.employeeName}</td>
                {detail.dayColumns.map((day) => (
                  <td key={`${row.id}-${day}`} className="px-2 py-2 text-center tabular-nums">
                    {row.dailyPoints[day] ?? 0}
                  </td>
                ))}
                <td className="px-2 py-2 text-slate-700">
                  W1 {row.weeklyPercent.week1}% · W2 {row.weeklyPercent.week2}% · W3 {row.weeklyPercent.week3}% · W4 {row.weeklyPercent.week4}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{row.monthlyPointsTotal}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.monthlyPercent}%</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.hadir}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.telat}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.izinJamHours} jam</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.izinSakit}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.cuti}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.alpha}</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.overtimeHours} jam</td>
                <td className="px-2 py-2 text-right tabular-nums">{row.lemburDays} hari</td>
                <td className={`px-2 py-2 font-medium ${row.fulltimeEligibility ? "text-emerald-700" : "text-red-700"}`}>
                  {row.fulltimeEligibility ? "Eligible" : "Tidak Eligible"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
