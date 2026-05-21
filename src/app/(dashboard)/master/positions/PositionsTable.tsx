"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NEW_EMPLOYEE_GROUPS,
  normalizeEmployeeGroup,
  resolveEmployeeGroupLabel,
  type EmployeeGroup,
} from "@/lib/employee-groups";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createPosition,
  deletePosition,
  updatePosition,
} from "@/server/actions/positions";

export type PositionRow = {
  id: string;
  name: string;
  code: string;
  employeeGroup: EmployeeGroup;
  isActive: boolean;
};

type PositionsTableProps = {
  data: PositionRow[];
};

export default function PositionsTable({ data }: PositionsTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PositionRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<PositionRow | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreateSubmit(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      const result = await createPosition(formData);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setCreateOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleEditSubmit(formData: FormData) {
    if (!editingRow) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await updatePosition(editingRow.id, formData);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setEditingRow(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deletingRow) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await deletePosition(deletingRow.id);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setDeletingRow(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<PositionRow>[] = useMemo(
    () => [
      { header: "Nama Jabatan", accessorKey: "name" },
      { header: "Kode", accessorKey: "code" },
      {
        header: "Kelompok",
        accessorKey: "employeeGroup",
        cell: ({ row }) => (
          <Badge variant={normalizeEmployeeGroup(row.original.employeeGroup) === "KARYAWAN_TETAP" ? "outline" : "secondary"}>
            {resolveEmployeeGroupLabel(row.original.employeeGroup)}
          </Badge>
        ),
      },
      {
        header: "Status",
        accessorKey: "isActive",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? "Aktif" : "Nonaktif"}
          </Badge>
        ),
      },
      {
        header: "Aksi",
        id: "actions",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFormError(null);
                setEditingRow(row.original);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setFormError(null);
                setDeletingRow(row.original);
              }}
            >
              Hapus
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-3">
      <DataTable
        data={data}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Cari jabatan..."
        toolbarSlot={
          <Button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            Tambah Jabatan
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Jabatan</DialogTitle>
          </DialogHeader>
          <form action={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="position-create-name" className="text-sm font-medium">
                Nama Jabatan
              </label>
              <Input id="position-create-name" name="name" required maxLength={100} />
            </div>
            <div className="space-y-2">
              <label htmlFor="position-create-code" className="text-sm font-medium">
                Kode
              </label>
              <Input id="position-create-code" name="code" required maxLength={20} />
            </div>
            <div className="space-y-2">
              <label htmlFor="position-create-group" className="text-sm font-medium">
                Kelompok Karyawan
              </label>
              <select
                id="position-create-group"
                name="employeeGroup"
                defaultValue="MITRA_KERJA"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {NEW_EMPLOYEE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {resolveEmployeeGroupLabel(group)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="position-create-active" className="text-sm font-medium">
                Status
              </label>
              <select
                id="position-create-active"
                name="isActive"
                defaultValue="true"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </div>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
                Batal
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingRow !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Jabatan</DialogTitle>
          </DialogHeader>
          {editingRow ? (
            <form key={editingRow.id} action={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="position-edit-name" className="text-sm font-medium">
                  Nama Jabatan
                </label>
                <Input
                  id="position-edit-name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editingRow.name}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="position-edit-code" className="text-sm font-medium">
                  Kode
                </label>
                <Input
                  id="position-edit-code"
                  name="code"
                  required
                  maxLength={20}
                  defaultValue={editingRow.code}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="position-edit-group" className="text-sm font-medium">
                  Kelompok Karyawan
                </label>
                <select
                  id="position-edit-group"
                  name="employeeGroup"
                  defaultValue={normalizeEmployeeGroup(editingRow.employeeGroup)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {NEW_EMPLOYEE_GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {resolveEmployeeGroupLabel(group)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="position-edit-active" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="position-edit-active"
                  name="isActive"
                  defaultValue={editingRow.isActive ? "true" : "false"}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingRow(null)} disabled={pending}>
                  Batal
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jabatan</AlertDialogTitle>
            <AlertDialogDescription>
              {`Data jabatan "${deletingRow?.name ?? ""}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={pending}
            >
              {pending ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
