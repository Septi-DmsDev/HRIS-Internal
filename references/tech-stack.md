# Tech Stack HRD Dashboard

**Versi:** 1.0  
**Tanggal:** 27 April 2026  
**Basis utama:** Next.js terbaru + Supabase/PostgreSQL  
**Konteks proyek:** Dashboard HRD dengan modul Profiling Karyawan, Manajemen Poin Kinerja, Review Karyawan, Ticketing Izin/Sakit/Cuti, dan Payroll System.

> Catatan penyelarasan code 2026-05-25:
> Repo aktual memakai Next.js `16.2.4`, React `19.2.4`, Tailwind CSS v4, Supabase Auth via `@supabase/ssr`, Drizzle ORM, Vitest, route handler PDF/XLSX payroll, `src/proxy.ts` untuk auth redirect, `user_roles.employee_id` untuk self-service, dan `user_role_divisions` untuk SPV/KABAG scope. Bagian di bawah tetap berfungsi sebagai rekomendasi arsitektur, tetapi status implementasi terbaru ada di `docs/codebase-curriculum/00-overview.md`.
> Tambahan status aktual: repo juga memiliki route ingest ADMS/fingerprint, scheduler operational view, ticket approval queue dua tahap, overtime request/draft/approval, employee placement helper, employee-group configs, payroll rekap XLSX, dan bulk slips PDF.

---

## 1. Ringkasan Rekomendasi

Tech stack yang direkomendasikan untuk proyek ini adalah kombinasi **Next.js + TypeScript + Supabase PostgreSQL**. Stack ini cocok karena proyek HRD Dashboard membutuhkan aplikasi web internal yang aman, modular, auditable, dan mampu menangani proses bisnis sensitif seperti approval, payroll, cuti, poin kinerja, bonus, dan histori karyawan.

Rekomendasi utama:

```text
Frontend:
Next.js + React + TypeScript + Tailwind CSS + shadcn/ui

Backend:
Next.js Server Actions + Route Handlers + Supabase Edge Functions untuk proses tertentu

Database:
Supabase PostgreSQL + Row Level Security + SQL Functions + Migrations

Auth:
Supabase Auth + custom roles table + permission system

Storage:
Supabase Storage private bucket

Realtime:
Supabase Realtime untuk approval, ticketing, dan notifikasi dashboard

Deployment:
Vercel + Supabase Cloud
```

Prinsip penting:

```text
Logic sensitif seperti payroll, bonus, cuti berbayar, SP penalty, closing payroll, dan adjustment tidak boleh dihitung di browser.
Semua perhitungan final harus dilakukan di server-side engine atau PostgreSQL transaction.
```

---

## 2. Core Stack

| Area | Rekomendasi | Fungsi |
|---|---|---|
| Fullstack Framework | Next.js terbaru | Framework utama aplikasi web dan backend ringan |
| Language | TypeScript | Menjaga tipe data agar aman untuk payroll, role, status, dan nominal |
| UI Styling | Tailwind CSS | Styling cepat, konsisten, dan cocok untuk dashboard |
| UI Component | shadcn/ui | Komponen dashboard modern dan mudah dikustom |
| Database | Supabase PostgreSQL | Penyimpanan utama seluruh data HRD dan payroll |
| Auth | Supabase Auth | Login, session, dan integrasi user identity |
| Authorization | PostgreSQL RLS + custom roles | Pembatasan akses berdasarkan role, divisi, dan karyawan |
| Storage | Supabase Storage | Bukti sakit, dokumen karyawan, slip gaji, lampiran tiket |
| Realtime | Supabase Realtime | Notifikasi approval, ticketing, dan dashboard live |
| Deployment | Vercel + Supabase Cloud | Hosting frontend/backend Next.js dan database managed |

---

## 3. Frontend Stack

### 3.1 Framework

```text
Next.js terbaru
React
TypeScript
App Router
Server Components
Server Actions
```

Next.js dipilih karena cocok untuk:

- dashboard internal multi-role;
- halaman dengan data kompleks;
- server-side rendering;
- server-side business logic;
- route handler untuk API internal;
- integrasi mudah dengan Supabase;
- deployment cepat di Vercel.

### 3.2 UI Library

