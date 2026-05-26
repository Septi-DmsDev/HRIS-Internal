# Data Flow and User Flow

## 1. Tujuan Dokumen

Dokumen ini menjelaskan alur data antar modul dan alur user per role supaya pembaca paham kenapa data mengalir seperti itu, bukan sekadar file mana yang memanggil file mana.

## 2. Data Flow Utama

```text
Master Data
→ Employee Profile
→ Schedule Assignment + Division/Position/Grade History
→ Performance / Ticketing / Overtime / Review / Training
→ Monthly Point Performance + Incident + Managerial KPI + History
→ Payroll Employee Snapshot
→ Payroll Result
→ Finance Dashboard / Payslip / Export
```

## 3. Alur Login dan Session

```text
User buka route private
→ src/proxy.ts cek session Supabase
→ jika belum login redirect /login
→ jika login lanjut ke route
→ page/action pakai requireAuth()
→ role dibaca dari user_roles
→ sidebar/header/akses modul dirender sesuai role
```

## 4. User Flow per Role

### SUPER_ADMIN

```text
Login
→ akses semua modul
→ kelola master data
→ kelola employee
→ approve final performance/ticket/overtime/review bila perlu
→ lihat history lintas modul
→ ikut mengelola payroll
```

### HRD

```text
Login
→ kelola master data
→ kelola employee profiling
→ monitor dan override performance
→ kelola ticket dan overtime
→ validasi review
→ putuskan training
→ baca payroll dan finance
```

### FINANCE

```text
Login
→ buka payroll
→ buat periode / buka payroll untuk auto-preview / finalize / mark paid / lock
→ buka finance dashboard
→ export Excel payroll
→ lihat detail payroll per karyawan
```

### SPV

```text
Login
→ hanya melihat karyawan divisinya
→ memproses aktivitas harian divisinya
→ review ticket TEAMWORK dan memproses overtime divisinya
→ membuat review dan incident divisinya
→ melihat trainee divisinya
```

### TEAMWORK / MANAGERIAL

```text
Login
→ bisa masuk dashboard
→ TEAMWORK bisa self-service performance, ticket, overtime, dan schedule tertentu
→ MANAGERIAL terhubung ke ticket/schedule/payroll detail sesuai employee link
```

### PAYROLL_VIEWER

```text
Login
→ buka payroll read-only
→ buka finance dashboard read-only
→ tidak bisa mutate
```

## 5. Data Flow Modul Master ke Employee

```text
Master cabang/divisi/jabatan/grade/jadwal/shift
→ dipilih di form employee
→ employee tersimpan dengan FK ke master
→ histori perubahan disimpan terpisah
→ histori itu nanti dipakai untuk snapshot performance dan payroll
```

## 6. Data Flow Performance

```text
Import workbook katalog
→ point_catalog_versions + division_point_target_rules + point_catalog_entries
→ user input daily activity
→ daily_activity_entries menyimpan snapshot poin
→ approval log ditulis ke daily_activity_approval_logs
→ generate monthly performance
→ monthly_point_performances terbentuk
→ training/dashboard/payroll membaca hasil ini
```

## 7. Data Flow Overtime

```text
User input overtime
→ overtime_requests + overtime_draft_entries
→ approver decision
→ request status APPROVED / REJECTED
→ payroll membaca overtime approved di periode
→ THP bertambah pada preview server-side
```

## 8. Data Flow Ticketing

```text
Ticket dibuat
→ attendance_tickets status SUBMITTED
→ SPV/KABAG review TEAMWORK menjadi APPROVED_SPV
→ HRD/SUPER_ADMIN final approve menjadi APPROVED_HRD
→ jika eligible:
   leave_quotas dipakai sesuai jenis tiket
→ payrollImpact tersimpan di ticket
→ untuk ticket harian penuh, employee_schedule_assignments dikosongkan pada rentang ticket
→ target poin bulanan ikut turun karena hari OFF/kosong assignment tidak dihitung
→ payroll membaca ticket approved dalam periode aktif
→ /scheduler menampilkan OFF dari assignment jadwal
→ /schedule karyawan membaca assignment jadwal yang sama
→ dropdown per tanggal di /scheduler bisa set shift atau OFF langsung
```

