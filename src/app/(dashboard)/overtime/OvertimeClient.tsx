"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteOvertimeRequest,
  decideOvertimeRequest,
  getEmployeeShiftForDate,
  getMyShiftForDate,
  scheduleDivisionOvertime,
  submitOvertimeDraft,
  submitOvertimeRequest,
  submitSpvOvertimeRequest,
} from "@/server/actions/overtime";
import { formatOneDecimal } from "@/lib/format/number";
import type { UserRole } from "@/types";
import { resolveEmployeeGroupLabel } from "@/lib/employee-groups";

export type OvertimeRow = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  divisionName: string;
  requestDate: string;
  overtimeType: "OVERTIME_1H" | "OVERTIME_2H" | "OVERTIME_3H" | "LEMBUR_FULLDAY" | "PATCH_ABSENCE_3H";
  overtimePlacement: "BEFORE_SHIFT" | "AFTER_SHIFT";
  overtimeHours: number;
  breakHours: number;
  baseAmount: number;
  mealAmount: number;
  totalAmount: number;
  periodCode: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  draftTotalPoints: number;
  draftItems: {
    id: string;
    jobId: string;
    workName: string;
    quantity: number;
    pointValue: number;
    totalPoints: number;
    notes: string | null;
  }[];
};

export type ScopedEmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionName: string | null;
  employeeGroup: import("@/lib/employee-groups").EmployeeGroup;
};

export type OvertimeCatalogEntry = {
  id: string;
  externalCode: string | null;
  workName: string;
  pointValue: number;
  unitDescription: string | null;
};

const OVERTIME_TYPE_LABEL: Record<OvertimeRow["overtimeType"], string> = {
  OVERTIME_1H: "Overtime 1 Jam (nonaktif)",
  OVERTIME_2H: "Overtime 2 Jam (nonaktif)",
  OVERTIME_3H: "Overtime 3 Jam",
  LEMBUR_FULLDAY: "Lembur 1 Hari",
  PATCH_ABSENCE_3H: "Penambalan Izin (3 Jam)",
};

const OVERTIME_HELP_TEXT: Record<OvertimeRow["overtimeType"], string> = {
  OVERTIME_1H: "Tidak tersedia untuk pengajuan baru",
  OVERTIME_2H: "Tidak tersedia untuk pengajuan baru",
  OVERTIME_3H: "Rp33.000 + uang makan Rp10.000",
  LEMBUR_FULLDAY: "Rp100.000 + uang makan Rp20.000",
  PATCH_ABSENCE_3H: "Rp11.000 + uang makan Rp30.000, maksimal 3x/periode (IZIN/SAKIT/CUTI approved)",
};

const OVERTIME_PLACEMENT_LABEL: Record<OvertimeRow["overtimePlacement"], string> = {
  BEFORE_SHIFT: "Sebelum jam kerja",
  AFTER_SHIFT: "Setelah jam kerja",
};

