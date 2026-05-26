# Performance Point Module

## Status

`status: tersedia, tetapi belum lengkap`

File ditemukan:

- `src/lib/db/schema/point.ts`
- `src/server/actions/point-catalog.ts`
- `src/server/actions/performance.ts`
- `src/server/point-engine/parse-master-point-workbook.ts`
- `src/server/point-engine/count-assigned-days-for-period.ts`
- `src/server/point-engine/count-target-days-for-period.ts`
- `src/server/point-engine/calculate-monthly-point-performance.ts`
- `src/server/services/point-catalog-service.ts`
- `src/app/(dashboard)/performance/page.tsx`
- `src/app/(dashboard)/performance/PerformanceCatalogClient.tsx`
- `src/app/(dashboard)/performance/TwPerformanceClient.tsx`

Gap yang perlu dibangun:

- enforcement deadline H+1/H+2/H+1 revisi,
- audit dan rule tambahan bila activity dibuka ulang setelah payroll.
- hardening self-service TEAMWORK agar lebih lengkap untuk flow input harian.

Fitur yang sudah ada di code:

- input massal persentase performa managerial bulanan oleh HRD/SUPER_ADMIN untuk role KABAG/SPV/MANAGERIAL.
- self-service TEAMWORK performance helper sudah ada di action dan route layer.
- draft self-service TW yang belum dikirim dipersist sementara di `sessionStorage` browser per employee login.

## 1. Tujuan Modul

Modul ini mengelola:

