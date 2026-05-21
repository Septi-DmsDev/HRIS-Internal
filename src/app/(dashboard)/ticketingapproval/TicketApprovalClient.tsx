"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/DataTable";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveTicket, rejectTicket } from "@/server/actions/tickets";
import { detectAlphaAbsences, issueAlphaSp1, sendAlphaCall } from "@/server/actions/alpha";
import type { UserRole } from "@/types";

export type ApprovalTicketRow = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  employeeCode: string;
  divisionName: string;
  ticketType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  izinHours?: number | null;
  reason: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
};

export type TicketHistoryRow = ApprovalTicketRow & {
  payrollImpact: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
};

type DecisionState = {
  action: "approve" | "reject";
  ticketId: string;
  label: string;
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

const QUEUE_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Menunggu Review",
  NEED_REVIEW: "Perlu Review",
  APPROVED_SPV: "Disetujui SPV",
};

const QUEUE_STATUS_COLOR: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  NEED_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED_SPV: "bg-teal-100 text-teal-700",
};

const HISTORY_STATUS_LABEL: Record<string, string> = {
  ...QUEUE_STATUS_LABEL,
  APPROVED_HRD: "Disetujui HRD",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  LOCKED: "Terkunci",
  AUTO_APPROVED: "Auto Approved",
  AUTO_REJECTED: "Auto Rejected",
  DRAFT: "Draft",
};

const HISTORY_STATUS_COLOR: Record<string, string> = {
  ...QUEUE_STATUS_COLOR,
  APPROVED_HRD: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  LOCKED: "bg-violet-100 text-violet-700",
  AUTO_APPROVED: "bg-teal-100 text-teal-700",
  AUTO_REJECTED: "bg-red-100 text-red-700",
  DRAFT: "bg-slate-100 text-slate-500",
};

const PAYROLL_IMPACT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PAID_QUOTA_MONTHLY: "Quota Bulanan",
  PAID_QUOTA_ANNUAL: "Quota Tahunan",
};

type Props = {
  tickets: ApprovalTicketRow[];
  historyTickets: TicketHistoryRow[];
  alphaRows: {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    divisionName: string;
    alphaDate: string;
    alphaCount: number;
    status: string;
    callSentAt: string | null;
    sp1IssuedAt: string | null;
    notes: string | null;
  }[];
  role: UserRole;
};

