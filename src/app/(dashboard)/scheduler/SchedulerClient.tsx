"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignEmployeeSchedule, assignEmployeeSchedulesBulk, getEmployeeScheduleDetail } from "@/server/actions/schedule";
import { CalendarCog, CalendarDays, CheckCircle2, Clock, Filter, Loader2, Users } from "lucide-react";
import type { MyScheduleResult } from "@/server/actions/schedule";
import { cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import {
  NEW_EMPLOYEE_GROUPS,
  normalizeEmployeeGroup,
  resolveEmployeeGroupLabel,
} from "@/lib/employee-groups";
import type { ScheduleAssignmentRange } from "@/server/actions/schedule";

type TeamMember = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  branchId: string | null;
  branchName: string;
  divisionId: string | null;
  divisionName: string;
  positionId: string | null;
  positionName: string;
  employeeGroup: import("@/lib/employee-groups").EmployeeGroup;
  scheduleName: string | null;
  scheduleCode: string | null;
  scheduleId: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
};

type ScheduleOption = {
  id: string;
  name: string;
  code: string;
};

type Props = {
  teamMembers: TeamMember[];
  scheduleOptions: ScheduleOption[];
  periodStart: string;
  periodEnd: string;
  assignmentRanges: ScheduleAssignmentRange[];
  selectedYear: number;
  selectedMonth: number;
  canBulkAssign?: boolean;
};

type AssignForm = {
  employeeId: string;
  employeeName: string;
  scheduleId: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  notes: string;
};

type BulkForm = {
  scheduleId: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  notes: string;
};

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const SHIFT_COLOR_THEMES = [
  {
    text: "text-sky-700",
    border: "border-sky-200",
    bg: "bg-sky-50",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    optionBg: "#eff6ff",
    optionColor: "#0369a1",
  },
  {
    text: "text-emerald-700",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    optionBg: "#ecfdf5",
    optionColor: "#047857",
  },
  {
    text: "text-amber-700",
    border: "border-amber-200",
    bg: "bg-amber-50",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    optionBg: "#fffbeb",
    optionColor: "#b45309",
  },
  {
    text: "text-violet-700",
    border: "border-violet-200",
    bg: "bg-violet-50",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    optionBg: "#f5f3ff",
    optionColor: "#6d28d9",
  },
  {
    text: "text-rose-700",
    border: "border-rose-200",
    bg: "bg-rose-50",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    optionBg: "#fff1f2",
    optionColor: "#be123c",
  },
  {
    text: "text-cyan-700",
    border: "border-cyan-200",
    bg: "bg-cyan-50",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    optionBg: "#ecfeff",
    optionColor: "#0e7490",
  },
] as const;

const OFF_SHIFT_THEME = {
  text: "text-slate-500",
  border: "border-slate-200",
  bg: "bg-slate-50",
  badge: "border-slate-200 bg-slate-50 text-slate-500",
  optionBg: "#f8fafc",
  optionColor: "#64748b",
};