| Kebutuhan | Library |
|---|---|
| Styling | Tailwind CSS |
| Komponen UI | shadcn/ui |
| Icon | lucide-react |
| Tabel data | TanStack Table |
| Chart | Recharts |
| Form | React Hook Form |
| Validasi form | Zod |
| Toast notification | Sonner |
| Date picker | React Day Picker |
| Kalender/jadwal | FullCalendar atau custom calendar |

Rekomendasi kombinasi:

```text
Tailwind CSS + shadcn/ui + TanStack Table + Recharts
```

Kombinasi ini ideal untuk:

- tabel karyawan;
- histori poin;
- approval SPV;
- payroll preview;
- dashboard HRD;
- monitoring ticketing;
- detail slip gaji;
- grafik performa.

---

## 4. Backend & Business Logic

Backend utama dapat menggunakan fitur bawaan Next.js:

```text
Server Actions
Route Handlers
Server Components
Middleware
```

Pembagian logic yang direkomendasikan:

| Jenis Logic | Tempat Eksekusi |
|---|---|
| Baca data dashboard | Server Component / Supabase query |
| Input aktivitas TW | Server Action + validasi server |
| Approval SPV | Server Action |
| Ticketing izin/sakit/cuti | Server Action |
| Auto approve/reject ticket | Server Action / Edge Function / Cron |
| Payroll preview | Server-side only |
| Payroll finalization | Server-side only + transaction |
| HRD adjustment | Server-side only |
| Generate slip gaji | Server-side only |
| Audit log | Database trigger + server action |

Prinsip utama:

```text
Browser hanya mengirim request dan menampilkan hasil.
Server yang memvalidasi, menghitung, dan menyimpan keputusan final.
```

---

## 5. Supabase Stack

Supabase digunakan sebagai backend platform utama.

| Produk Supabase | Fungsi dalam proyek |
|---|---|
| PostgreSQL Database | Data utama seluruh modul |
| Auth | Login user dan session |
| Row Level Security | Pembatasan akses data |
| Storage | File lampiran dan dokumen |
| Realtime | Notifikasi dan dashboard live |
| Edge Functions | Background process, webhook, dan automation tertentu |
| Cron / pg_cron | Reminder, generate period, auto checking |
| Database Functions / RPC | Perhitungan atomik dan proses transaction-sensitive |

---

## 6. Database & ORM

Rekomendasi utama:

```text
Supabase PostgreSQL
Supabase CLI migrations
Generated TypeScript types
Drizzle ORM untuk query kompleks
```

### 6.1 Kenapa PostgreSQL/Supabase cocok

Sistem HRD ini membutuhkan:

- relasi data yang kuat;
- transaksi payroll yang aman;
- audit trail;
- role-based access;
- query agregasi performa;
- histori karyawan;
- snapshot payroll;
- locking periode;
- validasi data lintas modul.

PostgreSQL sangat cocok untuk kebutuhan tersebut.

### 6.2 Drizzle ORM

Drizzle direkomendasikan untuk:

- query yang type-safe;
- relasi data kompleks;
- payroll preview;
- report dashboard;
- migration yang mudah dikontrol;
- tetap dekat dengan SQL.

Namun untuk proses sangat sensitif seperti payroll closing, tetap disarankan memakai:

```text
PostgreSQL transaction
Database function / RPC
Server-side transaction handler
```

---

## 7. Security Architecture

Karena sistem ini menangani data HRD dan payroll, keamanan wajib menjadi fondasi sejak awal.

Layer keamanan yang direkomendasikan:

```text
1. Supabase Auth
2. Custom role & permission table
3. PostgreSQL Row Level Security
4. Server-side validation
5. Audit log
6. Payroll period locking
7. Private storage bucket
8. Environment separation
```

### 7.1 Role utama

```text
SUPER_ADMIN
HRD
FINANCE
SPV
TEAMWORK
MANAGERIAL
PAYROLL_VIEWER
```

### 7.2 Prinsip akses

| Role | Akses utama |
|---|---|
| TEAMWORK | Data diri sendiri, input aktivitas, tiket pribadi |
| SPV | Approval dan review TW di divisinya |
| HRD | Semua data karyawan, profiling, review, ticketing, override |
| FINANCE | Payroll, additions, deductions, history, payslip |
| SUPER_ADMIN | Master data, role, konfigurasi sistem |
| MANAGERIAL | KPI/report sesuai scope |
| PAYROLL_VIEWER | Melihat payroll tanpa mengubah data |

