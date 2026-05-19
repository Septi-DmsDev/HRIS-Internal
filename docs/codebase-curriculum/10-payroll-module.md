# Payroll Module

## Status

`status: tersedia, tetapi belum lengkap`

File ditemukan:

- `src/lib/db/schema/payroll.ts`
- `src/lib/validations/payroll.ts`
- `src/server/actions/payroll.ts`
- `src/server/attendance-engine/resolve-attendance-payroll-eligibility.ts`
- `src/server/payroll-engine/*`
- `src/app/(dashboard)/payroll/*`
- `src/app/(dashboard)/finance/*`

Gap yang perlu dibangun:

- uang harian masih ada di schema/UI tetapi belum dihitung di preview,
- rule “koreksi setelah paid masuk periode berikutnya” belum dibantu alur UI khusus,
- belum ada scope payroll per divisi,
- attendance manual sudah dibaca preview untuk eligibility fulltime/disiplin, tetapi integrasi fingerprint/ADMS belum ada.

## 1. Tujuan Modul

Modul payroll mengubah data final dari modul lain menjadi hasil gaji yang bisa diaudit. Modul ini sudah mencakup:

- pembuatan periode payroll,
- salary config per karyawan,
- KPI managerial,
- auto-preview payroll saat periode dibuka,
- eligibility bonus fulltime/disiplin dari rekap absensi manual,
- snapshot data employee,
- finalisasi,
- status paid,
- lock periode,
- adjustment manual,
- detail payroll,
- export Excel,
- payslip PDF,
- finance summary.

## 2. File dan Folder Terkait

| File/Folder | Fungsi | Dipakai Oleh | Catatan |
|---|---|---|---|
| `src/lib/db/schema/payroll.ts` | semua tabel payroll | payroll, finance | schema utama |
| `src/lib/validations/payroll.ts` | validasi periode, adjustment, KPI, salary config | action payroll | pakai Zod |
| `src/server/actions/payroll.ts` | workspace dan mutation payroll | UI payroll, route export, finance | action paling kompleks |
| `src/server/attendance-engine/resolve-attendance-payroll-eligibility.ts` | rekap eligibility fulltime/disiplin dari absensi | preview payroll | pure |
| `src/server/payroll-engine/resolve-payroll-period.ts` | resolver anchor `YYYY-MM` ke periode 26-25 | create period | pure |
| `src/server/payroll-engine/resolve-bonus-level.ts` | tabel level bonus | calculator payroll | pure |
| `src/server/payroll-engine/calculate-teamwork-payroll.ts` | payroll TEAMWORK | preview payroll | pure |
| `src/server/payroll-engine/calculate-managerial-payroll.ts` | payroll MANAGERIAL | preview payroll | pure |
| `src/server/payroll-engine/resolve-discipline-bonus.ts` | gate payout bonus disiplin dari eligibility absensi | preview payroll | pure |
| `src/server/payroll-engine/resolve-sp-performance-penalty.ts` | pengurang performa absolut SP1/SP2 | preview payroll | pure |
| `src/server/payroll-engine/resolve-payroll-status-transition.ts` | aturan paid/lock | mark paid, lock | pure |
| `src/server/payroll-engine/build-payroll-export-rows.ts` | baris export Excel | route export | pure |
| `src/server/payroll-engine/build-payslip-breakdown.ts` | grouping addition/deduction | detail page, PDF | pure |
| `src/server/payroll-engine/summarize-payroll-results.ts` | summary finance global dan per divisi | payroll page, finance page | pure |
| `src/server/payroll-engine/render-payslip-pdf.tsx` | render PDF ke buffer | route payslip | menggunakan React PDF |
| `src/server/payroll-engine/PayslipPdfDocument.tsx` | template slip gaji | render PDF | tampilan final PDF |
| `src/app/(dashboard)/payroll/page.tsx` | workspace payroll | user payroll | merakit data untuk client |
| `src/app/(dashboard)/payroll/PayrollClient.tsx` | UI period, results, adjustment, KPI, salary config | HRD/Finance/Admin | client besar |
| `src/app/(dashboard)/payroll/[periodId]/[employeeId]/page.tsx` | detail payroll per karyawan | payroll reader | breakdown lengkap |
| `src/app/(dashboard)/payroll/[periodId]/export.xlsx/route.ts` | export Excel payroll per karyawan | browser | node runtime |
| `src/app/(dashboard)/payroll/[periodId]/rekap.xlsx/route.ts` | export rekap Excel per kategori dengan breakdown Summary | browser | node runtime |
| `src/app/(dashboard)/payroll/[periodId]/slips.pdf/route.ts` | export bulk payslip PDF | browser | node runtime |
| `src/app/(dashboard)/payroll/[periodId]/[employeeId]/payslip.pdf/route.ts` | export PDF payslip per karyawan | browser | node runtime |
| `src/app/(dashboard)/finance/page.tsx` | finance dashboard | HRD/Finance/Viewer | membaca workspace payroll |
| `src/app/(dashboard)/finance/FinanceDashboardClient.tsx` | summary finance per periode — gaji pokok, grade, adjustment (tambah/edit/hapus) | HRD/Finance/Viewer | client component |

