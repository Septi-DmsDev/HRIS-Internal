# Review and Incident Module

## Status

`status: tersedia`

## 1. Tujuan Modul

Modul ini mengukur kualitas kerja dan mencatat kejadian penting yang tidak tercermin langsung di output poin. Ada dua bagian:

- review karyawan 5 aspek,
- incident log yang bisa berdampak ke review atau payroll.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/lib/db/schema/hr.ts` | `employee_reviews` dan `incident_logs` | reviews, payroll, dashboard | schema inti |
| `src/lib/validations/hr.ts` | `createReviewSchema`, `createIncidentSchema` | action reviews | validasi input |
| `src/server/actions/reviews.ts` | query review/incident dan mutation | UI review | modul utama |
| `src/app/(dashboard)/reviews/page.tsx` | page server review | user internal | menyiapkan opsi karyawan |
| `src/app/(dashboard)/reviews/ReviewsClient.tsx` | UI tabs review dan incident | user internal | pakai DataTable + Tabs |

## 3. Alur Kerja Modul

```text
User buka /reviews
→ getReviews()
→ requireAuth()
→ role menentukan apakah data boleh dibaca
→ jika SPV/KABAG, data dibatasi `divisionIds`
→ page ambil opsi employee
→ client menampilkan tab Review dan Incident
```

```text
Create review
→ createReview()
→ checkRole(["SUPER_ADMIN","HRD","KABAG","SPV"])
→ validasi input
→ jika SPV/KABAG, cek employee ada di scope divisi
→ hitung total score dan category
→ insert employee_reviews status SUBMITTED
→ HRD/SUPER_ADMIN bisa validateReview()
→ status menjadi VALIDATED
```

## 4. Penjelasan File-by-File

### `src/server/actions/reviews.ts`

Fungsi utama:
semua logika review dan incident.

Export utama:
`getReviews()`, `createReview()`, `validateReview()`, `createIncident()`, `deleteIncident()`

Logika penting:

- bobot review:
  - SOP/kualitas `25%`
  - instruksi `15%`
  - absensi/disiplin `20%`
  - inisiatif/teamwork `20%`
  - miss proses/tanggung jawab `20%`
- skor akhir:
  `(bobot * skor) / 5 * 100`
- kategori:
  - `>= 90` Sangat Baik
  - `>= 80` Baik
  - `>= 70` Cukup
  - `>= 60` Kurang
  - lainnya Buruk
- `reviewerEmployeeId` diisi dari `user_roles.employee_id` bila akun reviewer terhubung ke employee.
- incident bisa mencatat `payrollDeduction`.
- `getReviews()` hanya menampilkan incident aktif.
- `deleteIncident()` melakukan soft-delete dengan `isActive=false`, bukan hard delete.

### `src/app/(dashboard)/reviews/page.tsx`

Fungsi utama:
menyiapkan `reviewRows`, `incidentRows`, dan `employeeOptions` yang sudah diformat untuk client.

### `src/app/(dashboard)/reviews/ReviewsClient.tsx`

Fungsi utama:
UI review dan incident.

Logika penting:

- memakai `Tabs`:
  `Review Karyawan` dan `Incident Log`,
- form review menggunakan 5 tombol skor 1-5 per aspek,
- validasi review hanya muncul untuk HRD/SUPER_ADMIN pada row `SUBMITTED`.

## 5. Business Rules yang Diterapkan

- role modul: `SUPER_ADMIN`, `HRD`, `KABAG`, `SPV`.
- SPV/KABAG hanya boleh membuat atau menghapus review/incident untuk karyawan di divisinya.
- review dibuat dengan status `SUBMITTED`.
- validasi review hanya oleh `SUPER_ADMIN` atau `HRD`.
- incident type mencakup `SP1` dan `SP2`, yang dipakai payroll untuk mengurangi performa absolut 10/20 poin sebelum tier bonus dipilih.
- incident yang dihapus/nonaktif tidak tampil di Incident Log dan tidak dibaca payroll.

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `employee_reviews` | ya | ya | penilaian kualitas kerja |
| `incident_logs` | ya | ya | kejadian yang memengaruhi review/payroll |
| `employees` | ya | tidak | label karyawan dan scope divisi |
| `divisions` | ya | tidak | label divisi |

## 7. Edge Case

- SPV/KABAG tanpa `divisionIds` tidak bisa membuat review scoped.
- review hanya bisa divalidasi saat status `SUBMITTED`.
- `payrollDeduction` pada incident bersifat opsional.
- hapus incident bersifat soft-delete agar row historis tidak langsung hilang dari database.

## 8. Hal yang Perlu Diperhatikan Developer

- belum ada audit log terpisah untuk validate review.
- bila nanti review memengaruhi payroll lebih jauh, sebaiknya formula dipindah ke `src/server/review-engine`.
- reviewer employee tercatat bila akun reviewer memiliki `user_roles.employee_id`.

## 9. Contoh Alur Nyata

```text
SPV buka /reviews
→ pilih tab Review Karyawan
→ klik Tambah Review
→ isi periode dan 5 skor aspek
→ createReview() menghitung total + category
→ review masuk status SUBMITTED
→ HRD membuka row yang sama
→ klik Validasi
→ validateReview() mengubah status menjadi VALIDATED
→ jika ada kejadian seperti SP1 atau komplain berat
→ SPV/HRD bisa menambah incident terpisah
→ payroll membaca incident aktif pada periode terkait
```
