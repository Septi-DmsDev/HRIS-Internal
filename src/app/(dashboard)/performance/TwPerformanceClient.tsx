"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ChevronDown, ScanSearch, Trash2 } from "lucide-react";
import { batchSubmitDraft, deleteActivityEntry } from "@/server/actions/performance";
import { resolveActivityJobIdLabel } from "@/lib/performance/job-id";
import { formatPointNumber } from "@/lib/format/number";
import type { TwCatalogEntry, TwActivityItem } from "@/server/actions/performance";

type DraftItem = {
  key: string;
  catalogEntryId: string;
  jobId: string;
  workName: string;
  pointValue: number;
  qty: number;
};

type JobGroup = {
  jobId: string;
};

type CurrentJobLine = {
  key: string;
  catalogEntryId: string;
  workName: string;
  pointValue: number;
  qty: number;
};

type DateGroup = {
  workDate: string;
  entries: TwActivityItem[];
  totalJobs: number;
  totalPoints: number;
  statusLabel: string;
  statusType: "pending" | "approved" | "rejected" | "locked";
  canEdit: boolean;
  canDelete: boolean;
  deletableEntryIds: string[];
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  locked: "outline",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function resolveGroupStatus(entries: TwActivityItem[]): DateGroup["statusType"] {
  const statuses = entries.map((e) => e.status);
  if (statuses.some((s) => s === "DITOLAK_SPV")) return "rejected";
  if (statuses.some((s) => ["DIAJUKAN", "DIAJUKAN_ULANG"].includes(s))) return "pending";
  if (statuses.every((s) => s === "DIKUNCI_PAYROLL")) return "locked";
  return "approved";
}

const STATUS_TEXT: Record<DateGroup["statusType"], string> = {
  pending: "Menunggu Review HRD",
  approved: "Disetujui HRD",
  rejected: "Ditolak HRD",
  locked: "Terkunci",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type BrowserTesseract = {
  recognize: (
    image: Blob | string,
    lang?: string,
    options?: {
      logger?: (message: unknown) => void;
      tessedit_char_whitelist?: string;
      preserve_interword_spaces?: string;
      user_defined_dpi?: string;
    }
  ) => Promise<{ data?: { text?: string } }>;
};

declare global {
  interface Window {
    Tesseract?: BrowserTesseract;
  }
}

function normalizeJobId(raw: string) {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

function extractJobIdsFromText(text: string) {
  // Selaras dengan engine referensi: 2 huruf + spasi + 2-6 angka
  const regex = /(?:^|[\s,;|])([A-Za-z]{2})\s+(\d{2,6})(?=\s|$|[^A-Za-z0-9])/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    found.add(normalizeJobId(`${m[1]} ${m[2]}`));
  }
  return Array.from(found);
}

async function preprocessForOcr(file: Blob): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal memuat gambar"));
    image.src = URL.createObjectURL(file);
  });

  const w = img.naturalWidth || 640;
  const h = img.naturalHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w * 2);
  canvas.height = Math.max(1, h * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += g;
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
  }
  const mean = sum / (d.length / 4);
  const darkBg = mean < 128;

  for (let i = 0; i < d.length; i += 4) {
    let g = d[i];
    if (darkBg) g = 255 - g;
    g = (g - 128) * 1.4 + 128;
    g = Math.max(80, Math.min(235, g));
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
  }

  ctx.putImageData(imageData, 0, 0);
  ctx.filter = "contrast(120%) brightness(102%)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ?? file;
}

type Props = {
  catalogEntries: TwCatalogEntry[];
  activities: TwActivityItem[];
  divisionName: string | null;
};

