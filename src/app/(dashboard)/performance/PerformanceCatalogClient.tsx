"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/tables/DataTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faPaperPlane,
  faPenToSquare,
  faRotateLeft,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  clearAllCatalogData,
  upsertCatalogEntry,
  deleteCatalogEntry,
  importCatalogEntriesFromXlsx,
} from "@/server/actions/point-catalog";
import {
  approveDailyActivityEntry,
  batchDecideDraftActivities,
  deleteActivityEntry,
  deleteMonthlyPerformanceByPeriod,
  deleteMonthlyPerformance,
  generateMonthlyPerformance,
  inputEmployeeMonthlyPerformance,
  rejectDailyActivityEntry,
  saveDailyActivityEntry,
  submitDailyActivityEntry,
} from "@/server/actions/performance";
import { resolveActivityJobIdLabel } from "@/lib/performance/job-id";
import { formatOneDecimal, formatPointNumber } from "@/lib/format/number";
import type { UserRole } from "@/types";

export type PerformanceVersionRow = {
  id: string;
  code: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  sourceFileName: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  importedAt: string;
};

export type PerformanceDivisionTargetRow = {
  divisionName: string;
  targetPoints: number;
  source: "DEFAULT" | "OVERRIDE";
};

export type PerformanceCatalogEntryRow = {
  id: string;
  divisionName: string;
  externalCode: string;
  workName: string;
  pointValue: string;
  unitDescription: string;
};

export type PerformanceEmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionId: string;
  divisionName: string;
  employmentStatus: string;
};

export type PerformanceDivisionOption = {
  id: string;
  name: string;
};

export type PerformanceManagerialEmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionId: string | null;
  divisionName: string;
};

export type PerformanceActivityRow = {
  id: string;
  employeeId: string;
  pointCatalogEntryId: string;
  jobIdSnapshot: string | null;
  employeeName: string;
  employeeCode: string;
  employeeDivisionId: string | null;
  employeeDivisionName: string;
  workDate: string;
  actualDivisionId: string | null;
  actualDivisionName: string;
  workNameSnapshot: string;
  pointCatalogDivisionName: string;
  pointValueSnapshot: string;
  quantity: string;
  totalPoints: string;
  status:
    | "DRAFT"
    | "DIAJUKAN"
    | "DITOLAK_SPV"
    | "REVISI_TW"
    | "DIAJUKAN_ULANG"
    | "DISETUJUI_SPV"
    | "OVERRIDE_HRD"
    | "DIKUNCI_PAYROLL";
  notes: string | null;
  submittedAt: string;
  approvedAt: string;
  rejectedAt: string;
  createdAt: string;
};

export type PerformanceMonthlyRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeDivisionId: string | null;
  employeeDivisionName: string;
  periodStartDate: string;
  periodEndDate: string;
  divisionSnapshotName: string;
  targetDailyPoints: number;
  targetDays: number;
  totalTargetPoints: number;
  totalApprovedPoints: string;
  performancePercent: string;
  status: "DRAFT" | "FINALIZED" | "LOCKED";
  calculatedAt: string;
};

type EntryDraft = {
  id?: string;
  divisionName: string;
  workName: string;
  pointValue: string;
  unitDescription: string;
};

function createEntryDraft(entry?: PerformanceCatalogEntryRow): EntryDraft {
  return {
    id: entry?.id,
    divisionName: entry?.divisionName ?? "",
    workName: entry?.workName ?? "",
    pointValue: entry?.pointValue ?? "",
    unitDescription: entry?.unitDescription ?? "",
  };
}

type ActivityDraft = {
  id?: string;
  employeeId: string;
  workDate: string;
  totalPoints: string;
  notes: string | null;
};

type MonthlyDraft = {
  periodStartDate: string;
  periodEndDate: string;
};

type ManagerialMonthlyInputDraft = {
  employeeId: string;
  periodCode: string;
  performancePercent: string;
  notes: string;
};

type MonthlyEmployeePickerOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  divisionName: string;
  employeeGroup: import("@/lib/employee-groups").EmployeeGroup;
};

type DecisionAction = "submit" | "approve" | "reject";

type DecisionState = {
  action: DecisionAction;
  activityId: string;
  title: string;
  rowLabel: string;
};

type ActivityDraftGroup = {
  key: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeDivisionName: string;
  workDate: string;
  submittedAt: string;
  status: "DIAJUKAN" | "DIAJUKAN_ULANG";
  ids: string[];
  totalPoints: number;
  activities: PerformanceActivityRow[];
};

const ACTIVITY_STATUS_VARIANT: Record<
  PerformanceActivityRow["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  DIAJUKAN: "secondary",
  DIAJUKAN_ULANG: "secondary",
  DITOLAK_SPV: "destructive",
  REVISI_TW: "outline",
  DISETUJUI_SPV: "default",
  OVERRIDE_HRD: "default",
  DIKUNCI_PAYROLL: "default",
};

const ACTIVITY_STATUS_LABEL: Record<PerformanceActivityRow["status"], string> = {
  DRAFT: "Draft",
  DIAJUKAN: "Diajukan",
  DIAJUKAN_ULANG: "Diajukan Ulang",
  DITOLAK_SPV: "Ditolak HRD",
  REVISI_TW: "Revisi TW",
  DISETUJUI_SPV: "Disetujui",
  OVERRIDE_HRD: "Disetujui HRD",
  DIKUNCI_PAYROLL: "Dikunci Payroll",
};

