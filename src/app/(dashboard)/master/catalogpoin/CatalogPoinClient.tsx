"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/DataTable";
import { formatPointNumber } from "@/lib/format/number";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearAllCatalogData,
  upsertCatalogEntry,
  deleteCatalogEntry,
  importCatalogEntriesFromXlsx,
} from "@/server/actions/point-catalog";
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

type CatalogPoinClientProps = {
  role: UserRole;
  canManageCatalog: boolean;
  entries: PerformanceCatalogEntryRow[];
};

export default function CatalogPoinClient({
  role,
  canManageCatalog,
  entries,
}: CatalogPoinClientProps) {
  const router = useRouter();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(createEntryDraft());
  const [deleteCatalogId, setDeleteCatalogId] = useState<string | null>(null);
  const [clearCatalogOpen, setClearCatalogOpen] = useState(false);
  const [xlsxOpen, setXlsxOpen] = useState(false);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function resetMessages() {
    setFormError(null);
    setLastResult(null);
  }

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
          `Import berhasil: ${result.importedEntries} entry dari ${result.importedDivisions} divisi.`
        );
        router.refresh();
      }
    } finally { setPending(false); }
  }

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

      <div className="space-y-6">
        <DataTable
          data={entries}
          columns={entryColumns}
          searchKey="workName"
          searchPlaceholder="Cari nama pekerjaan..."
          toolbarSlot={
            canManageCatalog ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setEntryDraft(createEntryDraft());
                    setEntryOpen(true);
                  }}
                >
                  + Tambah Entry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetMessages();
                    setXlsxFile(null);
                    setXlsxOpen(true);
                  }}
                >
                  Import .xlsx
                </Button>
                {role === "SUPER_ADMIN" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      resetMessages();
                      setClearCatalogOpen(true);
                    }}
                  >
                    Hapus Semua Katalog
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
        />
      </div>

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

      {/* Add / Edit Catalog Entry Dialog */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{entryDraft.id ? "Edit Entry Katalog" : "Tambah Entry Katalog"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Divisi</label>
              <input
                type="text"
                value={entryDraft.divisionName}
                onChange={(e) => setEntryDraft((d) => ({ ...d, divisionName: e.target.value }))}
                placeholder="Contoh: AFT"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Jenis Pekerjaan</label>
              <input
                type="text"
                value={entryDraft.workName}
                onChange={(e) => setEntryDraft((d) => ({ ...d, workName: e.target.value }))}
                placeholder="Nama pekerjaan"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Poin</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={entryDraft.pointValue}
                  onChange={(e) => setEntryDraft((d) => ({ ...d, pointValue: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Keterangan / Satuan</label>
                <input
                  type="text"
                  value={entryDraft.unitDescription}
                  onChange={(e) => setEntryDraft((d) => ({ ...d, unitDescription: e.target.value }))}
                  placeholder="pcs, hari, …"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
    </div>
  );
}