### 7.3 Catatan keamanan penting

```text
Service role key Supabase tidak boleh pernah diekspos ke browser.
Semua payroll action harus dijalankan dari server environment.
RLS harus aktif pada tabel yang bisa diakses client.
```

---

## 8. Modul Berdasarkan 3 Phase

## Phase 1 - Profiling Karyawan & Master Data Foundation

### Tujuan

Membangun fondasi data karyawan, role, divisi, grade, jadwal kerja, dan histori perubahan.

### Route utama

```text
/auth
/dashboard
/employees
/employees/[id]
/master/branches
/master/divisions
/master/positions
/master/grades
/master/schedules
/master/roles
/settings
```

### Tabel utama

```text
profiles
employees
branches
divisions
positions
grades
employee_employment_status
employee_division_history
employee_grade_history
employee_spv_history
user_roles
role_permissions
work_schedules
audit_logs
```

### Teknologi utama

```text
Supabase Auth
PostgreSQL RLS
Next.js Server Components
React Hook Form
Zod
TanStack Table
```

### Output phase 1

- login dan role dasar;
- master data karyawan;
- master cabang, divisi, jabatan, grade;
- status training/reguler;
- histori divisi dan grade;
- jadwal kerja individual;
- halaman profil karyawan.

---

## Phase 2 - Performance Management Engine

Phase ini mencakup:

```text
Manajemen Poin Kinerja
Review Karyawan
Ticketing Izin/Sakit/Cuti
Training Evaluation
```

### Route utama

```text
/performance/daily-input
/performance/approval
/performance/monthly-summary
/performance/master-points
/reviews
/reviews/[employee_id]
/tickets
/tickets/new
/training
```

### Tabel utama

```text
master_point_versions
master_points
daily_activities
activity_approval_logs
monthly_point_performance
employee_reviews
review_score_details
review_incident_logs
leave_tickets
leave_ticket_validation_logs
leave_quotas
attendance_summaries
training_evaluations
```

### Teknologi utama

```text
Server Actions
Supabase Realtime
Supabase Storage
PostgreSQL Functions
RLS by role/division
```

### Output phase 2

- input aktivitas TW;
- approval SPV;
- master poin versioning;
- snapshot poin transaksi;
- rekap poin bulanan;
- review karyawan;
- incident log;
- ticketing izin/sakit/cuti;
- leave quota;
- monitoring training;
- dashboard performa HRD.

### Catatan teknis penting

```text
TW hanya bisa input pekerjaan sesuai divisi aktual harian.
SPV hanya bisa melihat dan approve/tolak TW di divisinya.
HRD bisa melihat semua dan override.
Master poin wajib versioning dan snapshot.
Ticket approved harus menghasilkan payroll impact dan point target impact.
```

---

## Phase 3 - Payroll System & Finance Closing

### Tujuan

Menjadikan payroll sebagai final calculation engine yang mengambil data final dari profiling, poin, ticketing, review, absensi, dan finance adjustment.

### Route utama

```text
/payroll
/payroll/periods
/payroll/process
/payroll/history
/payroll/[period_id]/preview
/payroll/[period_id]/finalize
/payroll/adjustments
/payroll/components
/payroll/slips
/finance/additions
/finance/deductions
```

### Tabel utama

```text
payroll_periods
payroll_employee_snapshots
salary_configs
salary_grade_masters
payroll_variables
payroll_runs
payroll_items
payroll_components
payroll_adjustments
salary_additions
salary_deductions
loan_installments
payslips
```

### Teknologi utama

```text
Server-side payroll engine
PostgreSQL transaction
Database snapshot
Audit log
PDF generation
Role-based access
```

### Output phase 3

- payroll period 26-25;
- employee payroll snapshot;
- payroll preview;
- payroll exception checking;
- payroll finalization;
- payroll locking;
- salary additions;
- salary deductions;
- adjustment;
- payslip;
- payroll history;
- dashboard finance.

---

## 9. Rule Engine Placement

Karena sistem ini memiliki banyak aturan bisnis, sebaiknya dibuat folder khusus untuk engine.

