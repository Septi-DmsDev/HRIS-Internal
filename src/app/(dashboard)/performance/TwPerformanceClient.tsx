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
import { Camera, ChevronDown, Pencil, ScanSearch, Trash2 } from "lucide-react";
import { appendToPendingDraft, batchSubmitDraft, deleteActivityEntry, updatePendingActivityEntry } from "@/server/actions/performance";
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
  statusType: "pending" | "approved" | "rejected" | "revision" | "locked";
  canEdit: boolean;
  canDelete: boolean;
  canAddTo: boolean;
  deletableEntryIds: string[];
};

type PersistedDraftState = {
  activeTab: "submit" | "history";
  selectedDate: string;
  draftItems: DraftItem[];
  jobGroups: JobGroup[];
  editingDate: string | null;
  currentJobId: string;
  currentJobLines: CurrentJobLine[];
  inputCatalogId: string;
  inputQty: string;
  appendingDate: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  revision: "secondary",
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
  if (statuses.some((s) => s === "REVISI_TW")) return "revision";
  return "approved";
}

const STATUS_TEXT: Record<DateGroup["statusType"], string> = {
  pending: "Menunggu Review HRD",
  approved: "Disetujui HRD",
  rejected: "Ditolak HRD",
  revision: "Perlu Direvisi",
  locked: "Terkunci",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const DRAFT_STORAGE_VERSION = 1;

function getDraftStorageKey(employeeId?: string | null) {
  return employeeId ? `performance:tw-draft:v${DRAFT_STORAGE_VERSION}:${employeeId}` : null;
}

function clearDraftStorage(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Browser storage can be disabled; draft submission must still work.
  }
}

function readPersistedDraftState(storageKey: string | null): PersistedDraftState | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDraftState>;
    if (
      typeof parsed.selectedDate !== "string" ||
      !Array.isArray(parsed.draftItems) ||
      !Array.isArray(parsed.jobGroups) ||
      !Array.isArray(parsed.currentJobLines)
    ) {
      return null;
    }
    return {
      activeTab: parsed.activeTab === "history" ? "history" : "submit",
      selectedDate: parsed.selectedDate,
      draftItems: parsed.draftItems as DraftItem[],
      jobGroups: parsed.jobGroups as JobGroup[],
      editingDate: typeof parsed.editingDate === "string" || parsed.editingDate === null ? parsed.editingDate : null,
      currentJobId: typeof parsed.currentJobId === "string" ? parsed.currentJobId : "",
      currentJobLines: parsed.currentJobLines as CurrentJobLine[],
      inputCatalogId: typeof parsed.inputCatalogId === "string" ? parsed.inputCatalogId : "",
      inputQty: typeof parsed.inputQty === "string" ? parsed.inputQty : "1",
      appendingDate: typeof parsed.appendingDate === "string" || parsed.appendingDate === null ? parsed.appendingDate : null,
    };
  } catch {
    return null;
  }
}

function normalizeDraftItems(items: unknown, validCatalogEntryIds: Set<string>) {
  if (!Array.isArray(items)) return [] as DraftItem[];

  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<DraftItem>;
    if (
      typeof candidate.key !== "string" ||
      typeof candidate.catalogEntryId !== "string" ||
      typeof candidate.jobId !== "string" ||
      typeof candidate.workName !== "string"
    ) {
      return [];
    }
    if (!validCatalogEntryIds.has(candidate.catalogEntryId)) return [];

    const pointValue = Number(candidate.pointValue);
    const qty = Number(candidate.qty);
    if (!Number.isFinite(pointValue) || !Number.isFinite(qty) || pointValue <= 0 || qty <= 0) return [];

    return [
      {
        key: candidate.key || `${candidate.jobId}-${index}`,
        catalogEntryId: candidate.catalogEntryId,
        jobId: normalizeJobId(candidate.jobId),
        workName: candidate.workName,
        pointValue,
        qty,
      },
    ];
  });
}

function normalizeCurrentJobLines(lines: unknown, validCatalogEntryIds: Set<string>) {
  if (!Array.isArray(lines)) return [] as CurrentJobLine[];

  return lines.flatMap((line, index) => {
    if (!line || typeof line !== "object") return [];
    const candidate = line as Partial<CurrentJobLine>;
    if (
      typeof candidate.key !== "string" ||
      typeof candidate.catalogEntryId !== "string" ||
      typeof candidate.workName !== "string"
    ) {
      return [];
    }
    if (!validCatalogEntryIds.has(candidate.catalogEntryId)) return [];

    const pointValue = Number(candidate.pointValue);
    const qty = Number(candidate.qty);
    if (!Number.isFinite(pointValue) || !Number.isFinite(qty) || pointValue <= 0 || qty <= 0) return [];

    return [
      {
        key: candidate.key || `${candidate.catalogEntryId}-${index}`,
        catalogEntryId: candidate.catalogEntryId,
        workName: candidate.workName,
        pointValue,
        qty,
      },
    ];
  });
}

