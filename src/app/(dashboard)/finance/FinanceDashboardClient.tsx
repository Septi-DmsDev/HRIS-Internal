"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Search, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  addPayrollAdjustment,
  deletePayrollAdjustment,
  updatePayrollAdjustment,
  syncSalaryConfigWithEmployeeGroupMaster,
  upsertEmployeeSalaryConfig,
  upsertGradeCompensationConfig,
} from "@/server/actions/payroll";
import {
  ADJUSTMENT_CATEGORY_LABELS,
  type AdjustmentCategory,
} from "@/lib/validations/payroll";
import {
  filterAdjustmentEmployeeOptions,
  getEligibleAdjustmentEmployeeOptions,
} from "./employee-search";
import { isKpiEmployeeGroup, resolveEmployeeGroupLabel, type EmployeeGroup } from "@/lib/employee-groups";
import type {
  PayrollAdjustmentRow,
  PayrollGradeCompensationRow,
  PayrollPeriodRow,
  PayrollSalaryConfigRow,
} from "../payroll/PayrollClient";

type Props = {
  canManage: boolean;
  activePeriodId: string | null;
  periods: PayrollPeriodRow[];
  salaryConfigs: PayrollSalaryConfigRow[];
  gradeCompensations: PayrollGradeCompensationRow[];
  adjustments: PayrollAdjustmentRow[];
};

type SalaryDraft = {
  employeeId: string;
  employeeLabel: string;
  baseSalaryAmount: string;
  notes: string;
};

type GradeDraft = {
  gradeId: string;
  gradeLabel: string;
  allowanceAmount: string;
  bonusKinerja80: string;
  bonusKinerja90: string;
  bonusKinerja100: string;
  bonusKinerjaTeam80: string;
  bonusKinerjaTeam90: string;
  bonusKinerjaTeam100: string;
  bonusDisiplin80: string;
  bonusDisiplin90: string;
  bonusDisiplin100: string;
  bonusPrestasi140: string;
  bonusPrestasi165: string;
};

type AdjustmentDraft = {
  employeeId: string;
  category: AdjustmentCategory;
  amount: string;
  description: string;
  tenorMonthsRemaining: string;
};

type AdjustmentEditDraft = {
  amount: string;
  description: string;
  tenorMonthsRemaining: string;
};

const ADDITION_DEFAULT_AMOUNTS: Partial<Record<AdjustmentCategory, number>> = {
  BONUS_OMSET_1_CSM: 400000,
  BONUS_OMSET_2_CSM: 250000,
  BONUS_OMSET_3_CSM: 100000,
  BONUS_KINERJA_CSM_TERTINGGI: 250000,
  BONUS_COUNTER_MESIN: 100000,
};