## 9. Data Flow Review dan Incident

```text
Review dibuat
→ employee_reviews status SUBMITTED
→ HRD validasi
→ review menjadi artefak HR

Incident dibuat
→ incident_logs tersimpan
→ jika ada payrollDeduction atau SP1/SP2
→ payroll membaca incident aktif dalam periode
```

## 10. Data Flow Training

```text
Employee status = TRAINING
→ monthly_point_performances terkumpul
→ getTrainingEvaluations() hitung rata-rata performa
→ HRD putuskan lulus / tidak lolos
→ employees.employmentStatus dan payrollStatus berubah
```

## 11. Data Flow Payroll

```text
Create payroll period
→ payroll_periods

Siapkan salary config / KPI / adjustment
→ employee_salary_configs
→ managerial_kpi_summaries
→ payroll_adjustments
→ recurring_payroll_adjustments

Auto-preview saat `/payroll` dibuka
→ baca employees aktif
→ resolve snapshot divisi/jabatan/grade
→ baca monthly performance atau KPI
→ baca approved ticket, overtime, incident, adjustment periode, dan recurring adjustment aktif
→ hitung payroll via engine
→ tulis payroll_employee_snapshots
→ tulis payroll_results

Finalize
→ payroll_results FINALIZED
→ payroll_periods FINALIZED
→ monthly_point_performances LOCKED
→ daily_activity_entries DIKUNCI_PAYROLL

Mark paid
→ payroll_periods PAID

Lock
→ payroll_periods LOCKED
```

## 12. User Flow End-to-End yang Paling Penting

### Alur Onboarding Employee Baru

```text
HRD buat branch/division/position/grade bila belum ada
→ HRD buat work schedule dan shift master
→ HRD tambah employee
→ histori awal employee tercatat
→ employee siap dipakai di performance/ticketing/overtime/training/payroll
```

### Alur Performance TEAMWORK

```text
HRD import katalog poin aktif
→ aktivitas harian disimpan
→ activity diajukan
→ SPV approve
→ HRD generate monthly performance
→ hasil bulanan dibaca training/payroll
```

### Alur Ticket, Overtime, dan Payroll

```text
ticket/overtime dibuat
→ ticket/overtime disetujui
→ payrollImpact / overtimeAmount ditentukan
→ payroll preview menghitung unpaid/paid leave days dan overtime THP
→ THP dan eligibility bonus terpengaruh
```

### Alur Absensi ke Payroll

```text
HRD/Admin input absensi manual di /absensi
atau server ADMS kirim batch attendance/raw taps
→ record masuk employee_attendance_records source MANUAL/FINGERPRINT_ADMS
→ record MANUAL tidak ditimpa oleh batch ADMS
→ payroll preview membaca record dalam periode 26-25
→ tanpa data absensi, bonus fulltime dan disiplin bernilai 0
→ jika semua hari kerja HADIR, fulltime eligible
→ jika semua hari kerja HADIR, tidak TELAT, dan performa minimal 80%, discipline eligible
```

### Alur Incident ke Payroll

```text
incident dicatat
→ jika type SP1/SP2, performa payroll dikurangi absolut 10/20 poin sebelum tier bonus dipilih
→ jika payrollDeduction terisi pada incident non-SP, nominal deduction bertambah
→ payroll preview membaca incident aktif dalam periode
```

### Alur Payroll Closing

```text
Finance buat periode
→ buka payroll; sistem auto-preview server-side
→ review hasil
→ finalisasi
→ paid
→ lock
→ finance dashboard dan export membaca result final
```

## 13. Titik Putus Alur yang Perlu Disadari

- performance self-service belum sepenuhnya sama di semua role, jadi cek action dan route yang benar-benar aktif.
- ticket self-service dan overtime self-service bergantung pada `user_roles.employee_id`.
- training decision belum memiliki rule efektif next payroll period sepenuhnya di code.
- history audit lintas modul sudah ada, tetapi coverage tiap modul belum merata.