export default function TwPerformanceClient({ catalogEntries, activities, divisionName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  // Stage 1: current Job ID group being built
  const [currentJobId, setCurrentJobId] = useState("");
  const [currentJobLines, setCurrentJobLines] = useState<CurrentJobLine[]>([]);

  // Line input for current job group
  const [inputCatalogId, setInputCatalogId] = useState("");
  const [inputQty, setInputQty] = useState("1");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<DateGroup | null>(null);
  const [openOcrModal, setOpenOcrModal] = useState(false);
  const [ocrPending, setOcrPending] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrStreamOn, setOcrStreamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const workDate = searchParams.get("workDate");
    const fromOvertime = searchParams.get("fromOvertime");
    if (!workDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return;
    setSelectedDate(workDate);
    setActiveTab("submit");
    if (fromOvertime) {
      setSuccess(`Tanggal draft diatur dari overtime approved (${workDate}). Lanjutkan isi Job ID dan jenis pekerjaan.`);
    }
  }, [searchParams]);

  const selectedCatalog = catalogEntries.find((c) => c.id === inputCatalogId);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalogEntries;
    return catalogEntries.filter(
      (c) =>
        c.workName.toLowerCase().includes(q) ||
        c.externalCode?.toLowerCase().includes(q)
    );
  }, [catalogSearch, catalogEntries]);

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

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Add one work type line to the current Job ID group
  function addLineToCurrentJob() {
    if (!inputCatalogId) { setError("Pilih jenis pekerjaan terlebih dahulu."); return; }
    const cat = catalogEntries.find((c) => c.id === inputCatalogId);
    if (!cat) return;
    const qty = Math.max(0.01, Number(inputQty) || 1);
    setError(null);
    setCurrentJobLines((prev) => [
      ...prev,
      {
        key: `${inputCatalogId}-${Date.now()}`,
        catalogEntryId: cat.id,
        workName: cat.workName,
        pointValue: Number(cat.pointValue),
        qty,
      },
    ]);
    setInputCatalogId("");
    setInputQty("1");
    setCatalogSearch("");
    setCatalogOpen(false);
  }

  function removeCurrentLine(key: string) {
    setCurrentJobLines((prev) => prev.filter((l) => l.key !== key));
  }

  // Commit current Job ID + its lines into the draft list
  function commitJobIdGroup() {
    if (!currentJobId.trim()) { setError("Isi Job ID terlebih dahulu."); return; }
    if (currentJobLines.length === 0) { setError("Tambahkan minimal 1 jenis pekerjaan untuk Job ID ini."); return; }
    setError(null);
    const jobId = normalizeJobId(currentJobId);
    setJobGroups((prev) => (prev.some((g) => g.jobId === jobId) ? prev : [...prev, { jobId }]));
    setDraftItems((prev) => [
      ...prev,
      ...currentJobLines.map((line) => ({
        key: `${jobId}-${line.key}`,
        catalogEntryId: line.catalogEntryId,
        jobId,
        workName: line.workName,
        pointValue: line.pointValue,
        qty: line.qty,
      })),
    ]);
    setCurrentJobId("");
    setCurrentJobLines([]);
  }

  function removeDraftItem(key: string) {
    setDraftItems((prev) => prev.filter((i) => i.key !== key));
  }

  function removeDraftGroup(jobId: string) {
    setDraftItems((prev) => prev.filter((i) => i.jobId !== jobId));
    setJobGroups((prev) => prev.filter((g) => g.jobId !== jobId));
  }

  function editDraftGroup(jobId: string) {
    const groupItems = draftItems.filter((item) => item.jobId === jobId);
    setCurrentJobId(jobId);
    setCurrentJobLines(
      groupItems.map((item) => ({
        key: `${item.key}-edit`,
        catalogEntryId: item.catalogEntryId,
        workName: item.workName,
        pointValue: item.pointValue,
        qty: item.qty,
      }))
    );
    setDraftItems((prev) => prev.filter((item) => item.jobId !== jobId));
    setJobGroups((prev) => prev.filter((g) => g.jobId !== jobId));
    setActiveTab("submit");
  }

  async function handleSubmit() {
    if (draftItems.length === 0) { setError("Tambahkan minimal 1 aktivitas."); return; }
    if (currentJobLines.length > 0) {
      setError("Ada jenis pekerjaan di Job ID saat ini yang belum dimasukkan ke draft. Tekan [+ Job ID] terlebih dahulu.");
      return;
    }
    const emptyGroups = jobGroups.filter((g) => !draftItems.some((i) => i.jobId === g.jobId));
    if (emptyGroups.length > 0) {
      setError(`Masih ada Job ID tanpa pekerjaan: ${emptyGroups.map((g) => g.jobId).join(", ")}`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await batchSubmitDraft({
        workDate: selectedDate,
        items: draftItems.map((i) => ({
          pointCatalogEntryId: i.catalogEntryId,
          jobId: i.jobId,
          quantity: i.qty,
        })),
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setDraftItems([]);
      setJobGroups([]);
      setCurrentJobId("");
      setCurrentJobLines([]);
      setEditingDate(null);
      setSuccess("Draft berhasil dikirim ke HRD untuk review.");
      setActiveTab("history");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteHistoryGroup(group: DateGroup) {
    if (!group.canDelete || group.deletableEntryIds.length === 0) {
      setError("Aktivitas pada tanggal ini tidak dapat dihapus.");
      return;
    }
    const ok = window.confirm(`Hapus ${group.deletableEntryIds.length} aktivitas pada tanggal ${formatDate(group.workDate)}?`);
    if (!ok) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      for (const id of group.deletableEntryIds) {
        const result = await deleteActivityEntry(id);
        if (result && "error" in result) {
          setError(result.error ?? "Gagal menghapus aktivitas.");
          return;
        }
      }
      if (historyDetail?.workDate === group.workDate) {
        setHistoryDetail(null);
      }
      setSuccess("Riwayat aktivitas berhasil dihapus.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function handleEdit(group: DateGroup) {
    const items: DraftItem[] = group.entries
      .filter((e) => e.status === "DITOLAK_SPV")
      .map((e) => {
        const cat = catalogEntries.find((c) => c.id === e.pointCatalogEntryId);
        return {
          key: `${e.id}-edit`,
          catalogEntryId: e.pointCatalogEntryId,
          jobId: resolveActivityJobIdLabel(e.jobIdSnapshot, cat?.externalCode ?? null, e.notes),
          workName: e.workNameSnapshot,
          pointValue: Number(e.pointValueSnapshot),
          qty: Number(e.quantity),
        };
      });
    setSelectedDate(group.workDate);
    setDraftItems(items);
    setJobGroups(Array.from(new Set(items.map((i) => i.jobId))).map((jobId) => ({ jobId })));
    setCurrentJobId("");
    setCurrentJobLines([]);
    setEditingDate(group.workDate);
    setError(null);
    setSuccess(null);
    setActiveTab("submit");
  }

  async function ensureTesseractLoaded() {
    if (typeof window === "undefined") return null;
    if (window.Tesseract) return window.Tesseract;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-ocr='tesseract']");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Gagal memuat OCR engine")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.dataset.ocr = "tesseract";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Gagal memuat OCR engine"));
      document.body.appendChild(script);
    });
    return window.Tesseract ?? null;
  }

  function mergeDetectedJobIds(jobIds: string[]) {
    if (jobIds.length === 0) {
      setError("Kode Job ID tidak terdeteksi. Pastikan format seperti TT 6312 terlihat jelas.");
      return;
    }
    setJobGroups((prev) => {
      const set = new Set(prev.map((g) => g.jobId));
      const next = [...prev];
      for (const jobId of jobIds) {
        if (!set.has(jobId)) {
          next.push({ jobId });
          set.add(jobId);
        }
      }
      return next;
    });
    setSuccess(`OCR berhasil mendeteksi ${jobIds.length} Job ID.`);
    setError(null);
    setOpenOcrModal(false);
    setActiveTab("submit");
  }

  async function runOcrOnBlob(blob: Blob) {
    setOcrPending(true);
    setError(null);
    try {
      const engine = await ensureTesseractLoaded();
      if (!engine) {
        setError("OCR engine tidak tersedia di browser ini.");
        return;
      }
      const preprocessed = await preprocessForOcr(blob);

      const [rawResult, processedResult] = await Promise.all([
        engine.recognize(blob, "eng", {
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_/.",
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        }),
        engine.recognize(preprocessed, "eng", {
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_/.",
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        }),
      ]);

      const rawText = rawResult?.data?.text ?? "";
      const processedText = processedResult?.data?.text ?? "";
      const mergedText = [rawText, processedText].filter(Boolean).join("\n");
      setOcrText(mergedText);

      const mergedIds = Array.from(new Set([
        ...extractJobIdsFromText(rawText),
        ...extractJobIdsFromText(processedText),
      ]));
      mergeDetectedJobIds(mergedIds);
    } catch {
      setError("OCR gagal diproses. Coba ulangi dengan gambar yang lebih jelas.");
    } finally {
      setOcrPending(false);
    }
  }

  async function handleUploadImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrPreview(URL.createObjectURL(file));
    await runOcrOnBlob(file);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setOcrStreamOn(true);
    } catch {
      setError("Akses kamera ditolak atau tidak tersedia.");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setOcrStreamOn(false);
  }

  async function captureFromCamera() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setOcrPreview(dataUrl);
    const blob = await (await fetch(dataUrl)).blob();
    await runOcrOnBlob(blob);
  }

  const dateGroups = useMemo((): DateGroup[] => {
    const map = new Map<string, TwActivityItem[]>();
    for (const a of activities) {
      const key = typeof a.workDate === "string"
        ? a.workDate
        : a.workDate instanceof Date
          ? a.workDate.toISOString().slice(0, 10)
          : String(a.workDate);
      const existing = map.get(key) ?? [];
      existing.push(a);
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([workDate, entries]) => {
        const statusType = resolveGroupStatus(entries);
        const totalJobs = new Set(entries.map((e) => e.pointCatalogEntryId)).size;
        const isShowPoints = ["approved", "locked"].includes(statusType);
        const totalPoints = isShowPoints
          ? entries.reduce((s, e) => s + Number(e.totalPoints), 0)
          : 0;
        const deletableEntryIds = entries
          .filter((entry) => ["DRAFT", "DIAJUKAN", "DIAJUKAN_ULANG"].includes(entry.status))
          .map((entry) => entry.id);
        return {
          workDate,
          entries,
          totalJobs,
          totalPoints,
          statusLabel: STATUS_TEXT[statusType],
          statusType,
          canEdit: statusType === "rejected",
          canDelete: deletableEntryIds.length === entries.length && entries.length > 0,
          deletableEntryIds,
        };
      });
  }, [activities]);

  // Group committed draft items by Job ID (preserve insertion order)
  const groupedDraft = useMemo(() => {
    const seen = new Map<string, DraftItem[]>();
    const order: string[] = jobGroups.map((g) => g.jobId);
    for (const jobId of order) seen.set(jobId, []);
    for (const item of draftItems) {
      if (!seen.has(item.jobId)) {
        seen.set(item.jobId, []);
        order.push(item.jobId);
      }
      seen.get(item.jobId)!.push(item);
    }
    return order.map((jobId) => ({ jobId, items: seen.get(jobId)! }));
  }, [draftItems, jobGroups]);

  const draftTotal = draftItems.reduce((s, i) => s + i.pointValue * i.qty, 0);
  const currentJobLineTotal = currentJobLines.reduce((s, l) => s + l.pointValue * l.qty, 0);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "submit" | "history")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Performa Saya</h2>
            {divisionName && (
              <p className="text-sm text-slate-500">Divisi: {divisionName}</p>
            )}
          </div>
          <TabsList>
            <TabsTrigger value="submit">Submit Draft</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        {/* ── TAB SUBMIT ── */}
        <TabsContent value="submit" className="space-y-4 pt-2">
          {editingDate && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Mengedit ulang draft yang ditolak HRD untuk tanggal{" "}
              <strong>{formatDate(editingDate)}</strong>. Ubah isian lalu kirim ulang.
            </div>
          )}

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

          {catalogEntries.length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                Belum ada katalog poin aktif untuk divisi Anda.
              </p>
            </div>
          ) : (
            <>
              {/* ── Stage 1: Build current Job ID group ── */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Tambah Aktivitas
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-medium text-slate-600">Tanggal Kerja</label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setEditingDate(null); }}
                      className="w-40 h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Row 1: Job ID + Pekerjaan + Qty + [+] */}
                <div className="grid grid-cols-[140px_1fr_90px_auto] gap-2 items-end">
                  {/* JOB ID */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Job ID</label>
                    <Input
                      value={currentJobId}
                      onChange={(e) => { setCurrentJobId(e.target.value); setError(null); }}
                      placeholder="Job ID…"
                      className="bg-white"
                    />
                  </div>

                  {/* JENIS PEKERJAAN — searchable combobox */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Jenis Pekerjaan</label>
                    <div ref={comboboxRef} className="relative">
                      <button
                        type="button"
                        className="h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:bg-slate-50"
                        onClick={() => { setCatalogOpen((o) => !o); setCatalogSearch(""); }}
                      >
                        <span className={inputCatalogId ? "text-slate-900 truncate" : "text-slate-400"}>
                          {selectedCatalog
                            ? `${selectedCatalog.workName}${selectedCatalog.unitDescription ? ` (${selectedCatalog.unitDescription})` : ""} — ${formatPointNumber(selectedCatalog.pointValue)} poin`
                            : "Pilih pekerjaan…"}
                        </span>
                        <ChevronDown size={14} className="text-slate-400 shrink-0" />
                      </button>

                      {catalogOpen && (
                        <div className="absolute z-50 w-full mt-1 rounded-md border border-slate-200 bg-white shadow-lg">
                          <div className="p-2 border-b border-slate-100">
                            <Input
                              autoFocus
                              value={catalogSearch}
                              onChange={(e) => setCatalogSearch(e.target.value)}
                              placeholder="Cari pekerjaan atau kode…"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {filteredCatalog.length === 0 ? (
                              <p className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ditemukan</p>
                            ) : (
                              filteredCatalog.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-slate-50 ${
                                    c.id === inputCatalogId ? "bg-teal-50 text-teal-700" : "text-slate-900"
                                  }`}
                                  onClick={() => {
                                    setInputCatalogId(c.id);
                                    setCatalogOpen(false);
                                    setCatalogSearch("");
                                    setError(null);
                                  }}
                                >
                                  <span className="truncate">
                                    {c.externalCode && (
                                      <span className="font-mono text-xs text-slate-400 mr-1.5">{c.externalCode}</span>
                                    )}
                                    {c.workName}
                                    {c.unitDescription && (
                                      <span className="text-slate-400"> ({c.unitDescription})</span>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatPointNumber(c.pointValue)} poin</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* QTY */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Qty</label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={inputQty}
                      onChange={(e) => setInputQty(e.target.value)}
                    />
                  </div>

                  <Button variant="outline" onClick={addLineToCurrentJob} className="shrink-0 px-3">
                    +
                  </Button>
                </div>

                {/* Row 2: Tambah Job ID (right-aligned) */}
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={commitJobIdGroup}
                    disabled={currentJobLines.length === 0 || !currentJobId.trim()}
                    size="sm"
                  >
                    Tambah Job ID
                  </Button>
                </div>

                {/* Current job lines mini-table — lines added to current Job ID */}
                {currentJobLines.length > 0 && (
                  <div className="rounded-md border border-slate-200 overflow-hidden mt-1">
                    <table className="w-full text-sm">
                      <thead className="bg-white border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Jenis Pekerjaan</th>
                          <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">Qty</th>
                          <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-500">Poin</th>
                          <th className="px-3 py-1.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentJobLines.map((line) => (
                          <tr key={line.key} className="bg-slate-50/50">
                            <td className="px-3 py-1.5 text-slate-800">{line.workName}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{line.qty}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                              {formatPointNumber(line.pointValue * line.qty)}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => removeCurrentLine(line.key)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200 bg-white">
                        <tr>
                          <td colSpan={2} className="px-3 py-1.5 text-xs font-medium text-slate-500 text-right">
                            Subtotal
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-teal-600 tabular-nums">
                            {formatPointNumber(currentJobLineTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

              </div>

              {/* ── Stage 2: Committed draft list grouped by Job ID ── */}
              {groupedDraft.length > 0 && (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID / Jenis Pekerjaan</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Poin</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupedDraft.map(({ jobId, items }) => {
                        const groupTotal = items.reduce((s, i) => s + i.pointValue * i.qty, 0);
                        const isEmpty = items.length === 0;
                        return (
                          <Fragment key={`grp-${jobId}`}>
                            {/* Job ID header row */}
                            <tr key={`hdr-${jobId}`} className="bg-slate-100 border-t border-slate-200">
                              <td className="px-4 py-2 font-semibold text-slate-700 font-mono text-xs" colSpan={2}>
                                Job ID: {jobId}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums text-xs font-medium text-slate-600">
                                {formatPointNumber(groupTotal)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => editDraftGroup(jobId)}>
                                    Edit
                                  </Button>
                                  <button
                                    onClick={() => removeDraftGroup(jobId)}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                    title="Hapus seluruh Job ID ini"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {/* Work type rows */}
                            {isEmpty ? (
                              <tr className="bg-white border-t border-slate-100">
                                <td colSpan={4} className="px-4 py-2.5 text-xs text-amber-700">
                                  Job ID ini belum punya pekerjaan. Klik Edit untuk melengkapi.
                                </td>
                              </tr>
                            ) : items.map((item) => (
                              <tr key={item.key} className="bg-white hover:bg-slate-50/50 border-t border-slate-100">
                                <td className="px-4 py-2 pl-8 text-slate-700">{item.workName}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-slate-600">{item.qty}</td>
                                <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">
                                  {formatPointNumber(item.pointValue * item.qty)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    onClick={() => removeDraftItem(item.key)}
                                    className="text-slate-300 hover:text-red-400 transition-colors"
                                    title="Hapus baris ini"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-2.5 text-sm font-semibold text-slate-700 text-right">
                          Total Poin
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-teal-600 tabular-nums">
                          {formatPointNumber(draftTotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {jobGroups.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => void handleSubmit()}
                    disabled={pending || jobGroups.some((g) => !draftItems.some((i) => i.jobId === g.jobId))}
                    size="lg"
                  >
                    {pending ? "Mengirim…" : editingDate ? "Kirim Ulang Draft" : "Kirim Draft"}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── TAB HISTORY ── */}
        <TabsContent value="history" className="pt-2">
          {dateGroups.length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-6 py-16 text-center">
              <p className="text-sm text-slate-500">Belum ada riwayat aktivitas.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Tgl Draft
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Total Job
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Poin
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateGroups.map((group) => (
                    <tr
                      key={group.workDate}
                      className="cursor-pointer bg-white hover:bg-slate-50/50"
                      onClick={() => setHistoryDetail(group)}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatDate(group.workDate)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                        {group.totalJobs}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                        {["approved", "locked"].includes(group.statusType)
                          ? formatPointNumber(group.totalPoints)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[group.statusType]}>
                            {group.statusLabel}
                          </Badge>
                          {group.canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(group);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {group.canDelete ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteHistoryGroup(group);
                            }}
                          >
                            Hapus
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <button
        type="button"
        onClick={() => setOpenOcrModal(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        title="Scan Job ID"
      >
        <ScanSearch className="mx-auto h-6 w-6" />
      </button>

      <Dialog open={openOcrModal} onOpenChange={(open) => { setOpenOcrModal(open); if (!open) stopCamera(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Scan Job ID (OCR)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Upload screenshot/foto atau gunakan kamera. Format yang terbaca: contoh <code>TT 6312</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <span>Upload Gambar</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleUploadImage(e)} />
              </label>
              {!ocrStreamOn ? (
                <Button type="button" variant="outline" onClick={() => void startCamera()}>
                  <Camera className="mr-2 h-4 w-4" />
                  Buka Kamera
                </Button>
              ) : (
                <>
                  <Button type="button" onClick={() => void captureFromCamera()} disabled={ocrPending}>Ambil & Scan</Button>
                  <Button type="button" variant="outline" onClick={stopCamera}>Tutup Kamera</Button>
                </>
              )}
            </div>

            {ocrStreamOn && (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full object-cover" />
              </div>
            )}

            {ocrPreview && (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <img src={ocrPreview} alt="OCR Preview" className="max-h-64 w-full object-contain bg-slate-50" />
              </div>
            )}

            {ocrText ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Teks Terdeteksi</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{ocrText}</pre>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenOcrModal(false); stopCamera(); }}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDetail !== null} onOpenChange={(open) => !open && setHistoryDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Detail Draft - {historyDetail ? formatDate(historyDetail.workDate) : "-"}
            </DialogTitle>
          </DialogHeader>

          {historyDetail && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Total job: <span className="font-semibold text-slate-900">{historyDetail.totalJobs}</span>
                {" • "}
                Status: <span className="font-semibold text-slate-900">{historyDetail.statusLabel}</span>
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Jenis Pekerjaan</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Poin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyDetail.entries.map((entry) => (
                      <tr key={entry.id} className="bg-white">
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">
                          {resolveActivityJobIdLabel(entry.jobIdSnapshot, null, entry.notes)}
                        </td>
                        <td className="px-4 py-2 text-slate-900">{entry.workNameSnapshot}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{entry.quantity}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">{entry.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDetail(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