function hashShiftCode(code: string) {
  return [...code].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getCurrentPayrollPeriodStr() {
  const jakartaNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = jakartaNow.getUTCFullYear();
  const month = jakartaNow.getUTCMonth();
  const day = jakartaNow.getUTCDate();

  if (day >= 26) {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-26`;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-25`;
    return { start, end };
  }

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const start = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-26`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-25`;
  return { start, end };
}

function addDaysStr(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return "-";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export default function SchedulerClient({
  teamMembers,
  scheduleOptions,
  periodStart,
  periodEnd,
  assignmentRanges,
  selectedYear,
  selectedMonth,
  canBulkAssign = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const payrollPeriod = useMemo(() => getCurrentPayrollPeriodStr(), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [form, setForm] = useState<AssignForm>({
    employeeId: "",
    employeeName: "",
    scheduleId: "",
    effectiveStartDate: payrollPeriod.start,
    effectiveEndDate: payrollPeriod.end,
    notes: "",
  });
  const [bulkForm, setBulkForm] = useState<BulkForm>({
    scheduleId: "__unselected__",
    effectiveStartDate: payrollPeriod.start,
    effectiveEndDate: payrollPeriod.end,
    notes: "",
  });
  const [quickScheduleByEmployee, setQuickScheduleByEmployee] = useState<Record<string, string>>({});
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Record<string, boolean>>({});
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const [matrixStartDate, setMatrixStartDate] = useState(periodStart);
  const [matrixEndDate, setMatrixEndDate] = useState(periodEnd);
  const [matrixDate, setMatrixDate] = useState(periodStart);
  const [matrixScheduleId, setMatrixScheduleId] = useState("__unselected__");
  const [matrixCellOverrides, setMatrixCellOverrides] = useState<Record<string, string>>({});
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixSuccess, setMatrixSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(false);
  const [scheduleDetailOpen, setScheduleDetailOpen] = useState(false);
  const [scheduleDetailLoading, setScheduleDetailLoading] = useState(false);
  const [scheduleDetailError, setScheduleDetailError] = useState<string | null>(null);
  const [scheduleDetail, setScheduleDetail] = useState<MyScheduleResult | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  let prevYear = selectedYear;
  let prevMonth = selectedMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  let nextYear = selectedYear;
  let nextMonth = selectedMonth + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  const scheduleOptionMap = useMemo(
    () => new Map(scheduleOptions.map((option) => [option.id, option] as const)),
    [scheduleOptions]
  );

  const scheduleThemeMap = useMemo(() => {
    const map = new Map<string, (typeof SHIFT_COLOR_THEMES)[number]>();
    for (const option of scheduleOptions) {
      map.set(option.id, SHIFT_COLOR_THEMES[hashShiftCode(option.code) % SHIFT_COLOR_THEMES.length]);
    }
    return map;
  }, [scheduleOptions]);

  function getScheduleTheme(scheduleId: string) {
    if (!scheduleId) return OFF_SHIFT_THEME;
    return scheduleThemeMap.get(scheduleId) ?? SHIFT_COLOR_THEMES[0];
  }

  function renderShiftOption(option: ScheduleOption) {
    const theme = getScheduleTheme(option.id);
    return (
      <option
        key={option.id}
        value={option.id}
        style={{ backgroundColor: theme.optionBg, color: theme.optionColor }}
      >
        {option.code}
      </option>
    );
  }

  function renderShiftNameOption(option: ScheduleOption) {
    const theme = getScheduleTheme(option.id);
    return (
      <option
        key={option.id}
        value={option.id}
        style={{ backgroundColor: theme.optionBg, color: theme.optionColor }}
      >
        {option.name} ({option.code})
      </option>
    );
  }

  const branchOptions = useMemo(
    () =>
      Array.from(
        new Map(
          teamMembers
            .map((member) => [member.branchId ?? member.branchName, member.branchName] as const)
        ).entries()
      ).map(([value, label]) => ({ value, label })),
    [teamMembers]
  );

  const divisionOptions = useMemo(
    () =>
      Array.from(
        new Map(
          teamMembers
            .map((member) => [member.divisionId ?? member.divisionName, member.divisionName] as const)
        ).entries()
      ).map(([value, label]) => ({ value, label })),
    [teamMembers]
  );

  const positionOptions = useMemo(
    () =>
      Array.from(
        new Map(
          teamMembers
            .map((member) => [member.positionId ?? member.positionName, member.positionName] as const)
        ).entries()
      ).map(([value, label]) => ({ value, label })),
    [teamMembers]
  );

  const filteredTeamMembers = useMemo(
    () =>
      teamMembers.filter((member) => {
        const branchMatch = branchFilter
          ? (member.branchId ?? member.branchName) === branchFilter
          : true;
        const divisionMatch = divisionFilter
          ? (member.divisionId ?? member.divisionName) === divisionFilter
          : true;
        const positionMatch = positionFilter
          ? (member.positionId ?? member.positionName) === positionFilter
          : true;
        const groupMatch = groupFilter ? normalizeEmployeeGroup(member.employeeGroup) === groupFilter : true;
        return branchMatch && divisionMatch && positionMatch && groupMatch;
      }),
    [branchFilter, divisionFilter, groupFilter, positionFilter, teamMembers]
  );

  const filteredEmployeeIds = useMemo(
    () => filteredTeamMembers.map((member) => member.employeeId),
    [filteredTeamMembers]
  );

  const allFilteredSelected =
    filteredEmployeeIds.length > 0 &&
    filteredEmployeeIds.every((employeeId) => Boolean(selectedEmployeeIds[employeeId]));
  const someFilteredSelected =
    filteredEmployeeIds.some((employeeId) => Boolean(selectedEmployeeIds[employeeId])) &&
    !allFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  useEffect(() => {
    setMatrixCellOverrides({});
  }, [assignmentRanges]);

  function resetFilters() {
    setBranchFilter("");
    setDivisionFilter("");
    setPositionFilter("");
    setGroupFilter("");
  }

  function toggleSelectAllFiltered(nextChecked: boolean) {
    setSelectedEmployeeIds((prev) => {
      const next = { ...prev };
      for (const employeeId of filteredEmployeeIds) {
        next[employeeId] = nextChecked;
      }
      return next;
    });
  }

  const periodDates = useMemo(() => {
    const result: string[] = [];
    const cursor = new Date(`${matrixStartDate}T00:00:00`);
    const end = new Date(`${matrixEndDate}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
      return result;
    }
    while (cursor <= end) {
      result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [matrixEndDate, matrixStartDate]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, ScheduleAssignmentRange[]>();
    for (const row of assignmentRanges) {
      const list = map.get(row.employeeId) ?? [];
      list.push(row);
      map.set(row.employeeId, list);
    }
    return map;
  }, [assignmentRanges]);

  function resolveScheduleAtDate(employeeId: string, dateKey: string) {
    const rows = assignmentMap.get(employeeId) ?? [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const inRange =
        row.effectiveStartDate <= dateKey &&
        (row.effectiveEndDate === null || row.effectiveEndDate >= dateKey);
      if (inRange) return row.scheduleId;
    }
    return "";
  }

  async function applySingleCell(employeeId: string, dateKey: string, scheduleId: string, previousScheduleId: string) {
    setMatrixError(null);
    setMatrixSuccess(null);
    const cellKey = `${employeeId}:${dateKey}`;
    startTransition(async () => {
      const result = await assignEmployeeSchedule({
        employeeId,
        scheduleId: scheduleId || null,
        effectiveStartDate: dateKey,
        effectiveEndDate: dateKey,
        notes: "Matrix scheduler",
      });
      if ("error" in result) {
        setMatrixCellOverrides((current) => ({
          ...current,
          [cellKey]: previousScheduleId,
        }));
        setMatrixError(result.error);
        return;
      }
      setMatrixSuccess(`${scheduleId ? "Shift" : "OFF"} tanggal ${formatDateDisplay(dateKey)} tersimpan.`);
      router.refresh();
    });
  }

  async function applySelectedByDate() {
    setMatrixError(null);
    setMatrixSuccess(null);
    const employeeIds = filteredTeamMembers.filter((m) => selectedEmployeeIds[m.employeeId]).map((m) => m.employeeId);
    if (employeeIds.length === 0) {
      setMatrixError("Pilih minimal satu karyawan.");
      return;
    }
    if (matrixScheduleId === "__unselected__") {
      setMatrixError("Pilih shift untuk aksi massal.");
      return;
    }
    const startMs = new Date(matrixStartDate).getTime();
    const endMs = new Date(matrixEndDate).getTime();
    const rangeDays = Math.round((endMs - startMs) / 86400000) + 1;
    const skipSundays = rangeDays > 6;

    startTransition(async () => {
      const result = await assignEmployeeSchedulesBulk({
        employeeIds,
        scheduleId: matrixScheduleId || null,
        effectiveStartDate: matrixStartDate,
        effectiveEndDate: matrixEndDate,
        notes: "Bulk matrix scheduler",
        skipSundays,
      });
      if ("error" in result) {
        setMatrixError(result.error);
        return;
      }
      const suffix = skipSundays ? " (hari Minggu di-OFF otomatis)" : "";
      setMatrixSuccess(`Berhasil set ${employeeIds.length} karyawan${suffix}.`);
      router.refresh();
    });
  }

  function openDialog(member: TeamMember) {
    setForm({
      employeeId: member.employeeId,
      employeeName: member.employeeName,
      scheduleId: member.scheduleId ?? "",
      effectiveStartDate: payrollPeriod.start,
      effectiveEndDate: payrollPeriod.end,
      notes: "",
    });
    setError(null);
    setSuccess(false);
    setDialogOpen(true);
  }

  function closeScheduleDetail() {
    setScheduleDetailOpen(false);
    setScheduleDetail(null);
    setSelectedMember(null);
    setScheduleDetailError(null);
    setScheduleDetailLoading(false);
  }

  function openScheduleDetail(member: TeamMember) {
    setSelectedMember(member);
    setScheduleDetailOpen(true);
    setScheduleDetailLoading(true);
    setScheduleDetailError(null);
    setScheduleDetail(null);

    startTransition(async () => {
      try {
        const result = await getEmployeeScheduleDetail(member.employeeId, selectedYear, selectedMonth);
        if (!result) {
          setScheduleDetailError("Jadwal karyawan tidak ditemukan.");
          setScheduleDetailLoading(false);
          return;
        }

        setScheduleDetail(result);
        setScheduleDetailLoading(false);
      } catch {
        setScheduleDetailError("Gagal memuat jadwal karyawan.");
        setScheduleDetailLoading(false);
      }
    });
  }

  function openBulkDialog() {
    setBulkForm({
      scheduleId: "__unselected__",
      effectiveStartDate: payrollPeriod.start,
      effectiveEndDate: payrollPeriod.end,
      notes: "",
    });
    setBulkError(null);
    setBulkSuccess(false);
    setBulkDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setError(null);
    setSuccess(false);
  }

  function handleBulkClose() {
    setBulkDialogOpen(false);
    setBulkError(null);
    setBulkSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!form.scheduleId) {
      setError("Pilih master shift terlebih dahulu.");
      return;
    }
    if (!form.effectiveStartDate || !form.effectiveEndDate) {
      setError("Rentang tanggal harus diisi.");
      return;
    }

    startTransition(async () => {
      const result = await assignEmployeeSchedule({
        employeeId: form.employeeId,
        scheduleId: form.scheduleId,
        effectiveStartDate: form.effectiveStartDate,
        effectiveEndDate: form.effectiveEndDate,
        notes: form.notes || undefined,
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
        setTimeout(() => {
          setDialogOpen(false);
          setSuccess(false);
        }, 1200);
      }
    });
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBulkError(null);
    setBulkSuccess(false);

    if (bulkForm.scheduleId === "__unselected__") {
      setBulkError("Pilih master shift terlebih dahulu.");
      return;
    }
    if (!bulkForm.effectiveStartDate || !bulkForm.effectiveEndDate) {
      setBulkError("Rentang tanggal harus diisi.");
      return;
    }
    if (filteredTeamMembers.length === 0) {
      setBulkError("Tidak ada karyawan yang cocok dengan filter aktif.");
      return;
    }

    startTransition(async () => {
      const result = await assignEmployeeSchedulesBulk({
        employeeIds: filteredTeamMembers.map((member) => member.employeeId),
        scheduleId: bulkForm.scheduleId || null,
        effectiveStartDate: bulkForm.effectiveStartDate,
        effectiveEndDate: bulkForm.effectiveEndDate,
        notes: bulkForm.notes || undefined,
      });

      if ("error" in result) {
        setBulkError(result.error);
      } else {
        setBulkSuccess(true);
        router.refresh();
        setTimeout(() => {
          setBulkDialogOpen(false);
          setBulkSuccess(false);
        }, 1200);
      }
    });
  }

  function handleQuickAssign(member: TeamMember) {
    setQuickError(null);
    setQuickSuccess(null);
    const scheduleId = quickScheduleByEmployee[member.employeeId] ?? member.scheduleId ?? "";
    if (!scheduleId) {
      setQuickError("Pilih master shift dulu untuk mode cepat.");
      return;
    }

    startTransition(async () => {
      const result = await assignEmployeeSchedule({
        employeeId: member.employeeId,
        scheduleId,
        effectiveStartDate: payrollPeriod.start,
        effectiveEndDate: payrollPeriod.end,
        notes: "Mode cepat periode aktif 26-25",
      });
      if ("error" in result) {
        setQuickError(result.error);
        return;
      }
      setQuickSuccess(`Shift ${member.employeeName} tersimpan untuk periode ${formatDateDisplay(payrollPeriod.start)} - ${formatDateDisplay(payrollPeriod.end)}.`);
      router.refresh();
    });
  }

  const columns: ColumnDef<TeamMember & Record<string, unknown>>[] = [
    {
      accessorKey: "employeeName",
      header: "Nama Karyawan",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => openScheduleDetail(row.original)}
          className="text-left group"
        >
          <p className="font-semibold text-slate-800 group-hover:text-teal-700 group-hover:underline">
            {row.original.employeeName}
          </p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{row.original.employeeCode}</p>
        </button>
      ),
    },
    {
      accessorKey: "divisionName",
      header: "Divisi",
      cell: ({ row }) => (
        <span className="text-sm text-slate-600">{row.original.divisionName}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const selectedScheduleId = quickScheduleByEmployee[row.original.employeeId] ?? row.original.scheduleId ?? "";
        const theme = getScheduleTheme(selectedScheduleId);

        return (
          <div className="flex items-center gap-2">
            <select
              value={selectedScheduleId}
              onChange={(event) =>
                setQuickScheduleByEmployee((current) => ({
                  ...current,
                  [row.original.employeeId]: event.target.value,
                }))
              }
              className={cn(
                "h-8 rounded-md border bg-white px-2 text-xs font-semibold",
                theme.border,
                theme.text,
                theme.bg
              )}
            >
              <option value="">Pilih shift</option>
              {scheduleOptions.map(renderShiftOption)}
            </select>
            <Button
              size="sm"
              className="h-8 bg-teal-600 text-xs hover:bg-teal-700"
              onClick={() => handleQuickAssign(row.original)}
            >
              Terapkan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-semibold border-slate-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors"
              onClick={() => openDialog(row.original)}
            >
              Detail
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <>
          <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <a
                href={`/scheduler?year=${prevYear}&month=${prevMonth}`}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Bulan Sebelumnya
              </a>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Periode ditampilkan</p>
                <p className="text-sm font-bold text-slate-900">
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </p>
                <p className="text-xs text-slate-500">{formatDateDisplay(periodStart)} - {formatDateDisplay(periodEnd)}</p>
              </div>
              <a
                href={`/scheduler?year=${nextYear}&month=${nextMonth}`}
                className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Bulan Berikutnya
              </a>
            </div>
          </div>
          <div className="space-y-2 mb-2">
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cabang</label>
                  <select
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="">Semua cabang</option>
                    {branchOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Divisi</label>
                  <select
                    value={divisionFilter}
                    onChange={(event) => setDivisionFilter(event.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  >
                    <option value="">Semua divisi</option>
                    {divisionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tanggal Mulai</label>
                  <Input
                    type="date"
                    className="mt-0.5 h-8 w-full text-xs"
                    value={matrixStartDate}
                    onChange={(e) => {
                      setMatrixStartDate(e.target.value);
                      if (matrixDate < e.target.value) setMatrixDate(e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tanggal Selesai</label>
                  <Input
                    type="date"
                    className="mt-0.5 h-8 w-full text-xs"
                    value={matrixEndDate}
                    onChange={(e) => {
                      setMatrixEndDate(e.target.value);
                      if (matrixDate > e.target.value) setMatrixDate(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={matrixScheduleId}
                  onChange={(e) => setMatrixScheduleId(e.target.value)}
                  className={cn(
                    "h-8 rounded-md border bg-white px-2 text-xs font-semibold",
                    getScheduleTheme(matrixScheduleId).border,
                    getScheduleTheme(matrixScheduleId).text,
                    getScheduleTheme(matrixScheduleId).bg
                  )}
                >
                  <option value="__unselected__">Pilih shift massal</option>
                  <option value="" style={{ backgroundColor: OFF_SHIFT_THEME.optionBg, color: OFF_SHIFT_THEME.optionColor }}>
                    OFF
                  </option>
                  {scheduleOptions.map(renderShiftOption)}
                </select>
                <Button type="button" size="sm" className="h-8 bg-teal-600 hover:bg-teal-700 text-xs" onClick={() => void applySelectedByDate()}>
                  Terapkan ke Terpilih
                </Button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("font-mono", OFF_SHIFT_THEME.badge)}>
                  OFF
                </Badge>
                {scheduleOptions.map((option) => (
                  <Badge key={option.id} variant="outline" className={cn("font-mono", getScheduleTheme(option.id).badge)}>
                    {option.code}
                  </Badge>
                ))}
              </div>
              {matrixError ? <p className="text-xs text-red-600">{matrixError}</p> : null}
              {matrixSuccess ? <p className="text-xs text-teal-700">{matrixSuccess}</p> : null}
              {matrixStartDate > matrixEndDate ? (
                <p className="text-xs text-red-600">Tanggal selesai harus sama atau setelah tanggal mulai.</p>
              ) : null}
              <div className="overflow-x-auto rounded-lg border border-slate-200 mt-2">
                <table className="min-w-max text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-10 border-b border-r bg-slate-50 px-2 py-2 text-left">
                        <label className="flex items-center gap-2">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                          />
                          <span>Karyawan</span>
                        </label>
                      </th>
                      {periodDates.map((dateKey) => (
                        <th key={dateKey} className="border-b border-r px-2 py-2 text-center">
                          {dateKey.slice(8, 10)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeamMembers.map((member) => (
                      <tr key={member.employeeId} className="border-b">
                        <td className="sticky left-0 z-10 border-r bg-white px-2 py-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedEmployeeIds[member.employeeId])}
                              onChange={(e) => setSelectedEmployeeIds((s) => ({ ...s, [member.employeeId]: e.target.checked }))}
                            />
                            <span className="whitespace-nowrap">{member.employeeName}</span>
                          </label>
                        </td>
                        {periodDates.map((dateKey) => {
                          const selectedScheduleId = resolveScheduleAtDate(member.employeeId, dateKey);
                          const cellKey = `${member.employeeId}:${dateKey}`;
                          const currentScheduleId = matrixCellOverrides[cellKey] ?? selectedScheduleId;
                          const theme = getScheduleTheme(currentScheduleId);
                          return (
                            <td key={`${member.employeeId}-${dateKey}`} className="border-r px-1 py-1">
                              <select
                                value={currentScheduleId}
                                onChange={(e) => {
                                  const nextScheduleId = e.target.value;
                                  setMatrixCellOverrides((current) => ({
                                    ...current,
                                    [cellKey]: nextScheduleId,
                                  }));
                                  void applySingleCell(member.employeeId, dateKey, nextScheduleId, currentScheduleId);
                                }}
                                className={cn(
                                  "h-7 w-[74px] rounded border px-1 text-[10px] font-semibold",
                                  theme.border,
                                  theme.text,
                                  theme.bg
                                )}
                              >
                                <option value="" style={{ backgroundColor: OFF_SHIFT_THEME.optionBg, color: OFF_SHIFT_THEME.optionColor }}>OFF</option>
                                {scheduleOptions.map(renderShiftOption)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
            {quickSuccess ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {quickSuccess}
              </div>
            ) : null}
            {quickError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {quickError}
              </div>
            ) : null}
          </div>

      </>

      <Dialog open={scheduleDetailOpen} onOpenChange={(open) => !open && closeScheduleDetail()}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <CalendarDays size={16} className="text-teal-500" />
              Jadwal Penuh Karyawan
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {selectedMember?.employeeName ?? "-"}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {selectedMember?.employeeCode ?? "-"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {selectedMember?.divisionName ?? "-"} · {selectedMember?.positionName ?? "-"}
              </p>
            </div>

            {scheduleDetailLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Memuat jadwal...
              </div>
            ) : scheduleDetailError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-xs text-red-700">{scheduleDetailError}</p>
              </div>
            ) : scheduleDetail ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 font-semibold text-teal-700">
                    {scheduleDetail.scheduleName} ({scheduleDetail.scheduleCode})
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatDateDisplay(scheduleDetail.days[0]?.date ?? "")} - {formatDateDisplay(scheduleDetail.days[scheduleDetail.days.length - 1]?.date ?? "")}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {scheduleDetail.days.map((day) => {
                    const isTicket = Boolean(day.ticketOverride);
                    const label = day.ticketOverride ?? (day.dayStatus === "KERJA" ? "KERJA" : day.dayStatus);
                    const timeLabel = day.startTime && day.endTime ? `${day.startTime} - ${day.endTime}` : "-";

                    return (
                      <div
                        key={day.date}
                        className={`rounded-lg border p-3 ${
                          isTicket
                            ? "border-amber-200 bg-amber-50"
                            : day.isWorkingDay
                            ? "border-teal-200 bg-teal-50/50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p className="text-[11px] font-semibold text-slate-900">{formatDateDisplay(day.date)}</p>
                        <p className="text-[11px] text-slate-500">{DAY_NAMES_ID[day.dayOfWeek]}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500">{isTicket ? "Izin / Cuti" : timeLabel}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Pilih karyawan untuk melihat jadwal.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <CalendarCog size={16} className="text-teal-500" />
              Ganti Jadwal
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* Employee name (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Karyawan
              </Label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-800">{form.employeeName}</p>
              </div>
            </div>

            {/* Schedule select */}
            <div className="space-y-1.5">
              <Label
                htmlFor="scheduleId"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Master Shift
              </Label>
              <select
                id="scheduleId"
                value={form.scheduleId}
                onChange={(e) => setForm((f) => ({ ...f, scheduleId: e.target.value }))}
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors",
                  getScheduleTheme(form.scheduleId).border,
                  getScheduleTheme(form.scheduleId).text,
                  getScheduleTheme(form.scheduleId).bg
                )}
                required
              >
                <option value="">— Pilih master shift —</option>
                {scheduleOptions.map(renderShiftNameOption)}
              </select>
              {form.scheduleId ? (
                <Badge variant="outline" className={cn("font-mono", getScheduleTheme(form.scheduleId).badge)}>
                  {scheduleOptionMap.get(form.scheduleId)?.code ?? "SHIFT"}
                </Badge>
              ) : null}
            </div>

            {/* Effective date */}
            <div className="space-y-1.5">
              <Label
                htmlFor="effectiveStartDate"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Tanggal Mulai
              </Label>
              <Input
                id="effectiveStartDate"
                type="date"
                value={form.effectiveStartDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveStartDate: e.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="effectiveEndDate"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Tanggal Selesai
              </Label>
              <Input
                id="effectiveEndDate"
                type="date"
                value={form.effectiveEndDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveEndDate: e.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
                required
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label
                htmlFor="notes"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Catatan <span className="font-normal text-slate-400">(opsional)</span>
              </Label>
              <Input
                id="notes"
                type="text"
                placeholder="Alasan perubahan jadwal..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2.5 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-teal-600" />
                <p className="text-xs text-teal-700 font-semibold">Jadwal berhasil disimpan!</p>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="border-slate-200 text-slate-600 hover:bg-slate-50"
                disabled={isPending}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending || success}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Jadwal"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={handleBulkClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <Users size={16} className="text-teal-500" />
              Atur Jadwal Serentak
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBulkSubmit} className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Target terfilter</p>
              <p className="text-sm font-semibold text-slate-800">
                {filteredTeamMembers.length} karyawan
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulkScheduleId" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Master Shift
              </Label>
              <select
                id="bulkScheduleId"
                value={bulkForm.scheduleId}
                onChange={(event) => setBulkForm((current) => ({ ...current, scheduleId: event.target.value }))}
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold",
                  getScheduleTheme(bulkForm.scheduleId).border,
                  getScheduleTheme(bulkForm.scheduleId).text,
                  getScheduleTheme(bulkForm.scheduleId).bg
                )}
                required
              >
                <option value="__unselected__">— Pilih master shift —</option>
                <option value="" style={{ backgroundColor: OFF_SHIFT_THEME.optionBg, color: OFF_SHIFT_THEME.optionColor }}>
                  OFF
                </option>
                {scheduleOptions.map(renderShiftNameOption)}
              </select>
              {bulkForm.scheduleId !== "__unselected__" ? (
                <Badge variant="outline" className={cn("font-mono", getScheduleTheme(bulkForm.scheduleId).badge)}>
                  {bulkForm.scheduleId ? scheduleOptionMap.get(bulkForm.scheduleId)?.code ?? "SHIFT" : "OFF"}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulkEffectiveDate" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Tanggal Mulai
              </Label>
              <Input
                id="bulkEffectiveStartDate"
                type="date"
                value={bulkForm.effectiveStartDate}
                onChange={(event) => setBulkForm((current) => ({ ...current, effectiveStartDate: event.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulkEffectiveEndDate" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Tanggal Selesai
              </Label>
              <Input
                id="bulkEffectiveEndDate"
                type="date"
                value={bulkForm.effectiveEndDate}
                onChange={(event) => setBulkForm((current) => ({ ...current, effectiveEndDate: event.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bulkNotes" className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Catatan <span className="font-normal text-slate-400">(opsional)</span>
              </Label>
              <Input
                id="bulkNotes"
                type="text"
                placeholder="Contoh: penyesuaian hari libur nasional"
                value={bulkForm.notes}
                onChange={(event) => setBulkForm((current) => ({ ...current, notes: event.target.value }))}
                className="h-10 text-sm border-slate-200 focus-visible:ring-teal-500"
              />
            </div>

            {bulkError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-xs text-red-700 font-medium">{bulkError}</p>
              </div>
            )}

            {bulkSuccess && (
              <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2.5 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-teal-600" />
                <p className="text-xs text-teal-700 font-semibold">Jadwal serentak berhasil disimpan!</p>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBulkClose}
                className="border-slate-200 text-slate-600 hover:bg-slate-50"
                disabled={isPending}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isPending || bulkSuccess || filteredTeamMembers.length === 0}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Serentak"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
