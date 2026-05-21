"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyAccountSettings } from "@/server/actions/settings";
import { updateMyPersonalProfile } from "@/server/actions/me";

type SettingsAccountFormProps = {
  initialData: {
    userEmail: string;
    username: string;
    phoneNumber: string;
    employeeCode: string | null;
    fullName: string | null;
    canEditPersonalEnrichment: boolean;
    hobbies: Array<{ id: string; hobbyName: string; notes: string }>;
    educationHistories: Array<{
      id: string;
      institutionName: string;
      degree: string;
      major: string;
      startYear: string;
      endYear: string;
      notes: string;
    }>;
    competencies: Array<{
      id: string;
      competencyName: string;
      level: string;
      issuer: string;
      certifiedAt: string;
      attachmentUrl: string;
      notes: string;
    }>;
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

export default function SettingsAccountForm({ initialData, profileData }: SettingsAccountFormProps) {
  const [pending, startTransition] = useTransition();
  const [profilePending, startProfileTransition] = useTransition();
  const [modalPending, startModalTransition] = useTransition();
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hobbies, setHobbies] = useState(
    initialData.hobbies.length ? initialData.hobbies : [{ id: crypto.randomUUID(), hobbyName: "", notes: "" }]
  );
  const [educationHistories, setEducationHistories] = useState(
    initialData.educationHistories.length
      ? initialData.educationHistories
      : [{ id: crypto.randomUUID(), institutionName: "", degree: "", major: "", startYear: "", endYear: "", notes: "" }]
  );
  const [competencies, setCompetencies] = useState(
    initialData.competencies.length
      ? initialData.competencies
      : [{ id: crypto.randomUUID(), competencyName: "", level: "", issuer: "", certifiedAt: "", attachmentUrl: "", notes: "" }]
  );

  function handleSubmit(formData: FormData) {
    setMessage(null);
    formData.set("hobbies", JSON.stringify(hobbies.filter((item) => item.hobbyName.trim())));
    formData.set(
      "educationHistories",
      JSON.stringify(educationHistories.filter((item) => item.institutionName.trim()))
    );
    formData.set(
      "competencies",
      JSON.stringify(competencies.filter((item) => item.competencyName.trim()))
    );
    startTransition(async () => {
      const result = await updateMyAccountSettings(formData);
      if (result?.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      if (result?.success) {
        setMessage({ type: "success", text: result.success });
      }
    });
  }

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

  function handleModalSubmit(formData: FormData) {
    setMessage(null);
    setProfileMessage(null);
    formData.set("hobbies", JSON.stringify(hobbies.filter((item) => item.hobbyName.trim())));
    formData.set(
      "educationHistories",
      JSON.stringify(educationHistories.filter((item) => item.institutionName.trim()))
    );
    formData.set(
      "competencies",
      JSON.stringify(competencies.filter((item) => item.competencyName.trim()))
    );
    startModalTransition(async () => {
      const profileResult = await updateMyPersonalProfile(formData);
      if (profileResult?.error) {
        setProfileMessage({ type: "error", text: profileResult.error });
        return;
      }

      const accountResult = await updateMyAccountSettings(formData);
      if (accountResult?.error) {
        setMessage({ type: "error", text: accountResult.error });
        return;
      }

      setProfileMessage({ type: "success", text: profileResult?.success ?? "Profil berhasil diperbarui." });
      setMessage({ type: "success", text: accountResult?.success ?? "Akun berhasil diperbarui." });
      setProfileEditOpen(false);
    });
  }

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

  function renderProfileForm() {
    return (
      <form action={handleProfileSubmit} className="space-y-4">
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
        {profileMessage && (
          <div className={`rounded-md border px-3 py-2 text-sm ${profileMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {profileMessage.text}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={profilePending}>
            {profilePending ? "Menyimpan Profil..." : "Simpan Profil"}
          </Button>
        </div>
      </form>
    );
  }

  function renderEditModalForm() {
    return (
      <form action={handleModalSubmit} className="space-y-5">
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">Data Diri</p>
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
        </div>
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">Akun Login</p>
          <p className="text-xs text-slate-500">Nama lengkap hanya bisa diubah Admin/HRD.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modalFullName">Nama Lengkap</Label>
              <Input id="modalFullName" value={initialData.fullName ?? "-"} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modalEmployeeCode">Kode Karyawan</Label>
              <Input id="modalEmployeeCode" value={initialData.employeeCode ?? "-"} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modalUsername">Username</Label>
              <Input id="modalUsername" name="username" defaultValue={initialData.username} required maxLength={100} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="modalEmail">Email Login</Label>
              <Input id="modalEmail" name="email" type="email" defaultValue={initialData.userEmail} required />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modalNewPassword">Password Baru</Label>
              <Input id="modalNewPassword" name="newPassword" type="password" placeholder="Minimal 8 karakter" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modalConfirmPassword">Konfirmasi Password Baru</Label>
              <Input id="modalConfirmPassword" name="confirmPassword" type="password" placeholder="Ulangi password baru" />
            </div>
          </div>
        </div>
        <input type="hidden" name="hobbies" value={JSON.stringify(hobbies.filter((item) => item.hobbyName.trim()))} />
        <input type="hidden" name="educationHistories" value={JSON.stringify(educationHistories.filter((item) => item.institutionName.trim()))} />
        <input type="hidden" name="competencies" value={JSON.stringify(competencies.filter((item) => item.competencyName.trim()))} />
        {(profileMessage || message) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              profileMessage?.type === "error" || message?.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {profileMessage?.type === "error"
              ? profileMessage.text
              : message?.type === "error"
                ? message.text
                : "Profil dan akun berhasil diperbarui."}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={modalPending}>
            {modalPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      {profileComplete ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-900">Profil Diri</p>
              <p className="mt-1 text-xs text-emerald-800">Data sudah lengkap. Klik edit jika ingin mengubah data diri.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setProfileEditOpen(true)}>
              Edit Profil
            </Button>
          </div>
          <div className="grid gap-4 rounded-lg border border-emerald-200 bg-white p-4 text-sm md:grid-cols-2">
            <div><p className="text-slate-500">Nama Lengkap</p><p className="font-medium text-slate-900">{initialData.fullName ?? "-"}</p></div>
            <div><p className="text-slate-500">Kode Karyawan</p><p className="font-medium text-slate-900">{initialData.employeeCode ?? "-"}</p></div>
            <div><p className="text-slate-500">Username</p><p className="font-medium text-slate-900">{initialData.username || "-"}</p></div>
            <div><p className="text-slate-500">Nomor HP</p><p className="font-medium text-slate-900">{profileData?.phoneNumber ?? initialData.phoneNumber ?? "-"}</p></div>
            <div className="md:col-span-2"><p className="text-slate-500">Email Login</p><p className="font-medium text-slate-900">{initialData.userEmail}</p></div>
            <div><p className="text-slate-500">NIK</p><p className="font-medium text-slate-900">{profileData?.nik ?? "-"}</p></div>
            <div><p className="text-slate-500">Nama Panggilan</p><p className="font-medium text-slate-900">{profileData?.nickname ?? "-"}</p></div>
            <div><p className="text-slate-500">Tempat Lahir</p><p className="font-medium text-slate-900">{profileData?.birthPlace ?? "-"}</p></div>
            <div><p className="text-slate-500">Tanggal Lahir</p><p className="font-medium text-slate-900">{birthDateValue || "-"}</p></div>
            <div><p className="text-slate-500">Jenis Kelamin</p><p className="font-medium text-slate-900">{profileData?.gender === "LAKI-LAKI" ? "Laki-laki" : profileData?.gender === "PEREMPUAN" ? "Perempuan" : "-"}</p></div>
            <div><p className="text-slate-500">Agama</p><p className="font-medium text-slate-900">{profileData?.religion ?? "-"}</p></div>
            <div><p className="text-slate-500">Status Pernikahan</p><p className="font-medium text-slate-900">{profileData?.maritalStatus === "BELUM MENIKAH" ? "Belum Menikah" : profileData?.maritalStatus === "MENIKAH" ? "Menikah" : "-"}</p></div>
            <div><p className="text-slate-500">Nomor HP</p><p className="font-medium text-slate-900">{profileData?.phoneNumber ?? "-"}</p></div>
            <div className="md:col-span-2"><p className="text-slate-500">Alamat</p><p className="font-medium text-slate-900">{profileData?.address ?? "-"}</p></div>
            <div className="md:col-span-2">
              <p className="text-slate-500">Foto Profil</p>
              {profileData?.photoUrl ? (
                <a href={profileData.photoUrl} target="_blank" rel="noreferrer" className="font-medium text-teal-700 underline">
                  Lihat foto profil saat ini
                </a>
              ) : (
                <p className="font-medium text-slate-900">-</p>
              )}
            </div>
          </div>
          <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit Profil Diri</DialogTitle>
              </DialogHeader>
              {renderEditModalForm()}
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <p className="text-sm font-semibold text-amber-900">Profil Wajib Sebelum Akses Penuh Sistem</p>
            <p className="mt-1 text-xs text-amber-800">Lengkapi NIK, biodata, kontak, alamat, dan foto profil.</p>
          </div>
          {renderProfileForm()}
        </div>
      )}

      <form action={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="username" value={initialData.username} />
      <input type="hidden" name="phoneNumber" value={initialData.phoneNumber} />
      <input type="hidden" name="email" value={initialData.userEmail} />
      <input type="hidden" name="newPassword" value="" />
      <input type="hidden" name="confirmPassword" value="" />

      <input type="hidden" name="hobbies" value={JSON.stringify(hobbies.filter((item) => item.hobbyName.trim()))} />
      <input type="hidden" name="educationHistories" value={JSON.stringify(educationHistories.filter((item) => item.institutionName.trim()))} />
      <input type="hidden" name="competencies" value={JSON.stringify(competencies.filter((item) => item.competencyName.trim()))} />

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Hobi</p>
          {initialData.canEditPersonalEnrichment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setHobbies((prev) => [...prev, { id: crypto.randomUUID(), hobbyName: "", notes: "" }])
              }
            >
              Tambah Hobi
            </Button>
          ) : null}
        </div>
        {hobbies.map((hobby) => (
          <div key={hobby.id} className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama Hobi</Label>
              <Input
                value={hobby.hobbyName}
                disabled={!initialData.canEditPersonalEnrichment}
                onChange={(e) =>
                  setHobbies((prev) =>
                    prev.map((item) => (item.id === hobby.id ? { ...item, hobbyName: e.target.value } : item))
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input
                value={hobby.notes}
                disabled={!initialData.canEditPersonalEnrichment}
                onChange={(e) =>
                  setHobbies((prev) =>
                    prev.map((item) => (item.id === hobby.id ? { ...item, notes: e.target.value } : item))
                  )
                }
              />
            </div>
            {initialData.canEditPersonalEnrichment ? (
              <div className="md:col-span-2">
                <Button type="button" variant="destructive" size="sm" onClick={() => setHobbies((prev) => prev.filter((item) => item.id !== hobby.id))}>
                  Hapus
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Riwayat Pendidikan</p>
          {initialData.canEditPersonalEnrichment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setEducationHistories((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), institutionName: "", degree: "", major: "", startYear: "", endYear: "", notes: "" },
                ])
              }
            >
              Tambah Pendidikan
            </Button>
          ) : null}
        </div>
        {educationHistories.map((education) => (
          <div key={education.id} className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Institusi</Label>
              <Input value={education.institutionName} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, institutionName: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenjang</Label>
              <Input value={education.degree} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, degree: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jurusan</Label>
              <Input value={education.major} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, major: e.target.value } : item)))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tahun Masuk</Label>
                <Input value={education.startYear} maxLength={4} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, startYear: e.target.value } : item)))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tahun Lulus</Label>
                <Input value={education.endYear} maxLength={4} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, endYear: e.target.value } : item)))} />
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Catatan</Label>
              <Input value={education.notes} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setEducationHistories((prev) => prev.map((item) => (item.id === education.id ? { ...item, notes: e.target.value } : item)))} />
            </div>
            {initialData.canEditPersonalEnrichment ? (
              <div className="md:col-span-2">
                <Button type="button" variant="destructive" size="sm" onClick={() => setEducationHistories((prev) => prev.filter((item) => item.id !== education.id))}>
                  Hapus
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Kompetensi</p>
          {initialData.canEditPersonalEnrichment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCompetencies((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), competencyName: "", level: "", issuer: "", certifiedAt: "", attachmentUrl: "", notes: "" },
                ])
              }
            >
              Tambah Kompetensi
            </Button>
          ) : null}
        </div>
        {competencies.map((competency) => (
          <div key={competency.id} className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama Kompetensi</Label>
              <Input value={competency.competencyName} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, competencyName: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Input value={competency.level} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, level: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Penerbit</Label>
              <Input value={competency.issuer} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, issuer: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal Sertifikat</Label>
              <Input type="date" value={competency.certifiedAt} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, certifiedAt: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Link Dokumen Pendukung</Label>
              <Input value={competency.attachmentUrl} placeholder="https://..." disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, attachmentUrl: e.target.value } : item)))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Catatan</Label>
              <Input value={competency.notes} disabled={!initialData.canEditPersonalEnrichment} onChange={(e) => setCompetencies((prev) => prev.map((item) => (item.id === competency.id ? { ...item, notes: e.target.value } : item)))} />
            </div>
            {initialData.canEditPersonalEnrichment ? (
              <div className="md:col-span-2">
                <Button type="button" variant="destructive" size="sm" onClick={() => setCompetencies((prev) => prev.filter((item) => item.id !== competency.id))}>
                  Hapus
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Profil Tambahan"}
        </Button>
      </div>
      </form>
    </div>
  );
}
