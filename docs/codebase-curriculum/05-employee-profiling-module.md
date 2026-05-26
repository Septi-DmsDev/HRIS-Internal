# Employee Profiling Module

## Status

`status: tersedia`

## 1. Tujuan Modul

Modul ini menyimpan profil karyawan yang menjadi fondasi semua modul lain. Bukan hanya biodata, tetapi juga:

- penempatan cabang/divisi,
- jabatan,
- grade,
- kelompok karyawan,
- status kerja,
- status payroll,
- supervisor,
- jadwal kerja,
- histori perubahan.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/lib/db/schema/employee.ts` | tabel profil, histori, dan assignment jadwal | semua modul | schema inti karyawan |
| `src/lib/validations/employee.ts` | validasi form employee dan work schedule | action employee | supervisor TEAMWORK wajib |
| `src/server/actions/employees.ts` | list, options, detail, import/export, create, update, BPJS toggle, bulk placement, access sync, delete | page employee/positioning/export | action terbesar kedua setelah payroll |
| `src/app/(dashboard)/employees/page.tsx` | page daftar karyawan | HRD/SPV/Finance/Admin | mempersiapkan row table |
| `src/app/(dashboard)/employees/export.xlsx/route.ts` | route export XLSX karyawan | HRD/Admin/role baca employee | memakai `getEmployeesForExport()` |
| `src/app/(dashboard)/employees/EmployeesTable.tsx` | tabel CRUD employee | user internal | form besar ada di sini |
| `src/app/(dashboard)/employees/[id]/page.tsx` | detail employee + histori | user internal | bacaan terbaik untuk memahami data employee |
| `src/app/(dashboard)/positioning/*` | mutasi massal cabang/divisi/jabatan/grade/kelompok | HRD/SUPER_ADMIN | memakai `bulkUpdateEmployeeOrganization()` |
| `src/app/(dashboard)/divisi/page.tsx` | route kompatibilitas lama | user internal | redirect ke `/positioning` |
| `src/server/actions/work-schedules.ts` | daftar schedule aktif | form employee | dipakai sebagai opsi jadwal |

## 3. Alur Kerja Modul

```text
User buka halaman employees
→ getEmployees() + getEmployeeFormOptions()
→ requireAuth() + role check
→ query employees + master option
→ DataTable tampil
→ user create/update employee
→ employeeSchema validasi input
→ server action insert/update employees
→ jika ada perubahan penting
→ insert ke history table terkait
→ jika jadwal berubah
→ tutup assignment lama dan buat assignment baru
→ revalidate page
```

## 4. Penjelasan File-by-File

### `src/lib/db/schema/employee.ts`

Fungsi utama:
mendefinisikan profil karyawan, histori, dan jadwal kerja.

Export utama:
`employees`, `employeeDivisionHistories`, `employeePositionHistories`, `employeeGradeHistories`, `employeeSupervisorHistories`, `employeeStatusHistories`, `employeeScheduleAssignments`, `workSchedules`, `workScheduleDays`

Logika penting:

- employee memiliki foreign key ke branch/division/position/grade,
- supervisor berupa self-reference ke tabel `employees`,
- jadwal kerja dipisah antara template (`workSchedules`) dan histori assignment (`employeeScheduleAssignments`).

### `src/server/actions/employees.ts`

Fungsi utama:
menjadi pusat semua operasi employee.

Export utama:
`getEmployees()`, `getEmployeesForExport()`, `getDivisionManagementOptions()`, `getEmployeeFormOptions()`, `getEmployeeById()`, `createEmployee()`, `importEmployeesFromXlsx()`, `updateEmployee()`, `toggleEmployeeBpjs()`, `bulkUpdateEmployeeOrganization()`, `deleteEmployeePositionHistory()`, `deleteEmployeeDivisionHistory()`, `deleteEmployeeGradeHistory()`, `deleteEmployee()`, dan beberapa utility akses karyawan untuk `SUPER_ADMIN`.

Logika penting:

- `getEmployees()` membatasi data SPV/KABAG berdasarkan `divisionIds`,
- `getEmployeeFormOptions()` mengumpulkan master option aktif untuk form,
- `getEmployeesForExport()` menjadi sumber route export XLSX karyawan,
- `getDivisionManagementOptions()` dan `bulkUpdateEmployeeOrganization()` dipakai route `/positioning` untuk mutasi massal struktur organisasi,
- `getEmployeeById()` mengembalikan profil lengkap plus histori dan schedule history,
- `createEmployee()` selalu menulis histori awal untuk divisi, jabatan, grade, supervisor, dan status,
- `importEmployeesFromXlsx()` mengimpor data karyawan dari workbook dengan validasi master,
- `updateEmployee()` hanya menambah histori ketika field benar-benar berubah,
- saat schedule berubah, assignment aktif lama ditutup dengan `effectiveEndDate = oneDayBefore(effectiveDate)`.
- utility akses seperti `createMissingEmployeeAccounts()`, `revokeResignedEmployeesAccess()`, `syncEmployeeRoles()`, dan `regenerateEmployeeUidsAndResetLogins()` adalah operasi admin sensitif dan dibatasi role.

Risiko/catatan:

- `deleteEmployee()` hard delete, bukan soft delete.
- jika butuh audit penghapusan, mekanismenya belum ada.

### `src/app/(dashboard)/employees/page.tsx`

Fungsi utama:
merakit row table dan opsi form dari action server.

Output:
prop `data` dan `options` untuk `EmployeesTable`.

### `src/app/(dashboard)/employees/EmployeesTable.tsx`

Fungsi utama:
UI CRUD profil karyawan.

Logika penting:

- form sangat luas dan mencakup hampir semua kolom employee,
- tombol `Detail` membuka halaman histori,
- `openEdit()` memanggil `getEmployeeById()` dulu agar draft mengikuti data lengkap,
- hanya role dengan `canManage` yang bisa tambah/edit/hapus.

### `src/app/(dashboard)/employees/[id]/page.tsx`

Fungsi utama:
menampilkan detail employee dan seluruh histori penting.

Logika penting:

- jika employee tidak ada atau di luar scope, akan `notFound()`,
- menampilkan histori divisi, jabatan, grade, supervisor, status, dan jadwal kerja.

## 5. Business Rules yang Diterapkan

- role baca employee hanya: `SUPER_ADMIN`, `HRD`, `KABAG`, `SPV`, `FINANCE`.
- SPV/KABAG hanya boleh melihat karyawan dalam `divisionIds`.
- karyawan `TEAMWORK` wajib punya supervisor.
- `trainingGraduationDate` tidak boleh lebih awal dari `startDate`.
- create employee harus menulis histori awal.
- update employee harus menulis histori hanya bila ada perubahan.
- bulk placement harus menulis histori sesuai field yang berubah.
- perubahan jadwal kerja memakai tanggal efektif.

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `employees` | ya | ya | profil utama |
| `branches` | ya | tidak | label cabang |
| `divisions` | ya | tidak | label divisi dan scope |
| `positions` | ya | tidak | label jabatan |
| `grades` | ya | tidak | label grade |
| `work_schedules` | ya | tidak langsung | opsi jadwal |
| `employee_division_histories` | ya | ya | histori divisi |
| `employee_position_histories` | ya | ya | histori jabatan |
| `employee_grade_histories` | ya | ya | histori grade |
| `employee_supervisor_histories` | ya | ya | histori supervisor |
| `employee_status_histories` | ya | ya | histori status |
| `employee_schedule_assignments` | ya | ya | histori jadwal kerja |
| `user_roles` | ya | ya untuk utility akses | employee-linked login dan sync role |

## 7. Edge Case

- SPV/KABAG tanpa `divisionIds` tidak dapat melihat data employee.
- edit employee dengan jadwal baru menutup assignment lama sehari sebelum tanggal efektif.
- jika `scheduleId` dikosongkan, assignment aktif lama bisa ditutup tanpa membuat assignment baru.
- delete employee akan menghapus row employee; potensi relasi turunannya bergantung constraint database.

## 8. Hal yang Perlu Diperhatikan Developer

- modul employee adalah sumber snapshot untuk performance dan payroll; jangan ubah struktur/semantik field secara sembarangan.
- histori efektif sangat penting. Kalau ada field baru yang memengaruhi payroll/performance, pertimbangkan apakah perlu history table juga.
- halaman `/employees` tetap area admin/HRD/SPV/KABAG/Finance; self-service karyawan berjalan melalui `/dashboard`, `/settings`, `/schedule`, `/tickets`, dan personal payroll detail berbasis `user_roles.employee_id`.

## 9. Contoh Alur Nyata

Contoh: memindahkan karyawan ke divisi baru dan mengganti jadwal.

```text
HRD buka /employees
→ klik Edit
→ EmployeesTable memanggil getEmployeeById()
→ draft form terisi data lama
→ HRD ubah divisionId, scheduleId, effectiveDate
→ updateEmployee()
→ update row employees
→ insert employeeDivisionHistories dengan previous/new division
→ assignment jadwal lama ditutup H-1 effectiveDate
→ assignment jadwal baru dibuat
→ detail employee menampilkan histori perubahan
```
