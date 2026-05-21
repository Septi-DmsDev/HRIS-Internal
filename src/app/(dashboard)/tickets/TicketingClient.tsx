"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/tables/DataTable";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelTicket, createTicket } from "@/server/actions/tickets";
import { overrideAttendancePeriodTotals } from "@/server/actions/attendance";
import type { UserRole } from "@/types";

type TicketRow = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  employeeCode: string;
  divisionName: string;
  ticketType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  izinHours: number | null;
  reason: string;
  attachmentUrl: string | null;
  status: string;
  payrollImpact: string | null;
  reviewNotes: string;
  rejectionReason: string;
  createdAt: string;
};

type AttendanceEmployee = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionName: string;
};

type AttendanceTotalRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  divisionName: string;
  hadir: number;
  telat: number;
  alpha: number;
  cuti: number;
  izinSakit: number;
};

type AttendanceData = {
  periodStart: string;
  periodEnd: string;
  workingDaysInPeriod: number;
  employees: AttendanceEmployee[];
  totals: AttendanceTotalRow[];
};

type Props = {
  role: UserRole;
  hasEmployeeLink: boolean;
  tickets: TicketRow[];
  canManageAttendance: boolean;
  attendanceData: AttendanceData | null;
};

type TicketDraft = {
  ticketType: string;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentUrl: string;
  izinHours: string;
};

type AttendanceEditDraft = {
  employeeId: string;
  employeeName: string;
  hadir: number;
  telat: number;
  alpha: number;
  cuti: number;
  izinSakit: number;
  notes: string;
};

const TICKET_TYPE_LABEL: Record<string, string> = {
  CUTI: "Cuti",
  CUTI_TAHUNAN: "Cuti Tahunan",
  CUTI_BULANAN: "Cuti Bulanan",
  CUTI_HAMIL_LAHIR: "Cuti Hamil/Lahir",
  CUTI_NIKAH: "Cuti Nikah",
  SAKIT: "Sakit",
  IZIN: "Izin",
  IZIN_ACARA: "Izin Acara",
  IZIN_JAM: "Izin Jam",
  MENINGGAL: "Meninggal",
  EMERGENCY: "Emergency",
  SETENGAH_HARI: "Setengah Hari (lama)",
  RESIGN: "Resign",
};

const TICKET_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SUBMITTED: "secondary",
  AUTO_APPROVED: "default",
  AUTO_REJECTED: "destructive",
  NEED_REVIEW: "secondary",
  APPROVED_SPV: "default",
  APPROVED_HRD: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
  LOCKED: "default",
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  AUTO_APPROVED: "Auto Approved",
  AUTO_REJECTED: "Auto Rejected",
  NEED_REVIEW: "Perlu Review",
  APPROVED_SPV: "Disetujui SPV",
  APPROVED_HRD: "Disetujui HRD",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  LOCKED: "Terkunci",
};

const PAYROLL_IMPACT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PAID_QUOTA_MONTHLY: "Quota Bulanan",
  PAID_QUOTA_ANNUAL: "Quota Tahunan",
};

function createDraft(): TicketDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ticketType: "IZIN_ACARA",
    startDate: today,
    endDate: today,
    reason: "",
    attachmentUrl: "",
    izinHours: "",
  };
}

function getDurationDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function createAttendanceDraft(row: AttendanceTotalRow): AttendanceEditDraft {
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

export default function TicketingClient({ role, hasEmployeeLink, tickets, canManageAttendance, attendanceData }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"TICKETING" | "KEHADIRAN">("TICKETING");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<TicketDraft>(createDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceSuccess, setAttendanceSuccess] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceEditDraft | null>(null);

  const needsAttachment = draft.ticketType === "SAKIT" && getDurationDays(draft.startDate, draft.endDate) > 1;
  const isIzinJam = draft.ticketType === "IZIN_JAM";
  const canSubmit = hasEmployeeLink;

  function update(field: keyof TicketDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate() {
    setPending(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        endDate: isIzinJam ? draft.startDate : draft.endDate,
        izinHours: isIzinJam && draft.izinHours ? Number(draft.izinHours) : undefined,
      };
      const result = await createTicket(payload);
      if (result && "error" in result) {
        setError(result.error ?? "Gagal mengajukan tiket.");
        return;
      }
      setSuccess("Tiket berhasil diajukan.");
      setCreateOpen(false);
      setDraft(createDraft());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const handleCancel = useCallback(async (ticketId: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await cancelTicket(ticketId);
      if (result && "error" in result) {
        setError(result.error ?? "Gagal membatalkan tiket.");
        return;
      }
      setSuccess("Tiket dibatalkan.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [router]);

  const ticketColumns: ColumnDef<TicketRow>[] = useMemo(() => [
    { header: "Karyawan", accessorKey: "employeeName", cell: ({ row }) => <div className="space-y-0.5"><p className="font-medium text-slate-900">{row.original.employeeName}</p><p className="text-xs text-slate-500">{row.original.employeeCode} - {row.original.divisionName}</p></div> },
    { header: "Jenis", accessorKey: "ticketType", cell: ({ row }) => <Badge variant="outline">{TICKET_TYPE_LABEL[row.original.ticketType] ?? row.original.ticketType}</Badge> },
    { header: "Tanggal", id: "dates", cell: ({ row }) => <div className="text-sm"><p>{row.original.startDate}</p>{row.original.startDate !== row.original.endDate && <p className="text-slate-400">s/d {row.original.endDate}</p>}{row.original.ticketType === "IZIN_JAM" ? <p className="text-xs text-slate-400">{row.original.izinHours ?? "-"} jam</p> : <p className="text-xs text-slate-400">{row.original.daysCount} hari</p>}</div> },
    { header: "Alasan", accessorKey: "reason", cell: ({ row }) => <p className="max-w-[220px] truncate text-sm">{row.original.reason}</p> },
    { header: "Bukti", accessorKey: "attachmentUrl", cell: ({ row }) => <span className="text-sm text-slate-500">{row.original.attachmentUrl ? "Terlampir" : "-"}</span> },
    { header: "Status", accessorKey: "status", cell: ({ row }) => <div className="space-y-1"><Badge variant={TICKET_STATUS_VARIANT[row.original.status] ?? "outline"}>{TICKET_STATUS_LABEL[row.original.status] ?? row.original.status}</Badge>{row.original.payrollImpact && <p className="text-xs text-slate-500">{PAYROLL_IMPACT_LABEL[row.original.payrollImpact]}</p>}{row.original.rejectionReason && <p className="max-w-[220px] truncate text-xs text-red-600">{row.original.rejectionReason}</p>}</div> },
    { header: "Diajukan", accessorKey: "createdAt", cell: ({ row }) => <span className="text-sm text-slate-500">{row.original.createdAt}</span> },
    { header: "Aksi", id: "actions", cell: ({ row }) => ["DRAFT", "SUBMITTED"].includes(row.original.status) ? <Button size="sm" variant="outline" onClick={() => void handleCancel(row.original.id)} disabled={pending}>Batalkan</Button> : null },
  ], [handleCancel, pending]);

  const attendanceColumns: ColumnDef<AttendanceTotalRow>[] = useMemo(() => [
    { header: "Nama", accessorKey: "employeeName", cell: ({ row }) => <div className="space-y-0.5"><p className="font-medium text-slate-900">{row.original.employeeName}</p><p className="text-xs text-slate-500">{row.original.employeeCode} - {row.original.divisionName}</p></div> },
    { id: "workingDaysInPeriod", header: "Hari Kerja", accessorFn: () => attendanceData?.workingDaysInPeriod ?? 0, cell: () => <span>{attendanceData?.workingDaysInPeriod ?? 0}</span> },
    { header: "Hadir", accessorKey: "hadir" },
    { header: "Telat", accessorKey: "telat" },
    { header: "Alpha", accessorKey: "alpha" },
    { header: "Cuti", accessorKey: "cuti" },
    { header: "Izin/Sakit", accessorKey: "izinSakit" },
    {
      header: "Aksi",
      id: "edit",
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => { setAttendanceDraft(createAttendanceDraft(row.original)); setAttendanceError(null); setAttendanceSuccess(null); setEditOpen(true); }}>
          Edit
        </Button>
      ),
    },
  ], [attendanceData?.workingDaysInPeriod]);

  async function handleSaveAttendanceTotals() {
    if (!attendanceDraft) return;
    setPending(true);
    setAttendanceError(null);
    setAttendanceSuccess(null);
    try {
      const result = await overrideAttendancePeriodTotals(attendanceDraft);
      if (result && "error" in result) {
        setAttendanceError(result.error ?? "Gagal menyimpan override periode.");
        return;
      }
      setAttendanceSuccess("Rekap kehadiran periode berhasil diperbarui.");
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
          <h2 className="text-base font-semibold text-slate-900">Ticketing Saya</h2>
          <p className="text-sm text-slate-500">{role === "TEAMWORK" ? "Pengajuan masuk ke SPV/KABAG lalu HRD." : "Pengajuan Anda masuk ke antrian HRD."}</p>
        </div>
        {canManageAttendance && <div className="flex items-center gap-2"><Button type="button" variant={activeTab === "TICKETING" ? "default" : "outline"} className={activeTab === "TICKETING" ? "bg-teal-600 hover:bg-teal-700" : ""} onClick={() => setActiveTab("TICKETING")}>Ticketing Saya</Button><Button type="button" variant={activeTab === "KEHADIRAN" ? "default" : "outline"} className={activeTab === "KEHADIRAN" ? "bg-teal-600 hover:bg-teal-700" : ""} onClick={() => setActiveTab("KEHADIRAN")}>Kehadiran</Button></div>}
      </div>

      {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!hasEmployeeLink && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">Akun belum terhubung ke data karyawan, jadi belum bisa mengajukan tiket pribadi.</div>}

      {activeTab === "TICKETING" || !canManageAttendance ? (
        <DataTable
          data={tickets}
          columns={ticketColumns}
          globalSearch
          searchPlaceholder="Cari perizinan..."
          toolbarSlot={<Button onClick={() => { setError(null); setDraft(createDraft()); setCreateOpen(true); }} disabled={!canSubmit}>Ajukan Tiket</Button>}
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-700">Periode aktif: <span className="font-semibold">{attendanceData?.periodStart} s.d {attendanceData?.periodEnd}</span> · Hari kerja (tanpa Minggu): <span className="font-semibold">{attendanceData?.workingDaysInPeriod ?? 0}</span></p>
          </div>
          {attendanceSuccess && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{attendanceSuccess}</div>}
          {attendanceError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{attendanceError}</div>}
          <DataTable data={attendanceData?.totals ?? []} columns={attendanceColumns} globalSearch searchPlaceholder="Cari nama karyawan..." />
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Rekap Kehadiran Periode</DialogTitle>
          </DialogHeader>
          {attendanceDraft && (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{attendanceDraft.employeeName}</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm">Hadir</label><Input type="number" min={0} value={attendanceDraft.hadir} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, hadir: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Telat</label><Input type="number" min={0} value={attendanceDraft.telat} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, telat: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Alpha</label><Input type="number" min={0} value={attendanceDraft.alpha} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, alpha: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Cuti</label><Input type="number" min={0} value={attendanceDraft.cuti} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, cuti: Number(e.target.value || 0) } : s)} /></div>
                <div><label className="text-sm">Izin/Sakit</label><Input type="number" min={0} value={attendanceDraft.izinSakit} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, izinSakit: Number(e.target.value || 0) } : s)} /></div>
              </div>
              <div>
                <label className="text-sm">Catatan Override</label>
                <Input value={attendanceDraft.notes} onChange={(e) => setAttendanceDraft((s) => s ? { ...s, notes: e.target.value } : s)} placeholder="Alasan override periode" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>Batal</Button>
            <Button onClick={() => void handleSaveAttendanceTotals()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Ajukan Tiket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Tiket akan diajukan untuk akun Anda sendiri.</div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Jenis Tiket</label><select value={draft.ticketType} onChange={(e) => update("ticketType", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="CUTI_TAHUNAN">Cuti Tahunan</option><option value="CUTI_BULANAN">Cuti Bulanan</option><option value="CUTI_HAMIL_LAHIR">Cuti Hamil/Lahir</option><option value="CUTI_NIKAH">Cuti Nikah</option><option value="IZIN_ACARA">Izin Acara</option><option value="SAKIT">Sakit</option><option value="MENINGGAL">Meninggal</option><option value="EMERGENCY">Emergency</option><option value="IZIN_JAM">Izin Jam</option><option value="RESIGN">Resign</option></select></div>
            {isIzinJam && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Izin jam menghapus bonus fulltime (Rp 200.000) dan memotong gaji Rp 5.000/jam.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Tanggal Mulai</label><Input type="date" value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} /></div>
              {!isIzinJam && <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Tanggal Akhir</label><Input type="date" value={draft.endDate} onChange={(e) => update("endDate", e.target.value)} /></div>}
              {isIzinJam && <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Jumlah Jam <span className="text-red-500">*</span></label><Input type="number" min={1} max={8} placeholder="1–8" value={draft.izinHours} onChange={(e) => update("izinHours", e.target.value)} /></div>}
            </div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Alasan / Catatan</label><textarea value={draft.reason} onChange={(e) => update("reason", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
            {needsAttachment && <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Bukti fisik/digital <span className="text-red-500">*</span></label><Input type="url" placeholder="https://..." value={draft.attachmentUrl} onChange={(e) => update("attachmentUrl", e.target.value)} /><p className="text-xs text-slate-500">Sakit lebih dari 1 hari wajib menyertakan surat dokter.</p></div>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>Batal</Button><Button onClick={() => void handleCreate()} disabled={pending}>{pending ? "Menyimpan..." : "Ajukan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

