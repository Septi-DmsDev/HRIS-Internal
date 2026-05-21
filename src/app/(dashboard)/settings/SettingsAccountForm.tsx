"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { updateMyAccountSettings } from "@/server/actions/settings";
import { updateMyPersonalProfile } from "@/server/actions/me";

// ─── Types ────────────────────────────────────────────────────────────────────

type Hobby = { id: string; hobbyName: string; notes: string };
type Education = {
  id: string;
  institutionName: string;
  degree: string;
  major: string;
  startYear: string;
  endYear: string;
  notes: string;
};
type Competency = {
  id: string;
  competencyName: string;
  level: string;
  issuer: string;
  certifiedAt: string;
  attachmentUrl: string;
  notes: string;
};

type SettingsAccountFormProps = {
  initialData: {
    userEmail: string;
    username: string;
    phoneNumber: string;
    employeeCode: string | null;
    fullName: string | null;
    canEditPersonalEnrichment: boolean;
    hobbies: Hobby[];
    educationHistories: Education[];
    competencies: Competency[];
  };
  profileData: {
    nik: string | null;
    nickname: string | null;
    birthPlace: string | null;
    birthDate: Date | null;
    gender: string | null;
    religion: string | null;
    maritalStatus: string | null;
    phoneNumber: string | null;
    address: string | null;
    photoUrl: string | null;
  } | null;
};