- master poin pekerjaan per versi,
- target harian per divisi,
- input aktivitas harian,
- workflow submit/approve/reject/override,
- rekap performa bulanan.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/lib/db/schema/point.ts` | schema katalog poin dan transaksi | performance, dashboard, payroll, training | inti data modul |
| `src/config/constants.ts` | target default dan fallback OFFSET legacy | point engine, payroll | fallback rule target harian |
| `src/server/services/point-catalog-service.ts` | helper versi aktif dan entry/rule per versi | action performance | query reusable |
| `src/server/point-engine/parse-master-point-workbook.ts` | parser workbook Excel ke entry katalog | import katalog | membaca sheet `MASTER_BERSIH` atau sheet pertama |
| `src/server/point-engine/count-assigned-days-for-period.ts` | hitung hari target live dari tanggal yang punya assignment scheduler | dashboard poin dan monthly performance | pure function |
| `src/server/point-engine/count-target-days-for-period.ts` | hitung hari kerja berdasarkan template schedule | payroll preview | pure function |
| `src/server/point-engine/calculate-monthly-point-performance.ts` | hitung target, approved point, performance % | generate monthly | pure function |
| `src/server/actions/point-catalog.ts` | overview katalog dan import workbook | UI katalog | HRD/SUPER_ADMIN |
| `src/server/actions/performance.ts` | workspace performance dan workflow aktivitas | UI aktivitas | HRD/SUPER_ADMIN/SPV |
| `src/app/(dashboard)/performance/page.tsx` | page server | user modul performance | merakit data untuk client |
| `src/app/(dashboard)/performance/PerformanceCatalogClient.tsx` | UI tab aktivitas/monthly/catalog | user internal | client terbesar kedua |
| `src/app/(dashboard)/performance/TwPerformanceClient.tsx` | UI self-service TW | TEAMWORK/MANAGERIAL employee-linked | persist draft lokal sampai berhasil dikirim |
| `src/app/(dashboard)/master/catalogpoin/*` | workspace katalog poin legacy | HRD/SUPER_ADMIN | sinkronisasi workbook dan entry catalog |

## 3. Alur Kerja Modul

```text
HRD sinkron workbook katalog
→ syncPointCatalogFromWorkbook()
→ parse workbook
→ simpan version + target rules + catalog entries
→ versi aktif berubah
```

```text
User kelola aktivitas
→ saveDailyActivityEntry()
→ validasi role dan input
→ cek versi katalog aktif
→ cek pekerjaan sesuai divisi aktual harian
→ snapshot nama pekerjaan/poin/satuan/divisi ke daily_activity_entries
→ simpan DRAFT / REVISI_TW
```

```text
User ajukan aktivitas
→ submitDailyActivityEntry()
→ status DRAFT/REVISI_TW menjadi DIAJUKAN/DIAJUKAN_ULANG
→ tulis approval log
```

```text
SPV atau HRD memproses
→ approveDailyActivityEntry() / rejectDailyActivityEntry()
→ cek scope divisi
→ ubah status
→ tulis approval log
→ data siap masuk generate monthly
```

```text
HRD generate monthly performance
→ generateMonthlyPerformance()
→ ambil employee TEAMWORK aktif
→ hitung total approved point dalam periode
→ resolve divisi snapshot dari history
→ hitung target days dari hari aktif/non-OFF scheduler
→ hitung total target = target harian master divisi x target days
→ hitung performancePercent
→ replace monthly_point_performances periode itu
```

## 4. Penjelasan File-by-File

### `src/lib/db/schema/point.ts`

Fungsi utama:
mendefinisikan versioning katalog poin dan transaksi performa.

Logika penting:

- `dailyActivityEntries` menyimpan snapshot lengkap:
  `pointCatalogVersionId`, `pointCatalogDivisionName`, `workNameSnapshot`, `unitDescriptionSnapshot`, `pointValueSnapshot`.
- `dailyActivityApprovalLogs` menjadi jejak approval aktivitas.
- `monthlyPointPerformances` menyimpan hasil final per periode, bukan hanya query dinamis.

### `src/server/actions/point-catalog.ts`

Fungsi utama:
menyediakan overview katalog aktif dan import versi baru.

Logika penting:

- overview memilih versi aktif, jika tidak ada jatuh ke versi terbaru.
- import bisa mengarsipkan versi aktif lama bila `activateVersion = true`.
- target divisi untuk schedule dan monthly performance membaca `divisions.dailyPointTarget` dari master divisi; resolver constant hanya menjadi fallback legacy.

Risiko/catatan:

- import mengandalkan path file lokal yang diisi user.

### `src/server/point-engine/parse-master-point-workbook.ts`

Fungsi utama:
menormalisasi workbook Excel ke format katalog internal.

Logika penting:

- sheet utama dicari dengan nama `MASTER_BERSIH`,
- nama divisi dinormalisasi uppercase,
- poin bisa dibaca dari angka atau string dengan normalisasi `.` dan `,`,
- rule target default selalu dibuat,
- override otomatis dibuat bila `resolvePointTargetForDivision()` memberi nilai selain default.

### `src/server/actions/performance.ts`

Fungsi utama:
workflow aktivitas harian dan generate bulanan.

Export utama:
`getPerformanceWorkspace()`, `saveDailyActivityEntry()`, `submitDailyActivityEntry()`, `approveDailyActivityEntry()`, `rejectDailyActivityEntry()`, `generateMonthlyPerformance()`, `inputEmployeeMonthlyPerformance()`, `deleteMonthlyPerformance()`, `deleteMonthlyPerformanceByPeriod()`, `getTwPerformanceData()`, `batchSubmitDraft()`, `appendToPendingDraft()`, `getSpvPendingActivities()`, `getTeamPerformanceWorkspace()`, `batchDecideDraftActivities()`, `updatePendingActivityEntry()`, dan `deleteActivityEntry()`

Logika penting:

- akses baca sekarang mencakup `SUPER_ADMIN`, `HRD`, `KABAG`, `SPV`, `TEAMWORK`, dan `MANAGERIAL`,
- daftar karyawan dibatasi ke kelompok `TEAMWORK` aktif,
- `saveDailyActivityEntry()` menolak jika pekerjaan poin tidak cocok dengan divisi aktual harian,
- `TwPerformanceClient` menyimpan draft belum terkirim di `sessionStorage` per `employeeId`; draft dihapus setelah `batchSubmitDraft()`/`appendToPendingDraft()` sukses,
- `appendToPendingDraft()` menambahkan draft personal ke server tanpa langsung submit, lalu draft tersebut bisa dilihat/dikelola pada history/draft flow,
- `updatePendingActivityEntry()` dan `deleteActivityEntry()` mendukung koreksi activity yang masih berada pada state yang diizinkan,
- only status `DRAFT`, `DITOLAK_SPV`, `REVISI_TW` yang masih bisa diubah,
- approval menghormati scope divisi SPV,
- generate monthly menghapus hasil periode lama lalu menulis ulang seluruh employee TEAMWORK aktif.
- tersedia input massal persentase managerial bulanan untuk KABAG/SPV/MANAGERIAL oleh HRD/SUPER_ADMIN.

### `src/server/point-engine/count-assigned-days-for-period.ts`

Fungsi utama:
menghitung hari aktif/non-OFF dari histori assignment scheduler. Tanggal tanpa row `employee_schedule_assignments` dianggap OFF dan tidak masuk target bulanan live.

### `src/server/point-engine/count-target-days-for-period.ts`

Fungsi utama:
menghitung hari kerja berdasarkan histori assignment jadwal dan hari kerja aktif di template schedule. Saat ini dipertahankan untuk jalur payroll preview yang masih membutuhkan interpretasi template kerja.

### `src/server/point-engine/calculate-monthly-point-performance.ts`

Fungsi utama:
menghasilkan:

- `targetDailyPoints`
- `targetDays`
- `totalTargetPoints`
- `totalApprovedPoints`
- `performancePercent`

Logika penting:

- target harian mengambil `divisions.dailyPointTarget` dari divisi snapshot, dengan resolver constant sebagai fallback,
- `targetDays` diambil dari jumlah hari aktif/non-OFF pada scheduler,
- jika target total nol, persentase menjadi nol.

## 5. Business Rules yang Diterapkan

- katalog poin wajib versioning.
- transaksi aktivitas menyimpan snapshot poin/master.
- target default harian `13.000`.
- target harian resmi di UI schedule, dashboard poin, dan monthly performance mengikuti setting master divisi (`divisions.dailyPointTarget`); migrasi backfill menyetel `OFFSET` ke `39.000`.
- target bulanan = target harian master divisi x jumlah hari aktif/non-OFF pada scheduler.
- generate monthly memakai divisi snapshot per awal periode, bukan divisi aktual harian.
- hanya status `DISETUJUI_SPV`, `OVERRIDE_HRD`, `DIKUNCI_PAYROLL` yang dihitung ke monthly performance.
- SPV/KABAG hanya boleh approve/reject aktivitas divisinya.
- route `/teamperformance` dipakai untuk tampilan performa tim/self-service TEAMWORK.
- draft/history performance yang belum masuk payroll tetap harus menghormati status workflow; perubahan setelah payroll locked hanya lewat mekanisme koreksi yang disetujui.

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `point_catalog_versions` | ya | ya | versi master poin |
| `division_point_target_rules` | ya | ya | target harian per divisi |
| `point_catalog_entries` | ya | ya | daftar pekerjaan poin |
| `daily_activity_entries` | ya | ya | transaksi aktivitas |
| `daily_activity_approval_logs` | ya | ya | audit approval aktivitas |
| `monthly_point_performances` | ya | ya | hasil performa bulanan |
| `employees` | ya | tidak | opsi karyawan dan scope |
| `employee_division_histories` | ya | tidak | resolve snapshot divisi |
| `employee_schedule_assignments` | ya | tidak | resolve target days |
| `work_schedule_days` | ya | tidak | jam dan label shift per schedule; target poin bulanan memakai assignment aktif/non-OFF |
| `divisions` | ya | tidak | label divisi dan validasi kecocokan katalog |

## 7. Edge Case

- tidak ada versi katalog aktif → aktivitas tidak bisa disimpan.
- pekerjaan poin beda divisi dengan `actualDivisionId` → ditolak.
- draft TW yang belum dikirim akan pulih setelah refresh/pindah menu selama browser tab/session yang sama masih menyimpan `sessionStorage`.
- activity yang sudah diajukan/disetujui tidak bisa diedit.
- activity yang boleh dihapus saat ini `DRAFT`, `DIAJUKAN`, dan `DIAJUKAN_ULANG`; jangan membuka delete untuk status approved/locked/payroll tanpa business decision baru.
- jika employee tidak punya assignment scheduler di periode itu, target days menjadi `0`.

## 8. Hal yang Perlu Diperhatikan Developer

- rule deadline H+1 dan H+2 ada di dokumen bisnis, tetapi belum ada enforcement di code.
- self-service TW sudah tersedia lewat helper personal dan route dashboard/team performance; tetap cek action yang dipakai jika mengubah flow input harian.
- generate monthly tidak mengurangi ticket approved secara terpisah; approved full-day leave harus sudah mengubah scheduler menjadi OFF sehingga tidak masuk `targetDays`.

## 9. Contoh Alur Nyata

```text
HRD sinkronkan workbook
→ versi katalog aktif terbentuk
→ admin/peran internal menambah aktivitas harian
→ activity tersimpan sebagai DRAFT dengan snapshot poin
→ activity diajukan
→ SPV setujui
→ HRD generate monthly untuk periode tertentu
→ sistem hitung target days dari hari aktif/non-OFF scheduler
→ sistem resolve target poin dari divisi snapshot
→ monthly_point_performances terbentuk
→ hasil dipakai training, dashboard, dan payroll TEAMWORK
```