## 3. Alur Kerja Modul

```text
Buat periode payroll
→ createPayrollPeriod()
→ validate createPayrollPeriodSchema
→ resolvePayrollPeriod("YYYY-MM")
→ insert payroll_periods status OPEN
→ insert payroll_audit_logs action CREATE_PERIOD
```

```text
Siapkan data payroll
→ upsertEmployeeSalaryConfig()
→ upsertManagerialKpiSummary() untuk MANAGERIAL
→ addPayrollAdjustment() bila perlu
```

```text
Auto-preview payroll
→ buka `/payroll` dan pilih periode yang masih OPEN/DRAFT/DATA_REVIEW
→ page server memanggil generatePayrollPreview(periodId)
→ ambil employee aktif dengan payrollStatus terkait
→ ambil snapshot divisi/jabatan/grade per awal periode
→ hitung scheduledWorkDays
→ ambil employeeAttendanceRecords dalam periode
→ ambil monthly performance atau managerial KPI
→ ambil ticket approved, incident aktif, adjustment periode, dan recurring adjustment aktif
→ hitung payroll per employee dengan engine
→ replace payroll_employee_snapshots
→ replace payroll_results
→ update payroll_periods status DRAFT
→ insert payroll_audit_logs action GENERATE_PREVIEW
```

```text
Finalisasi
→ finalizePayroll(periodId)
→ pastikan preview ada
→ ubah payroll_results status FINALIZED
→ ubah payroll_periods status FINALIZED
→ lock monthly_point_performances periode itu
→ lock activity DISETUJUI_SPV/OVERRIDE_HRD menjadi DIKUNCI_PAYROLL
→ insert daily_activity_approval_logs action LOCK_PAYROLL
→ insert payroll_audit_logs action FINALIZE
```

## 4. Penjelasan File-by-File

### `src/lib/db/schema/payroll.ts`

Fungsi utama:
menyimpan konfigurasi nominal, snapshot, hasil payroll, adjustment, dan audit.

Logika penting:

- snapshot menyimpan branch/division/position/grade/status/salary yang dibaca saat preview,
- `payroll_results.breakdown` menyimpan metadata tambahan seperti eligibility dan source performa,
- `payroll_audit_logs` sudah ada untuk aksi payroll utama.

### `src/server/actions/payroll.ts`

Fungsi utama:
orchestrator seluruh proses payroll.

Export utama:

- `getPayrollWorkspace()` — hasil include `branchName` dari `branchSnapshotName`
- `getPayrollEmployeeDetail()`
- `upsertEmployeeSalaryConfig()`
- `upsertManagerialKpiSummary()`
- `createPayrollPeriod()`
- `addPayrollAdjustment()` — tambah adjustment, enforce business rules per kategori
- `updatePayrollAdjustment()` — edit nominal/keterangan adjustment existing; enforce batas kasbon
- `deletePayrollAdjustment()` — hapus adjustment (RECURRING: soft-deactivate, PERIOD: hard-delete)
- `generatePayrollPreview()`
- `finalizePayroll()`
- `markPayrollPaid()`
- `lockPayrollPeriod()`

Logika penting:

- akses baca payroll:
  `SUPER_ADMIN`, `HRD`, `FINANCE`, `PAYROLL_VIEWER`
- akses write payroll:
  `SUPER_ADMIN`, `HRD`, `FINANCE`
- `generatePayrollPreview()`:
  - hanya employee aktif dengan payroll status `TRAINING`, `REGULER`, `FINAL_PAYROLL`,
  - gaji pokok default:
    - training `1.000.000`
    - lainnya `1.200.000`
  - memilih nominal bonus kinerja dari master grade sesuai rentang performa:
    - `80-89.99` memakai nominal tier 80,
    - `90-99.99` memakai nominal tier 90,
    - `>=100` memakai nominal tier 100,
  - nominal tier bonus kinerja dibayar langsung oleh engine; engine tidak mengalikan lagi dengan 80/90/100,
  - mengambil `monthlyPointPerformances` untuk TEAMWORK,
  - mengambil `managerialKpiSummaries` untuk MANAGERIAL,
  - membaca ticket approved hanya dari status `AUTO_APPROVED`, `APPROVED_SPV`, `APPROVED_HRD`,
  - membaca incident aktif dalam periode,
  - menghitung SP penalty dari incident type `SP1` dan `SP2` sebagai pengurang performa absolut sebelum tier bonus dipilih,
  - membaca `employeeAttendanceRecords` periode untuk menentukan bonus fulltime dan bonus disiplin,
  - membaca `overtime_requests` berstatus `APPROVED` dalam periode untuk dihitung sebagai komponen overtime THP,
  - untuk snapshot struktur (divisi/jabatan/grade), sistem mengutamakan histori perubahan **terbaru berdasarkan waktu input (`createdAt`)**; `effectiveDate` tetap disimpan sebagai referensi tanggal efektif.
  - tanpa data absensi periode, bonus fulltime dan bonus disiplin dibayar `0`,
  - bonus disiplin tidak dipicu oleh input persentase/manual KPI; eligibility-nya mengikuti absensi dan incident telat,
  - menyatukan adjustment periode dan recurring adjustment aktif.
- `BPJS` dan `TRANSPORT` disimpan di `recurring_payroll_adjustments`; adjustment lain tetap period-specific di `payroll_adjustments`.
- `updatePayrollAdjustment()` hanya mengubah `amount` dan `reason` (keterangan/tenor); kategori dan karyawan tidak bisa diubah melalui action ini untuk menjaga integritas business rules.
- rekap.xlsx sheet **Summary** berisi: kolom A–C = rekap per tab (KABAG/SPV/MANAGERIAL/divisi), kolom E–G = per cabang, I–K = per divisi, M–O = per jabatan, Q–S = per grade, U–W = per kelompok karyawan.
- page `/payroll` memanggil auto-preview untuk periode yang belum `FINALIZED/PAID/LOCKED`, sehingga tabel payroll langsung terisi tanpa tombol manual `Generate Preview`.
- `finalizePayroll()`:
  - mengunci result dan monthly performance,
  - mengubah activity approved menjadi `DIKUNCI_PAYROLL`.
- `markPayrollPaid()` dan `lockPayrollPeriod()`:
  - memakai engine transisi status.

### `src/server/payroll-engine/resolve-payroll-period.ts`

Fungsi utama:
menerjemahkan anchor `YYYY-MM` menjadi periode `26` bulan sebelumnya sampai `25` bulan berjalan.

