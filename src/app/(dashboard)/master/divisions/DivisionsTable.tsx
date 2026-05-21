"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
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
  createDivision,
  deleteDivision,
  updateDivision,
} from "@/server/actions/divisions";

export type DivisionRow = {
  id: string;
  name: string;
  code: string;
  trainingPassPercent: number;
  dailyPointTarget: number;
  isActive: boolean;
  branchId: string | null;
};

export type BranchOption = {
  id: string;
  name: string;
};

type DivisionsTableProps = {
  data: DivisionRow[];
  branches: BranchOption[];
};

export default function DivisionsTable({ data, branches }: DivisionsTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DivisionRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<DivisionRow | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreateSubmit(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      const result = await createDivision(formData);
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
      const result = await updateDivision(editingRow.id, formData);
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
      const result = await deleteDivision(deletingRow.id);
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

  const columns: ColumnDef<DivisionRow>[] = useMemo(
    () => [
      { header: "Nama Divisi", accessorKey: "name" },
      { header: "Kode", accessorKey: "code" },
      {
        header: "Min. Lulus Training",
        accessorKey: "trainingPassPercent",
        cell: ({ row }) => `${row.original.trainingPassPercent}%`,
      },
      {
        header: "Target Poin Harian",
        accessorKey: "dailyPointTarget",
        cell: ({ row }) => row.original.dailyPointTarget.toLocaleString("id-ID"),
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
        searchPlaceholder="Cari divisi..."
        toolbarSlot={
          <Button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            Tambah Divisi
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Divisi</DialogTitle>
          </DialogHeader>
          <form action={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="division-create-name" className="text-sm font-medium">
                Nama Divisi
              </label>
              <Input id="division-create-name" name="name" required maxLength={100} />
            </div>
            <div className="space-y-2">
              <label htmlFor="division-create-code" className="text-sm font-medium">
                Kode
              </label>
              <Input id="division-create-code" name="code" required maxLength={20} />
            </div>
            <div className="space-y-2">
              <label htmlFor="division-create-branch" className="text-sm font-medium">
                Cabang
              </label>
              <select
                id="division-create-branch"
                name="branchId"
                defaultValue=""
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Tanpa Cabang</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="division-create-pass" className="text-sm font-medium">
                Min. Lulus Training (%)
              </label>
              <Input
                id="division-create-pass"
                name="trainingPassPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={80}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="division-create-target" className="text-sm font-medium">
                Target Poin Harian
              </label>
              <Input
                id="division-create-target"
                name="dailyPointTarget"
                type="number"
                min={1}
                defaultValue={13000}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="division-create-active" className="text-sm font-medium">
                Status
              </label>
              <select
                id="division-create-active"
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
            <DialogTitle>Edit Divisi</DialogTitle>
          </DialogHeader>
          {editingRow ? (
            <form key={editingRow.id} action={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="division-edit-name" className="text-sm font-medium">
                  Nama Divisi
                </label>
                <Input
                  id="division-edit-name"
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editingRow.name}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="division-edit-code" className="text-sm font-medium">
                  Kode
                </label>
                <Input
                  id="division-edit-code"
                  name="code"
                  required
                  maxLength={20}
                  defaultValue={editingRow.code}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="division-edit-branch" className="text-sm font-medium">
                  Cabang
                </label>
                <select
                  id="division-edit-branch"
                  name="branchId"
                  defaultValue={editingRow.branchId ?? ""}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Tanpa Cabang</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="division-edit-pass" className="text-sm font-medium">
                  Min. Lulus Training (%)
                </label>
                <Input
                  id="division-edit-pass"
                  name="trainingPassPercent"
                  type="number"
                  min={0}
                  max={100}
                  required
                  defaultValue={editingRow.trainingPassPercent}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="division-edit-target" className="text-sm font-medium">
                  Target Poin Harian
                </label>
                <Input
                  id="division-edit-target"
                  name="dailyPointTarget"
                  type="number"
                  min={1}
                  required
                  defaultValue={editingRow.dailyPointTarget}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="division-edit-active" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="division-edit-active"
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
            <AlertDialogTitle>Hapus Divisi</AlertDialogTitle>
            <AlertDialogDescription>
              {`Data divisi "${deletingRow?.name ?? ""}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
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