function fmt(amount: number | null) {
  if (amount == null || amount === 0) return "-";
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function asInput(value: number | null) {
  return value == null ? "" : String(value);
}

function employeeGroupBadgeClass(group: EmployeeGroup) {
  switch (group) {
    case "KARYAWAN_TETAP":
    case "MANAGERIAL":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "MITRA_KERJA":
    case "TEAMWORK":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "BORONGAN":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "TRAINING":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function emptySalaryDraft(row?: PayrollSalaryConfigRow): SalaryDraft {
  return {
    employeeId: row?.employeeId ?? "",
    employeeLabel: row ? `${row.employeeName} · ${row.employeeCode}` : "",
    baseSalaryAmount: asInput(row?.baseSalaryAmount ?? null),
    notes: row?.notes ?? "",
  };
}

function emptyGradeDraft(row?: PayrollGradeCompensationRow): GradeDraft {
  return {
    gradeId: row?.gradeId ?? "",
    gradeLabel: row?.gradeName ?? "",
    allowanceAmount: asInput(row?.allowanceAmount ?? null),
    bonusKinerja80: asInput(row?.bonusKinerja80 ?? null),
    bonusKinerja90: asInput(row?.bonusKinerja90 ?? null),
    bonusKinerja100: asInput(row?.bonusKinerja100 ?? null),
    bonusKinerjaTeam80: asInput(row?.bonusKinerjaTeam80 ?? null),
    bonusKinerjaTeam90: asInput(row?.bonusKinerjaTeam90 ?? null),
    bonusKinerjaTeam100: asInput(row?.bonusKinerjaTeam100 ?? null),
    bonusDisiplin80: asInput(row?.bonusDisiplin80 ?? null),
    bonusDisiplin90: asInput(row?.bonusDisiplin90 ?? null),
    bonusDisiplin100: asInput(row?.bonusDisiplin100 ?? null),
    bonusPrestasi140: asInput(row?.bonusPrestasi140 ?? null),
    bonusPrestasi165: asInput(row?.bonusPrestasi165 ?? null),
  };
}

export default function FinanceDashboardClient({
  canManage,
  activePeriodId,
  periods,
  salaryConfigs,
  gradeCompensations,
  adjustments,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [salaryOpen, setSalaryOpen] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState<SalaryDraft>(emptySalaryDraft());

  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeDraft, setGradeDraft] = useState<GradeDraft>(emptyGradeDraft());

  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentEmployeeSearch, setAdjustmentEmployeeSearch] = useState("");
  const [adjustmentEmployeePickerOpen, setAdjustmentEmployeePickerOpen] = useState(false);
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft>({
    employeeId: salaryConfigs[0]?.employeeId ?? "",
    category: "BPJS",
    amount: "",
    description: "",
    tenorMonthsRemaining: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<PayrollAdjustmentRow | null>(null);
  const [editDraft, setEditDraft] = useState<AdjustmentEditDraft>({ amount: "", description: "", tenorMonthsRemaining: "" });

  const runAction = useCallback(async (action: () => Promise<{ error?: string; success?: boolean }>) => {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return false;
      }
      setSuccess("Perubahan berhasil disimpan.");
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }, [router]);

  const salaryColumns: ColumnDef<PayrollSalaryConfigRow>[] = useMemo(
    () => [
      {
        header: "Karyawan",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900">{row.original.employeeName}</p>
            <p className="text-xs text-slate-500">{row.original.positionName} · {row.original.divisionName}</p>
          </div>
        ),
      },
      {
        header: "Kelompok Karyawan",
        accessorKey: "employeeGroup",
        cell: ({ row }) => (
          <Badge variant="outline" className={employeeGroupBadgeClass(row.original.employeeGroup)}>
            {resolveEmployeeGroupLabel(row.original.employeeGroup)}
          </Badge>
        ),
      },
      {
        header: "Gaji Pokok",
        accessorKey: "baseSalaryAmount",
        cell: ({ row }) => <span>{fmt(row.original.baseSalaryAmount)}</span>,
      },
      {
        header: "Tunjangan Masa Kerja",
        accessorKey: "tenureAllowanceAmount",
        cell: ({ row }) => <span>{fmt(row.original.tenureAllowanceAmount)}</span>,
      },
      {
        header: "Update",
        accessorKey: "updatedAt",
        cell: ({ row }) => <span className="text-slate-500 text-xs">{row.original.updatedAt}</span>,
      },
      {
        header: "",
        id: "action",
        cell: ({ row }) =>
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSalaryDraft(emptySalaryDraft(row.original));
                setError(null);
                setSuccess(null);
                setSalaryOpen(true);
              }}
            >
              Atur
            </Button>
          ) : null,
      },
    ],
    [canManage]
  );

  const gradeColumns: ColumnDef<PayrollGradeCompensationRow>[] = useMemo(
    () => [
      { header: "Grade", accessorKey: "gradeName" },
      {
        header: "Tunjangan",
        accessorKey: "allowanceAmount",
        cell: ({ row }) => <span>{fmt(row.original.allowanceAmount)}</span>,
      },
      {
        header: "Kinerja 80 / 90 / 100",
        id: "kinerja",
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">
            {fmt(row.original.bonusKinerja80)} / {fmt(row.original.bonusKinerja90)} / {fmt(row.original.bonusKinerja100)}
          </span>
        ),
      },
      {
        header: "Disiplin 80 / 90 / 100",
        id: "disiplin",
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">
            {fmt(row.original.bonusDisiplin80)} / {fmt(row.original.bonusDisiplin90)} / {fmt(row.original.bonusDisiplin100)}
          </span>
        ),
      },
      {
        header: "",
        id: "action",
        cell: ({ row }) =>
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGradeDraft(emptyGradeDraft(row.original));
                setError(null);
                setSuccess(null);
                setGradeOpen(true);
              }}
            >
              Atur
            </Button>
          ) : null,
      },
    ],
    [canManage]
  );

  const categoryBadgeVariant = (category: string, adjustmentType: string) => {
    if (category === "MANUAL_ADDITION" || adjustmentType === "ADDITION") return "default" as const;
    if (category === "GANTI_RUGI_PERSONAL" || category === "GANTI_RUGI_TEAM") return "destructive" as const;
    return "secondary" as const;
  };

  const categoryLabel = (category: string, adjustmentType: string) => {
    const known = ADJUSTMENT_CATEGORY_LABELS[category as AdjustmentCategory];
    if (known) return known;
    return adjustmentType === "ADDITION" ? "Penambahan" : "Potongan";
  };

  const adjustmentEmployeeOptions = useMemo(
    () =>
      filterAdjustmentEmployeeOptions(
        salaryConfigs,
        adjustmentDraft.category,
        adjustmentEmployeeSearch
      ),
    [adjustmentDraft.category, adjustmentEmployeeSearch, salaryConfigs]
  );

  const selectedAdjustmentEmployee = useMemo(
    () => salaryConfigs.find((row) => row.employeeId === adjustmentDraft.employeeId) ?? null,
    [adjustmentDraft.employeeId, salaryConfigs]
  );

  function resolveEmployeeForCategory(category: AdjustmentCategory, currentEmployeeId: string) {
    const eligibleRows = getEligibleAdjustmentEmployeeOptions(salaryConfigs, category);
    if (eligibleRows.some((row) => row.employeeId === currentEmployeeId)) {
      return currentEmployeeId;
    }
    return eligibleRows[0]?.employeeId ?? "";
  }

  function decodeReasonToEditDraft(reason: string): AdjustmentEditDraft {
    const parts = reason.split("::");
    const category = parts[0] ?? "";
    if (category === "CICILAN") {
      return {
        amount: "",
        tenorMonthsRemaining: parts[1] ?? "",
        description: parts.slice(2).join("::"),
      };
    }
    return { amount: "", tenorMonthsRemaining: "", description: parts.slice(1).join("::") };
  }

  const handleOpenEdit = useCallback((row: PayrollAdjustmentRow) => {
    const draft = decodeReasonToEditDraft(row.reason);
    draft.amount = String(row.amount);
    setEditRow(row);
    setEditDraft(draft);
    setError(null);
    setSuccess(null);
    setEditOpen(true);
  }, []);

  const handleDeleteAdjustment = useCallback(async (row: PayrollAdjustmentRow) => {
    if (!activePeriodId) return;
    const ok = window.confirm(
      row.source === "RECURRING"
        ? "Hapus adjustment berulang ini? Baris ini tidak akan ikut payroll bulan berikutnya."
        : "Hapus adjustment periode ini?"
    );
    if (!ok) return;

    await runAction(() =>
      deletePayrollAdjustment({
        periodId: activePeriodId,
        adjustmentId: row.id,
        source: row.source,
      })
    );
  }, [activePeriodId, runAction]);

  const adjustmentColumns: ColumnDef<PayrollAdjustmentRow>[] = useMemo(
    () => [
      {
        header: "Karyawan",
        accessorKey: "employeeName",
        cell: ({ row }) => <span className="font-medium">{row.original.employeeName}</span>,
      },
      {
        header: "Kategori",
        accessorKey: "category",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant={categoryBadgeVariant(row.original.category, row.original.adjustmentType)}>
              {categoryLabel(row.original.category, row.original.adjustmentType)}
            </Badge>
            {row.original.source === "RECURRING" ? (
              <span className="text-xs text-slate-400">Berulang</span>
            ) : null}
          </div>
        ),
      },
      {
        header: "Nominal",
        accessorKey: "amount",
        cell: ({ row }) => (
          <span className={row.original.adjustmentType === "DEDUCTION" ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>
            {row.original.adjustmentType === "DEDUCTION" ? "−" : "+"}{fmt(row.original.amount)}
          </span>
        ),
      },
      {
        header: "Keterangan",
        accessorKey: "description",
        cell: ({ row }) => <span className="text-slate-500 text-sm">{row.original.description}</span>,
      },
      {
        header: "Tanggal",
        accessorKey: "createdAt",
        cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.createdAt}</span>,
      },
      {
        header: "",
        id: "action",
        cell: ({ row }) =>
          canManage ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 px-0 text-slate-600 hover:text-slate-800"
                disabled={pending || !activePeriodId}
                title="Edit adjustment"
                aria-label="Edit adjustment"
                onClick={() => handleOpenEdit(row.original)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 px-0 text-rose-600 hover:text-rose-700"
                disabled={pending || !activePeriodId}
                title="Hapus adjustment"
                aria-label="Hapus adjustment"
                onClick={() => void handleDeleteAdjustment(row.original)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [activePeriodId, canManage, handleDeleteAdjustment, handleOpenEdit, pending]
  );

  const activePeriod = periods.find((p) => p.id === activePeriodId);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      ) : null}

      <Tabs defaultValue="salary">
        <TabsList>
          <TabsTrigger value="salary">Pengaturan Gaji Pokok</TabsTrigger>
          <TabsTrigger value="grade">Master Bonus & Tunjangan Grade</TabsTrigger>
          <TabsTrigger value="adjustment">Adjustment</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Gaji Pokok per Karyawan */}
        <TabsContent value="salary">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <DataTable
              data={salaryConfigs}
              columns={salaryColumns}
              searchKey="employeeName"
              searchPlaceholder="Cari karyawan..."
              toolbarSlot={
                canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={async () => {
                      await runAction(() => syncSalaryConfigWithEmployeeGroupMaster());
                    }}
                  >
                    🔁 Sync
                  </Button>
                ) : null
              }
            />
          </div>
        </TabsContent>

        {/* Tab 2 - Master Grade */}
        <TabsContent value="grade">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-sm text-slate-500">
              Atur tunjangan dan bonus per grade jabatan. Berlaku untuk semua karyawan dengan grade tersebut.
            </p>
            <DataTable
              data={gradeCompensations}
              columns={gradeColumns}
              searchKey="gradeName"
              searchPlaceholder="Cari grade..."
            />
          </div>
        </TabsContent>

        {/* Tab 3 - Adjustment */}
        <TabsContent value="adjustment">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={activePeriodId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) router.push(`/finance?periodId=${id}`);
                  }}
                >
                  <option value="" disabled>Pilih periode</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.periodCode} — {p.status}
                    </option>
                  ))}
                </select>
                {activePeriod ? (
                  <span className="text-sm text-slate-500">{activePeriod.periodLabel}</span>
                ) : null}
              </div>
              {canManage && activePeriodId ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setAdjustmentDraft({
                      employeeId: salaryConfigs[0]?.employeeId ?? "",
                      category: "BPJS",
                      amount: "",
                      description: "",
                      tenorMonthsRemaining: "",
                    });
                    setAdjustmentEmployeeSearch("");
                    setAdjustmentEmployeePickerOpen(false);
                    setError(null);
                    setSuccess(null);
                    setAdjustmentOpen(true);
                  }}
                >
                  Tambah Adjustment
                </Button>
              ) : null}
            </div>
            {activePeriodId ? (
              <DataTable
                data={adjustments}
                columns={adjustmentColumns}
                searchKey="employeeName"
                searchPlaceholder="Cari karyawan..."
              />
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">Pilih periode untuk melihat adjustment.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Atur Gaji Pokok */}
      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atur Gaji Pokok</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={salaryDraft.employeeLabel} disabled />
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Gaji Pokok (Rp)</label>
              <Input
                type="number"
                placeholder="Nominal gaji pokok"
                value={salaryDraft.baseSalaryAmount}
                onChange={(e) => setSalaryDraft((v) => ({ ...v, baseSalaryAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Catatan (opsional)</label>
              <Input
                placeholder="Catatan"
                value={salaryDraft.notes}
                onChange={(e) => setSalaryDraft((v) => ({ ...v, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryOpen(false)} disabled={pending}>Batal</Button>
            <Button
              disabled={pending}
              onClick={async () => {
                const ok = await runAction(() =>
                  upsertEmployeeSalaryConfig({
                    employeeId: salaryDraft.employeeId,
                    baseSalaryAmount: salaryDraft.baseSalaryAmount,
                    notes: salaryDraft.notes,
                  })
                );
                if (ok) setSalaryOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Atur Grade Compensation */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Atur Bonus & Tunjangan — {gradeDraft.gradeLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-slate-500">Tunjangan Grade (Rp)</label>
              <Input type="number" placeholder="Tunjangan" value={gradeDraft.allowanceAmount} onChange={(e) => setGradeDraft((v) => ({ ...v, allowanceAmount: e.target.value }))} />
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Bonus Kinerja Individu</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">80%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerja80} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerja80: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">90%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerja90} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerja90: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">100%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerja100} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerja100: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Bonus Kinerja Tim</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">80%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerjaTeam80} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerjaTeam80: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">90%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerjaTeam90} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerjaTeam90: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">100%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusKinerjaTeam100} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusKinerjaTeam100: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Bonus Disiplin</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">80%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusDisiplin80} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusDisiplin80: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">90%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusDisiplin90} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusDisiplin90: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">100%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusDisiplin100} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusDisiplin100: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700 mb-2">Bonus Prestasi</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">140%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusPrestasi140} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusPrestasi140: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">165%</label>
                  <Input type="number" placeholder="0" value={gradeDraft.bonusPrestasi165} onChange={(e) => setGradeDraft((v) => ({ ...v, bonusPrestasi165: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)} disabled={pending}>Batal</Button>
            <Button
              disabled={pending}
              onClick={async () => {
                const ok = await runAction(() =>
                  upsertGradeCompensationConfig({
                    gradeId: gradeDraft.gradeId,
                    allowanceAmount: gradeDraft.allowanceAmount,
                    bonusKinerja80: gradeDraft.bonusKinerja80,
                    bonusKinerja90: gradeDraft.bonusKinerja90,
                    bonusKinerja100: gradeDraft.bonusKinerja100,
                    bonusKinerjaTeam80: gradeDraft.bonusKinerjaTeam80,
                    bonusKinerjaTeam90: gradeDraft.bonusKinerjaTeam90,
                    bonusKinerjaTeam100: gradeDraft.bonusKinerjaTeam100,
                    bonusDisiplin80: gradeDraft.bonusDisiplin80,
                    bonusDisiplin90: gradeDraft.bonusDisiplin90,
                    bonusDisiplin100: gradeDraft.bonusDisiplin100,
                    bonusPrestasi140: gradeDraft.bonusPrestasi140,
                    bonusPrestasi165: gradeDraft.bonusPrestasi165,
                    isActive: true,
                  })
                );
                if (ok) setGradeOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Edit Adjustment */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Adjustment</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <div className="space-y-3">
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 space-y-0.5">
                <p className="text-sm font-medium text-slate-900">{editRow.employeeName}</p>
                <p className="text-xs text-slate-500">
                  {categoryLabel(editRow.category, editRow.adjustmentType)}
                  {editRow.source === "RECURRING" ? " · Berulang" : ""}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">
                  Nominal (Rp){editRow.category === "KASBON" ? " — maks 300.000" : ""}
                </label>
                <Input
                  type="number"
                  placeholder="Nominal"
                  min={1}
                  max={editRow.category === "KASBON" ? 300000 : undefined}
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft((v) => ({ ...v, amount: e.target.value }))}
                />
              </div>

              {editRow.category === "CICILAN" && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Sisa Tenor (bulan)</label>
                  <Input
                    type="number"
                    placeholder="Contoh: 12"
                    min={1}
                    max={120}
                    value={editDraft.tenorMonthsRemaining}
                    onChange={(e) => setEditDraft((v) => ({ ...v, tenorMonthsRemaining: e.target.value }))}
                  />
                </div>
              )}

              {editRow.category !== "BPJS" && editRow.category !== "TRANSPORT" && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">
                    Keterangan{editRow.category === "MANUAL_ADDITION" ? " (wajib)" : " (opsional)"}
                  </label>
                  <Input
                    placeholder={
                      editRow.category === "MANUAL_ADDITION"
                        ? "Alasan penambahan"
                        : editRow.category === "CICILAN"
                        ? "Nama barang / keterangan pinjaman"
                        : "Keterangan"
                    }
                    value={editDraft.description}
                    onChange={(e) => setEditDraft((v) => ({ ...v, description: e.target.value }))}
                  />
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button
              disabled={pending || !activePeriodId || !editRow}
              onClick={async () => {
                if (!activePeriodId || !editRow) return;
                const ok = await runAction(() =>
                  updatePayrollAdjustment({
                    periodId: activePeriodId,
                    adjustmentId: editRow.id,
                    source: editRow.source,
                    amount: editDraft.amount,
                    description: editDraft.description || undefined,
                    tenorMonthsRemaining: editDraft.tenorMonthsRemaining || undefined,
                  })
                );
                if (ok) setEditOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Tambah Adjustment */}
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Kategori</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={adjustmentDraft.category}
                onChange={(e) =>
                  setAdjustmentDraft((v) => {
                    const nextCategory = e.target.value as AdjustmentCategory;
                    const defaultAmount = ADDITION_DEFAULT_AMOUNTS[nextCategory];
                    return {
                      ...v,
                      category: nextCategory,
                      employeeId: resolveEmployeeForCategory(nextCategory, v.employeeId),
                      amount: defaultAmount ? String(defaultAmount) : "",
                    };
                  })
                }
              >
                <optgroup label="Penambah Gaji">
                  <option value="MANUAL_ADDITION">Penambahan Manual</option>
                  <option value="TRANSPORT">Uang Transport (berulang)</option>
                  <option value="BONUS_OMSET_1_CSM">Bonus Omset 1 CSM (sekali/periode)</option>
                  <option value="BONUS_OMSET_2_CSM">Bonus Omset 2 CSM (sekali/periode)</option>
                  <option value="BONUS_OMSET_3_CSM">Bonus Omset 3 CSM (sekali/periode)</option>
                  <option value="BONUS_KINERJA_CSM_TERTINGGI">Bonus Kinerja CSM Tertinggi (sekali/periode)</option>
                  <option value="BONUS_COUNTER_MESIN">Bonus Counter Mesin (sekali/periode)</option>
                </optgroup>
                <optgroup label="Pengurang Gaji">
                  <option value="BPJS">BPJS</option>
                  <option value="KASBON">Kasbon (maks Rp 300.000/periode)</option>
                  <option value="GANTI_RUGI_PERSONAL">Ganti Rugi Personal (sekali per periode)</option>
                  <option value="GANTI_RUGI_TEAM">Ganti Rugi Team (Managerial only, sekali per periode)</option>
                  <option value="CICILAN">Cicilan (isi sisa tenor)</option>
                </optgroup>
              </select>
            </div>

            {/* Info banner per category */}
            {adjustmentDraft.category === "KASBON" && (
              <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Kasbon dibatasi maksimum Rp 300.000 per karyawan per periode.
              </p>
            )}
            {adjustmentDraft.category === "TRANSPORT" && (
              <p className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                Uang Transport dibayarkan otomatis setiap payroll selama karyawan masih aktif bekerja.
              </p>
            )}
            {adjustmentDraft.category === "BPJS" && (
              <p className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                BPJS menjadi potongan berulang setiap payroll sampai adjustment ini dihapus.
              </p>
            )}
            {adjustmentDraft.category === "GANTI_RUGI_TEAM" && (
              <p className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                Hanya karyawan Managerial yang dapat dikenakan Ganti Rugi Team.
              </p>
            )}
            {(adjustmentDraft.category === "BONUS_OMSET_1_CSM"
              || adjustmentDraft.category === "BONUS_OMSET_2_CSM"
              || adjustmentDraft.category === "BONUS_OMSET_3_CSM"
              || adjustmentDraft.category === "BONUS_KINERJA_CSM_TERTINGGI") && (
              <p className="rounded-md bg-cyan-50 border border-cyan-200 px-3 py-2 text-xs text-cyan-700">
                Bonus ini hanya untuk divisi CSM dan hanya satu kali per karyawan di periode yang sama.
              </p>
            )}
            {adjustmentDraft.category === "BONUS_COUNTER_MESIN" && (
              <p className="rounded-md bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-700">
                Bonus ini hanya untuk divisi Printing dan hanya satu kali per karyawan di periode yang sama.
              </p>
            )}
            {(adjustmentDraft.category === "GANTI_RUGI_PERSONAL" || adjustmentDraft.category === "GANTI_RUGI_TEAM") && (
              <p className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                Hanya satu kali per karyawan per periode.
              </p>
            )}

            {/* Employee select */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Karyawan</label>
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setAdjustmentEmployeePickerOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  onClick={() => {
                    setAdjustmentEmployeePickerOpen((open) => !open);
                    setAdjustmentEmployeeSearch("");
                  }}
                  aria-expanded={adjustmentEmployeePickerOpen}
                >
                  <span className="min-w-0 truncate">
                    {selectedAdjustmentEmployee
                      ? `${selectedAdjustmentEmployee.employeeName} - ${selectedAdjustmentEmployee.employeeCode}`
                      : "Pilih karyawan"}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>

                {adjustmentEmployeePickerOpen ? (
                  <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                    <div className="relative border-b border-slate-100">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      <Input
                        autoFocus
                        className="h-10 border-0 pl-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        placeholder="Cari nama, kode, divisi..."
                        value={adjustmentEmployeeSearch}
                        onChange={(e) => setAdjustmentEmployeeSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {adjustmentEmployeeOptions.length > 0 ? (
                        adjustmentEmployeeOptions.map((row) => (
                          <button
                            key={row.employeeId}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                            onClick={() => {
                              setAdjustmentDraft((v) => ({ ...v, employeeId: row.employeeId }));
                              setAdjustmentEmployeeSearch("");
                              setAdjustmentEmployeePickerOpen(false);
                            }}
                          >
                            <Check
                              className={`h-4 w-4 shrink-0 ${
                                row.employeeId === adjustmentDraft.employeeId
                                  ? "text-teal-600"
                                  : "text-transparent"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-slate-900">
                                {row.employeeName}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {row.employeeCode} - {row.divisionName} - {row.positionName}
                                {isKpiEmployeeGroup(row.employeeGroup) ? " [TETAP]" : ""}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-4 text-center text-sm text-slate-500">
                          Karyawan tidak ditemukan.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <select
                className="hidden"
                value={adjustmentDraft.employeeId}
                onChange={(e) => setAdjustmentDraft((v) => ({ ...v, employeeId: e.target.value }))}
              >
                <option value="">Pilih karyawan</option>
                {salaryConfigs
                  .filter((row) =>
                    adjustmentDraft.category === "GANTI_RUGI_TEAM"
                      ? isKpiEmployeeGroup(row.employeeGroup)
                      : adjustmentDraft.category === "BONUS_COUNTER_MESIN"
                      ? row.divisionName.trim().toUpperCase().includes("PRINTING")
                      : adjustmentDraft.category === "BONUS_OMSET_1_CSM"
                        || adjustmentDraft.category === "BONUS_OMSET_2_CSM"
                        || adjustmentDraft.category === "BONUS_OMSET_3_CSM"
                        || adjustmentDraft.category === "BONUS_KINERJA_CSM_TERTINGGI"
                      ? row.divisionName.trim().toUpperCase().includes("CSM")
                      : true
                  )
                  .map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>
                      {row.employeeName} · {row.employeeCode}
                      {isKpiEmployeeGroup(row.employeeGroup) ? " [TETAP]" : ""}
                    </option>
                  ))}
              </select>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">
                Nominal (Rp){adjustmentDraft.category === "KASBON" ? " — maks 300.000" : ""}
              </label>
              <Input
                type="number"
                placeholder="Nominal"
                min={1}
                max={adjustmentDraft.category === "KASBON" ? 300000 : undefined}
                value={adjustmentDraft.amount}
                onChange={(e) => setAdjustmentDraft((v) => ({ ...v, amount: e.target.value }))}
              />
            </div>

            {/* Tenor — CICILAN only */}
            {adjustmentDraft.category === "CICILAN" && (
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Sisa Tenor (bulan)</label>
                <Input
                  type="number"
                  placeholder="Contoh: 12"
                  min={1}
                  max={120}
                  value={adjustmentDraft.tenorMonthsRemaining}
                  onChange={(e) => setAdjustmentDraft((v) => ({ ...v, tenorMonthsRemaining: e.target.value }))}
                />
              </div>
            )}

            {/* Description - not required for recurring BPJS/transport */}
            {adjustmentDraft.category !== "BPJS" && adjustmentDraft.category !== "TRANSPORT" && (
              <div className="space-y-1">
                <label className="text-xs text-slate-500">
                  Keterangan{adjustmentDraft.category === "MANUAL_ADDITION" ? " (wajib)" : " (opsional)"}
                </label>
                <Input
                  placeholder={
                    adjustmentDraft.category === "MANUAL_ADDITION"
                      ? "Alasan penambahan"
                      : adjustmentDraft.category === "CICILAN"
                      ? "Nama barang / keterangan pinjaman"
                      : "Keterangan"
                  }
                  value={adjustmentDraft.description}
                  onChange={(e) => setAdjustmentDraft((v) => ({ ...v, description: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button
              disabled={pending || !activePeriodId}
              onClick={async () => {
                if (!activePeriodId) return;
                const ok = await runAction(() =>
                  addPayrollAdjustment({
                    periodId: activePeriodId,
                    employeeId: adjustmentDraft.employeeId,
                    category: adjustmentDraft.category,
                    amount: adjustmentDraft.amount,
                    description: adjustmentDraft.description || undefined,
                    tenorMonthsRemaining: adjustmentDraft.tenorMonthsRemaining || undefined,
                  })
                );
                if (ok) setAdjustmentOpen(false);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