const EMPTY_HOBBY: Omit<Hobby, "id"> = { hobbyName: "", notes: "" };
const EMPTY_EDUCATION: Omit<Education, "id"> = {
  institutionName: "",
  degree: "",
  major: "",
  startYear: "",
  endYear: "",
  notes: "",
};
const EMPTY_COMPETENCY: Omit<Competency, "id"> = {
  competencyName: "",
  level: "",
  issuer: "",
  certifiedAt: "",
  attachmentUrl: "",
  notes: "",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function field(label: string, value: string) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value || "-"}</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsAccountForm({ initialData, profileData }: SettingsAccountFormProps) {
  const [profilePending, startProfileTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Enrichment state ──────────────────────────────────────────────────────
  const [hobbies, setHobbies] = useState<Hobby[]>(initialData.hobbies);
  const [educations, setEducations] = useState<Education[]>(initialData.educationHistories);
  const [competencies, setCompetencies] = useState<Competency[]>(initialData.competencies);

  // ── Dialog: Hobby ─────────────────────────────────────────────────────────
  const [hobbyDialog, setHobbyDialog] = useState<{ open: boolean; item: Hobby | null }>({ open: false, item: null });
  const [hobbyDraft, setHobbyDraft] = useState<Omit<Hobby, "id">>(EMPTY_HOBBY);

  // ── Dialog: Education ─────────────────────────────────────────────────────
  const [educDialog, setEducDialog] = useState<{ open: boolean; item: Education | null }>({ open: false, item: null });
  const [educDraft, setEducDraft] = useState<Omit<Education, "id">>(EMPTY_EDUCATION);

  // ── Dialog: Competency ────────────────────────────────────────────────────
  const [compDialog, setCompDialog] = useState<{ open: boolean; item: Competency | null }>({ open: false, item: null });
  const [compDraft, setCompDraft] = useState<Omit<Competency, "id">>(EMPTY_COMPETENCY);

  // ── Persist helpers ───────────────────────────────────────────────────────

  const persist = useCallback(
    (
      nextHobbies: Hobby[],
      nextEducations: Education[],
      nextCompetencies: Competency[],
      onDone?: () => void
    ) => {
      const formData = new FormData();
      // pass account fields unchanged
      formData.set("username", initialData.username);
      formData.set("phoneNumber", initialData.phoneNumber);
      formData.set("email", initialData.userEmail);
      formData.set("newPassword", "");
      formData.set("confirmPassword", "");
      formData.set("hobbies", JSON.stringify(nextHobbies.filter((h) => h.hobbyName.trim())));
      formData.set("educationHistories", JSON.stringify(nextEducations.filter((e) => e.institutionName.trim())));
      formData.set("competencies", JSON.stringify(nextCompetencies.filter((c) => c.competencyName.trim())));

      startSaveTransition(async () => {
        const result = await updateMyAccountSettings(formData);
        if (result?.error) {
          setMessage({ type: "error", text: result.error });
          return;
        }
        setMessage({ type: "success", text: result?.success ?? "Tersimpan." });
        onDone?.();
      });
    },
    [initialData]
  );

  // ── Hobby handlers ────────────────────────────────────────────────────────

  function openAddHobby() {
    setHobbyDraft(EMPTY_HOBBY);
    setHobbyDialog({ open: true, item: null });
  }
  function openEditHobby(h: Hobby) {
    setHobbyDraft({ hobbyName: h.hobbyName, notes: h.notes });
    setHobbyDialog({ open: true, item: h });
  }
  function saveHobby() {
    if (!hobbyDraft.hobbyName.trim()) return;
    let next: Hobby[];
    if (hobbyDialog.item) {
      next = hobbies.map((h) => (h.id === hobbyDialog.item!.id ? { id: h.id, ...hobbyDraft } : h));
    } else {
      next = [...hobbies, { id: crypto.randomUUID(), ...hobbyDraft }];
    }
    persist(next, educations, competencies, () => {
      setHobbies(next);
      setHobbyDialog({ open: false, item: null });
    });
  }
  function deleteHobby(id: string) {
    if (!window.confirm("Hapus hobi ini?")) return;
    const next = hobbies.filter((h) => h.id !== id);
    persist(next, educations, competencies, () => setHobbies(next));
  }

  // ── Education handlers ────────────────────────────────────────────────────

  function openAddEduc() {
    setEducDraft(EMPTY_EDUCATION);
    setEducDialog({ open: true, item: null });
  }
  function openEditEduc(e: Education) {
    setEducDraft({
      institutionName: e.institutionName,
      degree: e.degree,
      major: e.major,
      startYear: e.startYear,
      endYear: e.endYear,
      notes: e.notes,
    });
    setEducDialog({ open: true, item: e });
  }
  function saveEduc() {
    if (!educDraft.institutionName.trim()) return;
    let next: Education[];
    if (educDialog.item) {
      next = educations.map((e) => (e.id === educDialog.item!.id ? { id: e.id, ...educDraft } : e));
    } else {
      next = [...educations, { id: crypto.randomUUID(), ...educDraft }];
    }
    persist(hobbies, next, competencies, () => {
      setEducations(next);
      setEducDialog({ open: false, item: null });
    });
  }
  function deleteEduc(id: string) {
    if (!window.confirm("Hapus data pendidikan ini?")) return;
    const next = educations.filter((e) => e.id !== id);
    persist(hobbies, next, competencies, () => setEducations(next));
  }

  // ── Competency handlers ───────────────────────────────────────────────────

  function openAddComp() {
    setCompDraft(EMPTY_COMPETENCY);
    setCompDialog({ open: true, item: null });
  }
  function openEditComp(c: Competency) {
    setCompDraft({
      competencyName: c.competencyName,
      level: c.level,
      issuer: c.issuer,
      certifiedAt: c.certifiedAt,
      attachmentUrl: c.attachmentUrl,
      notes: c.notes,
    });
    setCompDialog({ open: true, item: c });
  }
  function saveComp() {
    if (!compDraft.competencyName.trim()) return;
    let next: Competency[];
    if (compDialog.item) {
      next = competencies.map((c) => (c.id === compDialog.item!.id ? { id: c.id, ...compDraft } : c));
    } else {
      next = [...competencies, { id: crypto.randomUUID(), ...compDraft }];
    }
    persist(hobbies, educations, next, () => {
      setCompetencies(next);
      setCompDialog({ open: false, item: null });
    });
  }
  function deleteComp(id: string) {
    if (!window.confirm("Hapus data sertifikasi ini?")) return;
    const next = competencies.filter((c) => c.id !== id);
    persist(hobbies, educations, next, () => setCompetencies(next));
  }

  // ── Profile form ──────────────────────────────────────────────────────────

  const birthDateValue = profileData?.birthDate
    ? new Date(profileData.birthDate).toISOString().slice(0, 10)
    : "";

  const profileComplete = Boolean(
    profileData?.nik?.trim() &&
      profileData?.nickname?.trim() &&
      profileData?.birthPlace?.trim() &&
      birthDateValue &&
      profileData?.gender?.trim() &&
      profileData?.religion?.trim() &&
      profileData?.maritalStatus?.trim() &&
      profileData?.phoneNumber?.trim() &&
      profileData?.address?.trim() &&
      profileData?.photoUrl?.trim()
  );

  function handleProfileSubmit(formData: FormData) {
    setProfileMessage(null);
    startProfileTransition(async () => {
      const result = await updateMyPersonalProfile(formData);
      if (result?.error) {
        setProfileMessage({ type: "error", text: result.error });
        return;
      }
      if (result?.success) {
        setProfileMessage({ type: "success", text: result.success });
        setProfileEditOpen(false);
      }
    });
  }

  function renderProfileFields() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nik">NIK</Label>
          <Input id="nik" name="nik" defaultValue={profileData?.nik ?? ""} required maxLength={50} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nickname">Nama Panggilan</Label>
          <Input id="nickname" name="nickname" defaultValue={profileData?.nickname ?? ""} required maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthPlace">Tempat Lahir</Label>
          <Input id="birthPlace" name="birthPlace" defaultValue={profileData?.birthPlace ?? ""} required maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">Tanggal Lahir</Label>
          <Input id="birthDate" name="birthDate" type="date" defaultValue={birthDateValue} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Jenis Kelamin</Label>
          <select id="gender" name="gender" defaultValue={profileData?.gender ?? ""} required className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Pilih jenis kelamin</option>
            <option value="LAKI-LAKI">Laki-laki</option>
            <option value="PEREMPUAN">Perempuan</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="religion">Agama</Label>
          <select id="religion" name="religion" defaultValue={profileData?.religion ?? ""} required className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Pilih agama</option>
            <option value="Islam">Islam</option>
            <option value="Kristen">Kristen</option>
            <option value="Katolik">Katolik</option>
            <option value="Hindu">Hindu</option>
            <option value="Buddha">Buddha</option>
            <option value="Khonghucu">Khonghucu</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maritalStatus">Status Pernikahan</Label>
          <select id="maritalStatus" name="maritalStatus" defaultValue={profileData?.maritalStatus ?? ""} required className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Pilih status</option>
            <option value="BELUM MENIKAH">Belum Menikah</option>
            <option value="MENIKAH">Menikah</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profilePhoneNumber">Nomor HP</Label>
          <Input id="profilePhoneNumber" name="phoneNumber" defaultValue={profileData?.phoneNumber ?? ""} required maxLength={30} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="address">Alamat</Label>
          <textarea id="address" name="address" defaultValue={profileData?.address ?? ""} required rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="photoFile">Foto Profil</Label>
          <input id="photoFile" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          {profileData?.photoUrl ? (
            <a href={profileData.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline">
              Lihat foto profil saat ini
            </a>
          ) : null}
          <input type="hidden" name="existingPhotoUrl" value={profileData?.photoUrl ?? ""} />
        </div>
      </div>
    );
  }

  // ── Table helpers ─────────────────────────────────────────────────────────

  const canEdit = initialData.canEditPersonalEnrichment;

  function ActionBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    if (!canEdit) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          title="Edit"
          disabled={savePending}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Hapus"
          disabled={savePending}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Profil ── */}
      {profileComplete ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-900">Profil Diri</p>
              <p className="mt-1 text-xs text-emerald-800">Data sudah lengkap. Klik edit jika ingin mengubah.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setProfileEditOpen(true)}>
              Edit Profil
            </Button>
          </div>
          <div className="grid gap-3 rounded-lg border border-emerald-200 bg-white p-4 text-sm md:grid-cols-2">
            {field("Nama Lengkap", initialData.fullName ?? "")}
            {field("Kode Karyawan", initialData.employeeCode ?? "")}
            {field("Username", initialData.username)}
            {field("Nomor HP", profileData?.phoneNumber ?? initialData.phoneNumber ?? "")}
            <div className="md:col-span-2">{field("Email Login", initialData.userEmail)}</div>
            {field("NIK", profileData?.nik ?? "")}
            {field("Nama Panggilan", profileData?.nickname ?? "")}
            {field("Tempat Lahir", profileData?.birthPlace ?? "")}
            {field("Tanggal Lahir", birthDateValue)}
            {field("Jenis Kelamin", profileData?.gender === "LAKI-LAKI" ? "Laki-laki" : profileData?.gender === "PEREMPUAN" ? "Perempuan" : "")}
            {field("Agama", profileData?.religion ?? "")}
            {field("Status Pernikahan", profileData?.maritalStatus === "BELUM MENIKAH" ? "Belum Menikah" : profileData?.maritalStatus === "MENIKAH" ? "Menikah" : "")}
            <div className="md:col-span-2">{field("Alamat", profileData?.address ?? "")}</div>
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500">Foto Profil</p>
              {profileData?.photoUrl ? (
                <a href={profileData.photoUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-700 underline">
                  Lihat foto profil saat ini
                </a>
              ) : (
                <p className="text-sm font-medium text-slate-900">-</p>
              )}
            </div>
          </div>
          <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit Profil Diri</DialogTitle>
              </DialogHeader>
              <form action={handleProfileSubmit} className="space-y-4">
                {renderProfileFields()}
                {profileMessage && (
                  <div className={`rounded-md border px-3 py-2 text-sm ${profileMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    {profileMessage.text}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setProfileEditOpen(false)}>Batal</Button>
                  <Button type="submit" disabled={profilePending}>
                    {profilePending ? "Menyimpan..." : "Simpan Profil"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <p className="text-sm font-semibold text-amber-900">Profil Wajib Sebelum Akses Penuh Sistem</p>
            <p className="mt-1 text-xs text-amber-800">Lengkapi NIK, biodata, kontak, alamat, dan foto profil.</p>
          </div>
          <form action={handleProfileSubmit} className="space-y-4">
            {renderProfileFields()}
            {profileMessage && (
              <div className={`rounded-md border px-3 py-2 text-sm ${profileMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                {profileMessage.text}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={profilePending}>
                {profilePending ? "Menyimpan..." : "Simpan Profil"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Profil Tambahan ── */}
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">Profil Tambahan</p>
        <p className="text-xs text-slate-500 -mt-3">
          Informasi ini bersifat opsional dan membantu HRD mengenal Anda lebih baik.
        </p>

        {message && (
          <div className={`rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {message.text}
          </div>
        )}

        {/* ── Hobi ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Hobi</p>
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={openAddHobby} disabled={savePending}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Hobi
              </Button>
            )}
          </div>

          {hobbies.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
              Belum ada hobi yang ditambahkan.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Nama Hobi</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan</th>
                    {canEdit && <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hobbies.map((h) => (
                    <tr key={h.id} className="bg-white">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{h.hobbyName}</td>
                      <td className="px-4 py-2.5 text-slate-600">{h.notes || "-"}</td>
                      {canEdit && (
                        <td className="px-4 py-2.5">
                          <ActionBtns onEdit={() => openEditHobby(h)} onDelete={() => deleteHobby(h.id)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Riwayat Pendidikan ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Riwayat Pendidikan</p>
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={openAddEduc} disabled={savePending}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Pendidikan
              </Button>
            )}
          </div>

          {educations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
              Belum ada riwayat pendidikan yang ditambahkan.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Institusi</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Jenjang / Jurusan</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Tahun</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan</th>
                    {canEdit && <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {educations.map((e) => (
                    <tr key={e.id} className="bg-white">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{e.institutionName}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <span>{e.degree || "-"}</span>
                        {e.major && <span className="ml-1 text-slate-500">/ {e.major}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">
                        {e.startYear || "?"} – {e.endYear || "?"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{e.notes || "-"}</td>
                      {canEdit && (
                        <td className="px-4 py-2.5">
                          <ActionBtns onEdit={() => openEditEduc(e)} onDelete={() => deleteEduc(e.id)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Sertifikasi & Kompetensi ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Sertifikasi &amp; Kompetensi</p>
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={openAddComp} disabled={savePending}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tambah Sertifikasi
              </Button>
            )}
          </div>

          {competencies.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
              Belum ada sertifikasi yang ditambahkan.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Nama Sertifikasi</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Level / Penerbit</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Dokumen</th>
                    {canEdit && <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {competencies.map((c) => (
                    <tr key={c.id} className="bg-white">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.competencyName}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <span>{c.level || "-"}</span>
                        {c.issuer && <span className="ml-1 text-slate-500">/ {c.issuer}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{c.certifiedAt || "-"}</td>
                      <td className="px-4 py-2.5">
                        {c.attachmentUrl ? (
                          <a href={c.attachmentUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline hover:no-underline">
                            Lihat dokumen
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2.5">
                          <ActionBtns onEdit={() => openEditComp(c)} onDelete={() => deleteComp(c.id)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Dialog: Hobi ════════════════════════════════════════════════════ */}
      <Dialog open={hobbyDialog.open} onOpenChange={(open) => !open && setHobbyDialog({ open: false, item: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hobbyDialog.item ? "Edit Hobi" : "Tambah Hobi"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nama Hobi <span className="text-red-500">*</span></Label>
              <Input
                autoFocus
                placeholder="mis. Membaca, Fotografi, Memasak"
                value={hobbyDraft.hobbyName}
                onChange={(e) => setHobbyDraft((p) => ({ ...p, hobbyName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input
                placeholder="Keterangan tambahan (opsional)"
                value={hobbyDraft.notes}
                onChange={(e) => setHobbyDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHobbyDialog({ open: false, item: null })}>Batal</Button>
            <Button onClick={saveHobby} disabled={savePending || !hobbyDraft.hobbyName.trim()}>
              {savePending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog: Pendidikan ═══════════════════════════════════════════════ */}
      <Dialog open={educDialog.open} onOpenChange={(open) => !open && setEducDialog({ open: false, item: null })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{educDialog.item ? "Edit Riwayat Pendidikan" : "Tambah Riwayat Pendidikan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nama Institusi <span className="text-red-500">*</span></Label>
              <Input
                autoFocus
                placeholder="mis. Universitas Brawijaya, SMK Negeri 1 Malang"
                value={educDraft.institutionName}
                onChange={(e) => setEducDraft((p) => ({ ...p, institutionName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jenjang</Label>
                <Input
                  placeholder="mis. S1, SMA, D3"
                  value={educDraft.degree}
                  onChange={(e) => setEducDraft((p) => ({ ...p, degree: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Jurusan</Label>
                <Input
                  placeholder="mis. Teknik Informatika"
                  value={educDraft.major}
                  onChange={(e) => setEducDraft((p) => ({ ...p, major: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tahun Masuk</Label>
                <Input
                  placeholder="2018"
                  maxLength={4}
                  value={educDraft.startYear}
                  onChange={(e) => setEducDraft((p) => ({ ...p, startYear: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tahun Lulus</Label>
                <Input
                  placeholder="2022"
                  maxLength={4}
                  value={educDraft.endYear}
                  onChange={(e) => setEducDraft((p) => ({ ...p, endYear: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input
                placeholder="Keterangan tambahan (opsional)"
                value={educDraft.notes}
                onChange={(e) => setEducDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEducDialog({ open: false, item: null })}>Batal</Button>
            <Button onClick={saveEduc} disabled={savePending || !educDraft.institutionName.trim()}>
              {savePending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog: Sertifikasi ══════════════════════════════════════════════ */}
      <Dialog open={compDialog.open} onOpenChange={(open) => !open && setCompDialog({ open: false, item: null })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{compDialog.item ? "Edit Sertifikasi" : "Tambah Sertifikasi"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nama Sertifikasi / Kompetensi <span className="text-red-500">*</span></Label>
              <Input
                autoFocus
                placeholder="mis. Google Analytics, AWS Solutions Architect"
                value={compDraft.competencyName}
                onChange={(e) => setCompDraft((p) => ({ ...p, competencyName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Input
                  placeholder="mis. Profesional, Pemula"
                  value={compDraft.level}
                  onChange={(e) => setCompDraft((p) => ({ ...p, level: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Penerbit</Label>
                <Input
                  placeholder="mis. Google, Amazon, Badan Nasional"
                  value={compDraft.issuer}
                  onChange={(e) => setCompDraft((p) => ({ ...p, issuer: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal Sertifikat</Label>
              <Input
                type="date"
                value={compDraft.certifiedAt}
                onChange={(e) => setCompDraft((p) => ({ ...p, certifiedAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link Dokumen Pendukung</Label>
              <Input
                placeholder="https://..."
                value={compDraft.attachmentUrl}
                onChange={(e) => setCompDraft((p) => ({ ...p, attachmentUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input
                placeholder="Keterangan tambahan (opsional)"
                value={compDraft.notes}
                onChange={(e) => setCompDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompDialog({ open: false, item: null })}>Batal</Button>
            <Button onClick={saveComp} disabled={savePending || !compDraft.competencyName.trim()}>
              {savePending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
