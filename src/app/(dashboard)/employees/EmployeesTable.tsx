"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createEmployee, deleteEmployee, getEmployeeById, importEmployeesFromXlsx, syncEmployeeRoles, toggleEmployeeBpjs, updateEmployee } from "@/server/actions/employees";
import { getEmployeeLoginInfo, upsertEmployeeLogin } from "@/server/actions/users";
import { Plus, RefreshCw } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faFileExport, faFileImport, faPenToSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import { normalizeEmployeeGroup, type EmployeeGroup } from "@/lib/employee-groups";

type Option = { id: string; name: string };
type PositionOption = Option & { employeeGroup: EmployeeGroup };
type ScheduleOption = Option & { code: string };

export type EmployeeFormOptions = {
  branches: Option[];
  divisions: Option[];
  positions: PositionOption[];
  grades: Array<Option & { code: string }>;
  schedules: ScheduleOption[];
  supervisors: Array<{ id: string; fullName: string }>;
  canManage: boolean;
  isSuperAdmin: boolean;
};

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  nik: string | null;
  fullName: string;
  employmentStatus: "TRAINING" | "REGULER" | "DIALIHKAN_TRAINING" | "TIDAK_LOLOS" | "NONAKTIF" | "RESIGN";
  phoneNumber: string;
  bpjsKetenagakerjaanNumber: string | null;
  bpjsKetenagakerjaanActive: boolean;
  bpjsKesehatanNumber: string | null;
  bpjsKesehatanActive: boolean;
  startDate: string;
};

type EmployeeDraft = {
  employeeCode: string;
  nik: string;
  fullName: string;
  branchId: string;
  birthPlace: string;
  birthDate: string;
  gender: string;
  religion: string;
  maritalStatus: string;
  address: string;
  phoneNumber: string;
  bpjsKetenagakerjaanNumber: string;
  bpjsKetenagakerjaanActive: boolean;
  bpjsKesehatanNumber: string;
  bpjsKesehatanActive: boolean;
  startDate: string;
  trainingGraduationDate: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  divisionId: string;
  positionId: string;
  gradeId: string;
  employeeGroup: EmployeeGroup;
  employmentStatus: "TRAINING" | "REGULER" | "DIALIHKAN_TRAINING" | "TIDAK_LOLOS" | "NONAKTIF" | "RESIGN";
  payrollStatus: "TRAINING" | "REGULER" | "FINAL_PAYROLL" | "NONAKTIF";
  supervisorEmployeeId: string;
  scheduleId: string;
  effectiveDate: string;
  isActive: boolean;
  employeeStatus: "AKTIF" | "RESIGN";
  resignDate: string;
};

const GENDER_OPTIONS = ["LAKI-LAKI", "PEREMPUAN"] as const;
const RELIGION_OPTIONS = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Khonghucu"] as const;
const MARITAL_STATUS_OPTIONS = ["MENIKAH", "BELUM MENIKAH"] as const;

function normalizeGender(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "LAKI-LAKI" || normalized === "LAKI LAKI" || normalized === "LAKI") return "LAKI-LAKI";
  if (normalized === "PEREMPUAN") return "PEREMPUAN";
  return "";
}

function normalizeReligion(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "islam") return "Islam";
  if (normalized === "kristen") return "Kristen";
  if (normalized === "katolik") return "Katolik";
  if (normalized === "hindu") return "Hindu";
  if (normalized === "buddha") return "Buddha";
  if (normalized === "khonghucu") return "Khonghucu";
  return "";
}

function normalizeMaritalStatus(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "MENIKAH") return "MENIKAH";
  if (normalized === "BELUM MENIKAH" || normalized === "BELUMMENIKAH" || normalized === "SINGLE") return "BELUM MENIKAH";
  return "";
}

type EmployeeDetailResult = Awaited<ReturnType<typeof getEmployeeById>>;

function toLoginEmail(username: string, fallbackEmail: string) {
  const normalized = username.trim().toLowerCase();
  if (normalized.includes("@")) return normalized;
  if (normalized.length > 0) return `${normalized}@hris.internal`;
  return fallbackEmail.trim();
}