### `src/server/payroll-engine/resolve-bonus-level.ts`

Fungsi utama:
memilih level bonus dari persentase performa tanpa pembulatan level.

### `src/server/payroll-engine/calculate-teamwork-payroll.ts`

Fungsi utama:
rumus TEAMWORK.

Logika penting:

- training tidak mendapat bonus performa/fulltime/disiplin/team,
- gaji pokok diprorata menurut `activeEmploymentDays / periodDayCount`,
- `performanceBonusBaseAmount` berisi nominal tier bonus kinerja yang sudah dipilih dari performa setelah SP penalty,
- unpaid leave memotong gaji berdasar `scheduledWorkDays`,
- penalty SP tidak lagi dipakai sebagai multiplier nominal bonus di calculator.

### `src/server/payroll-engine/calculate-managerial-payroll.ts`

Fungsi utama:
rumus MANAGERIAL.

Logika penting:

- memakai KPI sebagai `performancePercent`,
- tidak punya bonus prestasi,
- `performanceBonusBaseAmount` berisi nominal tier bonus kinerja yang sudah dipilih dari performa setelah SP penalty,
- penalty SP tidak lagi dipakai sebagai multiplier nominal bonus di calculator.

### `src/server/payroll-engine/resolve-payroll-status-transition.ts`

Fungsi utama:
aturan status:

- `FINALIZED` → `PAID`
- `PAID` → `LOCKED`

### `src/app/(dashboard)/payroll/PayrollClient.tsx`

Fungsi utama:
workspace utama payroll.

Logika penting:

- period picker di sisi kiri,
- action utama:
  `Buat Periode`, `Finalisasi Payroll`, `Tandai PAID`, `Kunci Periode`, `Export Excel`,
- tabel:
  hasil payroll, summary divisi, adjustment, KPI managerial, salary config,
- dialog:
  create period, add adjustment, edit salary config, input KPI.

### `src/app/(dashboard)/payroll/[periodId]/[employeeId]/page.tsx`

Fungsi utama:
menjelaskan hasil payroll per karyawan secara detail.

Logika penting:

- membaca `breakdown` JSON dari payroll result,
- membangun addition/deduction dengan `buildPayslipBreakdown()`,
- menampilkan ticket approved dan incident yang menjadi sumber perhitungan.

### Route export Excel dan PDF

Fungsi utama:
memberi keluaran dokumen yang bisa dibagikan atau diaudit.

Catatan:

- route export membaca ulang `getPayrollWorkspace()` atau `getPayrollEmployeeDetail()`,
- artinya akses route tetap tunduk pada server-side auth check.

## 5. Business Rules yang Diterapkan

- periode payroll anchor `YYYY-MM` selalu berarti `26 bulan sebelumnya` sampai `25 bulan berjalan`.
- payroll read role terbatas.
- payroll write role terbatas.
- TEAMWORK training tidak mendapat bonus performa.
- default gaji pokok:
  - training `Rp1.000.000`
  - reguler `Rp1.200.000`
- bonus level memakai persentase raw, bukan persentase yang dibulatkan di UI.
- bonus kinerja membayar nominal tier 80/90/100 secara langsung sesuai rentang performa; nominal tersebut tidak dikali lagi dengan persentase tier.
- bonus fulltime dan bonus disiplin default `0` jika data absensi periode belum ada.
- bonus fulltime butuh semua hari kerja terjadwal tercatat `HADIR`; ticket approved tetap menggugurkan fulltime.
- bonus disiplin butuh performa payroll minimal 80%, eligible fulltime, tidak ada `TELAT` di absensi, dan tidak ada incident `TELAT` aktif.
- unpaid leave memotong gaji pokok dibayar.
- SP penalty mengurangi performa payroll secara absolut: SP1 -10 poin, SP2 -20 poin; nominal bonus tidak dikalikan multiplier SP.
- finalisasi mengunci monthly performance dan activity yang relevan.
- period status transisi:
  `DRAFT/FINALIZED` → `PAID` → `LOCKED`