function currency(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function OvertimeClient({
  role,
  canSubmit,
  canApprove,
  canMonitor,
  canSpvManage,
  isManagerial,
  scopedEmployees,
  overtimeCatalogEntries,
  myRequests,
  pendingRequests,
  processedRequests,
}: {
  role: UserRole;
  canSubmit: boolean;
  canApprove: boolean;
  canMonitor: boolean;
  canSpvManage: boolean;
  isManagerial: boolean;
  scopedEmployees: ScopedEmployeeOption[];
  overtimeCatalogEntries: OvertimeCatalogEntry[];
  myRequests: OvertimeRow[];
  pendingRequests: OvertimeRow[];
  processedRequests: OvertimeRow[];
}) {
  const router = useRouter();
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [overtimeType, setOvertimeType] = useState<OvertimeRow["overtimeType"]>("OVERTIME_3H");
  const [overtimePlacement, setOvertimePlacement] = useState<OvertimeRow["overtimePlacement"]>("AFTER_SHIFT");
  const [reason, setReason] = useState("");
  const [openTwSubmit, setOpenTwSubmit] = useState(false);
  const [openTwDraft, setOpenTwDraft] = useState(false);
  const [openDraftDetail, setOpenDraftDetail] = useState(false);
  const [activeDraftRequest, setActiveDraftRequest] = useState<OvertimeRow | null>(null);
  const [draftJobId, setDraftJobId] = useState("");
  const [draftCatalogId, setDraftCatalogId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [currentJobLines, setCurrentJobLines] = useState<Array<{
    key: string;
    catalogEntryId: string;
    workName: string;
    quantity: number;
    pointValue: number;
    notes: string;
  }>>([]);
  const [draftItems, setDraftItems] = useState<Array<{
    key: string;
    catalogEntryId: string;
    jobId: string;
    workName: string;
    quantity: number;
    pointValue: number;
    totalPoints: number;
    notes: string;
  }>>([]);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [openSpvSubmit, setOpenSpvSubmit] = useState(false);
  const [openSpvSchedule, setOpenSpvSchedule] = useState(false);
  const [spvRequestDate, setSpvRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [spvOvertimeType, setSpvOvertimeType] = useState<OvertimeRow["overtimeType"]>("OVERTIME_3H");
  const [spvOvertimePlacement, setSpvOvertimePlacement] = useState<OvertimeRow["overtimePlacement"]>("AFTER_SHIFT");
  const [spvReason, setSpvReason] = useState("");
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [scheduleRequestDate, setScheduleRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleOvertimeType, setScheduleOvertimeType] = useState<OvertimeRow["overtimeType"]>("OVERTIME_3H");
  const [scheduleOvertimePlacement, setScheduleOvertimePlacement] = useState<OvertimeRow["overtimePlacement"]>("AFTER_SHIFT");
  const [scheduleReason, setScheduleReason] = useState("");
  const [myShiftInfo, setMyShiftInfo] = useState<{ startTime: string; endTime: string } | null | "loading">(null);
  const [scheduleShiftInfo, setScheduleShiftInfo] = useState<{ startTime: string; endTime: string } | null | "loading">(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!openTwSubmit || overtimeType !== "OVERTIME_3H" || !requestDate) {
      setMyShiftInfo(null);
      return;
    }
    setMyShiftInfo("loading");
    void getMyShiftForDate(requestDate).then((result) => {
      setMyShiftInfo(result);
      if (result) setOvertimePlacement("AFTER_SHIFT");
    });
  }, [openTwSubmit, overtimeType, requestDate]);

  useEffect(() => {
    if (!openSpvSchedule || !targetEmployeeId || !scheduleRequestDate) {
      setScheduleShiftInfo(null);
      return;
    }
    setScheduleShiftInfo("loading");
    void getEmployeeShiftForDate(targetEmployeeId, scheduleRequestDate).then((result) => {
      setScheduleShiftInfo(result);
      if (result) {
        setScheduleOvertimeType("OVERTIME_3H");
        setScheduleOvertimePlacement("AFTER_SHIFT");
      }
    });
  }, [openSpvSchedule, targetEmployeeId, scheduleRequestDate]);

  function addHoursToTime(time: string, hours: number): string {
    const [h, m] = time.split(":").map(Number);
    const totalMinutes = ((h ?? 0) * 60 + (m ?? 0) + hours * 60 + 1440 * 2) % 1440;
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }

  async function handleSubmitRequest() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitOvertimeRequest({
        requestDate,
        overtimeType,
        overtimePlacement,
        reason,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Pengajuan overtime gagal.");
        return;
      }
      setReason("");
      setOpenTwSubmit(false);
      setSuccess("Pengajuan overtime berhasil dikirim.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDecision(requestId: string, action: "APPROVE" | "REJECT") {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await decideOvertimeRequest({
        requestId,
        action,
        reviewNotes: reviewNotes[requestId] ?? "",
      });
      if (result && "error" in result) {
        setError(result.error ?? "Proses approval overtime gagal.");
        return;
      }
      setSuccess(action === "APPROVE" ? "Pengajuan overtime disetujui." : "Pengajuan overtime ditolak.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteRequest(requestId: string) {
    const ok = window.confirm("Hapus pengajuan overtime ini? Data yang dihapus tidak bisa dikembalikan.");
    if (!ok) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await deleteOvertimeRequest({ requestId });
      if (result && "error" in result) {
        setError(result.error ?? "Hapus pengajuan overtime gagal.");
        return;
      }
      setSuccess("Pengajuan overtime berhasil dihapus.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSpvSelfSubmit() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitSpvOvertimeRequest({
        requestDate: spvRequestDate,
        overtimeType: spvOvertimeType,
        overtimePlacement: spvOvertimePlacement,
        reason: spvReason,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Pengajuan lembur SPV gagal.");
        return;
      }
      setSpvReason("");
      setOpenSpvSubmit(false);
      setSuccess("Pengajuan lembur SPV tersimpan dan otomatis disetujui.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSpvSchedule() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await scheduleDivisionOvertime({
        employeeId: targetEmployeeId,
        requestDate: scheduleRequestDate,
        overtimeType: scheduleOvertimeType,
        overtimePlacement: scheduleOvertimePlacement,
        reason: scheduleReason,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Atur lembur gagal.");
        return;
      }
      setScheduleReason("");
      setTargetEmployeeId("");
      setScheduleShiftInfo(null);
      setOpenSpvSchedule(false);
      setSuccess("Lembur terjadwal berhasil disimpan dan otomatis disetujui.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function openFillDraft(row: OvertimeRow) {
    setActiveDraftRequest(row);
    setDraftItems(
      row.draftItems.map((item) => ({
        key: item.id,
        catalogEntryId: "",
        jobId: item.jobId,
        workName: item.workName,
        quantity: item.quantity,
        pointValue: item.pointValue,
        totalPoints: item.totalPoints,
        notes: item.notes ?? "",
      }))
    );
    setDraftJobId("");
    setDraftCatalogId("");
    setDraftQty("1");
    setCurrentJobLines([]);
    setOpenTwDraft(true);
  }

  function addLineToCurrentJob() {
    const qty = Number(draftQty);
    if (!draftCatalogId) {
      setError("Pilih jenis pekerjaan terlebih dahulu.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }
    const catalog = overtimeCatalogEntries.find((c) => c.id === draftCatalogId);
    if (!catalog) {
      setError("Jenis pekerjaan tidak valid.");
      return;
    }
    setError(null);
    setCurrentJobLines((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        catalogEntryId: catalog.id,
        workName: catalog.workName,
        quantity: qty,
        pointValue: Number(catalog.pointValue),
        notes: "",
      },
    ]);
    setDraftCatalogId("");
    setDraftQty("1");
    setCatalogSearch("");
    setCatalogOpen(false);
  }

  function removeCurrentLine(key: string) {
    setCurrentJobLines((prev) => prev.filter((item) => item.key !== key));
  }

  function commitJobIdGroup() {
    if (!draftJobId.trim()) {
      setError("Isi Job ID terlebih dahulu.");
      return;
    }
    if (currentJobLines.length === 0) {
      setError("Tambahkan minimal 1 jenis pekerjaan untuk Job ID ini.");
      return;
    }
    const jobId = draftJobId.trim();
    setDraftItems((prev) => [
      ...prev,
      ...currentJobLines.map((line) => ({
        key: `${jobId}-${line.key}`,
        catalogEntryId: line.catalogEntryId,
        jobId,
        workName: line.workName,
        quantity: line.quantity,
        pointValue: line.pointValue,
        totalPoints: Number((line.quantity * line.pointValue).toFixed(2)),
        notes: line.notes,
      })),
    ]);
    setDraftJobId("");
    setCurrentJobLines([]);
    setError(null);
  }

  function removeDraftItem(key: string) {
    setDraftItems((prev) => prev.filter((item) => item.key !== key));
  }

  function removeDraftGroup(jobId: string) {
    setDraftItems((prev) => prev.filter((item) => item.jobId !== jobId));
  }

  async function saveDraft() {
    if (!activeDraftRequest) return;
    if (draftItems.length === 0) {
      setError("Isi minimal 1 baris draft lembur.");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitOvertimeDraft({
        requestId: activeDraftRequest.id,
        items: draftItems.map((item) => ({
          jobId: item.jobId,
          workName: item.workName,
          quantity: item.quantity,
          pointValue: item.pointValue,
          notes: item.notes || undefined,
        })),
      });
      if (result && "error" in result) {
        setError(result.error ?? "Simpan draft lembur gagal.");
        return;
      }
      setOpenTwDraft(false);
      setSuccess("Draft lembur berhasil disimpan.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function openDraftDetailModal(row: OvertimeRow) {
    if (row.draftItems.length === 0) return;
    setActiveDraftRequest(row);
    setOpenDraftDetail(true);
  }

  const myPendingReqs = useMemo(() => myRequests.filter((r) => r.status === "PENDING"), [myRequests]);
  const myHistoryReqs = useMemo(() => myRequests.filter((r) => r.status !== "PENDING"), [myRequests]);

  const groupedDraft = useMemo(() => {
    const map = new Map<string, typeof draftItems>();
    const order: string[] = [];
    for (const item of draftItems) {
      if (!map.has(item.jobId)) {
        map.set(item.jobId, []);
        order.push(item.jobId);
      }
      map.get(item.jobId)!.push(item);
    }
    return order.map((jobId) => ({ jobId, items: map.get(jobId)! }));
  }, [draftItems]);

  const selectedCatalog = overtimeCatalogEntries.find((entry) => entry.id === draftCatalogId) ?? null;
  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return overtimeCatalogEntries;
    return overtimeCatalogEntries.filter(
      (entry) => entry.workName.toLowerCase().includes(q) || (entry.externalCode ?? "").toLowerCase().includes(q)
    );
  }, [catalogSearch, overtimeCatalogEntries]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setCatalogOpen(false);
        setCatalogSearch("");
      }
    }
    if (catalogOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [catalogOpen]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Overtime</h2>
            <p className="text-sm text-slate-500">Role aktif: {role}</p>
          </div>
          {canSpvManage ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setOpenSpvSubmit(true)}>Ajukan Lembur</Button>
              <Button size="sm" variant="outline" onClick={() => setOpenSpvSchedule(true)}>Atur Lembur</Button>
            </div>
          ) : canSubmit ? (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setOpenTwSubmit(true)}>
                {isManagerial ? "Ajukan Lembur" : "Ajukan OVT/Lembur"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      {canApprove ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Antrian Approval Overtime</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Karyawan</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tanggal</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Jenis</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Nominal</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Catatan Review</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRequests.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Tidak ada pengajuan overtime yang menunggu approval.</td></tr>
                ) : pendingRequests.map((row) => (
                  <tr key={row.id} className="bg-white">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{row.employeeName}</p>
                      <p className="text-xs text-slate-500">{row.employeeCode} · {row.divisionName}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.requestDate}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <div className="flex flex-col gap-1">
                        <span>{OVERTIME_TYPE_LABEL[row.overtimeType]}</span>
                        {row.overtimeType === "OVERTIME_3H" ? (
                          <span className="text-xs text-slate-500">{OVERTIME_PLACEMENT_LABEL[row.overtimePlacement]}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{currency(row.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <Input
                        placeholder="Opsional untuk approve, wajib jika tolak"
                        value={reviewNotes[row.id] ?? ""}
                        onChange={(e) => setReviewNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" onClick={() => void handleDecision(row.id, "APPROVE")} disabled={pending}>Setujui</Button>
                        <Button size="sm" variant="destructive" onClick={() => void handleDecision(row.id, "REJECT")} disabled={pending}>Tolak</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Tabel pengajuan aktif (PENDING) untuk canSubmit, atau riwayat processed untuk approver/monitor */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {canSubmit ? "Pengajuan Aktif Saya" : canMonitor ? "Riwayat Overtime (Monitoring HRD)" : "Riwayat Pengajuan Overtime"}
          </h3>
          {canSubmit ? (
            <p className="text-xs text-slate-500 mt-0.5">Pengajuan yang sedang menunggu review</p>
          ) : null}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Karyawan</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tanggal</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Jenis</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Nominal</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Poin</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Catatan</th>
              {canSubmit || canApprove || canMonitor ? (
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Aksi</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(canSubmit ? myPendingReqs : processedRequests).length === 0 ? (
              <tr>
                <td colSpan={canSubmit || canApprove || canMonitor ? 8 : 7} className="px-3 py-8 text-center text-sm text-slate-500">
                  {canSubmit ? "Tidak ada pengajuan yang sedang menunggu review." : "Belum ada data overtime."}
                </td>
              </tr>
            ) : (canSubmit ? myPendingReqs : processedRequests).map((row) => (
              <tr key={row.id} className="bg-white">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{row.employeeName}</p>
                  <p className="text-xs text-slate-500">{row.employeeCode} · {row.divisionName}</p>
                </td>
                <td className="px-3 py-2 text-slate-700">{row.requestDate}</td>
                <td className="px-3 py-2 text-slate-700">
                  <div className="flex flex-col gap-1">
                    <span>{OVERTIME_TYPE_LABEL[row.overtimeType]}</span>
                    {row.overtimeType === "OVERTIME_3H" ? (
                      <span className="text-xs text-slate-500">{OVERTIME_PLACEMENT_LABEL[row.overtimePlacement]}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">{currency(row.totalAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatOneDecimal(row.draftTotalPoints)}</td>
                <td className="px-3 py-2">
                  <Badge variant={row.status === "APPROVED" ? "default" : row.status === "REJECTED" ? "destructive" : "secondary"}>
                    {row.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{row.reviewNotes ?? "-"}</td>
                {canSubmit || canApprove || canMonitor ? (
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteRequest(row.id);
                        }}
                        disabled={pending}
                      >
                        Hapus
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* History section: riwayat pengajuan yang sudah diproses (APPROVED / REJECTED) */}
      {canSubmit ? (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Riwayat Lembur &amp; Overtime</h3>
            <p className="text-xs text-slate-500 mt-0.5">Pengajuan yang sudah disetujui atau ditolak</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tanggal</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Jenis</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Nominal</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Poin</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Tgl Proses</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Catatan Review</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myHistoryReqs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    Belum ada riwayat pengajuan yang diproses.
                  </td>
                </tr>
              ) : myHistoryReqs.map((row) => (
                <tr
                  key={row.id}
                  className={row.status === "APPROVED" && row.draftItems.length > 0 ? "cursor-pointer bg-white hover:bg-slate-50/50" : "bg-white"}
                  onClick={() => openDraftDetailModal(row)}
                >
                  <td className="px-3 py-2 text-slate-700">{row.requestDate}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="flex flex-col gap-1">
                      <span>{OVERTIME_TYPE_LABEL[row.overtimeType]}</span>
                      {row.overtimeType === "OVERTIME_3H" ? (
                        <span className="text-xs text-slate-500">{OVERTIME_PLACEMENT_LABEL[row.overtimePlacement]}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">{currency(row.totalAmount)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatOneDecimal(row.draftTotalPoints)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={row.status === "APPROVED" ? "default" : "destructive"}>
                      {row.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {row.status === "APPROVED" ? (row.approvedAt ?? "-") : (row.rejectedAt ?? "-")}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{row.reviewNotes ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {row.status === "APPROVED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openFillDraft(row); }}
                        >
                          Isi Draft
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {openTwSubmit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 space-y-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {isManagerial ? "Ajukan Lembur Managerial" : "Ajukan Overtime / Lembur"}
              </h3>
              {isManagerial ? (
                <p className="text-xs text-blue-600 mt-0.5">Pengajuan akan masuk ke antrian approval HRD secara langsung.</p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Tanggal</label>
                <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Jenis {isManagerial ? "Lembur" : "Overtime"}</label>
                <select
                  value={overtimeType}
                  onChange={(e) => {
                    const nextType = e.target.value as OvertimeRow["overtimeType"];
                    setOvertimeType(nextType);
                    if (nextType !== "OVERTIME_3H") {
                      setOvertimePlacement("AFTER_SHIFT");
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(OVERTIME_TYPE_LABEL)
                    .filter(([key]) => key !== "OVERTIME_1H" && key !== "OVERTIME_2H" && (!isManagerial || key !== "PATCH_ABSENCE_3H"))
                    .map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500">{OVERTIME_HELP_TEXT[overtimeType]}</p>
              </div>
            </div>
            {overtimeType === "OVERTIME_3H" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Penempatan Overtime 3 Jam</label>
                {myShiftInfo === "loading" ? (
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Memuat jadwal karyawan...</p>
                ) : myShiftInfo === null ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Jadwal tidak ditemukan untuk tanggal ini. Pastikan Anda memiliki jadwal aktif.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOvertimePlacement("BEFORE_SHIFT")}
                      className={`flex-1 rounded-md border px-3 py-2.5 text-sm text-left transition-colors ${
                        overtimePlacement === "BEFORE_SHIFT"
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-semibold">Berangkat Lebih Awal</span>
                      <span className="text-xs font-mono text-slate-500">
                        {addHoursToTime(myShiftInfo.startTime, -3)} – {myShiftInfo.endTime}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOvertimePlacement("AFTER_SHIFT")}
                      className={`flex-1 rounded-md border px-3 py-2.5 text-sm text-left transition-colors ${
                        overtimePlacement === "AFTER_SHIFT"
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block font-semibold">Pulang Lebih Lama</span>
                      <span className="text-xs font-mono text-slate-500">
                        {myShiftInfo.startTime} – {addHoursToTime(myShiftInfo.endTime, 3)}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Alasan / Catatan</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenTwSubmit(false)} disabled={pending}>Batal</Button>
              <Button onClick={() => void handleSubmitRequest()} disabled={pending}>
                {pending ? "Mengirim..." : "Kirim Pengajuan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {openTwDraft && activeDraftRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Isi Draft Lembur - {activeDraftRequest.requestDate}</h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-[140px_1fr_90px_auto] gap-2 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Job ID</label>
                  <Input value={draftJobId} onChange={(e) => setDraftJobId(e.target.value)} placeholder="Job ID..." />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Jenis Pekerjaan</label>
                  <div ref={comboboxRef} className="relative">
                    <button
                      type="button"
                      className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:bg-slate-50"
                      onClick={() => { setCatalogOpen((v) => !v); setCatalogSearch(""); }}
                    >
                      <span className={selectedCatalog ? "text-slate-900 truncate" : "text-slate-400"}>
                        {selectedCatalog
                          ? `${selectedCatalog.workName}${selectedCatalog.unitDescription ? ` (${selectedCatalog.unitDescription})` : ""} - ${formatOneDecimal(selectedCatalog.pointValue)} poin`
                          : "Pilih pekerjaan..."}
                      </span>
                    </button>
                    {catalogOpen ? (
                      <div className="absolute z-50 w-full mt-1 rounded-md border border-slate-200 bg-white shadow-lg">
                        <div className="p-2 border-b border-slate-100">
                          <Input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Cari pekerjaan atau kode..." className="h-8 text-sm" />
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {filteredCatalog.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ditemukan</p>
                          ) : filteredCatalog.map((catalog) => (
                            <button
                              key={catalog.id}
                              type="button"
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-slate-50 ${catalog.id === draftCatalogId ? "bg-teal-50 text-teal-700" : "text-slate-900"}`}
                              onClick={() => {
                                setDraftCatalogId(catalog.id);
                                setCatalogOpen(false);
                                setCatalogSearch("");
                                setError(null);
                              }}
                            >
                              <span className="truncate">
                                {catalog.externalCode ? <span className="font-mono text-xs text-slate-400 mr-1.5">{catalog.externalCode}</span> : null}
                                {catalog.workName}
                                {catalog.unitDescription ? <span className="text-slate-400"> ({catalog.unitDescription})</span> : null}
                              </span>
                              <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatOneDecimal(catalog.pointValue)} poin</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Qty</label>
                  <Input type="number" min="0.01" step="0.01" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
                </div>
                <Button variant="outline" onClick={addLineToCurrentJob}>+</Button>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={commitJobIdGroup} disabled={!draftJobId.trim() || currentJobLines.length === 0}>
                  Tambah Job ID
                </Button>
              </div>
              {currentJobLines.length > 0 ? (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-white border-b border-slate-100">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Jenis Pekerjaan</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">Qty</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">Poin</th>
                        <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">Total</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentJobLines.map((line) => (
                        <tr key={line.key}>
                          <td className="px-3 py-1.5">{line.workName}</td>
                          <td className="px-3 py-1.5 text-right">{line.quantity.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right">{formatOneDecimal(line.pointValue)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatOneDecimal(line.quantity * line.pointValue)}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="icon" variant="ghost" onClick={() => removeCurrentLine(line.key)} className="text-black hover:text-red-600 focus-visible:text-red-600 active:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Job ID</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Jenis Pekerjaan</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Poin</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedDraft.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Belum ada draft.</td></tr>
                  ) : groupedDraft.flatMap((group) => ([
                      <tr key={`hdr-${group.jobId}`} className="bg-slate-100">
                        <td className="px-3 py-2 font-semibold" colSpan={5}>Job ID: {group.jobId}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="icon" variant="ghost" onClick={() => removeDraftGroup(group.jobId)} className="text-black hover:text-red-600 focus-visible:text-red-600 active:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                      ,
                      ...group.items.map((item) => (
                        <tr key={item.key}>
                          <td className="px-3 py-2">{item.jobId}</td>
                          <td className="px-3 py-2">{item.workName}</td>
                          <td className="px-3 py-2 text-right">{item.quantity.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{formatOneDecimal(item.pointValue)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatOneDecimal(item.totalPoints)}</td>
                          <td className="px-3 py-2 text-right">
                            <Button size="icon" variant="ghost" onClick={() => removeDraftItem(item.key)} className="text-black hover:text-red-600 focus-visible:text-red-600 active:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )),
                    ]))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenTwDraft(false)} disabled={pending}>Batal</Button>
              <Button onClick={() => void saveDraft()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan Draft"}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {openDraftDetail && activeDraftRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Detail Draft Lembur - {activeDraftRequest.requestDate}</h3>
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Job ID</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Jenis Pekerjaan</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Poin</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeDraftRequest.draftItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.jobId}</td>
                      <td className="px-3 py-2">{item.workName}</td>
                      <td className="px-3 py-2 text-right">{item.quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{formatOneDecimal(item.pointValue)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatOneDecimal(item.totalPoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpenDraftDetail(false)}>Tutup</Button>
            </div>
          </div>
        </div>
      ) : null}

      {openSpvSubmit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Ajukan Lembur SPV (Auto Approve)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Tanggal</label>
                <Input type="date" value={spvRequestDate} onChange={(e) => setSpvRequestDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Jenis</label>
                <select
                  value={spvOvertimeType}
                  onChange={(e) => {
                    const nextType = e.target.value as OvertimeRow["overtimeType"];
                    setSpvOvertimeType(nextType);
                    if (nextType !== "OVERTIME_3H") {
                      setSpvOvertimePlacement("AFTER_SHIFT");
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(OVERTIME_TYPE_LABEL).filter(([key]) => key !== "OVERTIME_1H" && key !== "OVERTIME_2H" && key !== "PATCH_ABSENCE_3H").map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            {spvOvertimeType === "OVERTIME_3H" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Penempatan Overtime 3 Jam</label>
                <select
                  value={spvOvertimePlacement}
                  onChange={(e) => setSpvOvertimePlacement(e.target.value as OvertimeRow["overtimePlacement"])}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="AFTER_SHIFT">Setelah jam kerja default (contoh 12.00-00.00)</option>
                  <option value="BEFORE_SHIFT">Sebelum jam kerja default (contoh 09.00-21.00)</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Catatan</label>
              <textarea
                value={spvReason}
                onChange={(e) => setSpvReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenSpvSubmit(false)} disabled={pending}>Batal</Button>
              <Button onClick={() => void handleSpvSelfSubmit()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {openSpvSchedule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 space-y-3">
            <h3 className="text-base font-semibold text-slate-900">Atur Lembur Terjadwal Divisi</h3>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Karyawan</label>
              <select
                value={targetEmployeeId}
                onChange={(e) => setTargetEmployeeId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Pilih karyawan</option>
                {scopedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} - {employee.fullName} ({resolveEmployeeGroupLabel(employee.employeeGroup)})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Tanggal</label>
              <Input type="date" value={scheduleRequestDate} onChange={(e) => setScheduleRequestDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Penempatan Overtime 3 Jam</label>
              {scheduleShiftInfo === "loading" ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Memuat jadwal karyawan...</p>
              ) : scheduleShiftInfo === null ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {targetEmployeeId
                    ? "Jadwal tidak ditemukan untuk tanggal ini. Pastikan karyawan memiliki jadwal aktif."
                    : "Pilih karyawan dan tanggal terlebih dahulu."}
                </p>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setScheduleOvertimeType("OVERTIME_3H"); setScheduleOvertimePlacement("BEFORE_SHIFT"); }}
                    className={`flex-1 rounded-md border px-3 py-2.5 text-sm text-left transition-colors ${
                      scheduleOvertimePlacement === "BEFORE_SHIFT"
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-semibold">Sebelum Shift</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {addHoursToTime(scheduleShiftInfo.startTime, -3)} – {scheduleShiftInfo.startTime}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScheduleOvertimeType("OVERTIME_3H"); setScheduleOvertimePlacement("AFTER_SHIFT"); }}
                    className={`flex-1 rounded-md border px-3 py-2.5 text-sm text-left transition-colors ${
                      scheduleOvertimePlacement === "AFTER_SHIFT"
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-semibold">Setelah Shift</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {scheduleShiftInfo.endTime} – {addHoursToTime(scheduleShiftInfo.endTime, 3)}
                    </span>
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Catatan Penjadwalan</label>
              <textarea
                value={scheduleReason}
                onChange={(e) => setScheduleReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenSpvSchedule(false)} disabled={pending}>Batal</Button>
              <Button
                onClick={() => void handleSpvSchedule()}
                disabled={pending || !scheduleShiftInfo || scheduleShiftInfo === "loading"}
              >
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
