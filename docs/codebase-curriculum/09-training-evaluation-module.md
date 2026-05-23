# Training Evaluation Module

## Status

`status: tersedia, usable, masih perlu hardening kebijakan status`

File ditemukan:

- `src/server/actions/training.ts`
- `src/app/(dashboard)/performance/training/page.tsx`
- `src/app/(dashboard)/performance/training/TrainingEvaluationClient.tsx`
- tabel pendukung di `employee.ts`, `master.ts`, `point.ts`

Gap yang perlu dibangun:

- enforcement minimal 1 bulan dan maksimal 3 bulan,
- keputusan status reguler masih langsung mengubah employee status, sementara payroll hanya memprorate dampak periode tengah,
- audit keputusan training.

## 1. Tujuan Modul

Modul ini mengevaluasi karyawan `TEAMWORK` dengan `employmentStatus = TRAINING` berdasarkan performa poin bulanan, lalu membantu HRD memutuskan:

- lulus training,
- tidak lolos training.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/server/actions/training.ts` | query evaluasi dan keputusan training | UI training | action utama |
| `src/app/(dashboard)/performance/training/page.tsx` | page server | user internal | wrapper sederhana |
| `src/app/(dashboard)/performance/training/TrainingEvaluationClient.tsx` | kartu evaluasi trainee | HRD/SPV | menampilkan performa per periode |
| `src/lib/db/schema/employee.ts` | status karyawan dan `trainingGraduationDate` | training, payroll | field target perubahan status |
| `src/lib/db/schema/master.ts` | `divisions.trainingPassPercent` | training | standar lulus per divisi |
| `src/lib/db/schema/point.ts` | `monthlyPointPerformances` | training | sumber performa |

## 3. Alur Kerja Modul

```text
User buka /performance/training
→ getTrainingEvaluations()
→ requireAuth()
→ cek role TRAINING_ROLES
→ ambil employee TEAMWORK aktif dengan status TRAINING
→ ambil seluruh monthly_point_performances per trainee
→ hitung avgPerformancePercent, latestPerformancePercent, trainingMonths
→ tentukan evaluationCategory
→ tampilkan di client
```

```text
Keputusan lulus
→ graduateTrainee(employeeId, notes)
→ checkRole(["SUPER_ADMIN","HRD"])
→ pastikan status saat ini TRAINING
→ update employees:
   employmentStatus = REGULER
   payrollStatus = REGULER
   trainingGraduationDate = now
→ revalidate training dan employees
```

## 4. Penjelasan File-by-File

### `src/server/actions/training.ts`

Fungsi utama:
menghitung evaluasi training dan memproses keputusan.

Export utama:
`getTrainingEvaluations()`, `graduateTrainee()`, `failTrainee()`

Logika penting:

- role yang boleh membaca:
  `SUPER_ADMIN`, `HRD`, `SPV`
- trainee yang dibaca hanya:
  `employeeGroup = TEAMWORK`, `employmentStatus = TRAINING`, `isActive = true`
- `avgPerformancePercent` dihitung dari semua monthly performance trainee,
- `trainingMonths` dihitung kasar dari selisih `Date.now()` dan `startDate`,
- payroll memakai `training_graduation_date` untuk menentukan tunjangan masa kerja serta prorate bonus fulltime/disiplin bila lulus di tengah periode.
- kategori:
  - `LULUS` bila rata-rata >= pass percent divisi
  - `MENDEKATI` bila >= 80% dari pass percent
  - selain itu `BELUM_LULUS`

### `src/app/(dashboard)/performance/training/TrainingEvaluationClient.tsx`

Fungsi utama:
menampilkan kartu trainee dan riwayat performanya.

Logika penting:

- HRD/SUPER_ADMIN bisa klik `Luluskan` atau `Tidak Lolos`,
- progress divisualkan dengan progress bar dan garis pass percent,
- detail performa per periode ditampilkan dalam tabel kecil.

## 5. Business Rules yang Diterapkan

- standar lulus training diambil dari `divisions.trainingPassPercent`, default `80`.
- hanya trainee aktif dari kelompok `TEAMWORK` yang dievaluasi.
- keputusan lulus mengubah status menjadi `REGULER`.
- keputusan gagal mengubah status menjadi `TIDAK_LOLOS` dan `payrollStatus = NONAKTIF`.

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `employees` | ya | ya | daftar trainee dan update keputusan |
| `divisions` | ya | tidak | standar lulus per divisi |
| `monthly_point_performances` | ya | tidak | sumber performa trainee |

## 7. Edge Case

- trainee tanpa monthly performance akan mendapat `avgPerformancePercent = 0`.
- SPV hanya melihat trainee di divisinya.
- lulus/gagal ditolak jika karyawan sudah bukan status `TRAINING`.

## 8. Hal yang Perlu Diperhatikan Developer

- code sekarang langsung mengubah status karyawan saat tombol keputusan ditekan.
- payroll sudah memprorate bonus fulltime/disiplin dan selisih gaji jika lulus di tengah periode, tetapi rule bisnis untuk status reguler efektif di periode berikutnya masih perlu keputusan final.
- rule minimal 1 bulan dan maksimal 3 bulan training juga belum ada di action.

## 9. Contoh Alur Nyata

```text
HRD buka /performance/training
→ sistem menampilkan trainee aktif beserta performa bulanan mereka
→ HRD melihat rata-rata performa trainee A = 84%
→ pass percent divisinya 80%
→ kategori menjadi LULUS
→ HRD klik Luluskan
→ graduateTrainee() mengubah employee menjadi REGULER + payroll REGULER
→ halaman employee dan training ter-refresh
```
