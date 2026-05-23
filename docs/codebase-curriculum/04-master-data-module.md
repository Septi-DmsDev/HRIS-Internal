# Master Data Module

## Status

`status: tersedia`

Master data adalah modul yang paling lengkap dan paling stabil di repo saat ini.

## 1. Tujuan Modul

Modul ini menyediakan data referensi yang dipakai modul lain:

- cabang,
- divisi,
- jabatan,
- grade,
- jadwal kerja mingguan,
- master shift,
- konfigurasi kelompok karyawan.

Tanpa modul ini, employee profiling, performance, training, dan payroll tidak bisa berjalan konsisten.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/lib/db/schema/master.ts` | tabel branch/division/position/grade/employee group | employee, performance, training, payroll | schema inti master |
| `src/lib/db/schema/employee.ts` | `workSchedules`, `workShiftMasters`, `workScheduleDays` | employee, performance, absensi, payroll | jadwal kerja diletakkan di schema employee |
| `src/lib/validations/master.ts` | validasi branch/division/position/grade | action master | pakai Zod |
| `src/lib/validations/employee.ts` | validasi work schedule | action work schedule | 7 hari unik wajib |
| `src/server/actions/branches.ts` | CRUD cabang | UI master cabang | role HRD/SUPER_ADMIN |
| `src/server/actions/divisions.ts` | CRUD divisi | UI master divisi | ada `trainingPassPercent` |
| `src/server/actions/positions.ts` | CRUD jabatan | UI master jabatan | ada `employeeGroup` |
| `src/server/actions/employee-group-configs.ts` | konfigurasi kelompok karyawan | UI master employee groups | untuk aturan turunan role/group |
| `src/server/actions/grades.ts` | CRUD grade | UI master grade | kode unik |
| `src/server/actions/work-schedules.ts` | CRUD jadwal kerja + hari | UI jadwal kerja | pakai transaction |
| `src/app/(dashboard)/master/branches/*` | page + table cabang | user HRD/admin | pola CRUD table |
| `src/app/(dashboard)/master/divisions/*` | page + table divisi | user HRD/admin | pola CRUD table |
| `src/app/(dashboard)/master/positions/*` | page + table jabatan | user HRD/admin | pola CRUD table |
| `src/app/(dashboard)/master/employee-groups/*` | page + table konfigurasi kelompok | user HRD/admin | aturan kelompok karyawan |
| `src/app/(dashboard)/master/grades/*` | page + table grade | user HRD/admin | pola CRUD table |
| `src/app/(dashboard)/master/work-schedules/*` | page + table jadwal | user HRD/admin | paling kompleks di master |

## 3. Alur Kerja Modul

```text
User buka halaman master
→ page server component memanggil get*()
→ action memanggil requireAuth()
→ data master dibaca dari database
→ DataTable menampilkan data
→ user submit form create/update/delete
→ server action validasi Zod
→ checkRole(["HRD","SUPER_ADMIN"])
→ query insert/update/delete
→ revalidatePath("/master/...")
→ UI refresh
```

## 4. Penjelasan File-by-File

### `src/lib/db/schema/master.ts`

Fungsi utama:
mendefinisikan tabel master utama.

Export utama:
`branches`, `divisions`, `positions`, `grades`, `employeeGroupEnum`

Logika penting:

- `divisions.code`, `positions.code`, `grades.code` harus unik.
- `divisions.trainingPassPercent` default `80`.
- `divisions.dailyPointTarget` menjadi sumber target poin harian yang ditampilkan di `/schedule`, dashboard poin, dan dipakai generator performa bulanan.
- Target poin bulanan dihitung dari `divisions.dailyPointTarget` dikali jumlah tanggal aktif/non-OFF di scheduler.
- `positions.employeeGroup` memaksa jabatan dikaitkan ke `MANAGERIAL` atau `TEAMWORK`.
- `workShiftMasters` menyimpan toleransi check-in/break/check-out untuk absensi.
- `employee-group-configs` menjadi pengaturan tambahan untuk label/aturan kelompok karyawan, bukan pengganti enum group inti.

Risiko/catatan:

- perubahan data master bisa berdampak luas ke employee, training, performance, dan payroll.

### `src/server/actions/branches.ts`

Fungsi utama:
CRUD master cabang.

Logika penting:

- read cukup `requireAuth()`,
- create/update/delete butuh `HRD` atau `SUPER_ADMIN`,
- error PostgreSQL `23503` diterjemahkan menjadi pesan “masih digunakan”.

### `src/server/actions/divisions.ts`

Fungsi utama:
CRUD divisi.

Logika penting:

- field bisnis khusus: `trainingPassPercent`,
- dipakai lintas modul sebagai standar training dan scope SPV.

### `src/server/actions/positions.ts`

Fungsi utama:
CRUD jabatan.

Logika penting:

- setiap jabatan wajib punya `employeeGroup`,
- group ini memengaruhi jalur evaluasi karyawan dan payroll.

### `src/server/actions/grades.ts`

Fungsi utama:
CRUD grade.

Catatan:
grade dipakai sebagai referensi pada profil karyawan dan snapshot payroll, tetapi nominal payroll belum diturunkan otomatis dari grade.

### `src/server/actions/work-schedules.ts`

Fungsi utama:
CRUD jadwal kerja dan 7 detail hari.

Logika penting:

- input dinormalisasi dan diurutkan per `dayOfWeek`,
- create/update memakai transaction,
- update akan menghapus semua `workScheduleDays` lama lalu insert ulang versi baru,
- delete menolak jika jadwal masih dipakai profil karyawan.

Risiko/catatan:

- update seluruh hari sekaligus berarti perubahan kecil tetap menulis ulang satu paket jadwal.

### `src/app/(dashboard)/master/*/page.tsx`

Fungsi utama:
server component yang mengambil data awal lalu mengirim ke client table.

Logika penting:

- semua page tipis,
- formatting data dilakukan di server page sebelum masuk ke table client.

### `BranchesTable.tsx`, `DivisionsTable.tsx`, `PositionsTable.tsx`, `GradesTable.tsx`, `WorkSchedulesTable.tsx`

Fungsi utama:
UI CRUD master berbasis `DataTable`, `Dialog`, dan `AlertDialog`.

Logika penting:

- pattern UI konsisten:
  list → dialog form → action → refresh.
- `WorkSchedulesTable.tsx` paling kaya karena menangani 7 hari jadwal.

## 5. Business Rules yang Diterapkan

- hanya `HRD` dan `SUPER_ADMIN` yang boleh mutate master data.
- kode division/position/grade harus unik.
- jadwal kerja harus berisi tepat 7 hari unik.
- untuk hari kerja, jam masuk dan jam pulang wajib lengkap.
- jam pulang harus lebih besar daripada jam masuk.
- jadwal yang masih dipakai karyawan tidak boleh dihapus.
- divisi menyimpan `trainingPassPercent` yang akan dipakai training evaluation.
- divisi menyimpan `dailyPointTarget`; jadwal harian tim menentukan tanggal aktif/non-OFF dan jam shift, sedangkan nominal target harian mengikuti setting master divisi.
- shift master dipakai absensi manual dan fallback attendance.

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `branches` | ya | ya | master cabang |
| `divisions` | ya | ya | master divisi |
| `positions` | ya | ya | master jabatan |
| `grades` | ya | ya | master grade |
| `work_schedules` | ya | ya | template jadwal kerja |
| `work_schedule_days` | ya | ya | detail 7 hari per jadwal |
| `employee_schedule_assignments` | tidak langsung di modul ini | tidak | hanya dicek implisit saat delete jadwal |

## 7. Edge Case

- delete branch/division/position/grade gagal bila masih direferensikan tabel lain.
- update work schedule gagal jika jadwal tidak ditemukan.
- kode jadwal yang sama tidak boleh dipakai dua kali.
- hari non-kerja boleh tanpa jam kerja.

## 8. Hal yang Perlu Diperhatikan Developer

- jangan ubah master data tanpa memahami efek ke modul downstream.
- karena payroll memakai snapshot, perubahan master tidak otomatis mengubah payroll periode yang sudah disnapshot.
- jika nanti butuh audit master data, repo saat ini belum punya audit log khusus master.

## 9. Contoh Alur Nyata

Contoh: menambah jadwal kerja baru.

```text
HRD buka /master/work-schedules
→ klik Tambah Jadwal
→ isi code, nama, dan 7 hari jadwal
→ createWorkSchedule()
→ workScheduleSchema memvalidasi 7 hari unik dan jam kerja
→ transaction insert ke work_schedules
→ transaction insert 7 baris ke work_schedule_days
→ revalidate /master/work-schedules dan /employees
→ jadwal muncul di pilihan form karyawan
```
