"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  createWorkShiftMaster,
  deleteWorkShiftMaster,
  updateWorkShiftMaster,
} from "@/server/actions/work-schedules";

export type WorkShiftRow = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  checkOutStart: string | null;
  checkInToleranceMinutes: number;
  breakToleranceMinutes: number;
  checkOutToleranceMinutes: number;
  isOvernight: boolean;
  applicableDivisionCodes: string[];
  notes: string;
  sortOrder: number;
  isActive: boolean;
};

type ShiftDraft = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  checkOutStart: string;
  checkInToleranceMinutes: string;
  breakToleranceMinutes: string;
  checkOutToleranceMinutes: string;
  isOvernight: boolean;
  applicableDivisionCodes: string;
  notes: string;
  sortOrder: string;
  isActive: boolean;
};

function createDraft(): ShiftDraft {
  return {
    code: "",
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    breakStart: "12:00",
    breakEnd: "13:00",
    checkOutStart: "",
    checkInToleranceMinutes: "0",
    breakToleranceMinutes: "5",
    checkOutToleranceMinutes: "0",
    isOvernight: false,
    applicableDivisionCodes: "",
    notes: "",
    sortOrder: "0",
    isActive: true,
  };
}

function draftFromRow(row: WorkShiftRow): ShiftDraft {
  return {
    code: row.code,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    breakStart: row.breakStart ?? "",
    breakEnd: row.breakEnd ?? "",
    checkOutStart: row.checkOutStart ?? "",
    checkInToleranceMinutes: String(row.checkInToleranceMinutes),
    breakToleranceMinutes: String(row.breakToleranceMinutes),
    checkOutToleranceMinutes: String(row.checkOutToleranceMinutes),
    isOvernight: row.isOvernight,
    applicableDivisionCodes: row.applicableDivisionCodes.join(", "),
    notes: row.notes,
    sortOrder: String(row.sortOrder),
    isActive: row.isActive,
  };
}

function toInput(draft: ShiftDraft) {
  return {
    code: draft.code,
    name: draft.name,
    startTime: draft.startTime,
    endTime: draft.endTime,
    breakStart: draft.breakStart,
    breakEnd: draft.breakEnd,
    checkOutStart: draft.checkOutStart,
    checkInToleranceMinutes: Number(draft.checkInToleranceMinutes || 0),
    breakToleranceMinutes: Number(draft.breakToleranceMinutes || 0),
    checkOutToleranceMinutes: Number(draft.checkOutToleranceMinutes || 0),
    isOvernight: draft.isOvernight,
    applicableDivisionCodes: draft.applicableDivisionCodes
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    notes: draft.notes,
    sortOrder: Number(draft.sortOrder || 0),
    isActive: draft.isActive,
  };
}

export default function MasterShiftClient({ shifts }: { shifts: WorkShiftRow[] }) {
  const router = useRouter();
  const [editingShift, setEditingShift] = useState<WorkShiftRow | null>(null);
  const [deletingShift, setDeletingShift] = useState<WorkShiftRow | null>(null);
  const [draft, setDraft] = useState<ShiftDraft>(createDraft());
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function set(field: keyof ShiftDraft, value: string | boolean) {
    setDraft((v) => ({ ...v, [field]: value }));
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    try {
      const result = editingShift
        ? await updateWorkShiftMaster(editingShift.id, toInput(draft))
        : await createWorkShiftMaster(toInput(draft));
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setEditingShift(null);
      setDraft(createDraft());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deletingShift) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await deleteWorkShiftMaster(deletingShift.id);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      setDeletingShift(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {editingShift ? `Edit Shift: ${editingShift.name}` : "Tambah Shift Baru"}
          </h3>
          {editingShift ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setEditingShift(null); setDraft(createDraft()); setFormError(null); }}
            >
              Batal Edit
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input value={draft.code} onChange={(e) => set("code", e.target.value)} placeholder="Kode shift" />
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Nama shift" />
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Jam Masuk</p>
            <Input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Jam Pulang</p>
            <Input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Mulai Istirahat</p>
            <Input type="time" value={draft.breakStart} onChange={(e) => set("breakStart", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Selesai Istirahat</p>
            <Input type="time" value={draft.breakEnd} onChange={(e) => set("breakEnd", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Awal Tap Pulang Valid</p>
            <Input type="time" value={draft.checkOutStart} onChange={(e) => set("checkOutStart", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Toleransi Masuk (menit)</p>
            <Input type="number" min={0} max={60} value={draft.checkInToleranceMinutes} onChange={(e) => set("checkInToleranceMinutes", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Toleransi Istirahat (menit)</p>
            <Input type="number" min={0} max={60} value={draft.breakToleranceMinutes} onChange={(e) => set("breakToleranceMinutes", e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Toleransi Pulang (menit)</p>
            <Input type="number" min={0} max={60} value={draft.checkOutToleranceMinutes} onChange={(e) => set("checkOutToleranceMinutes", e.target.value)} />
          </div>
          <Input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="Urutan" />
          <select
            value={draft.isActive ? "true" : "false"}
            onChange={(e) => set("isActive", e.target.value === "true")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>

        <Input
          value={draft.applicableDivisionCodes}
          onChange={(e) => set("applicableDivisionCodes", e.target.value)}
          placeholder="Divisi berlaku (pisahkan koma), contoh: FINISHING, PRINTING"
        />
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Catatan shift"
        />

        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

        <div className="flex justify-end">
          <Button type="button" onClick={() => void submit()} disabled={pending}>
            {pending ? "Menyimpan..." : editingShift ? "Simpan Perubahan" : "Tambah Shift"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {shifts.map((shift) => (
          <div
            key={shift.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <span className="font-medium text-slate-800">
              {shift.code} - {shift.name}{" "}
              <span className="text-slate-500">({shift.startTime}–{shift.endTime})</span>
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingShift(shift);
                  setDraft(draftFromRow(shift));
                  setFormError(null);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setDeletingShift(shift); setFormError(null); }}
              >
                Hapus
              </Button>
            </div>
          </div>
        ))}
        {shifts.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Belum ada master shift.</p>
        ) : null}
      </div>

      <AlertDialog
        open={deletingShift !== null}
        onOpenChange={(open) => { if (!open) setDeletingShift(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Master Shift</AlertDialogTitle>
            <AlertDialogDescription>
              {`Shift "${deletingShift?.name ?? ""}" akan dihapus permanen.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
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
