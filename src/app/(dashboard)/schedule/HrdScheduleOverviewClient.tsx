"use client";

import * as React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveEmployeeGroupLabel } from "@/lib/employee-groups";
import type { HrdScheduleOverview } from "@/server/actions/schedule";

function getGroupChipClass(kind: "SHIFT" | "TICKET"): string {
  return kind === "SHIFT"
    ? "border-teal-200 bg-teal-50 text-teal-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

export default function HrdScheduleOverviewClient({ overview }: { overview: HrdScheduleOverview }) {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const selectedDay = React.useMemo(
    () => overview.days.find((day) => day.date === selectedDate) ?? null,
    [overview.days, selectedDate]
  );

  const closeDialog = React.useCallback(() => setSelectedDate(null), []);

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Rekap Jadwal Harian Tim</h1>
          <p className="text-sm text-slate-500 mt-1">
            Periode kerja {overview.periodStart} s.d. {overview.periodEnd}. Klik tanggal untuk melihat detail karyawan per shift.
          </p>
        </div>
        <Link href="/schedule/attendance-recap" className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
          Override Kehadiran Periode
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {overview.days.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => setSelectedDate(day.date)}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <p className="text-xs font-bold text-slate-900">{day.date}</p>
            <p className="text-[11px] text-slate-500 mb-2">{day.dayName}</p>

            {day.counts.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">Tidak ada data</p>
            ) : (
              <div className="space-y-0.5">
                {day.counts.map((item) => (
                  <p
                    key={item.key}
                    className={`text-[10px] leading-tight ${
                      item.kind === "SHIFT" ? "text-slate-700" : "text-amber-700"
                    }`}
                  >
                    ({item.label} = {item.count} Org)
                  </p>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedDay?.date ?? "-"}</DialogTitle>
            <DialogDescription>{selectedDay?.dayName ?? "-"}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {!selectedDay || selectedDay.groups.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Tidak ada data pada tanggal ini.</p>
            ) : (
              selectedDay.groups.map((group) => (
                <section key={group.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getGroupChipClass(group.kind)}`}>
                        {group.label}
                      </span>
                      <span className="text-xs text-slate-500">{group.count} org</span>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.employees.map((employee) => (
                      <article key={employee.employeeId} className="rounded-lg border border-white bg-white p-2 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{employee.employeeName}</p>
                            <p className="text-[11px] text-slate-500">{employee.employeeCode}</p>
                          </div>
                          <span className="text-[10px] font-semibold rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 shrink-0">
                          {resolveEmployeeGroupLabel(employee.employeeGroup)}
                        </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 truncate">
                          {employee.divisionName} · {employee.positionName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{employee.branchName}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