function normalizeUsernameFromName(fullName: string) {
  const base = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return base || "user";
}

function createEmptyDraft(options: EmployeeFormOptions): EmployeeDraft {
  const today = new Date().toISOString().slice(0, 10);
  const defaultPosition =
    options.positions.find((position) => normalizeEmployeeGroup(position.employeeGroup) === "MITRA_KERJA") ??
    options.positions[0];
  return {
    employeeCode: "",
    nik: "",
    fullName: "",
    branchId: options.branches[0]?.id ?? "",
    birthPlace: "",
    birthDate: "",
    gender: "",
    religion: "",
    maritalStatus: "",
    address: "",
    phoneNumber: "",
    bpjsKetenagakerjaanNumber: "",
    bpjsKetenagakerjaanActive: false,
    bpjsKesehatanNumber: "",
    bpjsKesehatanActive: false,
    startDate: today,
    trainingGraduationDate: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    divisionId: options.divisions[0]?.id ?? "",
    positionId: defaultPosition?.id ?? "",
    gradeId: options.grades[0]?.id ?? "",
    employeeGroup: normalizeEmployeeGroup(defaultPosition?.employeeGroup ?? "MITRA_KERJA"),
    employmentStatus: "TRAINING",
    payrollStatus: "TRAINING",
    supervisorEmployeeId: "",
    scheduleId: "",
    effectiveDate: today,
    isActive: true,
    employeeStatus: "AKTIF",
    resignDate: "",
  };
}

function createDraftFromEmployee(detail: NonNullable<EmployeeDetailResult>, loginEmail: string | null): EmployeeDraft {
  const { employee, currentScheduleAssignment } = detail;
  const today = new Date().toISOString().slice(0, 10);

  return {
    employeeCode: employee.employeeCode,
    nik: employee.nik ?? "",
    fullName: employee.fullName,
    branchId: employee.branchId,
    birthPlace: employee.birthPlace ?? "",
    birthDate: employee.birthDate ? new Date(employee.birthDate).toISOString().slice(0, 10) : "",
    gender: normalizeGender(employee.gender),
    religion: normalizeReligion(employee.religion),
    maritalStatus: normalizeMaritalStatus(employee.maritalStatus),
    address: employee.address ?? "",
    phoneNumber: employee.phoneNumber ?? "",
    bpjsKetenagakerjaanNumber: employee.bpjsKetenagakerjaanNumber ?? "",
    bpjsKetenagakerjaanActive: employee.bpjsKetenagakerjaanActive,
    bpjsKesehatanNumber: employee.bpjsKesehatanNumber ?? "",
    bpjsKesehatanActive: employee.bpjsKesehatanActive,
    startDate: new Date(employee.startDate).toISOString().slice(0, 10),
    trainingGraduationDate: employee.trainingGraduationDate ? new Date(employee.trainingGraduationDate).toISOString().slice(0, 10) : "",
    username: loginEmail ? loginEmail.split("@")[0] : "",
    email: loginEmail ?? "",
    password: "",
    confirmPassword: "",
    divisionId: employee.divisionId,
    positionId: employee.positionId,
    gradeId: employee.gradeId,
    employeeGroup: normalizeEmployeeGroup(employee.employeeGroup),
    employmentStatus: employee.employmentStatus,
    payrollStatus: employee.payrollStatus,
    supervisorEmployeeId: employee.supervisorEmployeeId ?? "",
    scheduleId: currentScheduleAssignment?.scheduleId ?? "",
    effectiveDate: today,
    isActive: employee.isActive,
    employeeStatus: employee.employmentStatus === "RESIGN" || !employee.isActive ? "RESIGN" : "AKTIF",
    resignDate: "",
  };
}

