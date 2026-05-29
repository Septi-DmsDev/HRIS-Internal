"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types";

type RecapRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  divisionName: string;
  hadir: number;
  telat: number;
  izinJamHours: number;
  izinSakit: number;
  cuti: number;
  alpha: number;
  overtimeHours: number;
  lemburDays: number;
  fulltimeEligible: boolean;
};

type Workspace = {
  periodCode?: string;
  periodStart: string;
  periodEnd: string;
  workingDaysInPeriod: number;
  rows: RecapRow[];
};

type OverridePayload = {
  employeeId: string;
  periodCode?: string;
  hadir: number;
  telat: number;
  alpha: number;
  cuti: number;
  izinSakit: number;
  notes?: string;
};

type Props = {
  role: UserRole;
  workspace: Workspace;
  saveOverride: (payload: OverridePayload) => Promise<{ success: boolean } | { error: string }>;
};

type EditDraft = {
  employeeId: string;
  employeeName: string;
  hadir: number;
  telat: number;
  alpha: number;
  cuti: number;
  izinSakit: number;
  notes: string;
};

function makeDraft(row: RecapRow): EditDraft {
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    hadir: row.hadir,
    telat: row.telat,
    alpha: row.alpha,
    cuti: row.cuti,
    izinSakit: row.izinSakit,
    notes: "",
  };
}

export default function AttendanceRecapClient({ role, workspace, saveOverride }: Props) {
  void role;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const periodCode = useMemo(() => {
    const endDate = new Date(`${workspace.periodEnd}T00:00:00`);
    const month = String(endDate.getMonth() + 1).padStart(2, "0");
    return `${endDate.getFullYear()}-${month}`;
  }, [workspace.periodEnd]);

  const [selectedPeriod, setSelectedPeriod] = useState(periodCode);

  function movePeriod(step: -1 | 1) {
    const [yearStr, monthStr] = selectedPeriod.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const cursor = new Date(year, month - 1 + step, 1);
    const next = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    setSelectedPeriod(next);
    router.push(`/schedule/attendance-recap?period=${next}`);
  }

  const columns: ColumnDef<RecapRow>[] = useMemo(() => [
    {
      header: "Nama Karyawan",
      accessorKey: "employeeName",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-medium text-slate-900">{row.original.employeeName}</p>
          <p className="text-xs text-slate-500">{row.original.employeeCode} - {row.original.divisionName}</p>
        </div>
      ),
    },
    { header: "Total Hadir", accessorKey: "hadir" },
    { header: "Telat", accessorKey: "telat" },
    { header: "Izin Jam", accessorKey: "izinJamHours", cell: ({ row }) => <span>{row.original.izinJamHours} jam</span> },
    { header: "Izin/Sakit", accessorKey: "izinSakit" },
    { header: "Cuti", accessorKey: "cuti" },
    { header: "Alpha", accessorKey: "alpha" },
    { header: "Overtime", accessorKey: "overtimeHours", cell: ({ row }) => <span>{row.original.overtimeHours} jam</span> },
    { header: "Lembur", accessorKey: "lemburDays", cell: ({ row }) => <span>{row.original.lemburDays} hari</span> },
    {
      header: "Indikator Fulltime Eligibility",
      accessorKey: "fulltimeEligible",
      cell: ({ row }) => (
        <span className={row.original.fulltimeEligible ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
          {row.original.fulltimeEligible ? "Eligible" : "Tidak Eligible"}
        </span>
      ),
    },
    {
      header: "Aksi",
      id: "aksi",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setError(null);
            setSuccess(null);
            setDraft(makeDraft(row.original));
            setEditOpen(true);
          }}
        >
          Override
        </Button>
      ),
    },
  ], []);

  async function handleSave() {
    if (!draft) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await saveOverride({
        employeeId: draft.employeeId,
        periodCode: selectedPeriod,
        hadir: draft.hadir,
        telat: draft.telat,
        alpha: draft.alpha,
        cuti: draft.cuti,
        izinSakit: draft.izinSakit,
        notes: draft.notes,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Gagal menyimpan override.");
        return;
      }
      setSuccess("Override total kehadiran berhasil disimpan.");
      setEditOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Rekap Total Absensi Periode</h1>
          <p className="text-sm text-slate-500 mt-1">
            Periode {workspace.periodStart} s.d. {workspace.periodEnd} · Hari kerja (tanpa Minggu): {workspace.workingDaysInPeriod}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/schedule">Kembali ke Jadwal</a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => movePeriod(-1)}>
          Periode Sebelumnya
        </Button>
        <Input
          type="month"
          value={selectedPeriod}
          onChange={(event) => {
            const next = event.target.value;
            setSelectedPeriod(next);
            if (next) router.push(`/schedule/attendance-recap?period=${next}`);
          }}
          className="w-[180px]"
        />
        <Button type="button" variant="outline" onClick={() => movePeriod(1)}>
          Periode Berikutnya
        </Button>
      </div>

      {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <DataTable data={workspace.rows} columns={columns} globalSearch searchPlaceholder="Cari nama karyawan..." />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Override Kehadiran Periode</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{draft.employeeName}</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm">Hadir</label><Input type="number" min={0} value={draft.hadir} onChange={(e) => setDraft((s) => s ? { ...s, hadir: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Telat</label><Input type="number" min={0} value={draft.telat} onChange={(e) => setDraft((s) => s ? { ...s, telat: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Alpha</label><Input type="number" min={0} value={draft.alpha} onChange={(e) => setDraft((s) => s ? { ...s, alpha: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Cuti</label><Input type="number" min={0} value={draft.cuti} onChange={(e) => setDraft((s) => s ? { ...s, cuti: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Izin/Sakit</label><Input type="number" min={0} value={draft.izinSakit} onChange={(e) => setDraft((s) => s ? { ...s, izinSakit: Number(e.target.value || 0) } : s)} /></div>
              </div>
              <div>
                <label className="text-sm">Catatan Override</label>
                <Input value={draft.notes} onChange={(e) => setDraft((s) => s ? { ...s, notes: e.target.value } : s)} placeholder="Alasan override periode" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>Batal</Button>
            <Button onClick={() => void handleSave()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