function normalizeJobGroups(groups: unknown, draftItems: DraftItem[]) {
  const result: JobGroup[] = [];
  const seen = new Set<string>();

  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!group || typeof group !== "object") continue;
      const candidate = group as Partial<JobGroup>;
      if (typeof candidate.jobId !== "string") continue;
      const jobId = normalizeJobId(candidate.jobId);
      if (!jobId) continue;
      if (seen.has(jobId)) continue;
      seen.add(jobId);
      result.push({ jobId });
    }
  }

  for (const item of draftItems) {
    if (!item.jobId) continue;
    if (seen.has(item.jobId)) continue;
    seen.add(item.jobId);
    result.push({ jobId: item.jobId });
  }

  return result;
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
  employeeId: string;
};

type ImportedJsonItem = {
  jobId: string;
  workName: string;
  qty: number;
};

export default function TwPerformanceClient({ catalogEntries, activities, divisionName, employeeId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeWorkDate = searchParams.get("workDate");
  const routeFromOvertime = searchParams.get("fromOvertime");
  const initialRouteWorkDate = routeWorkDate && /^\d{4}-\d{2}-\d{2}$/.test(routeWorkDate) ? routeWorkDate : null;
  const draftStorageKey = useMemo(() => getDraftStorageKey(employeeId), [employeeId]);
  const persistedDraftState = useMemo(() => readPersistedDraftState(draftStorageKey), [draftStorageKey]);
  const shouldRestorePersistedDraft = Boolean(
    persistedDraftState && (!initialRouteWorkDate || initialRouteWorkDate === persistedDraftState.selectedDate)
  );
  const shouldPreserveExistingDraft = Boolean(
    persistedDraftState && initialRouteWorkDate && initialRouteWorkDate !== persistedDraftState.selectedDate
  );
  const initialDraftState = useMemo(() => {
    if (!shouldRestorePersistedDraft || !persistedDraftState) return null;

    const validCatalogEntryIds = new Set(catalogEntries.map((entry) => entry.id));
    const restoredDraftItems = normalizeDraftItems(persistedDraftState.draftItems, validCatalogEntryIds);

    return {
      ...persistedDraftState,
      draftItems: restoredDraftItems,
      jobGroups: normalizeJobGroups(persistedDraftState.jobGroups, restoredDraftItems),
      currentJobLines: normalizeCurrentJobLines(persistedDraftState.currentJobLines, validCatalogEntryIds),
      inputCatalogId: validCatalogEntryIds.has(persistedDraftState.inputCatalogId) ? persistedDraftState.inputCatalogId : "",
      inputQty: persistedDraftState.inputQty || "1",
    };
  }, [catalogEntries, persistedDraftState, shouldRestorePersistedDraft]);
  const initialOvertimeMessage =
    initialRouteWorkDate && routeFromOvertime
      ? `Tanggal draft diatur dari overtime approved (${initialRouteWorkDate}). Lanjutkan isi Job ID dan jenis pekerjaan.`
      : null;
  const [activeTab, setActiveTab] = useState<"submit" | "history">(() => initialDraftState?.activeTab ?? "submit");

  const [selectedDate, setSelectedDate] = useState(() => initialDraftState?.selectedDate ?? initialRouteWorkDate ?? todayStr());
  const [draftItems, setDraftItems] = useState<DraftItem[]>(() => initialDraftState?.draftItems ?? []);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>(() => initialDraftState?.jobGroups ?? []);
  const [editingDate, setEditingDate] = useState<string | null>(() => initialDraftState?.editingDate ?? null);

  // Stage 1: current Job ID group being built
  const [currentJobId, setCurrentJobId] = useState(() => initialDraftState?.currentJobId ?? "");
  const [currentJobLines, setCurrentJobLines] = useState<CurrentJobLine[]>(() => initialDraftState?.currentJobLines ?? []);

  // Line input for current job group
  const [inputCatalogId, setInputCatalogId] = useState(() => initialDraftState?.inputCatalogId ?? "");
  const [inputQty, setInputQty] = useState(() => initialDraftState?.inputQty ?? "1");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const comboboxRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(() => initialOvertimeMessage);
  const [historyDetail, setHistoryDetail] = useState<DateGroup | null>(null);
  // Mode tambah ke draft pending
  const [appendingDate, setAppendingDate] = useState<string | null>(() => initialDraftState?.appendingDate ?? null);

  // Edit satu entri pending di modal detail
  type EditingEntry = {
    id: string;
    jobId: string;
    catalogEntryId: string;
    qty: string;
  };
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [editEntryError, setEditEntryError] = useState<string | null>(null);
  const [editEntryCatalogOpen, setEditEntryCatalogOpen] = useState(false);
  const [editEntryCatalogSearch, setEditEntryCatalogSearch] = useState("");
  const editEntryCatalogRef = useRef<HTMLDivElement>(null);
  const [openOcrModal, setOpenOcrModal] = useState(false);
  const [ocrPending, setOcrPending] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [ocrStreamOn, setOcrStreamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!initialRouteWorkDate) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedDate(initialRouteWorkDate);
      setActiveTab("submit");
      if (routeFromOvertime) {
        setSuccess(`Tanggal draft diatur dari overtime approved (${initialRouteWorkDate}). Lanjutkan isi Job ID dan jenis pekerjaan.`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialRouteWorkDate, routeFromOvertime]);

  useEffect(() => {
    if (!draftStorageKey) return;

    const hasPersistableState =
      draftItems.length > 0 ||
      jobGroups.length > 0 ||
      currentJobLines.length > 0 ||
      currentJobId.trim().length > 0 ||
      inputCatalogId.length > 0 ||
      inputQty !== "1" ||
      editingDate !== null ||
      appendingDate !== null;

    if (!hasPersistableState) {
      if (shouldPreserveExistingDraft) return;
      clearDraftStorage(draftStorageKey);
      return;
    }

    const payload: PersistedDraftState = {
      activeTab,
      selectedDate,
      draftItems,
      jobGroups,
      editingDate,
      currentJobId,
      currentJobLines,
      inputCatalogId,
      inputQty,
      appendingDate,
    };

    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(payload));
    } catch {
      // Draft recovery is best-effort; server submission remains the source of truth.
    }
  }, [
    activeTab,
    appendingDate,
    currentJobId,
    currentJobLines,
    draftItems,
    draftStorageKey,
    editingDate,
    inputCatalogId,
    inputQty,
    jobGroups,
    shouldPreserveExistingDraft,
    selectedDate,
  ]);

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

  function normalizeLooseString(value: unknown) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function parsePerformanceJsonPayload(payload: unknown): ImportedJsonItem[] {
    const asObject = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const rootCandidates = [
      payload,
      asObject?.items,
      asObject?.data,
      asObject?.records,
      asObject?.activities,
      asObject?.pencatatan_harian,
    ];
    const rawRows = rootCandidates.find((candidate) => Array.isArray(candidate));
    if (!Array.isArray(rawRows)) {
      throw new Error("Format JSON tidak valid. Gunakan array data aktivitas.");
    }

    const result: ImportedJsonItem[] = [];
    rawRows.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const item = row as Record<string, unknown>;
      const jobId = normalizeJobId(
        normalizeLooseString(
          item.jobid ??
            item.job_id ??
            item.jobId ??
            item.job_code ??
            item.jobCode ??
            item["job code"]
        )
      );
      const workName = normalizeLooseString(
        item.jenis_pekerjaan ?? item.jenisPekerjaan ?? item.work_name ?? item.workName ?? item.pekerjaan
      );
      const qtyRaw = item.qty ?? item.quantity ?? item.jumlah ?? item.QTY;
      const qty = Number(qtyRaw);

      if (!workName || !Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Baris ${index + 1} tidak valid. Wajib ada job code, jenis pekerjaan, dan qty > 0.`);
      }
      // Izinkan placeholder job id seperti "." dari export lama, fallback ke "-" agar tetap bisa submit.
      const normalizedJobId = jobId && jobId !== "." ? jobId : "-";
      result.push({ jobId: normalizedJobId, workName, qty });
    });

    if (result.length === 0) {
      throw new Error("Tidak ada baris aktivitas valid di file JSON.");
    }

    return result;
  }

  async function handleUploadJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("File harus berformat .json");
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const importedItems = parsePerformanceJsonPayload(payload);
      const catalogByWorkName = new Map(
        catalogEntries.map((entry) => [entry.workName.trim().toLowerCase(), entry] as const)
      );

      const mappedDraftItems: DraftItem[] = [];
      for (let i = 0; i < importedItems.length; i += 1) {
        const row = importedItems[i];
        const matched = catalogByWorkName.get(row.workName.trim().toLowerCase());
        if (!matched) {
          throw new Error(`Jenis pekerjaan "${row.workName}" tidak ditemukan di katalog aktif sistem.`);
        }
        mappedDraftItems.push({
          key: `json-${Date.now()}-${i}`,
          catalogEntryId: matched.id,
          jobId: row.jobId,
          workName: matched.workName,
          pointValue: Number(matched.pointValue),
          qty: row.qty,
        });
      }

      setDraftItems((prev) => {
        const merged = [...prev, ...mappedDraftItems];
        setJobGroups((prevGroups) => normalizeJobGroups(prevGroups, merged));
        return merged;
      });
      setCurrentJobId("");
      setCurrentJobLines([]);
      setError(null);
      setSuccess(`Upload JSON berhasil: ${mappedDraftItems.length} baris aktivitas ditambahkan ke draft.`);
      setActiveTab("submit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca JSON. Pastikan format berisi job code, jenis pekerjaan, dan qty.");
    }
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
      const payload = {
        workDate: selectedDate,
        items: draftItems.map((i) => ({
          pointCatalogEntryId: i.catalogEntryId,
          jobId: i.jobId,
          quantity: i.qty,
        })),
      };
      const result = appendingDate
        ? await appendToPendingDraft(payload)
        : await batchSubmitDraft(payload);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      clearDraftStorage(draftStorageKey);
      setDraftItems([]);
      setJobGroups([]);
      setCurrentJobId("");
      setCurrentJobLines([]);
      setInputCatalogId("");
      setInputQty("1");
      setEditingDate(null);
      setAppendingDate(null);
      setSuccess(
        appendingDate
          ? "Job ID berhasil ditambahkan ke draft yang sedang direview HRD."
          : "Draft berhasil dikirim ke HRD untuk review."
      );
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
      .filter((e) => e.status === "DITOLAK_SPV" || e.status === "REVISI_TW")
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

  // Tutup combobox edit entry saat klik di luar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (editEntryCatalogRef.current && !editEntryCatalogRef.current.contains(e.target as Node)) {
        setEditEntryCatalogOpen(false);
        setEditEntryCatalogSearch("");
      }
    }
    if (editEntryCatalogOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editEntryCatalogOpen]);

  async function handleDeleteSingleEntry(entryId: string) {
    const ok = window.confirm("Hapus entri ini dari draft?");
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteActivityEntry(entryId);
      if (result && "error" in result) {
        setError(result.error ?? "Gagal menghapus entri.");
        return;
      }
      // Perbarui historyDetail secara optimistis
      setHistoryDetail((prev) => {
        if (!prev) return null;
        const entries = prev.entries.filter((e) => e.id !== entryId);
        if (entries.length === 0) return null; // tutup modal jika kosong
        const totalJobs = new Set(
          entries.map((e) => resolveActivityJobIdLabel(e.jobIdSnapshot, null, e.notes))
        ).size;
        return { ...prev, entries, totalJobs };
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleSaveEditEntry() {
    if (!editingEntry) return;
    if (!editingEntry.catalogEntryId) { setEditEntryError("Pilih jenis pekerjaan."); return; }
    const qty = Number(editingEntry.qty);
    if (!qty || qty <= 0) { setEditEntryError("Qty harus lebih besar dari 0."); return; }
    setPending(true);
    setEditEntryError(null);
    try {
      const result = await updatePendingActivityEntry({
        id: editingEntry.id,
        pointCatalogEntryId: editingEntry.catalogEntryId,
        jobId: editingEntry.jobId || undefined,
        quantity: qty,
      });
      if (result && "error" in result && result.error) {
        setEditEntryError(result.error);
        return;
      }
      // Perbarui historyDetail secara optimistis
      const cat = catalogEntries.find((c) => c.id === editingEntry.catalogEntryId);
      setHistoryDetail((prev) => {
        if (!prev) return null;
        const entries = prev.entries.map((e) => {
          if (e.id !== editingEntry.id) return e;
          const pv = Number(cat?.pointValue ?? e.pointValueSnapshot);
          return {
            ...e,
            jobIdSnapshot: editingEntry.jobId || e.jobIdSnapshot,
            pointCatalogEntryId: editingEntry.catalogEntryId,
            workNameSnapshot: cat?.workName ?? e.workNameSnapshot,
            pointValueSnapshot: pv,
            quantity: qty,
            totalPoints: Number((pv * qty).toFixed(2)),
          };
        });
        const totalJobs = new Set(
          entries.map((e) => resolveActivityJobIdLabel(e.jobIdSnapshot, null, e.notes))
        ).size;
        return { ...prev, entries, totalJobs };
      });
      setEditingEntry(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function handleAddToPending(group: DateGroup) {
    setSelectedDate(group.workDate);
    setDraftItems([]);
    setJobGroups([]);
    setCurrentJobId("");
    setCurrentJobLines([]);
    setAppendingDate(group.workDate);
    setEditingDate(null);
    setError(null);
    setSuccess(null);
    setHistoryDetail(null);
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
        const totalJobs = new Set(
          entries.map((e) => resolveActivityJobIdLabel(e.jobIdSnapshot, null, e.notes))
        ).size;
        const isShowPoints = ["pending", "approved", "locked"].includes(statusType);
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
          canEdit: statusType === "rejected" || statusType === "revision",
          canAddTo: statusType === "pending",
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
              {dateGroups.find((g) => g.workDate === editingDate)?.statusType === "revision"
                ? <>Draft tanggal <strong>{formatDate(editingDate)}</strong> dikembalikan oleh Admin untuk direvisi. Ubah isian lalu kirim ulang.</>
                : <>Mengedit ulang draft yang ditolak HRD untuk tanggal <strong>{formatDate(editingDate)}</strong>. Ubah isian lalu kirim ulang.</>
              }
            </div>
          )}

          {appendingDate && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
              <strong>Tambah Job ID</strong> ke draft tanggal{" "}
              <strong>{formatDate(appendingDate)}</strong> yang sedang direview HRD.
              Job ID lama tidak akan terhapus — hanya job ID baru yang ditambahkan.{" "}
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => {
                  setAppendingDate(null);
                  setDraftItems([]);
                  setJobGroups([]);
                  setCurrentJobId("");
                  setCurrentJobLines([]);
                }}
              >
                Batal
              </button>
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
                      onChange={(e) => { setSelectedDate(e.target.value); setEditingDate(null); setAppendingDate(null); }}
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
                        {["pending", "approved", "locked"].includes(group.statusType)
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
                          {group.canAddTo && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToPending(group);
                              }}
                            >
                              + Job ID
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
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleUploadJson(e)}
              />
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <span>Upload Gambar</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleUploadImage(e)} />
              </label>
              <Button
                type="button"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => jsonInputRef.current?.click()}
              >
                Upload JSON
              </Button>
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
        <DialogContent className="sm:max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              Detail Draft - {historyDetail ? formatDate(historyDetail.workDate) : "-"}
            </DialogTitle>
          </DialogHeader>

          {historyDetail && (
            <div className="flex flex-col gap-3 min-h-0 flex-1">
              <p className="text-sm text-slate-600 flex-shrink-0">
                Total job: <span className="font-semibold text-slate-900">{historyDetail.totalJobs}</span>
                {" • "}
                Status: <span className="font-semibold text-slate-900">{historyDetail.statusLabel}</span>
              </p>

              {editEntryError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex-shrink-0">
                  {editEntryError}
                </div>
              )}

              <div className="overflow-auto rounded-lg border border-slate-200 flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Jenis Pekerjaan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Poin</th>
                      {historyDetail.canAddTo && (
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyDetail.entries.map((entry) => {
                      const isEditing = editingEntry?.id === entry.id;
                      const filteredEditCatalog = editEntryCatalogSearch.trim()
                        ? catalogEntries.filter((c) =>
                            c.workName.toLowerCase().includes(editEntryCatalogSearch.toLowerCase()) ||
                            c.externalCode?.toLowerCase().includes(editEntryCatalogSearch.toLowerCase())
                          )
                        : catalogEntries;
                      const editCat = catalogEntries.find((c) => c.id === editingEntry?.catalogEntryId);
                      return (
                        <Fragment key={entry.id}>
                          <tr className={isEditing ? "bg-blue-50" : "bg-white"}>
                            <td className="px-3 py-2 font-mono text-xs text-slate-700">
                              {resolveActivityJobIdLabel(entry.jobIdSnapshot, null, entry.notes)}
                            </td>
                            <td className="px-3 py-2 text-slate-900">{entry.workNameSnapshot}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{entry.quantity}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{entry.totalPoints}</td>
                            {historyDetail.canAddTo && (
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    title="Edit entri"
                                    disabled={pending}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                                    onClick={() => {
                                      setEditEntryError(null);
                                      setEditingEntry({
                                        id: entry.id,
                                        jobId: resolveActivityJobIdLabel(entry.jobIdSnapshot, null, entry.notes) === "—"
                                          ? ""
                                          : resolveActivityJobIdLabel(entry.jobIdSnapshot, null, entry.notes),
                                        catalogEntryId: entry.pointCatalogEntryId,
                                        qty: String(entry.quantity),
                                      });
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Hapus entri"
                                    disabled={pending}
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                    onClick={() => void handleDeleteSingleEntry(entry.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>

                          {/* Baris edit inline */}
                          {isEditing && editingEntry && (
                            <tr className="bg-blue-50 border-t border-blue-200">
                              <td colSpan={historyDetail.canAddTo ? 5 : 4} className="px-3 py-3">
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap gap-2 items-start">
                                    {/* Job ID */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium text-slate-600">Job ID</label>
                                      <Input
                                        className="h-7 w-28 text-xs font-mono"
                                        placeholder="mis. SA 36342"
                                        value={editingEntry.jobId}
                                        onChange={(e) =>
                                          setEditingEntry((prev) => prev ? { ...prev, jobId: e.target.value.toUpperCase() } : null)
                                        }
                                      />
                                    </div>

                                    {/* Jenis Pekerjaan */}
                                    <div className="flex flex-col gap-1 flex-1 min-w-[160px]" ref={editEntryCatalogRef}>
                                      <label className="text-xs font-medium text-slate-600">Jenis Pekerjaan</label>
                                      <div className="relative">
                                        <button
                                          type="button"
                                          className="flex h-7 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 text-xs hover:border-slate-300"
                                          onClick={() => { setEditEntryCatalogOpen((v) => !v); setEditEntryCatalogSearch(""); }}
                                        >
                                          <span className="truncate text-left">
                                            {editCat ? editCat.workName : <span className="text-slate-400">Pilih jenis...</span>}
                                          </span>
                                          <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-slate-400" />
                                        </button>
                                        {editEntryCatalogOpen && (
                                          <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-slate-200 bg-white shadow-lg">
                                            <div className="p-1.5">
                                              <Input
                                                autoFocus
                                                className="h-7 text-xs"
                                                placeholder="Cari jenis pekerjaan..."
                                                value={editEntryCatalogSearch}
                                                onChange={(e) => setEditEntryCatalogSearch(e.target.value)}
                                              />
                                            </div>
                                            <div className="max-h-44 overflow-y-auto">
                                              {filteredEditCatalog.length === 0 ? (
                                                <p className="px-3 py-2 text-xs text-slate-500">Tidak ditemukan.</p>
                                              ) : (
                                                filteredEditCatalog.map((c) => (
                                                  <button
                                                    key={c.id}
                                                    type="button"
                                                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                                                    onClick={() => {
                                                      setEditingEntry((prev) => prev ? { ...prev, catalogEntryId: c.id } : null);
                                                      setEditEntryCatalogOpen(false);
                                                      setEditEntryCatalogSearch("");
                                                    }}
                                                  >
                                                    <span>{c.workName}</span>
                                                    <span className="ml-2 shrink-0 text-slate-400">{c.pointValue} pt</span>
                                                  </button>
                                                ))
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Qty */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-xs font-medium text-slate-600">Qty</label>
                                      <Input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        className="h-7 w-20 text-xs text-right"
                                        value={editingEntry.qty}
                                        onChange={(e) =>
                                          setEditingEntry((prev) => prev ? { ...prev, qty: e.target.value } : null)
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs"
                                      disabled={pending}
                                      onClick={() => void handleSaveEditEntry()}
                                    >
                                      Simpan
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-3 text-xs"
                                      onClick={() => { setEditingEntry(null); setEditEntryError(null); }}
                                    >
                                      Batal
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter className="flex-shrink-0">
            {historyDetail?.canAddTo && (
              <Button
                variant="default"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => handleAddToPending(historyDetail)}
              >
                + Tambah Job ID
              </Button>
            )}
            <Button variant="outline" onClick={() => setHistoryDetail(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