```text
server/
├── point-engine/
│   ├── calculate-daily-point.ts
│   ├── calculate-monthly-performance.ts
│   └── resolve-bonus-level.ts
│
├── ticketing-engine/
│   ├── validate-ticket.ts
│   ├── resolve-leave-quota.ts
│   └── resolve-payroll-impact.ts
│
├── review-engine/
│   ├── calculate-review-score.ts
│   ├── apply-incident-deduction.ts
│   └── resolve-review-category.ts
│
├── payroll-engine/
│   ├── create-period-snapshot.ts
│   ├── calculate-training-payroll.ts
│   ├── calculate-teamwork-payroll.ts
│   ├── calculate-managerial-payroll.ts
│   ├── calculate-deductions.ts
│   ├── calculate-additions.ts
│   └── finalize-payroll.ts
```

Prinsip:

```text
UI tidak boleh menyimpan logic bisnis utama.
UI hanya memanggil service/action.
Rule engine harus bisa dites secara terpisah.
```

---

## 10. Struktur Folder Next.js

Rekomendasi struktur proyek:

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── employees/
│   │   ├── performance/
│   │   ├── reviews/
│   │   ├── tickets/
│   │   ├── payroll/
│   │   └── settings/
│   ├── api/
│   └── layout.tsx
│
├── components/
│   ├── ui/
│   ├── tables/
│   ├── forms/
│   ├── charts/
│   └── layout/
│
├── features/
│   ├── employees/
│   ├── performance/
│   ├── reviews/
│   ├── ticketing/
│   ├── payroll/
│   └── auth/
│
├── lib/
│   ├── supabase/
│   ├── db/
│   ├── auth/
│   ├── validations/
│   ├── permissions/
│   └── utils/
│
├── server/
│   ├── actions/
│   ├── services/
│   ├── point-engine/
│   ├── ticketing-engine/
│   ├── review-engine/
│   └── payroll-engine/
│
├── types/
└── config/
```

---

## 11. Package / Library Rekomendasi

### Core

```bash
next
react
react-dom
typescript
@supabase/supabase-js
@supabase/ssr
zod
react-hook-form
```

### UI

```bash
tailwindcss
shadcn/ui
lucide-react
sonner
cmdk
class-variance-authority
tailwind-merge
```

### Table, Chart, Date

```bash
@tanstack/react-table
recharts
date-fns
react-day-picker
```

### Database

```bash
drizzle-orm
drizzle-kit
postgres
```

### PDF / Export

```bash
@react-pdf/renderer
xlsx
papaparse
```

### Testing

```bash
vitest
@testing-library/react
playwright
```

### Code Quality

```bash
eslint
prettier
husky
lint-staged
```

### Monitoring

```bash
@sentry/nextjs
```

---

## 12. Deployment Stack

| Area | Rekomendasi |
|---|---|
| Frontend hosting | Vercel |
| Backend runtime | Next.js server runtime di Vercel |
| Database | Supabase Cloud |
| Storage | Supabase Storage |
| Auth | Supabase Auth |
| Background jobs | Supabase Edge Functions / Cron |
| Monitoring error | Sentry |
| Technical analytics | Vercel Analytics / Supabase Logs |

---

## 13. Environment Strategy

Minimal gunakan 3 environment:

```text
development
staging
production
```

### Development

```text
Local Next.js
Supabase local CLI
Seed data dummy
```

### Staging

```text
Supabase staging project
Vercel preview/staging
Data dummy atau copy terbatas
```

### Production

```text
Supabase production
Vercel production
RLS aktif penuh
Backup aktif
Access terbatas
```

---

## 14. Arsitektur Sistem

```text
User Browser
   ↓
Next.js App Router
   ↓
Server Components / Server Actions / Route Handlers
   ↓
Supabase Auth
   ↓
PostgreSQL + RLS
   ↓
Point Engine / Ticketing Engine / Review Engine / Payroll Engine
   ↓