## 6. Data yang Dibaca dan Ditulis

| Tabel Database | Dibaca | Ditulis | Fungsi |
|---|---|---|---|
| `payroll_periods` | ya | ya | periode payroll |
| `employee_salary_configs` | ya | ya | nominal dasar per employee |
| `managerial_kpi_summaries` | ya | ya | KPI managerial |
| `payroll_employee_snapshots` | ya | ya | snapshot data payroll |
| `payroll_results` | ya | ya | hasil payroll per employee |
| `payroll_adjustments` | ya | ya | koreksi manual |
| `recurring_payroll_adjustments` | ya | ya | BPJS dan Uang Transport berulang |
| `payroll_audit_logs` | ya | ya | audit payroll |
| `employees` | ya | tidak langsung | sumber profil aktif |
| `employee_division_histories` | ya | tidak | snapshot divisi |
| `employee_position_histories` | ya | tidak | snapshot jabatan |
| `employee_grade_histories` | ya | tidak | snapshot grade |
| `employee_schedule_assignments` | ya | tidak | scheduled work days |
| `work_schedule_days` | ya | tidak | scheduled work days |
| `monthly_point_performances` | ya | di-lock | sumber performa TEAMWORK |
| `attendance_tickets` | ya | tidak | unpaid/paid leave days |
| `employee_attendance_records` | ya | tidak | eligibility bonus fulltime dan disiplin |
| `incident_logs` | ya | tidak | potongan dan SP penalty |
| `overtime_requests` | ya | tidak | nominal overtime approved per periode |
| `daily_activity_entries` | ya | di-lock saat finalize | mengunci aktivitas yang sudah masuk payroll |
| `daily_activity_approval_logs` | ya | ya | log `LOCK_PAYROLL` |

## 7. Edge Case

- employee yang baru mulai setelah akhir periode tidak ikut preview.
- MANAGERIAL tanpa KPI validated akan menggagalkan auto-preview/generate preview.
- employee tanpa data absensi periode tetap muncul di preview, tetapi bonus fulltime dan disiplin bernilai `0`.
- preview periode `PAID` atau `LOCKED` tidak bisa digenerate ulang.
- auto-preview tidak berjalan untuk periode `FINALIZED`, `PAID`, atau `LOCKED`.
- finalize tanpa preview akan ditolak.
- lock hanya boleh setelah status `PAID`.

## 8. Hal yang Perlu Diperhatikan Developer

- `dailyAllowanceAmount` dan `overtimeRateAmount` sudah ada di salary config, tetapi preview saat ini tetap menyimpan `dailyAllowancePaid = 0`; nominal overtime dibaca dari `overtime_requests` approved per periode.
- adjustment period-specific dan recurring adjustment adalah sumber penambah/pengurang manual.
- absensi manual saat ini adalah sumber payroll untuk bonus fulltime/disiplin; integrasi fingerprint/ADMS akan menulis ke tabel yang sama dengan source berbeda.
- payroll saat ini belum menerapkan scope divisi; aksesnya global sesuai role payroll.
- rule “jangan hitung payroll di browser” dipatuhi: semua kalkulasi ada di server action/engine.

## 9. Contoh Alur Nyata

```text
Finance membuat periode 2026-04
→ resolvePayrollPeriod() menghasilkan 2026-03-26 s.d. 2026-04-25
→ HRD mengisi salary config dan KPI managerial
→ HRD mengisi absensi manual periode terkait
→ Finance membuka `/payroll`; sistem auto-preview server-side
→ sistem membuat snapshot employee dan payroll result
→ HRD review hasil, bila perlu tambah adjustment
→ Finance finalisasi payroll
→ sistem lock monthly performance dan activity yang sudah approved
→ Finance tandai PAID
→ Finance kunci periode
→ user payroll dapat export Excel dan slip gaji PDF
```