function toActionInput(draft: EmployeeDraft) {
  const isResign = draft.employeeStatus === "RESIGN";
  const resolvedEmploymentStatus: EmployeeDraft["employmentStatus"] =
    isResign
      ? "RESIGN"
      : draft.employmentStatus === "RESIGN"
        ? "REGULER"
        : draft.employmentStatus;
  const resolvedPayrollStatus: EmployeeDraft["payrollStatus"] =
    isResign
      ? "NONAKTIF"
      : draft.payrollStatus === "NONAKTIF"
        ? "REGULER"
        : draft.payrollStatus;
  const resolvedEffectiveDate = isResign ? (draft.resignDate || draft.effectiveDate) : draft.effectiveDate;

  return {
    employeeCode: draft.employeeCode,
    nik: draft.nik,
    fullName: draft.fullName,
    birthPlace: draft.birthPlace,
    birthDate: draft.birthDate,
    gender: draft.gender,
    religion: draft.religion,
    maritalStatus: draft.maritalStatus,
    phoneNumber: draft.phoneNumber,
    bpjsKetenagakerjaanNumber: draft.bpjsKetenagakerjaanNumber,
    bpjsKetenagakerjaanActive: draft.bpjsKetenagakerjaanActive,
    bpjsKesehatanNumber: draft.bpjsKesehatanNumber,
    bpjsKesehatanActive: draft.bpjsKesehatanActive,
    address: draft.address,
    startDate: draft.startDate,
    branchId: draft.branchId,
    divisionId: draft.divisionId,
    positionId: draft.positionId,
    gradeId: draft.gradeId,
    employeeGroup: draft.employeeGroup,
    employmentStatus: resolvedEmploymentStatus,
    payrollStatus: resolvedPayrollStatus,
    supervisorEmployeeId: draft.supervisorEmployeeId,
    scheduleId: draft.scheduleId,
    trainingGraduationDate: draft.trainingGraduationDate,
    effectiveDate: resolvedEffectiveDate,
    isActive: isResign ? false : true,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><label className="text-sm font-medium text-slate-700">{label}</label>{children}</div>;
}

function EmployeePersonalForm({
  draft,
  onChange,
  options,
  isEditMode = false,
}: {
  draft: EmployeeDraft;
  onChange: (field: keyof EmployeeDraft, value: string) => void;
  options: EmployeeFormOptions;
  isEditMode?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {!isEditMode ? <Field label="CABANG"><select value={draft.branchId} onChange={(e) => onChange("branchId", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required><option value="">Pilih cabang</option>{options.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field> : null}
      {!isEditMode ? <Field label="SUPERVISOR"><select value={draft.supervisorEmployeeId} onChange={(e) => onChange("supervisorEmployeeId", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Pilih supervisor</option>{options.supervisors.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></Field> : null}
      <Field label="NAMA"><Input value={draft.fullName} onChange={(e) => onChange("fullName", e.target.value)} required /></Field>
      {!isEditMode ? <Field label="UID (otomatis saat tambah baru)"><Input value={draft.employeeCode} onChange={(e) => onChange("employeeCode", e.target.value)} required /></Field> : null}
      <Field label="NIK"><Input value={draft.nik} onChange={(e) => onChange("nik", e.target.value)} maxLength={50} /></Field>
      <Field label="Username"><Input value={draft.username} onChange={(e) => onChange("username", e.target.value)} /></Field>
      <Field label="Email"><Input type="email" value={draft.email} onChange={(e) => onChange("email", e.target.value)} /></Field>
      <Field label="Password"><Input type="password" value={draft.password} onChange={(e) => onChange("password", e.target.value)} /></Field>
      <Field label="Konfirmasi Password"><Input type="password" value={draft.confirmPassword} onChange={(e) => onChange("confirmPassword", e.target.value)} /></Field>
      <Field label="TEMPAT LAHIR"><Input value={draft.birthPlace} onChange={(e) => onChange("birthPlace", e.target.value)} /></Field>
      <Field label="TGL LAHIR"><Input type="date" value={draft.birthDate} onChange={(e) => onChange("birthDate", e.target.value)} /></Field>
      <Field label="JENIS KELAMIN">
        <select value={draft.gender} onChange={(e) => onChange("gender", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Pilih jenis kelamin</option>
          {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="AGAMA">
        <select value={draft.religion} onChange={(e) => onChange("religion", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Pilih agama</option>
          {RELIGION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="STATUS">
        <select value={draft.maritalStatus} onChange={(e) => onChange("maritalStatus", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Pilih status</option>
          {MARITAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
      <Field label="NO TELP"><Input value={draft.phoneNumber} onChange={(e) => onChange("phoneNumber", e.target.value)} /></Field>
      <Field label="NO BPJS KT"><Input value={draft.bpjsKetenagakerjaanNumber} onChange={(e) => onChange("bpjsKetenagakerjaanNumber", e.target.value)} maxLength={50} /></Field>
      <Field label="NO BPJS KS"><Input value={draft.bpjsKesehatanNumber} onChange={(e) => onChange("bpjsKesehatanNumber", e.target.value)} maxLength={50} /></Field>
      <Field label="MASUK KERJA"><Input type="date" value={draft.startDate} onChange={(e) => onChange("startDate", e.target.value)} /></Field>
      <Field label="LOLOS TRAINING"><Input type="date" value={draft.trainingGraduationDate} onChange={(e) => onChange("trainingGraduationDate", e.target.value)} /></Field>
      {isEditMode ? (
        <Field label="STATUS KARYAWAN">
          <select value={draft.employeeStatus} onChange={(e) => onChange("employeeStatus", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="AKTIF">AKTIF</option>
            <option value="RESIGN">RESIGN</option>
          </select>
        </Field>
      ) : null}
      {isEditMode && draft.employeeStatus === "RESIGN" ? (
        <Field label="TGL RESIGN">
          <Input type="date" value={draft.resignDate} onChange={(e) => onChange("resignDate", e.target.value)} />
        </Field>
      ) : null}
      <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium text-slate-700">ALAMAT</label><textarea value={draft.address} onChange={(e) => onChange("address", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
    </div>
  );
}

export default function EmployeesTable({ data, options }: { data: EmployeeRow[]; options: EmployeeFormOptions }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EmployeeRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<EmployeeRow | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>(createEmptyDraft(options));
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleSyncRoles() {
    setPending(true);
    setSyncResult(null);
    try {
      const result = await syncEmployeeRoles();
      if (result && "error" in result) {
        setSyncResult(`Gagal: ${result.error}`);
        return;
      }
      if (result && "updatedCount" in result) {
        setSyncResult(
          result.updatedCount === 0
            ? `Semua akses sudah sinkron. (${result.totalChecked} karyawan dicek)`
            : `Berhasil update ${result.updatedCount} dari ${result.totalChecked} akses karyawan.`
        );
      }
      setSyncOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }


  function onDraftChange(field: keyof EmployeeDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function openCreate() {
    setDraft(createEmptyDraft(options));
    setFormError(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setPending(true);
    setFormError(null);
    try {
      if (draft.password && draft.password !== draft.confirmPassword) {
        setFormError("Konfirmasi password tidak cocok.");
        return;
      }

      const result = await createEmployee(toActionInput(draft));
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }

      const preferredUsername = draft.username.trim() || normalizeUsernameFromName(draft.fullName);
      const email = toLoginEmail(preferredUsername, draft.email);
      const password = draft.password || "12345678";
      if (email && result && "employeeId" in result) {
        const loginResult = await upsertEmployeeLogin({ employeeId: result.employeeId, email, password });
        if (loginResult?.error) {
          setFormError(`Data karyawan tersimpan, tetapi akun login gagal: ${loginResult.error}`);
          return;
        }
      }

      setCreateOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function openEdit(row: EmployeeRow) {
    setPending(true);
    setFormError(null);
    try {
      const [detail, loginInfo] = await Promise.all([getEmployeeById(row.id), getEmployeeLoginInfo(row.id)]);
      if (!detail) {
        setFormError("Detail karyawan tidak ditemukan.");
        return;
      }
      setDraft(createDraftFromEmployee(detail, loginInfo?.email ?? null));
      setEditingRow(row);
    } finally {
      setPending(false);
    }
  }

  async function submitEdit() {
    if (!editingRow) return;
    setPending(true);
    setFormError(null);

    try {
      if (draft.password && draft.password !== draft.confirmPassword) {
        setFormError("Konfirmasi password tidak cocok.");
        return;
      }

      const result = await updateEmployee(editingRow.id, toActionInput(draft));
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }

      const loginEmail = toLoginEmail(draft.username, draft.email);
      if (draft.employeeStatus !== "RESIGN" && loginEmail) {
        const loginResult = await upsertEmployeeLogin({ employeeId: editingRow.id, email: loginEmail, password: draft.password || undefined });
        if (loginResult?.error) {
          setFormError(loginResult.error);
          return;
        }
      }

      setEditingRow(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function submitImport() {
    setPending(true);
    setFormError(null);
    try {
      if (!importFile) {
        setFormError("Pilih file Excel terlebih dahulu.");
        return;
      }
      const formData = new FormData();
      formData.append("file", importFile);
      const result = await importEmployeesFromXlsx(formData);
      if (result && "error" in result) {
        setFormError(result.error ?? "Import gagal.");
        return;
      }
      setImportOpen(false);
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
      const result = await deleteEmployee(deletingRow.id);
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

  async function handleToggleBpjs(row: EmployeeRow, type: "KT" | "KS") {
    setPending(true);
    setFormError(null);
    try {
      const current = type === "KT" ? row.bpjsKetenagakerjaanActive : row.bpjsKesehatanActive;
      const result = await toggleEmployeeBpjs(row.id, type, !current);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<EmployeeRow>[] = useMemo(() => [
    { header: "UID", accessorKey: "employeeCode" },
    { header: "NIK", accessorKey: "nik" },
    {
      header: "NAMA",
      accessorKey: "fullName",
      cell: ({ row }) => (
        <Link
          href={`/employees/${row.original.id}`}
          className={`font-medium hover:underline ${row.original.employmentStatus === "RESIGN" ? "text-red-600" : "text-slate-900"}`}
        >
          {row.original.fullName}
        </Link>
      ),
    },
    { header: "NO TELPON", accessorKey: "phoneNumber" },
    { header: "MASUK KERJA", accessorKey: "startDate" },
    {
      header: "BPJS KT",
      id: "bpjs-kt",
      cell: ({ row }) => {
        const hasNumber = Boolean(row.original.bpjsKetenagakerjaanNumber?.trim());
        const enabled = row.original.bpjsKetenagakerjaanActive;
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-9 rounded-full p-0 hover:bg-transparent"
            disabled={!options.canManage || pending || !hasNumber}
            onClick={() => void handleToggleBpjs(row.original, "KT")}
            title={hasNumber ? "Toggle BPJS KT" : "Isi nomor BPJS KT di Edit Karyawan"}
          >
            <span
              className={[
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                enabled ? "bg-emerald-500" : "bg-slate-300",
                !hasNumber ? "opacity-60" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-4.5" : "translate-x-0.5",
                ].join(" ")}
              />
            </span>
          </Button>
        );
      },
    },
    {
      header: "BPJS KS",
      id: "bpjs-ks",
      cell: ({ row }) => {
        const hasNumber = Boolean(row.original.bpjsKesehatanNumber?.trim());
        const enabled = row.original.bpjsKesehatanActive;
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-9 rounded-full p-0 hover:bg-transparent"
            disabled={!options.canManage || pending || !hasNumber}
            onClick={() => void handleToggleBpjs(row.original, "KS")}
            title={hasNumber ? "Toggle BPJS KS" : "Isi nomor BPJS KS di Edit Karyawan"}
          >
            <span
              className={[
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                enabled ? "bg-emerald-500" : "bg-slate-300",
                !hasNumber ? "opacity-60" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-4.5" : "translate-x-0.5",
                ].join(" ")}
              />
            </span>
          </Button>
        );
      },
    },
    {
      header: "Aksi",
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Button asChild variant="outline" size="icon" title="Detail" aria-label="Detail">
            <Link href={`/employees/${row.original.id}`}>
              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
            </Link>
          </Button>
          {options.canManage ? (
            <>
              <Button
                variant="outline"
                size="icon"
                title="Edit"
                aria-label="Edit"
                onClick={() => void openEdit(row.original)}
              >
                <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                title="Hapus"
                aria-label="Hapus"
                onClick={() => setDeletingRow(row.original)}
              >
                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ], [options.canManage, pending]);

  return (
    <div className="space-y-3">
      <DataTable data={data} columns={columns} globalSearch searchPlaceholder="Cari UID, NIK, nama, no telpon, atau tanggal masuk..." toolbarSlot={options.canManage ? <div className="flex gap-2">{options.isSuperAdmin ? <Button type="button" variant="outline" size="sm" onClick={() => { setSyncOpen(true); setSyncResult(null); }}><RefreshCw size={14} className="mr-1.5" />Sync Akses</Button> : null}<Button asChild type="button" variant="outline" size="sm"><a href="/employees/export.xlsx"><FontAwesomeIcon icon={faFileExport} className="mr-1.5 h-3.5 w-3.5" />Export Excel</a></Button><Button type="button" variant="outline" size="sm" onClick={() => { setImportOpen(true); setFormError(null); }}><FontAwesomeIcon icon={faFileImport} className="mr-1.5 h-3.5 w-3.5" />Import Excel</Button><Button type="button" size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={openCreate}><Plus size={14} className="mr-1.5" />Tambah Karyawan</Button></div> : undefined} />

      <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent><DialogHeader><DialogTitle>Import Karyawan</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-slate-600">Format: CABANG, NAMA, NIK/ID KARYAWAN, Username, Password, TEMPAT LAHIR, TGL LAHIR, JENIS KELAMIN, AGAMA, STATUS, ALAMAT, NO TELP, EMAIL, MASUK KERJA, LOLOS TRAINING.</p><Input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />{formError ? <p className="text-sm text-red-600">{formError}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Batal</Button><Button onClick={() => void submitImport()} disabled={pending}>{pending ? "Mengimpor..." : "Import"}</Button></DialogFooter></div></DialogContent></Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Tambah Karyawan</DialogTitle></DialogHeader><EmployeePersonalForm draft={draft} onChange={onDraftChange} options={options} isEditMode={false} />{formError ? <p className="text-sm text-red-600">{formError}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button><Button onClick={() => void submitCreate()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={editingRow !== null} onOpenChange={(open) => { if (!open) setEditingRow(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Edit Karyawan</DialogTitle></DialogHeader><div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">Username login: <span className="font-semibold">{draft.username || "-"}</span> | Password default: <span className="font-semibold">12345678</span></div><EmployeePersonalForm draft={draft} onChange={onDraftChange} options={options} isEditMode />{formError ? <p className="text-sm text-red-600">{formError}</p> : null}<DialogFooter><Button variant="outline" onClick={() => setEditingRow(null)}>Batal</Button><Button onClick={() => void submitEdit()} disabled={pending}>{pending ? "Menyimpan..." : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={deletingRow !== null} onOpenChange={(open) => { if (!open) setDeletingRow(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Hapus Karyawan</AlertDialogTitle><AlertDialogDescription>{`Data karyawan \"${deletingRow?.fullName ?? ""}\" akan dinonaktifkan.`}</AlertDialogDescription></AlertDialogHeader>{formError ? <p className="text-sm text-red-600">{formError}</p> : null}<AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDelete(); }}>{pending ? "Menghapus..." : "Hapus"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AlertDialog open={syncOpen} onOpenChange={(open) => { if (!open) { setSyncOpen(false); setSyncResult(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync Akses Pengguna</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Proses ini akan menyesuaikan role akun login karyawan berdasarkan grup karyawan saat ini:</span>
              <span className="block text-xs">• Grup <strong>MANAGERIAL</strong> → role <strong>Managerial</strong></span>
              <span className="block text-xs">• Grup lainnya (Teamwork, Training, dst.) → role <strong>TeamWork</strong></span>
              <span className="block text-xs text-slate-500 mt-1">Role SPV, KABAG, HRD, Finance, dan Super Admin <strong>tidak</strong> akan diubah.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {syncResult ? <p className="text-sm text-slate-700 px-1">{syncResult}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleSyncRoles(); }} disabled={pending}>
              {pending ? "Menyinkronkan..." : "Sync Sekarang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
</div>
  );
}