Audit Log + Realtime Notification + Storage
```

Untuk payroll:

```text
Payroll tidak membaca data mentah secara bebas.
Payroll membaca data final/snapshot dari:
- employee payroll snapshot
- monthly performance
- ticketing summary
- attendance summary
- approved additions
- approved deductions
- adjustment log
```

---

## 15. Payroll Technical Principle

Payroll harus menjadi **final calculation engine**, bukan tempat input semua data mentah.

Sumber data payroll:

| Sumber | Data yang diambil |
|---|---|
| Profiling Karyawan | status, jabatan, grade, divisi, cabang, masa kerja |
| Poin Kinerja | persentase TEAMWORK reguler |
| KPI | persentase MANAGERIAL |
| Ticketing | paid leave, unpaid leave, cuti, sakit, izin |
| Jadwal/Absensi | hadir, telat, alpa, hari kerja aktif |
| Review/Incident | SP, missprint, pelanggaran, bonus disiplin |
| Finance | additions, deductions, kasbon, cicilan |

Formula umum:

```text
THP =
Gaji Pokok Dibayar
+ Tunjangan Grade
+ Tunjangan Masa Kerja
+ Uang Harian
+ Overtime
+ Bonus Fulltime
+ Bonus Disiplin
+ Bonus Kinerja
+ Bonus Prestasi
+ Bonus Team / KPI
+ Penambah Manual
- Potongan
- Potongan Unpaid Leave
± Adjustment
```

---

## 16. Database Design Principle

Prinsip utama database:

```text
1. Semua data penting punya audit log.
2. Master yang memengaruhi histori harus memakai versioning.
3. Transaksi payroll harus memakai snapshot.
4. Periode payroll harus bisa dikunci.
5. Perubahan setelah locked hanya lewat adjustment.
6. Role access harus dikunci dengan RLS dan server validation.
```

Contoh data yang wajib snapshot:

```text
Jabatan
Grade
Divisi payroll
Gaji pokok
Tunjangan
Status training/reguler
Status kelompok karyawan
Master poin saat transaksi
Periode payroll
```

---

## 17. MVP Tech Stack

Untuk MVP awal, cukup gunakan:

```text
Next.js terbaru
TypeScript
Tailwind CSS
shadcn/ui
Supabase Auth
Supabase PostgreSQL
Supabase Storage
RLS basic
React Hook Form
Zod
TanStack Table
Recharts
```

Fokus MVP:

```text
Profil karyawan
Master data
Input poin TW
Approval SPV
Ticketing dasar
Review dasar
Payroll preview
Payroll history
```

---

## 18. Enhancement Setelah MVP

Setelah MVP stabil, tambahkan:

```text
Drizzle ORM
Supabase Realtime
Supabase Edge Functions
Cron jobs
PDF payslip
Sentry
Playwright E2E test
Advanced audit log
Advanced payroll locking
Notification system
```

---

## 19. Risiko Teknis dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Logic payroll tercecer di UI | Perhitungan tidak konsisten | Pusatkan di payroll engine server-side |
| RLS salah konfigurasi | Data sensitif bocor | Test policy per role dan gunakan staging |
| Master poin berubah memengaruhi histori | Data lama rusak | Gunakan versioning dan snapshot |
| Payroll finalisasi berulang | Potongan/cicilan bisa dobel | Buat finalization idempotent dan period locking |
| Query dashboard lambat | Dashboard berat | Gunakan summary table/materialized view jika perlu |
| Ticketing tidak sinkron dengan payroll | Gaji/target salah | Buat payroll attendance summary final |
| Tidak ada audit log | Sulit investigasi | Audit semua action penting |

---

## 20. Rekomendasi Final

Tech stack final yang paling sesuai:

```text
Frontend:
Next.js terbaru + React + TypeScript + Tailwind CSS + shadcn/ui

Backend:
Next.js Server Actions + Route Handlers + Supabase Edge Functions untuk background jobs

Database:
Supabase PostgreSQL + RLS + SQL Functions + Supabase CLI Migrations

Auth:
Supabase Auth + custom roles table + RLS policies

Storage:
Supabase Storage private buckets

Realtime:
Supabase Realtime untuk approval, ticketing, dan dashboard notification

Business Logic:
Server-side rule engines untuk point, ticketing, review, dan payroll

Deployment:
Vercel + Supabase Cloud

Monitoring:
Sentry + Vercel logs + Supabase logs
```

Prioritas teknis paling penting:

```text
1. Jangan hitung payroll di client.
2. Gunakan snapshot untuk payroll dan master poin.
3. Aktifkan RLS sejak awal.
4. Simpan audit log untuk approval, override, payroll, dan adjustment.
5. Pisahkan engine bisnis dari UI.
6. Buat staging environment sebelum production.
```
