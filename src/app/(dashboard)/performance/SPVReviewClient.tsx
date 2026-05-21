"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { batchDecideDraftActivities } from "@/server/actions/performance";
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

type DecisionState = {
  action: "approve" | "reject";
  group: ActivityGroup;
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
  const router = useRouter();
  const [detailGroup, setDetailGroup] = useState<ActivityGroup | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  function openDecision(action: "approve" | "reject", group: ActivityGroup) {
    setError(null);
    setNotes("");
    setDecision({ action, group });
  }

  async function handleDecision() {
    if (!decision) return;
    setPending(true);
    setError(null);
    try {
      const result = await batchDecideDraftActivities({
        ids: decision.group.ids,
        action: decision.action,
        notes: notes.trim() || undefined,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Gagal memproses.");
        return;
      }
      setSuccess(
        decision.action === "approve"
          ? `${decision.group.activities.length} aktivitas ${decision.group.employeeName} disetujui.`
          : `${decision.group.activities.length} aktivitas ${decision.group.employeeName} ditolak.`
      );
      setDecision(null);
      setDetailGroup(null);
      setNotes("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Antrian Review Aktivitas</h2>
          <p className="text-sm text-slate-500">
            {groups.length} batch - {activities.length} aktivitas menunggu persetujuan
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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
                      <Button size="sm" onClick={() => openDecision("approve", group)}>Terima</Button>
                      <Button size="sm" variant="destructive" onClick={() => openDecision("reject", group)}>Tolak</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">Klik baris untuk melihat rincian aktivitas</p>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailGroup(null)}>Tutup</Button>
            <Button variant="destructive" onClick={() => { openDecision("reject", detailGroup!); setDetailGroup(null); }}>Tolak</Button>
            <Button onClick={() => { openDecision("approve", detailGroup!); setDetailGroup(null); }}>Terima</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action === "approve" ? "Terima Draft" : "Tolak Draft"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{decision?.group.employeeName}</span>
              {" - "}{decision?.group.workDate}
              {" - "}{decision?.group.activities.length} aktivitas
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {decision?.action === "reject" ? "Alasan Penolakan" : "Catatan (opsional)"}
                {decision?.action === "reject" && <span className="ml-1 text-red-500">*</span>}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={decision?.action === "reject" ? "Tuliskan alasan penolakan..." : ""}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={pending}>Batal</Button>
            <Button
              variant={decision?.action === "reject" ? "destructive" : "default"}
              onClick={() => void handleDecision()}
              disabled={pending || (decision?.action === "reject" && !notes.trim())}
            >
              {pending ? "Memproses..." : decision?.action === "approve" ? "Terima Semua" : "Tolak Semua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