export default function TicketApprovalClient({ tickets, historyTickets, alphaRows, role }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"QUEUE" | "HISTORY">("QUEUE");
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isHrd = ["SUPER_ADMIN", "HRD"].includes(role);
  const [alphaPending, setAlphaPending] = useState(false);

  async function handleDecision() {
    if (!decision) return;
    setPending(true);
    setError(null);
    try {
      const payload = {
        ticketId: decision.ticketId,
        notes: notes.trim() || undefined,
        rejectionReason: rejectionReason.trim() || undefined,
      };
      const result =
        decision.action === "approve"
          ? await approveTicket(payload)
          : await rejectTicket(payload);
      if (result && "error" in result) {
        setError(result.error ?? "Gagal memproses tiket.");
        return;
      }
      setSuccess(decision.action === "approve" ? "Tiket disetujui." : "Tiket ditolak.");
      setDecision(null);
      setNotes("");
      setRejectionReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<ApprovalTicketRow>[] = [
    {
      header: "Karyawan",
      accessorKey: "employeeName",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">{row.original.employeeName}</p>
          <p className="text-xs text-slate-500">
            {row.original.employeeCode} - {row.original.divisionName}
          </p>
        </div>
      ),
    },
    {
      header: "Jenis",
      accessorKey: "ticketType",
      cell: ({ row }) => (
        <Badge variant="outline">
          {TICKET_TYPE_LABEL[row.original.ticketType] ?? row.original.ticketType}
        </Badge>
      ),
    },
    {
      header: "Tanggal",
      id: "dates",
      cell: ({ row }) => (
        <div className="text-sm">
          <p>{row.original.startDate}</p>
          {row.original.startDate !== row.original.endDate && (
            <p className="text-slate-400">s/d {row.original.endDate}</p>
          )}
          {row.original.ticketType === "IZIN_JAM"
            ? <p className="text-xs text-slate-400">{row.original.izinHours ?? "-"} jam</p>
            : <p className="text-xs text-slate-400">{row.original.daysCount} hari</p>}
        </div>
      ),
    },
    {
      header: "Alasan",
      accessorKey: "reason",
      cell: ({ row }) => (
        <p className="max-w-[180px] truncate text-sm">{row.original.reason}</p>
      ),
    },
    {
      header: "Bukti",
      accessorKey: "attachmentUrl",
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">
          {row.original.attachmentUrl ? "Terlampir" : "-"}
        </span>
      ),
    },
    ...(isHrd
      ? [
          {
            header: "Tahap",
            accessorKey: "status",
            cell: ({ row }: { row: { original: ApprovalTicketRow } }) => (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${QUEUE_STATUS_COLOR[row.original.status] ?? "bg-slate-100 text-slate-500"}`}
              >
                {QUEUE_STATUS_LABEL[row.original.status] ?? row.original.status}
              </span>
            ),
          } satisfies ColumnDef<ApprovalTicketRow>,
        ]
      : []),
    {
      header: "Diajukan",
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">{row.original.createdAt}</span>
      ),
    },
    {
      header: "Aksi",
      id: "actions",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() =>
                setDecision({
                  action: "approve",
                  ticketId: t.id,
                  label: `${t.employeeName} - ${TICKET_TYPE_LABEL[t.ticketType] ?? t.ticketType}`,
                })
              }
            >
              Terima
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                setDecision({
                  action: "reject",
                  ticketId: t.id,
                  label: `${t.employeeName} - ${TICKET_TYPE_LABEL[t.ticketType] ?? t.ticketType}`,
                })
              }
            >
              Tolak
            </Button>
          </div>
        );
      },
    },
  ];

  const subtitle = isHrd
    ? "Tiket TEAMWORK yang sudah disetujui SPV/KABAG dan tiket langsung dari SPV/KABAG"
    : "Tiket dari anggota divisi Anda yang menunggu persetujuan";

  return (
    <div className="space-y-4">
      {isHrd && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Monitoring ALPHA</h3>
              <p className="text-xs text-amber-700">
                Deteksi tim yang tidak ceklok dan tidak ada izin disetujui sampai jam kerja selesai.
              </p>
            </div>
            <Button
              size="sm"
              disabled={alphaPending}
              onClick={async () => {
                setAlphaPending(true);
                setError(null);
                try {
                  const result = await detectAlphaAbsences();
                  if (result && "error" in result) {
                    setError(result.error ?? "Gagal deteksi ALPHA.");
                    return;
                  }
                  setSuccess(`Sinkron ALPHA selesai. Event baru: ${result.created}.`);
                  router.refresh();
                } finally {
                  setAlphaPending(false);
                }
              }}
            >
              {alphaPending ? "Memproses..." : "Sinkron ALPHA Hari Ini"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 text-amber-900">
                  <th className="py-2 text-left">Karyawan</th>
                  <th className="py-2 text-left">Tanggal</th>
                  <th className="py-2 text-left">Akumulasi</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {alphaRows.slice(0, 12).map((row) => (
                  <tr key={row.id} className="border-b border-amber-100 last:border-0">
                    <td className="py-2">
                      <p className="font-medium text-slate-900">{row.employeeName}</p>
                      <p className="text-xs text-slate-500">{row.employeeCode} - {row.divisionName}</p>
                    </td>
                    <td className="py-2 text-slate-700">{row.alphaDate}</td>
                    <td className="py-2 text-slate-700">{row.alphaCount}x</td>
                    <td className="py-2 text-slate-700">{row.status}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alphaPending || row.status === "SP1_ISSUED"}
                          onClick={async () => {
                            setAlphaPending(true);
                            setError(null);
                            try {
                              const res = await sendAlphaCall({ alphaEventId: row.id });
                              if (res && "error" in res) {
                                setError(res.error ?? "Gagal kirim pemanggilan.");
                                return;
                              }
                              setSuccess("Notifikasi pemanggilan berhasil dikirim.");
                              router.refresh();
                            } finally {
                              setAlphaPending(false);
                            }
                          }}
                        >
                          Pemanggilan
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={alphaPending || row.alphaCount < 2 || row.status === "SP1_ISSUED"}
                          onClick={async () => {
                            setAlphaPending(true);
                            setError(null);
                            try {
                              const res = await issueAlphaSp1({ alphaEventId: row.id });
                              if (res && "error" in res) {
                                setError(res.error ?? "Gagal menerbitkan SP1.");
                                return;
                              }
                              setSuccess("SP1 berhasil diterbitkan.");
                              router.refresh();
                            } finally {
                              setAlphaPending(false);
                            }
                          }}
                        >
                          Beri SP1
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {alphaRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">Belum ada event ALPHA.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {tab === "QUEUE" ? "Antrian Review Izin" : "Riwayat Pengajuan Izin"}
          </h2>
          <p className="text-sm text-slate-500">
            {tab === "QUEUE"
              ? tickets.length > 0
                ? `${tickets.length} pengajuan menunggu - ${subtitle}`
                : subtitle
              : "Seluruh riwayat tiket dari divisi Anda."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setTab("QUEUE")}
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-colors ${
              tab === "QUEUE"
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            APPROVAL
          </button>
          <button
            type="button"
            onClick={() => setTab("HISTORY")}
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-colors ${
              tab === "HISTORY"
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            HISTORY
          </button>
        </div>
      </div>

      {tab === "QUEUE" && (
        <>
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
        </>
      )}

      {tab === "QUEUE" ? (
        tickets.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-6 py-16 text-center">
            <p className="text-sm text-slate-500">Tidak ada pengajuan izin yang menunggu persetujuan.</p>
          </div>
        ) : (
          <DataTable
            data={tickets}
            columns={columns}
            globalSearch
            searchPlaceholder="Cari karyawan, jenis, atau status..."
          />
        )
      ) : historyTickets.length === 0 ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-6 py-16 text-center">
          <p className="text-sm text-slate-500">Belum ada riwayat pengajuan izin.</p>
        </div>
      ) : (
        <DataTable
          data={historyTickets}
          columns={[
            {
              header: "Karyawan",
              accessorKey: "employeeName",
              cell: ({ row }) => (
                <div>
                  <p className="font-medium text-slate-900">{row.original.employeeName}</p>
                  <p className="text-xs text-slate-500">
                    {row.original.employeeCode} - {row.original.divisionName}
                  </p>
                </div>
              ),
            },
            {
              header: "Jenis",
              accessorKey: "ticketType",
              cell: ({ row }) => (
                <Badge variant="outline">
                  {TICKET_TYPE_LABEL[row.original.ticketType] ?? row.original.ticketType}
                </Badge>
              ),
            },
            {
              header: "Status",
              accessorKey: "status",
              cell: ({ row }) => (
                <Badge variant="outline" className={HISTORY_STATUS_COLOR[row.original.status] ?? "bg-slate-100 text-slate-600"}>
                  {HISTORY_STATUS_LABEL[row.original.status] ?? row.original.status}
                </Badge>
              ),
            },
            {
              header: "Tanggal",
              id: "dates",
              cell: ({ row }) => (
                <div className="text-sm">
                  <p>{row.original.startDate}</p>
                  {row.original.startDate !== row.original.endDate && (
                    <p className="text-slate-400">s/d {row.original.endDate}</p>
                  )}
                  {row.original.ticketType === "IZIN_JAM"
            ? <p className="text-xs text-slate-400">{row.original.izinHours ?? "-"} jam</p>
            : <p className="text-xs text-slate-400">{row.original.daysCount} hari</p>}
                </div>
              ),
            },
            {
              header: "Payroll",
              accessorKey: "payrollImpact",
              cell: ({ row }) => (
                <span className="text-sm text-slate-500">
                  {row.original.payrollImpact ? PAYROLL_IMPACT_LABEL[row.original.payrollImpact] ?? row.original.payrollImpact : "-"}
                </span>
              ),
            },
            {
              header: "Keputusan",
              accessorKey: "approvedAt",
              cell: ({ row }) => (
                <div className="text-xs text-slate-500">
                  <p>Approve: {row.original.approvedAt ?? "-"}</p>
                  <p>Reject: {row.original.rejectedAt ?? "-"}</p>
                </div>
              ),
            },
            {
              header: "Diajukan",
              accessorKey: "createdAt",
              cell: ({ row }) => (
                <span className="text-sm text-slate-500">{row.original.createdAt}</span>
              ),
            },
          ]}
          globalSearch
          searchPlaceholder="Cari karyawan, status, atau jenis..."
        />
      )}

      <Dialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approve" ? "Terima Pengajuan" : "Tolak Pengajuan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{decision?.label}</p>
            {decision?.action === "reject" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Alasan Penolakan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Catatan (opsional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={pending}>
              Batal
            </Button>
            <Button
              variant={decision?.action === "reject" ? "destructive" : "default"}
              onClick={() => void handleDecision()}
              disabled={pending}
            >
              {pending
                ? "Memproses..."
                : decision?.action === "approve"
                  ? "Terima"
                  : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
