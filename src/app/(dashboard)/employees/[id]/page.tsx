import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEmployeeById } from "@/server/actions/employees";
import { resolveEmployeeGroupLabel } from "@/lib/employee-groups";
import DeleteDivisionHistoryButton from "./DeleteDivisionHistoryButton";
import DeleteGradeHistoryButton from "./DeleteGradeHistoryButton";
import DeletePositionHistoryButton from "./DeletePositionHistoryButton";

const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  TRAINING: "Training",
  REGULER: "Reguler",
  DIALIHKAN_TRAINING: "Dialihkan Training",
  TIDAK_LOLOS: "Tidak Lolos",
  NONAKTIF: "Nonaktif",
  RESIGN: "Resign",
};

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  TRAINING: "Training",
  REGULER: "Reguler",
  FINAL_PAYROLL: "Final Payroll",
  NONAKTIF: "Nonaktif",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  if (typeof value === "string") return value.slice(0, 10);
  return format(value, "yyyy-MM-dd");
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}

function formatBpjsStatus(active: boolean, number: string | null) {
  if (!number?.trim()) return "Belum diisi";
  return `${active ? "Aktif" : "Nonaktif"} - ${number}`;
}

function HistoryTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((cells, index) => (
                <tr key={index} className="border-t border-slate-100">
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Belum ada histori.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getEmployeeById(id);

  if (!detail) {
    notFound();
  }

  const { employee, currentScheduleAssignment, scheduleHistory, histories, isSuperAdmin } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={employee.isActive ? "default" : "secondary"}>
              {employee.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
            <Badge variant="outline">{resolveEmployeeGroupLabel(employee.employeeGroup)}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {employee.fullName}
            </h1>
            <p className="text-sm text-slate-500">
              {employee.employeeCode} • {employee.positionName ?? "-"} •{" "}
              {employee.divisionName ?? "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/master?tab=master-shift">Jadwal Kerja</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/employees">Kembali</Link>
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Ringkasan Profil
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Cabang" value={employee.branchName ?? "-"} />
          <DetailItem label="Divisi" value={employee.divisionName ?? "-"} />
          <DetailItem label="Jabatan" value={employee.positionName ?? "-"} />
          <DetailItem label="Grade" value={employee.gradeName ?? "-"} />
          <DetailItem
            label="Status Kerja"
            value={EMPLOYMENT_STATUS_LABEL[employee.employmentStatus] ?? employee.employmentStatus}
          />
          <DetailItem
            label="Status Payroll"
            value={PAYROLL_STATUS_LABEL[employee.payrollStatus] ?? employee.payrollStatus}
          />
          <DetailItem
            label="Supervisor"
            value={employee.supervisorName ?? "Belum ditetapkan"}
          />
          <DetailItem
            label="Jadwal Aktif"
            value={
              currentScheduleAssignment
                ? `${currentScheduleAssignment.scheduleName} (${currentScheduleAssignment.scheduleCode})`
                : "Belum ditetapkan"
            }
          />
          <DetailItem label="Tanggal Masuk" value={formatDate(employee.startDate)} />
          <DetailItem
            label="Lulus Training"
            value={formatDate(employee.trainingGraduationDate)}
          />
          <DetailItem label="Nomor HP" value={employee.phoneNumber ?? "-"} />
          <DetailItem label="Nama Panggilan" value={employee.nickname ?? "-"} />
          <DetailItem label="BPJS KT" value={formatBpjsStatus(employee.bpjsKetenagakerjaanActive, employee.bpjsKetenagakerjaanNumber)} />
          <DetailItem label="BPJS KS" value={formatBpjsStatus(employee.bpjsKesehatanActive, employee.bpjsKesehatanNumber)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Alamat</h2>
          <p className="mt-2 text-sm text-slate-600">
            {employee.address?.trim() || "-"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Catatan HRD</h2>
          <p className="mt-2 text-sm text-slate-600">
            {employee.notes?.trim() || "-"}
          </p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Hobi</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {detail.profileEnrichment.hobbies.length ? detail.profileEnrichment.hobbies.map((row) => (
              <li key={row.id} className="rounded-md border border-slate-100 p-2">
                <p className="font-medium text-slate-900">{row.hobbyName}</p>
                <p className="text-xs text-slate-500">{row.notes?.trim() || "-"}</p>
              </li>
            )) : <li className="text-slate-400">Belum ada data hobi.</li>}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Riwayat Pendidikan</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {detail.profileEnrichment.educationHistories.length ? detail.profileEnrichment.educationHistories.map((row) => (
              <li key={row.id} className="rounded-md border border-slate-100 p-2">
                <p className="font-medium text-slate-900">{row.institutionName}</p>
                <p className="text-xs text-slate-500">{row.degree ?? "-"} · {row.major ?? "-"}</p>
                <p className="text-xs text-slate-500">{row.startYear ?? "-"} - {row.endYear ?? "-"}</p>
                <p className="text-xs text-slate-500">{row.notes?.trim() || "-"}</p>
              </li>
            )) : <li className="text-slate-400">Belum ada data pendidikan.</li>}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Kompetensi</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {detail.profileEnrichment.competencies.length ? detail.profileEnrichment.competencies.map((row) => (
              <li key={row.id} className="rounded-md border border-slate-100 p-2">
                <p className="font-medium text-slate-900">{row.competencyName}</p>
                <p className="text-xs text-slate-500">{row.level ?? "-"} · {row.issuer ?? "-"}</p>
                <p className="text-xs text-slate-500">{formatDate(row.certifiedAt)}</p>
                {row.attachmentUrl ? (
                  <a href={row.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                    Lihat dokumen pendukung
                  </a>
                ) : (
                  <p className="text-xs text-slate-500">Dokumen: -</p>
                )}
                <p className="text-xs text-slate-500">{row.notes?.trim() || "-"}</p>
              </li>
            )) : <li className="text-slate-400">Belum ada data kompetensi.</li>}
          </ul>
        </section>
      </div>

      <HistoryTable
        title="Histori Jadwal Kerja"
        headers={["Periode", "Jadwal", "Catatan"]}
        rows={scheduleHistory.map((row) => [
          `${formatDate(row.effectiveStartDate)} - ${formatDate(row.effectiveEndDate)}`,
          row.scheduleName ? `${row.scheduleName} (${row.scheduleCode})` : "-",
          "-",
        ])}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <HistoryTable
          title="Histori Divisi"
          headers={isSuperAdmin ? ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan", "Aksi"] : ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan"]}
          rows={histories.divisions.map((row) => [
            formatDate(row.effectiveDate),
            row.previousDivisionName ?? "-",
            row.newDivisionName ?? "-",
            row.notes ?? "-",
            ...(isSuperAdmin
              ? [
                  row.previousDivisionName
                    ? (
                      <DeleteDivisionHistoryButton
                        key={row.id}
                        employeeId={employee.id}
                        historyId={row.id}
                      />
                    )
                    : <span key={row.id} className="text-slate-300">-</span>,
                ]
              : []),
          ])}
        />
        <HistoryTable
          title="Histori Jabatan"
          headers={isSuperAdmin ? ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan", "Aksi"] : ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan"]}
          rows={histories.positions.map((row) => [
            formatDate(row.effectiveDate),
            row.previousPositionName ?? "-",
            row.newPositionName ?? "-",
            row.notes ?? "-",
            ...(isSuperAdmin
              ? [
                  row.previousPositionName
                    ? (
                      <DeletePositionHistoryButton
                        key={row.id}
                        employeeId={employee.id}
                        historyId={row.id}
                      />
                    )
                    : <span key={row.id} className="text-slate-300">-</span>,
                ]
              : []),
          ])}
        />
        <HistoryTable
          title="Histori Grade"
          headers={isSuperAdmin ? ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan", "Aksi"] : ["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan"]}
          rows={histories.grades.map((row) => [
            formatDate(row.effectiveDate),
            row.previousGradeName ?? "-",
            row.newGradeName ?? "-",
            row.notes ?? "-",
            ...(isSuperAdmin
              ? [
                  row.previousGradeName
                    ? (
                      <DeleteGradeHistoryButton
                        key={row.id}
                        employeeId={employee.id}
                        historyId={row.id}
                      />
                    )
                    : <span key={row.id} className="text-slate-300">-</span>,
                ]
              : []),
          ])}
        />
        <HistoryTable
          title="Histori Supervisor"
          headers={["Tanggal Efektif", "Sebelum", "Sesudah", "Catatan"]}
          rows={histories.supervisors.map((row) => [
            formatDate(row.effectiveDate),
            row.previousSupervisorName ?? "-",
            row.newSupervisorName ?? "-",
            row.notes ?? "-",
          ])}
        />
      </div>


      <HistoryTable
        title="Histori Pengajuan Resign"
        headers={["Tanggal Efektif", "Status Tiket", "Alasan", "Catatan Review", "Alasan Tolak"]}
        rows={(histories.resigns ?? []).map((row) => [
          formatDate(row.effectiveDate),
          row.status,
          row.reason ?? "-",
          row.reviewNotes ?? "-",
          row.rejectionReason ?? "-",
        ])}
      />
    </div>
  );
}

