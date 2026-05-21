"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPointNumber } from "@/lib/format/number";
import { resolveActivityJobIdLabel } from "@/lib/performance/job-id";

export type SpvActivityRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeDivisionName: string;
  workDate: string;
  externalCode: string | null;
  jobIdSnapshot: string | null;
  notes: string | null;
  workNameSnapshot: string;
  pointValueSnapshot: string;
  quantity: string;
  totalPoints: string;
  status: string;
  submittedAt: string;
};

type ActivityGroup = {
  key: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeDivisionName: string;
  workDate: string;
  submittedAt: string;
  status: string;
  ids: string[];
  totalPoints: number;
  activities: SpvActivityRow[];
};

const STATUS_LABEL: Record<string, string> = {
  DIAJUKAN: "Diajukan",
  DIAJUKAN_ULANG: "Diajukan Ulang",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DIAJUKAN: "secondary",
  DIAJUKAN_ULANG: "outline",
};

type Props = {
  activities: SpvActivityRow[];
};

export default function SPVReviewClient({ activities }: Props) {
  const [detailGroup, setDetailGroup] = useState<ActivityGroup | null>(null);

  const groups = useMemo((): ActivityGroup[] => {
    const map = new Map<string, ActivityGroup>();
    for (const a of activities) {
      const groupKey = `${a.employeeId}-${a.workDate}`;
      const existing = map.get(groupKey);
      if (existing) {
        existing.ids.push(a.id);
        existing.totalPoints += Number(a.totalPoints);
        existing.activities.push(a);
      } else {
        map.set(groupKey, {
          key: groupKey,
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          employeeCode: a.employeeCode,
          employeeDivisionName: a.employeeDivisionName,
          workDate: a.workDate,
          submittedAt: a.submittedAt,
          status: a.status,
          ids: [a.id],
          totalPoints: Number(a.totalPoints),
          activities: [a],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [activities]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Monitoring Pengajuan Aktivitas</h2>
          <p className="text-sm text-slate-500">
            {groups.length} batch - {activities.length} aktivitas diajukan ke HRD
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-6 py-16 text-center">
          <p className="text-sm text-slate-500">Tidak ada aktivitas yang menunggu persetujuan.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Karyawan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tgl Kerja</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total Job</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Poin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Diajukan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((group) => (
                <tr
                  key={group.key}
                  className="cursor-pointer bg-white hover:bg-slate-50/60"
                  onClick={() => setDetailGroup(group)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{group.employeeName}</p>
                    <p className="text-xs text-slate-500">{group.employeeCode} - {group.employeeDivisionName}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{group.workDate}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-700">{group.activities.length}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatPointNumber(group.totalPoints)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[group.status] ?? "outline"}>
                      {STATUS_LABEL[group.status] ?? group.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{group.submittedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => setDetailGroup(group)}>Lihat</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">SPV/KABAG hanya monitoring. Approval diproses HRD.</p>
        </div>
      )}

      <Dialog open={detailGroup !== null} onOpenChange={(open) => !open && setDetailGroup(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rincian Draft - {detailGroup?.employeeName}</DialogTitle>
          </DialogHeader>
          {detailGroup && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {detailGroup.employeeCode} - {detailGroup.employeeDivisionName} - Tgl Kerja: {detailGroup.workDate} - Diajukan: {detailGroup.submittedAt}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="w-8 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">No</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Jenis Pekerjaan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Poin/Unit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailGroup.activities.map((a, idx) => (
                      <tr key={a.id} className="bg-white">
                        <td className="px-3 py-2.5 text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                          {resolveActivityJobIdLabel(a.jobIdSnapshot, a.externalCode, a.notes)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-900">{a.workNameSnapshot}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{a.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatPointNumber(a.pointValueSnapshot)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">{formatPointNumber(a.totalPoints)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold text-slate-700">Total</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-teal-600">{formatPointNumber(detailGroup.totalPoints)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDetailGroup(null)}>Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
