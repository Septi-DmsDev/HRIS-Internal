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
  createGrade,
  deleteGrade,
  updateGrade,
} from "@/server/actions/grades";

export type GradeRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
};

type GradesTableProps = {
  data: GradeRow[];
};

export default function GradesTable({ data }: GradesTableProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<GradeRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<GradeRow | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreateSubmit(formData: FormData) {
    setPending(true);
    setFormError(null);
    try {
      const result = await createGrade(formData);
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
      const result = await updateGrade(editingRow.id, formData);
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
      const result = await deleteGrade(deletingRow.id);
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

  const columns: ColumnDef<GradeRow>[] = useMemo(
    () => [
      { header: "Nama Grade", accessorKey: "name" },
      { header: "Kode", accessorKey: "code" },
      {
        header: "Deskripsi",
        accessorKey: "description",
        cell: ({ row }) => row.original.description?.trim() || "-",
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
        searchPlaceholder="Cari grade..."
        toolbarSlot={
          <Button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            Tambah Grade
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Grade</DialogTitle>
          </DialogHeader>
          <form action={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="grade-create-name" className="text-sm font-medium">
                Nama Grade
              </label>
              <Input id="grade-create-name" name="name" required maxLength={50} />
            </div>
            <div className="space-y-2">
              <label htmlFor="grade-create-code" className="text-sm font-medium">
                Kode
              </label>
              <Input id="grade-create-code" name="code" required maxLength={20} />
            </div>
            <div className="space-y-2">
              <label htmlFor="grade-create-description" className="text-sm font-medium">
                Deskripsi
              </label>
              <Input id="grade-create-description" name="description" maxLength={255} />
            </div>
            <div className="space-y-2">
              <label htmlFor="grade-create-active" className="text-sm font-medium">
                Status
              </label>
              <select
                id="grade-create-active"
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
            <DialogTitle>Edit Grade</DialogTitle>
          </DialogHeader>
          {editingRow ? (
            <form key={editingRow.id} action={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="grade-edit-name" className="text-sm font-medium">
                  Nama Grade
                </label>
                <Input
                  id="grade-edit-name"
                  name="name"
                  required
                  maxLength={50}
                  defaultValue={editingRow.name}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="grade-edit-code" className="text-sm font-medium">
                  Kode
                </label>
                <Input
                  id="grade-edit-code"
                  name="code"
                  required
                  maxLength={20}
                  defaultValue={editingRow.code}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="grade-edit-description" className="text-sm font-medium">
                  Deskripsi
                </label>
                <Input
                  id="grade-edit-description"
                  name="description"
                  maxLength={255}
                  defaultValue={editingRow.description ?? ""}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="grade-edit-active" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="grade-edit-active"
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
            <AlertDialogTitle>Hapus Grade</AlertDialogTitle>
            <AlertDialogDescription>
              {`Data grade "${deletingRow?.name ?? ""}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
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