function createActivityDraft(): ActivityDraft {
  return {
    employeeId: "",
    workDate: new Date().toISOString().slice(0, 10),
    totalPoints: "",
    notes: "",
  };
}

function createMonthlyDraft(): MonthlyDraft {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = String(today.getFullYear());
  return {
    periodStartDate: `${year}-${month}-01`,
    periodEndDate: `${year}-${month}-28`,
  };
}

function createManagerialMonthlyInputDraft(): ManagerialMonthlyInputDraft {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = String(today.getFullYear());
  return {
    employeeId: "",
    periodCode: `${year}-${month}`,
    performancePercent: "100",
    notes: "",
  };
}

type PerformanceCatalogClientProps = {
  role: UserRole;
  canManageCatalog?: boolean;
  canManageActivities: boolean;
  canGenerateMonthly: boolean;
  versions?: PerformanceVersionRow[];
  divisionTargets?: PerformanceDivisionTargetRow[];
  entries?: PerformanceCatalogEntryRow[];
  employeeOptions: PerformanceEmployeeOption[];
  managerialEmployeeOptions: PerformanceManagerialEmployeeOption[];
  activityEntries: PerformanceActivityRow[];
  monthlyPerformances: PerformanceMonthlyRow[];
};

function EmployeeSearchPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: MonthlyEmployeePickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selected = options.find((e) => e.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.divisionName.toLowerCase().includes(q)
    );
  }, [options, search]);

  if (selected) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Pilih Karyawan</label>
        <div className="flex items-center justify-between rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm">
          <div>
            <span className="font-semibold text-teal-800">{selected.fullName}</span>
            <span className="ml-2 text-xs text-teal-600">
              {selected.employeeCode} · {selected.divisionName} · {selected.employeeGroup}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(""); setSearch(""); }}
            className="ml-3 text-teal-400 hover:text-teal-700 text-base leading-none"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">Pilih Karyawan</label>
      <div className="rounded-md border border-input bg-white overflow-hidden">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ketik nama, kode, atau divisi..."
          className="w-full border-0 border-b border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400"
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Karyawan tidak ditemukan.</p>
          ) : (
            filtered.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => { onSelect(emp.id); setSearch(""); }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
              >
                <span className="font-medium text-slate-900 shrink-0">{emp.fullName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500 shrink-0">{emp.employeeCode}</span>
                <span className="text-slate-400">·</span>
                <span className="text-xs text-slate-500 truncate">{emp.divisionName}</span>
                <span className="ml-auto text-xs text-slate-400 shrink-0">{emp.employeeGroup}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function PerformanceCatalogClient({
  role,
  canManageCatalog = false,
  canManageActivities,
  canGenerateMonthly,
  versions = [],
  divisionTargets = [],
  entries = [],
  employeeOptions,
  managerialEmployeeOptions,
  activityEntries,
  monthlyPerformances,
}: PerformanceCatalogClientProps) {
  const router = useRouter();
  const [activityOpen, setActivityOpen] = useState(false);
  const [decisionState, setDecisionState] = useState<DecisionState | null>(null);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [managerialMonthlyOpen, setManagerialMonthlyOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [clearCatalogOpen, setClearCatalogOpen] = useState(false);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>(createActivityDraft());
  const [monthlyDraft, setMonthlyDraft] = useState<MonthlyDraft>(createMonthlyDraft());
  const [managerialMonthlyDraft, setManagerialMonthlyDraft] = useState<ManagerialMonthlyInputDraft>(
    createManagerialMonthlyInputDraft()
  );
  const [decisionNotes, setDecisionNotes] = useState("");
  const [draftQueueSearch, setDraftQueueSearch] = useState("");
  const [draftQueueDivision, setDraftQueueDivision] = useState("");
  const [draftDetailGroup, setDraftDetailGroup] = useState<ActivityDraftGroup | null>(null);
  const [draftDecision, setDraftDecision] = useState<{
    action: "approve" | "reject";
    group: ActivityDraftGroup;
  } | null>(null);
  const [draftDecisionNotes, setDraftDecisionNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Catalog entry CRUD state
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(createEntryDraft());
  const [deleteCatalogId, setDeleteCatalogId] = useState<string | null>(null);
  const [deleteMonthlyId, setDeleteMonthlyId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeletePeriodKey, setBulkDeletePeriodKey] = useState("");

  // Xlsx import state
  const [xlsxOpen, setXlsxOpen] = useState(false);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);

  function resetMessages() {
    setFormError(null);
    setLastResult(null);
  }

  function updateActivityDraft(field: keyof ActivityDraft, value: string) {
    setActivityDraft((current) => ({ ...current, [field]: value }));
  }

  function updateMonthlyDraft(field: keyof MonthlyDraft, value: string) {
    setMonthlyDraft((current) => ({ ...current, [field]: value }));
  }

  function updateManagerialMonthlyDraft(field: keyof ManagerialMonthlyInputDraft, value: string) {
    setManagerialMonthlyDraft((current) => ({ ...current, [field]: value }));
  }

  const monthlyEmployeeOptions = useMemo(() => {
    const teamwork: MonthlyEmployeePickerOption[] = employeeOptions.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      divisionName: employee.divisionName,
      employeeGroup: "MITRA_KERJA" as const,
    }));
    const managerial: MonthlyEmployeePickerOption[] = managerialEmployeeOptions.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      divisionName: employee.divisionName,
      employeeGroup: "KARYAWAN_TETAP" as const,
    }));
    const byId = new Map<string, MonthlyEmployeePickerOption>();
    for (const item of [...teamwork, ...managerial]) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return Array.from(byId.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [employeeOptions, managerialEmployeeOptions]);

  const isOverrideRole = role === "HRD" || role === "SUPER_ADMIN";

  const overrideDraftGroups = useMemo(() => {
    if (!isOverrideRole) return [];
    const pendingActivities = activityEntries.filter(
      (entry): entry is PerformanceActivityRow & { status: "DIAJUKAN" | "DIAJUKAN_ULANG" } =>
        entry.status === "DIAJUKAN" || entry.status === "DIAJUKAN_ULANG"
    );
    const map = new Map<string, ActivityDraftGroup>();
    for (const activity of pendingActivities) {
      const key = `${activity.employeeId}-${activity.workDate}`;
      const existing = map.get(key);
      if (existing) {
        existing.ids.push(activity.id);
        existing.activities.push(activity);
        existing.totalPoints += Number(activity.totalPoints);
      } else {
        map.set(key, {
          key,
          employeeId: activity.employeeId,
          employeeName: activity.employeeName,
          employeeCode: activity.employeeCode,
          employeeDivisionName: activity.employeeDivisionName,
          workDate: activity.workDate,
          submittedAt: activity.submittedAt,
          status: activity.status,
          ids: [activity.id],
          totalPoints: Number(activity.totalPoints),
          activities: [activity],
        });
      }
    }
    const q = draftQueueSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((group) => {
        if (draftQueueDivision && group.employeeDivisionName !== draftQueueDivision) return false;
        if (!q) return true;
        return (
          group.employeeName.toLowerCase().includes(q) ||
          group.employeeCode.toLowerCase().includes(q) ||
          group.employeeDivisionName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [activityEntries, draftQueueSearch, draftQueueDivision, isOverrideRole]);

  // Daftar divisi unik dari semua draft pending (sebelum filter search/divisi)
  const draftDivisionOptions = useMemo(() => {
    if (!isOverrideRole) return [];
    const seen = new Set<string>();
    for (const entry of activityEntries) {
      if (entry.status === "DIAJUKAN" || entry.status === "DIAJUKAN_ULANG") {
        if (entry.employeeDivisionName && entry.employeeDivisionName !== "-") {
          seen.add(entry.employeeDivisionName);
        }
      }
    }
    return Array.from(seen).sort();
  }, [activityEntries, isOverrideRole]);

  async function handleClearCatalog() {
    setPending(true);
    resetMessages();
    try {
      const result = await clearAllCatalogData();
      if (result && "error" in result) { setFormError(result.error); return; }
      setClearCatalogOpen(false);
      setLastResult("Semua data katalog berhasil dihapus.");
      router.refresh();
    } finally { setPending(false); }
  }

  async function handleSaveActivity() {
    setPending(true);
    resetMessages();
    try {
      const result = await saveDailyActivityEntry({
        id: activityDraft.id,
        employeeId: activityDraft.employeeId,
        workDate: activityDraft.workDate,
        totalPoints: activityDraft.totalPoints,
        notes: activityDraft.notes,
      });
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setActivityOpen(false);
      setActivityDraft(createActivityDraft());
      setLastResult("Aktivitas berhasil disimpan.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDecision() {
    if (!decisionState) return;
    setPending(true);
    resetMessages();
    try {
      const payload = {
        activityEntryId: decisionState.activityId,
        notes: decisionNotes,
      };
      const result =
        decisionState.action === "submit"
          ? await submitDailyActivityEntry(payload)
          : decisionState.action === "approve"
            ? await approveDailyActivityEntry(payload)
            : await rejectDailyActivityEntry(payload);

      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setDecisionState(null);
      setDecisionNotes("");
      setLastResult(
        decisionState.action === "submit"
          ? "Aktivitas berhasil diajukan."
          : decisionState.action === "approve"
            ? "Aktivitas berhasil diproses."
            : "Aktivitas berhasil ditolak."
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleBatchDraftDecision() {
    if (!draftDecision) return;
    setPending(true);
    resetMessages();
    try {
      const result = await batchDecideDraftActivities({
        ids: draftDecision.group.ids,
        action: draftDecision.action,
        notes: draftDecisionNotes.trim() || undefined,
      });
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setDraftDecision(null);
      setDraftDetailGroup(null);
      setDraftDecisionNotes("");
      setLastResult(
        draftDecision.action === "approve"
          ? `Draft harian ${draftDecision.group.employeeName} tanggal ${draftDecision.group.workDate} berhasil disetujui.`
          : `Draft harian ${draftDecision.group.employeeName} tanggal ${draftDecision.group.workDate} berhasil ditolak.`
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setPending(true);
    resetMessages();
    try {
      const result = await deleteActivityEntry(deleteTargetId);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setDeleteTargetId(null);
      setLastResult("Aktivitas berhasil dihapus.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleGenerateMonthly() {
    setPending(true);
    resetMessages();
    try {
      const result = await generateMonthlyPerformance(monthlyDraft);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setMonthlyOpen(false);
      const skipped = Number(result.skippedManualOverrides ?? 0);
      setLastResult(
        skipped > 0
          ? `Monthly performance berhasil digenerate untuk ${result.generatedEmployees} karyawan. ${skipped} karyawan manual override tidak ditimpa.`
          : `Monthly performance berhasil digenerate untuk ${result.generatedEmployees} karyawan.`
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleInputManagerialMonthlyPerformance() {
    setPending(true);
    resetMessages();
    try {
      const result = await inputEmployeeMonthlyPerformance({
        employeeId: managerialMonthlyDraft.employeeId,
        periodCode: managerialMonthlyDraft.periodCode,
        performancePercent: managerialMonthlyDraft.performancePercent,
        notes: managerialMonthlyDraft.notes,
      });
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setManagerialMonthlyOpen(false);
      setManagerialMonthlyDraft(createManagerialMonthlyInputDraft());
      const syncNote =
        result.employeeGroup === "KARYAWAN_TETAP" && !result.payrollPeriodReady
          ? " KPI payroll managerial akan otomatis tersinkron saat periode payroll dibuat."
          : "";
      setLastResult(
        `Performa ${result.performancePercent.toFixed(1)}% untuk ${result.employeeName} (${result.employeeGroup}) periode ${result.periodCode} berhasil disimpan.${syncNote}`
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleUpsertEntry() {
    setPending(true);
    resetMessages();
    try {
      const result = await upsertCatalogEntry({
        id: entryDraft.id,
        divisionName: entryDraft.divisionName,
        workName: entryDraft.workName,
        pointValue: entryDraft.pointValue,
        unitDescription: entryDraft.unitDescription || undefined,
      });
      if (result && "error" in result) { setFormError(result.error); return; }
      setEntryOpen(false);
      setLastResult(entryDraft.id ? "Entry berhasil diperbarui." : "Entry berhasil ditambahkan.");
      router.refresh();
    } finally { setPending(false); }
  }

  async function handleDeleteCatalogEntry() {
    if (!deleteCatalogId) return;
    setPending(true);
    resetMessages();
    try {
      const result = await deleteCatalogEntry(deleteCatalogId);
      if (result && "error" in result) { setFormError(result.error); return; }
      setDeleteCatalogId(null);
      setLastResult("Entry berhasil dihapus.");
      router.refresh();
    } finally { setPending(false); }
  }

  async function handleDeleteMonthlyPerformance() {
    if (!deleteMonthlyId) return;
    setPending(true);
    resetMessages();
    try {
      const result = await deleteMonthlyPerformance({ id: deleteMonthlyId });
      if (result && "error" in result) { setFormError(result.error); return; }
      setDeleteMonthlyId(null);
      setLastResult("Performa bulanan berhasil dihapus.");
      router.refresh();
    } finally { setPending(false); }
  }

  const monthlyPeriodOptions = useMemo(() => {
    const map = new Map<string, { periodStartDate: string; periodEndDate: string; count: number }>();
    for (const row of monthlyPerformances) {
      const key = `${row.periodStartDate}|${row.periodEndDate}`;
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { periodStartDate: row.periodStartDate, periodEndDate: row.periodEndDate, count: 1 });
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.periodStartDate.localeCompare(a.periodStartDate));
  }, [monthlyPerformances]);

  async function handleBulkDeleteMonthlyPerformance() {
    if (!bulkDeletePeriodKey) {
      setFormError("Pilih periode yang akan dihapus.");
      return;
    }
    const [periodStartDate, periodEndDate] = bulkDeletePeriodKey.split("|");
    if (!periodStartDate || !periodEndDate) {
      setFormError("Periode tidak valid.");
      return;
    }

    setPending(true);
    resetMessages();
    try {
      const result = await deleteMonthlyPerformanceByPeriod({ periodStartDate, periodEndDate });
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setBulkDeleteOpen(false);
      setBulkDeletePeriodKey("");
      setLastResult(`Hapus massal berhasil. ${result.deletedCount} data performa bulanan dihapus.`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleXlsxImport() {
    if (!xlsxFile) { setFormError("Pilih file xlsx terlebih dahulu."); return; }
    setPending(true);
    resetMessages();
    try {
      const formData = new FormData();
      formData.append("file", xlsxFile);
      const result = await importCatalogEntriesFromXlsx(formData);
      if (result && "error" in result) { setFormError(result.error); return; }
      if (result && "success" in result) {
        setXlsxOpen(false);
        setXlsxFile(null);
        setLastResult(
          `Import berhasil: ${result.updatedEntries} diperbarui + ${result.insertedEntries} baru dari ${result.importedDivisions} divisi.`
        );
        router.refresh();
      }
    } finally { setPending(false); }
  }

  const versionColumns: ColumnDef<PerformanceVersionRow>[] = useMemo(
    () => [
      { header: "Versi", accessorKey: "code" },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "ACTIVE"
                ? "default"
                : row.original.status === "DRAFT"
                  ? "outline"
                  : "secondary"
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      { header: "Sumber", accessorKey: "sourceFileName" },
      { header: "Efektif Mulai", accessorKey: "effectiveStartDate" },
      { header: "Efektif Sampai", accessorKey: "effectiveEndDate" },
      { header: "Diimpor", accessorKey: "importedAt" },
    ],
    []
  );

  const targetColumns: ColumnDef<PerformanceDivisionTargetRow>[] = useMemo(
    () => [
      { header: "Divisi", accessorKey: "divisionName" },
      {
        header: "Target Harian",
        accessorKey: "targetPoints",
        cell: ({ row }) => row.original.targetPoints.toLocaleString("id-ID"),
      },
      {
        header: "Sumber Rule",
        accessorKey: "source",
        cell: ({ row }) => (
          <Badge variant={row.original.source === "OVERRIDE" ? "default" : "secondary"}>
            {row.original.source === "OVERRIDE" ? "Override" : "Default"}
          </Badge>
        ),
      },
    ],
    []
  );

  const entryColumns: ColumnDef<PerformanceCatalogEntryRow>[] = useMemo(
    () => [
      { header: "Divisi", accessorKey: "divisionName" },
      { header: "Jenis Pekerjaan", accessorKey: "workName" },
      {
        header: "Poin",
        accessorKey: "pointValue",
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{formatPointNumber(row.original.pointValue)}</span>
        ),
      },
      { header: "Keterangan", accessorKey: "unitDescription" },
      ...(canManageCatalog
        ? [
            {
              header: "Aksi",
              id: "catalog-actions",
              cell: ({ row }: { row: { original: PerformanceCatalogEntryRow } }) => (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      resetMessages();
                      setEntryDraft(createEntryDraft(row.original));
                      setEntryOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteCatalogId(row.original.id)}
                  >
                    Hapus
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<PerformanceCatalogEntryRow>,
          ]
        : []),
    ],
    [canManageCatalog]
  );

  const activityColumns: ColumnDef<PerformanceActivityRow>[] = useMemo(
    () => [
      {
        header: "Karyawan",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900">{row.original.employeeName}</p>
            <p className="text-xs text-slate-500">
              {row.original.employeeCode} · {row.original.employeeDivisionName}
            </p>
          </div>
        ),
      },
      { header: "Tanggal", accessorKey: "workDate" },
      {
        header: "Job ID",
        accessorKey: "jobIdSnapshot",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">
            {resolveActivityJobIdLabel(
              row.original.jobIdSnapshot,
              null,
              row.original.notes
            )}
          </span>
        ),
      },
      {
        header: "Aktivitas",
        accessorKey: "workNameSnapshot",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="text-slate-900">{row.original.workNameSnapshot}</p>
            <p className="text-xs text-slate-500">
              {row.original.actualDivisionName} · {formatPointNumber(row.original.pointValueSnapshot)} × {row.original.quantity}
            </p>
          </div>
        ),
      },
      {
        header: "Total Poin",
        accessorKey: "totalPoints",
        cell: ({ row }) => (
          <span className="font-medium">
            {formatPointNumber(row.original.totalPoints)}
          </span>
        ),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <span
            className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium"
            title={ACTIVITY_STATUS_LABEL[row.original.status]}
          >
            {row.original.status === "DRAFT" ? (
              <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
            ) : row.original.status === "DIAJUKAN" || row.original.status === "DIAJUKAN_ULANG" ? (
              <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
            ) : row.original.status === "DITOLAK_SPV" || row.original.status === "REVISI_TW" ? (
              <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
            )}
          </span>
        ),
      },
      {
        header: "Aksi",
        id: "actions",
        cell: ({ row }) => {
          const entry = row.original;
          const isMutable = ["DRAFT", "DITOLAK_SPV", "REVISI_TW"].includes(entry.status);
          const isApprovable = ["DIAJUKAN", "DIAJUKAN_ULANG"].includes(entry.status);
          const isDeletable = ["DRAFT", "DIAJUKAN", "DIAJUKAN_ULANG"].includes(entry.status);
          const canApprove = role === "HRD" || role === "SUPER_ADMIN";

          return (
            <div className="flex flex-wrap gap-1.5">
              {canManageActivities && isMutable ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Edit"
                    aria-label="Edit"
                    onClick={() => {
                      setFormError(null);
                      setActivityDraft({
                        id: entry.id,
                        employeeId: entry.employeeId,
                        workDate: entry.workDate,
                        totalPoints: entry.totalPoints,
                        notes: entry.notes,
                      });
                      setActivityOpen(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Ajukan"
                    aria-label="Ajukan"
                    onClick={() =>
                      setDecisionState({
                        action: "submit",
                        activityId: entry.id,
                        title: "Ajukan Aktivitas",
                        rowLabel: `${entry.employeeName} · ${entry.workNameSnapshot}`,
                      })
                    }
                  >
                    <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
                  </Button>
                  {isDeletable ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      title="Hapus"
                      aria-label="Hapus"
                      onClick={() => setDeleteTargetId(entry.id)}
                    >
                      <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    </Button>
                  ) : null}
                </>
              ) : null}
              {canApprove && isApprovable ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    title="Setujui HRD"
                    aria-label="Setujui HRD"
                    onClick={() =>
                      setDecisionState({
                        action: "approve",
                        activityId: entry.id,
                        title: "Setujui Aktivitas",
                        rowLabel: `${entry.employeeName} · ${entry.workNameSnapshot}`,
                      })
                    }
                  >
                    <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    title="Tolak"
                    aria-label="Tolak"
                    onClick={() =>
                      setDecisionState({
                        action: "reject",
                        activityId: entry.id,
                        title: "Tolak Aktivitas",
                        rowLabel: `${entry.employeeName} · ${entry.workNameSnapshot}`,
                      })
                    }
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManageActivities, role]
  );

  const monthlyColumns: ColumnDef<PerformanceMonthlyRow>[] = useMemo(
    () => [
      {
        header: "Karyawan",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900">{row.original.employeeName}</p>
            <p className="text-xs text-slate-500">
              {row.original.employeeCode} · {row.original.divisionSnapshotName}
            </p>
          </div>
        ),
      },
      {
        header: "Periode",
        id: "period",
        cell: ({ row }) =>
          `${row.original.periodStartDate} s/d ${row.original.periodEndDate}`,
      },
      {
        header: "Target",
        id: "target",
        cell: ({ row }) =>
          `${row.original.targetDailyPoints.toLocaleString("id-ID")} × ${row.original.targetDays} hr = ${row.original.totalTargetPoints.toLocaleString("id-ID")}`,
      },
      {
        header: "Approved",
        accessorKey: "totalApprovedPoints",
        cell: ({ row }) => formatPointNumber(row.original.totalApprovedPoints),
      },
      {
        header: "Performa",
        accessorKey: "performancePercent",
        cell: ({ row }) => {
          const pct = Number(row.original.performancePercent);
          const color =
            pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-600" : "text-red-600";
          return <span className={`font-semibold ${color}`}>{pct.toFixed(1)}%</span>;
        },
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "LOCKED"
                ? "default"
                : row.original.status === "FINALIZED"
                  ? "secondary"
                  : "outline"
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      ...(canGenerateMonthly
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: PerformanceMonthlyRow } }) =>
                row.original.status !== "LOCKED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteMonthlyId(row.original.id)}
                  >
                    Hapus
                  </Button>
                ) : null,
            } satisfies ColumnDef<PerformanceMonthlyRow>,
          ]
        : []),
    ],
    [canGenerateMonthly]
  );

  return (
    <div className="space-y-4">
      {lastResult ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {lastResult}
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <Tabs defaultValue="activities">
        <TabsList>
          <TabsTrigger value="activities">Aktivitas Harian</TabsTrigger>
          <TabsTrigger value="monthly">Performa Bulanan</TabsTrigger>
        </TabsList>

        <TabsContent value="activities" className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Aktivitas Harian</h2>
              <p className="text-sm text-slate-500">
                Input total poin harian final per karyawan, subject to approval HRD.
              </p>
            </div>
            <div className="flex gap-2">
              {canGenerateMonthly ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetMessages();
                    setMonthlyOpen(true);
                  }}
                >
                  Generate Monthly
                </Button>
              ) : null}
              {canManageActivities ? (
                <Button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setActivityDraft(createActivityDraft());
                    setActivityOpen(true);
                  }}
                >
                  Tambah Aktivitas
                </Button>
              ) : null}
            </div>
          </div>
          {isOverrideRole ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Draft Harian Diajukan — Menunggu Persetujuan HRD
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {overrideDraftGroups.length} draft
                    {draftQueueDivision ? ` · Divisi: ${draftQueueDivision}` : ""}
                  </p>
                </div>
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 flex-1 min-w-[180px]"
                  value={draftQueueSearch}
                  onChange={(event) => setDraftQueueSearch(event.target.value)}
                  placeholder="Cari karyawan..."
                />
                {draftDivisionOptions.length > 1 && (
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[160px]"
                    value={draftQueueDivision}
                    onChange={(e) => setDraftQueueDivision(e.target.value)}
                  >
                    <option value="">Semua Divisi</option>
                    {draftDivisionOptions.map((div) => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                )}
                {(draftQueueSearch || draftQueueDivision) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 text-xs"
                    onClick={() => { setDraftQueueSearch(""); setDraftQueueDivision(""); }}
                  >
                    Reset filter
                  </Button>
                )}
              </div>

              {overrideDraftGroups.length === 0 ? (
                <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  {draftQueueSearch || draftQueueDivision
                    ? "Tidak ada draft yang cocok dengan filter."
                    : "Tidak ada draft harian yang menunggu persetujuan."}
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Karyawan</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total Job</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Poin</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overrideDraftGroups.map((group) => {
                        const uniqueJobs = new Set(
                          group.activities.map((a) =>
                            resolveActivityJobIdLabel(a.jobIdSnapshot, null, a.notes)
                          )
                        ).size;
                        return (
                          <tr
                            key={group.key}
                            className="cursor-pointer bg-white hover:bg-slate-50/70"
                            onClick={() => setDraftDetailGroup(group)}
                          >
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-slate-900">{group.employeeName}</p>
                              <p className="text-xs text-slate-500">{group.employeeCode} · {group.employeeDivisionName}</p>
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{group.workDate}</td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">{uniqueJobs}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{formatPointNumber(group.totalPoints)}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="secondary">
                                {group.status === "DIAJUKAN_ULANG" ? "Diajukan Ulang" : "Diajukan"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setDraftDecisionNotes("");
                                    setDraftDecision({ action: "approve", group });
                                  }}
                                >
                                  Setujui
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setDraftDecisionNotes("");
                                    setDraftDecision({ action: "reject", group });
                                  }}
                                >
                                  Tolak
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-400">
                    Klik baris draft untuk melihat rincian job id dan jenis pekerjaan.
                  </p>
                </div>
              )}
            </div>
          ) : null}
          <DataTable
            data={activityEntries}
            columns={activityColumns}
            searchKey="employeeName"
            searchPlaceholder="Cari karyawan..."
          />
        </TabsContent>

        <TabsContent value="monthly" className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Performa Bulanan</h2>
              <p className="text-sm text-slate-500">
                Rekap poin approved vs target divisi snapshot per periode yang digenerate.
              </p>
            </div>
            {canGenerateMonthly ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    resetMessages();
                    setBulkDeletePeriodKey(monthlyPeriodOptions[0]?.key ?? "");
                    setBulkDeleteOpen(true);
                  }}
                >
                  Hapus Massal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetMessages();
                    setManagerialMonthlyDraft(createManagerialMonthlyInputDraft());
                    setManagerialMonthlyOpen(true);
                  }}
                >
                  Input Performa Karyawan
                </Button>
              </div>
            ) : null}
          </div>
          <DataTable
            data={monthlyPerformances}
            columns={monthlyColumns}
            searchKey="employeeName"
            searchPlaceholder="Cari karyawan..."
          />
        </TabsContent>

      </Tabs>

      {/* Clear All Catalog Confirm Dialog */}
      <Dialog open={clearCatalogOpen} onOpenChange={setClearCatalogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Semua Katalog</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm text-slate-600">
            <p>Tindakan ini akan menghapus <strong>seluruh data katalog poin</strong> termasuk:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Semua versi katalog (aktif, draft, dan arsip)</li>
              <li>Semua entry katalog poin</li>
              <li>Semua rule target divisi</li>
              <li>Semua aktivitas harian karyawan</li>
            </ul>
            <p className="text-red-600 font-medium">Tindakan ini tidak dapat dibatalkan.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearCatalogOpen(false)} disabled={pending}>Batal</Button>
            <Button type="button" variant="destructive" onClick={() => void handleClearCatalog()} disabled={pending}>
              {pending ? "Menghapus..." : "Hapus Semua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Activity Dialog */}
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {activityDraft.id ? "Edit Aktivitas" : "Tambah Aktivitas"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Karyawan</label>
              <select
                value={activityDraft.employeeId}
                onChange={(event) => updateActivityDraft("employeeId", event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Pilih karyawan</option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} ({employee.employeeCode}) · {employee.divisionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Tanggal Kerja</label>
              <Input
                type="date"
                value={activityDraft.workDate}
                onChange={(event) => updateActivityDraft("workDate", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Total Poin Harian</label>
              <Input
                type="number"
                step="0.1"
                min="0.01"
                value={activityDraft.totalPoints}
                onChange={(event) => updateActivityDraft("totalPoints", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Catatan</label>
              <textarea
                value={activityDraft.notes ?? ""}
                onChange={(event) => updateActivityDraft("notes", event.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActivityOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button type="button" onClick={() => void handleSaveActivity()} disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit / Approve / Reject Dialog */}
      <Dialog
        open={decisionState !== null}
        onOpenChange={(open) => !open && setDecisionState(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{decisionState?.title ?? "Proses Aktivitas"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{decisionState?.rowLabel ?? ""}</p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Catatan</label>
              <textarea
                value={decisionNotes}
                onChange={(event) => setDecisionNotes(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDecisionState(null)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={decisionState?.action === "reject" ? "destructive" : "default"}
              onClick={() => void handleDecision()}
              disabled={pending}
            >
              {pending ? "Memproses..." : "Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={draftDetailGroup !== null} onOpenChange={(open) => !open && setDraftDetailGroup(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Rincian Draft Harian - {draftDetailGroup?.employeeName}</DialogTitle>
          </DialogHeader>
          {draftDetailGroup ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="flex-shrink-0 text-xs text-slate-500">
                {draftDetailGroup.employeeCode} · {draftDetailGroup.employeeDivisionName} · Tgl Kerja: {draftDetailGroup.workDate} · Diajukan: {draftDetailGroup.submittedAt}
              </p>
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">No</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Job ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Jenis Pekerjaan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Poin/Unit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftDetailGroup.activities.map((activity, index) => (
                      <tr key={activity.id} className="bg-white">
                        <td className="px-3 py-2.5 text-xs text-slate-400">{index + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                          {resolveActivityJobIdLabel(activity.jobIdSnapshot, null, activity.notes)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-900">{activity.workNameSnapshot}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{activity.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatPointNumber(activity.pointValueSnapshot)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">{formatPointNumber(activity.totalPoints)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => setDraftDetailGroup(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={draftDecision !== null} onOpenChange={(open) => !open && setDraftDecision(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draftDecision?.action === "approve" ? "Setujui Draft Harian" : "Tolak Draft Harian"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {draftDecision?.group.employeeName} · {draftDecision?.group.workDate} · {draftDecision?.group.activities.length} aktivitas
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Catatan {draftDecision?.action === "reject" ? "(wajib)" : "(opsional)"}
              </label>
              <textarea
                value={draftDecisionNotes}
                onChange={(event) => setDraftDecisionNotes(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraftDecision(null)} disabled={pending}>
              Batal
            </Button>
            <Button
              type="button"
              variant={draftDecision?.action === "reject" ? "destructive" : "default"}
              onClick={() => void handleBatchDraftDecision()}
              disabled={pending || (draftDecision?.action === "reject" && !draftDecisionNotes.trim())}
            >
              {pending ? "Memproses..." : draftDecision?.action === "approve" ? "Setujui Semua" : "Tolak Semua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Aktivitas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Aktivitas DRAFT ini akan dihapus permanen. Lanjutkan?
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={pending}
            >
              {pending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Catalog Entry Dialog */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{entryDraft.id ? "Edit Entry Katalog" : "Tambah Entry Katalog"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Divisi</label>
              <Input
                value={entryDraft.divisionName}
                onChange={(e) => setEntryDraft((d) => ({ ...d, divisionName: e.target.value }))}
                placeholder="Contoh: AFT"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Jenis Pekerjaan</label>
              <Input
                value={entryDraft.workName}
                onChange={(e) => setEntryDraft((d) => ({ ...d, workName: e.target.value }))}
                placeholder="Nama pekerjaan"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Poin</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={entryDraft.pointValue}
                  onChange={(e) => setEntryDraft((d) => ({ ...d, pointValue: e.target.value }))}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Keterangan / Satuan</label>
                <Input
                  value={entryDraft.unitDescription}
                  onChange={(e) => setEntryDraft((d) => ({ ...d, unitDescription: e.target.value }))}
                  placeholder="pcs, hari, …"
                />
              </div>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEntryOpen(false)} disabled={pending}>Batal</Button>
            <Button type="button" onClick={() => void handleUpsertEntry()} disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Catalog Entry Confirm */}
      <Dialog open={deleteCatalogId !== null} onOpenChange={(open) => !open && setDeleteCatalogId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Entry Katalog</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            Entry ini akan dihapus dari versi katalog aktif. Aktivitas yang sudah menggunakan entry ini
            tidak terpengaruh. Lanjutkan?
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteCatalogId(null)} disabled={pending}>Batal</Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteCatalogEntry()} disabled={pending}>
              {pending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import .xlsx Dialog */}
      <Dialog open={xlsxOpen} onOpenChange={setXlsxOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Import Katalog dari .xlsx</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold">Format header yang diperlukan:</p>
              <p className="font-mono">DIVISI | JENIS PEKERJAAN | POIN | KETERANGAN</p>
              <p className="text-slate-500">Kolom KETERANGAN bersifat opsional. Baris dengan data tidak valid akan dilewati.</p>
              <p className="text-amber-700 font-medium">⚠ Import akan menggantikan semua entry untuk divisi yang ada dalam file.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Pilih File .xlsx</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                onChange={(e) => setXlsxFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setXlsxOpen(false)} disabled={pending}>Batal</Button>
            <Button type="button" onClick={() => void handleXlsxImport()} disabled={pending || !xlsxFile}>
              {pending ? "Mengimpor..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Monthly Dialog */}
      <Dialog open={monthlyOpen} onOpenChange={setMonthlyOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate Monthly Performance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Menghitung ulang performa bulanan untuk semua karyawan poin-based aktif pada periode yang
            dipilih. Data sebelumnya untuk periode yang sama akan ditimpa.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Tanggal Awal Periode</label>
              <Input
                type="date"
                value={monthlyDraft.periodStartDate}
                onChange={(event) => updateMonthlyDraft("periodStartDate", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Tanggal Akhir Periode</label>
              <Input
                type="date"
                value={monthlyDraft.periodEndDate}
                onChange={(event) => updateMonthlyDraft("periodEndDate", event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMonthlyOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateMonthly()}
              disabled={pending}
            >
              {pending ? "Menghitung..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Monthly Performance Confirm */}
      <Dialog open={deleteMonthlyId !== null} onOpenChange={(open) => !open && setDeleteMonthlyId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Hapus Performa Bulanan</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            Data performa bulanan ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            Lanjutkan?
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteMonthlyId(null)} disabled={pending}>Batal</Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteMonthlyPerformance()} disabled={pending}>
              {pending ? "Menghapus..." : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Monthly Performance Confirm */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Massal Performa Bulanan</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Pilih periode yang akan dihapus. Data berstatus LOCKED tidak dapat dihapus.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Periode</label>
              <select
                value={bulkDeletePeriodKey}
                onChange={(event) => setBulkDeletePeriodKey(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {monthlyPeriodOptions.length === 0 ? (
                  <option value="">Tidak ada periode</option>
                ) : (
                  monthlyPeriodOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.periodStartDate} s/d {option.periodEndDate} ({option.count} data)
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleBulkDeleteMonthlyPerformance()}
              disabled={pending || monthlyPeriodOptions.length === 0}
            >
              {pending ? "Menghapus..." : "Hapus Massal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Input Managerial Monthly Dialog */}
      <Dialog open={managerialMonthlyOpen} onOpenChange={setManagerialMonthlyOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Input Performa Bulanan Karyawan</DialogTitle>
          </DialogHeader>
          <EmployeeSearchPicker
            options={monthlyEmployeeOptions}
            selectedId={managerialMonthlyDraft.employeeId}
            onSelect={(id) => updateManagerialMonthlyDraft("employeeId", id)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Periode (YYYY-MM)</label>
              <Input
                type="month"
                value={managerialMonthlyDraft.periodCode}
                onChange={(event) => updateManagerialMonthlyDraft("periodCode", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Persentase (%)</label>
              <Input
                type="number"
                min="0"
                max="200"
                step="0.1"
                value={managerialMonthlyDraft.performancePercent}
                onChange={(event) => updateManagerialMonthlyDraft("performancePercent", event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Catatan (opsional)</label>
              <textarea
                value={managerialMonthlyDraft.notes}
                onChange={(event) => updateManagerialMonthlyDraft("notes", event.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManagerialMonthlyOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void handleInputManagerialMonthlyPerformance()}
              disabled={pending || !managerialMonthlyDraft.employeeId}
            >
              {pending ? "Menyimpan..." : "Terapkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
