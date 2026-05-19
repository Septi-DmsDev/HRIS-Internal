"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  NEW_EMPLOYEE_GROUPS,
  normalizeEmployeeGroup,
  resolveEmployeeGroupLabel,
  resolveEmployeeGroupSearchText,
  type EmployeeGroup,
} from "@/lib/employee-groups";
import { bulkUpdateEmployeeOrganization } from "@/server/actions/employees";

type Option = { id: string; name: string };
type PositionOption = Option & { employeeGroup: EmployeeGroup };

export type DivisionManagementOptions = {
  branches: Option[];
  divisions: Option[];
  positions: PositionOption[];
  grades: Array<Option & { code: string }>;
};

export type DivisionEmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  branchName: string;
  divisionName: string;
  positionName: string;
  gradeName: string;
  employeeGroup: EmployeeGroup;
  isActive: boolean;
};

type BulkDraft = {
  branchId: string;
  divisionId: string;
  positionId: string;
  gradeId: string;
  employeeGroup: "" | EmployeeGroup;
  effectiveDate: string;
  notes: string;
};

function createDefaultDraft(): BulkDraft {
  return {
    branchId: "",
    divisionId: "",
    positionId: "",
    gradeId: "",
    employeeGroup: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

function employeeGroupBadgeClass(group: EmployeeGroup) {
  const normalized = normalizeEmployeeGroup(group);
  if (normalized === "KARYAWAN_TETAP") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "MITRA_KERJA") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "BORONGAN") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-violet-200 bg-violet-50 text-violet-700";
}

export default function DivisionManagementTable({ data, options }: { data: DivisionEmployeeRow[]; options: DivisionManagementOptions }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<BulkDraft>(createDefaultDraft());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const allSelected = useMemo(() => data.length > 0 && selectedIds.length === data.length, [data.length, selectedIds.length]);

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? data.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  async function applyBulkUpdate() {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await bulkUpdateEmployeeOrganization({
        employeeIds: selectedIds,
        branchId: draft.branchId || undefined,
        divisionId: draft.divisionId || undefined,
        positionId: draft.positionId || undefined,
        gradeId: draft.gradeId || undefined,
        employeeGroup: draft.employeeGroup || undefined,
        effectiveDate: draft.effectiveDate,
        notes: draft.notes,
      });

      if (result && "error" in result) {
        setError(result.error);
        return;
      }

      setSuccess(`Mutasi massal berhasil untuk ${selectedIds.length} karyawan.`);
      setSelectedIds([]);
      setDraft(createDefaultDraft());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<DivisionEmployeeRow>[] = [
    {
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => toggleSelectAll(event.target.checked)}
          aria-label="Pilih semua"
        />
      ),
      id: "select",
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.original.id)}
          onChange={(event) => toggleSelectOne(row.original.id, event.target.checked)}
          aria-label={`Pilih ${row.original.fullName}`}
        />
      ),
    },
    { header: "Nama", accessorKey: "fullName" },
    { header: "Cabang", accessorKey: "branchName" },
    { header: "Divisi", accessorKey: "divisionName" },
    { header: "Jabatan", accessorKey: "positionName" },
    { header: "Grade", accessorKey: "gradeName" },
    {
      header: "Kelompok",
      id: "employeeGroup",
      accessorFn: (row) => resolveEmployeeGroupSearchText(row.employeeGroup),
      cell: ({ row }) => (
        <Badge variant="outline" className={cn(employeeGroupBadgeClass(row.original.employeeGroup))}>
          {resolveEmployeeGroupLabel(row.original.employeeGroup)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Mutasi Massal Struktur Karyawan</h2>
        <p className="mt-1 text-xs text-slate-500">Pilih karyawan lalu terapkan perubahan Cabang, Divisi, Jabatan, Grade, atau Kelompok Karyawan.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Cabang Baru</p><select value={draft.branchId} onChange={(event) => setDraft((prev) => ({ ...prev, branchId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Tidak diubah</option>{options.branches.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Divisi Baru</p><select value={draft.divisionId} onChange={(event) => setDraft((prev) => ({ ...prev, divisionId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Tidak diubah</option>{options.divisions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Jabatan Baru</p><select value={draft.positionId} onChange={(event) => setDraft((prev) => ({ ...prev, positionId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Tidak diubah</option>{options.positions.map((option) => <option key={option.id} value={option.id}>{option.name} ({resolveEmployeeGroupLabel(option.employeeGroup)})</option>)}</select></div>
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Grade Baru</p><select value={draft.gradeId} onChange={(event) => setDraft((prev) => ({ ...prev, gradeId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Tidak diubah</option>{options.grades.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}</select></div>
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Kelompok Karyawan Baru</p><select value={draft.employeeGroup} onChange={(event) => setDraft((prev) => ({ ...prev, employeeGroup: event.target.value as BulkDraft["employeeGroup"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Tidak diubah</option>{NEW_EMPLOYEE_GROUPS.map((group) => <option key={group} value={group}>{resolveEmployeeGroupLabel(group)}</option>)}</select></div>
          <div className="space-y-1.5"><p className="text-xs font-medium text-slate-600">Tanggal Efektif</p><Input type="date" value={draft.effectiveDate} onChange={(event) => setDraft((prev) => ({ ...prev, effectiveDate: event.target.value }))} /></div>
        </div>

        <div className="mt-3 space-y-1.5"><p className="text-xs font-medium text-slate-600">Catatan Histori</p><Input value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Opsional, mis. rotasi divisi Mei 2026" /></div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-teal-700">{success}</p> : null}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">Terpilih: {selectedIds.length} karyawan</p>
          <Button type="button" onClick={() => void applyBulkUpdate()} disabled={pending || selectedIds.length === 0}>{pending ? "Menerapkan..." : "Terapkan Mutasi Massal"}</Button>
        </div>
      </div>

      <DataTable
        data={data}
        columns={columns}
        globalSearch
        searchPlaceholder="Cari karyawan, cabang, divisi, jabatan, grade, atau kelompok..."
        stateKey="positioning-employee-table"
      />
    </div>
  );
}
