# HRD Dashboard - Handover Document

**Tanggal update:** 2026-05-25
**Branch aktif:** `main`  
**Remote:** `https://github.com/Septi-DmsDev/HRIS-Internal.git`  
**Status saat ini:** repo sudah memiliki flow MVP lintas phase; dokumentasi utama disinkronkan ulang dengan alur code aktual pada 2026-05-25

---

## Ringkasan Proyek

HRD Dashboard internal berbasis Next.js App Router untuk mengelola:
- employee profiling dan master data
- placement/mutation karyawan
- performance point TEAMWORK
- manual attendance (`/absensi`) dan ADMS/fingerprint ingest
- training evaluation
- ticketing izin/sakit/cuti
- ticket approval queue dua tahap
- overtime request dan draft overtime
- review dan incident
- history audit lintas modul
- schedule dan scheduler operational view
- payroll preview/finalize/paid/locked
- finance summary

Arsitektur utama:
- Next.js 16 App Router
- Supabase Auth
- Drizzle ORM + PostgreSQL
- server actions untuk mutation sensitif
- snapshot untuk performance/payroll
- audit log untuk approval dan payroll lifecycle

---

## Status Phase

| Phase | Nama | Status |
|---|---|---|
| Phase 1 | Profiling Karyawan & Master Data Foundation | Selesai |
| Phase 2 | Performance Management Engine | Selesai |
| Phase 3 | Payroll System & Finance Closing | Implemented MVP-to-usable flow |
| QA | Functional review / hardening | Berikutnya |

Catatan phase 3 saat ini:
- payroll TEAMWORK dan MANAGERIAL sudah ada
- salary config, preview, finalize, paid, lock sudah ada
- finance dashboard sudah ada
- payslip PDF dan export Excel sudah ada
- rekap Excel dan bulk slips PDF sudah ada
- personal self-service access ke slip gaji sudah ada
- input massal persentase managerial bulanan dari `/performance` sudah ada
- input manual absensi harian dari `/absensi` sudah ada untuk koneksi awal ke payroll
- modul ini sudah usable, tetapi belum berarti semua hardening enterprise selesai

---

## Status Git Terbaru

Recent commits terpenting di `main`:
Terbaru:
- `932e783` Update View History Draft - scheduler OFF sync, target days by assignment, ticket schedule service, dan docs terkait
- `3bc709d` Update Pengisian Draft - self-service draft performance dan dokumentasi modul terkait
- `4c55e06` Update Deploy - Dockerfile deployment adjustment
- `c4092f2` Update - Dockerfile/package deployment adjustment
- `e8d3d0e` Update Masa Kerja - tenure allowance resolver/test dan dokumentasi payroll

Riwayat sebelumnya:
- `c723958` Tambah rekap breakdown cabang/divisi/jabatan/grade/kelompok di summary rekap.xlsx
- `8346a61` Remove export-accounts-a6 route
- `e813dde` Update Edit Deduction — tombol edit adjustment di Finance + server action `updatePayrollAdjustment`
- `dbc7f95` Tambah tombol Sync Akses di /employees untuk sinkronisasi role pengguna

Status kerja saat handover ini ditulis:
- semua modul MVP sudah usable; lihat tabel Status Phase di bawah
- dokumentasi disinkronkan ulang 2026-05-25

Update dokumentasi 2026-05-25:
- `AGENTS.md`, `README.md`, `HANDOVER.md`, `references/business-rules.md`, `references/implementation-playbook.md`, dan `references/tech-stack.md` diperbarui untuk mencerminkan ADMS aktif, route aktif terbaru, employee placement/access helper, overtime, ticket approval, scheduler OFF sync, dan export payroll lengkap.
- `docs/onboarding-curriculum.md` dan `docs/codebase-curriculum/README.md` diperbarui untuk tanggal/status terbaru.
- `docs/codebase-curriculum/00/01/03/04/05/06/12/13/14` diperbarui untuk schema/action/flow/test aktual, termasuk employee-group configs, grade compensation, import/export karyawan, self-service draft performance, ADMS raw tap classifier, dan test engine payroll/attendance terbaru.

Update dokumentasi 2026-05-23:
- `README.md`, `AGENTS.md`, `HANDOVER.md`, dan `docs/onboarding-curriculum.md` diperbarui untuk mencerminkan ADMS endpoint tambahan, ticket approval dua tahap, dan adjustment/overtime payroll.
- `docs/codebase-curriculum/00/01/02/03/07/10` diperbarui untuk status schema, auth, ticketing, payroll, dan route aktual.
- `next-update.md` diperbarui: item tenure allowance, training graduation proration, overtime nominal, patch absence overtime, dan structured adjustment ditandai sesuai implementasi/parsial.

Update dokumentasi 2026-05-19:
- `HANDOVER.md` diperbarui: commits terbaru, fitur baru Finance, rekap.xlsx, overtime, dan history.
- `CLAUDE.md` diperbarui: section Payroll Adjustments ditambah `updatePayrollAdjustment`.
- `docs/codebase-curriculum/10-payroll-module.md` diperbarui: export rekap, slips PDF, overtime, edit adjustment.
- `docs/codebase-curriculum/00-overview.md` diperbarui: status modul terkini.

---

## Setup Lokal

### Prerequisites
- Node.js
- pnpm
- akses `.env.local` yang valid
- koneksi database PostgreSQL/Supabase yang sesuai environment aktif

### Command utama
```bash
pnpm install
pnpm dev
pnpm vitest run
pnpm lint
pnpm build
```

### Env penting
Project mengandalkan variabel berikut:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
ADMS_INGEST_TOKEN=
```

Catatan:
- jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke client
- payroll dan mutation sensitif tetap harus server-side
- detail koneksi VPS/tunnel lama dari handover sebelumnya jangan diasumsikan masih final; verifikasi lagi sesuai environment aktif jika perlu

---

## Tech Stack

| Layer | Library / Tool |
|---|---|
| Framework | Next.js 16.2.4 App Router |
| Auth | Supabase Auth + `@supabase/ssr` |
| ORM | Drizzle ORM + `postgres` |
| Database | PostgreSQL / Supabase |
| UI | Tailwind CSS + shadcn/ui + Radix |
| Table | TanStack Table |
| Validation | Zod |
| Dates | `date-fns` |
| Testing | Vitest |
| Charts | Recharts |

---

## Current UI Direction

Design system aktif tetap memakai arah "Ink & Teal":
- primary teal
- dark navy sidebar
- light neutral content background
- white cards
- Plus Jakarta Sans

Layout utama saat ini:
- sidebar grouped navigation
- role badge di sidebar/header
- dynamic header title per route
- route settings/schedule untuk user employee-linked

---

## Struktur Fitur Saat Ini

### Auth and Role System
Role aktif di repo:
- `SUPER_ADMIN`
- `HRD`
- `KABAG`
- `SPV`
- `MANAGERIAL`
- `FINANCE`
- `TEAMWORK`
- `PAYROLL_VIEWER`

Auth/session pattern utama:
- `requireAuth()`
- `checkRole([...])`
- `getCurrentUserRoleRow()`
- `getCurrentUserRole()`
- `getUser()`

Perubahan penting terbaru:
- `RoleRow` sekarang memakai `divisionIds: string[]`
- `user_roles.divisionId` masih ada sebagai deprecated field untuk compatibility
- scoping division aktif memakai junction table `user_role_divisions`
- `SPV` dan `KABAG` adalah role division-scoped
- `KABAG` sudah fully wired di app layer

### Employee and Master Data
Sudah ada:
- branches
- divisions
- positions
- grades
- work schedules
- employees
- employee detail
- employee history tables
- employee placement/mutation route `/positioning`
- employee import/export XLSX

### Performance Phase 2
Sudah ada:
- point catalog versioning
- import/sync workbook poin
- division point target rules
- daily activity entries
- SPV/KABAG approval flow
- HRD override flow
- monthly point performance
- input massal persentase managerial bulanan
- training evaluation

Rule target yang aktif:
- default target harian `13_000`
- divisi `OFFSET` target harian `39_000`
- target performa mengikuti divisi snapshot payroll/awal periode
- pilihan pekerjaan harian mengikuti divisi aktual harian
- payroll MANAGERIAL membaca managerial_kpi_summaries per periode

### Ticketing / Review
Sudah ada:
- ticket create / approve / reject / cancel
- leave quota logic
- quarter leave quota logic
- review create / validate
- incident log
- incident delete memakai soft-delete `isActive=false` dan tetap role/division scoped
- reviewer auto-fill jika reviewer linked ke employee

### Absensi
Sudah ada:
- route `/absensi` untuk `SUPER_ADMIN` dan `HRD`
- input/update absensi manual per karyawan dan tanggal
- status kehadiran `HADIR`, `ALPA`, `IZIN`, `SAKIT`, `CUTI`, `OFF`
- status disiplin `TEPAT_WAKTU` / `TELAT`
- tabel mendukung source `MANUAL` dan `FINGERPRINT_ADMS`
- payroll preview membaca absensi periode untuk eligibility bonus fulltime/disiplin
- ADMS batch attendance/raw taps menulis ke tabel yang sama dan tidak menimpa record source `MANUAL`

### Integrasi BioFinger AT301 (Batch Attendance)
- Endpoint ingest rekap: `POST /api/integrations/adms/attendance`
- Endpoint ingest raw taps: `POST /api/integrations/adms/taps`
- Endpoint employee/device mapping: `GET /api/integrations/adms/employees`
- Auth: Bearer token via env `ADMS_INGEST_TOKEN`
- Alur: Cloud server kirim rekap per karyawan per tanggal → Dashboard hitung TELAT
- Mapping: User ID mesin = `employeeCode`
- Jadwal sync cloud: 09.00, 14.00, 17.00, 21.00
- Resolver punctuality: `src/server/attendance-engine/resolve-attendance-punctuality.ts`
- Rule: check-in tanpa toleransi, break/check-out toleransi 5 menit (configurable per jadwal via `breakToleranceMinutes` dan `checkInToleranceMinutes` di `workScheduleDays`)
- Data kosong tidak auto-ALPA: HRD yang tindak lanjut
- Manual attendance (source=`MANUAL`) tidak ditimpa oleh ADMS batch
- Validasi payload: `src/lib/validations/attendance.ts` (`admsAttendanceIngestSchema`, `admsRawTapIngestSchema`)
- Schema DB field baru (migration `0023_attendance_schedule_break_tolerance.sql`): `breakStart`, `breakEnd`, `breakToleranceMinutes`, `checkInToleranceMinutes` di tabel `workScheduleDays`

### Payroll / Finance
Sudah ada:
- payroll periods
- employee salary config
- managerial KPI summaries
- payroll auto-preview generation when `/payroll` opens editable periods
- bonus kinerja payroll memakai nominal tier 80/90/100 langsung dari performa setelah SP penalty absolut; SP1 mengurangi 10 poin dan SP2 mengurangi 20 poin performa
- bonus fulltime dan bonus disiplin payroll default `0` bila data absensi periode belum ada
- bonus disiplin payroll tidak dipicu oleh input persentase manual/KPI; eligibility mengikuti absensi dan incident telat
- payroll finalize
- mark paid
- lock period
- payroll detail per employee
- payslip structure
- payslip PDF route
- payroll Excel export route (`/payroll/[periodId]/export.xlsx`)
- payroll rekap Excel route (`/payroll/[periodId]/rekap.xlsx`) — sheet Summary berisi breakdown per tab, cabang, divisi, jabatan, grade, dan kelompok karyawan tersusun ke kanan
- finance dashboard route
- adjustment payroll: tambah, edit, hapus — dengan business rules per kategori (BPJS, Kasbon, Ganti Rugi, Cicilan, dll.)
- recurring adjustment (BPJS, Transport) disimpan di `recurring_payroll_adjustments`

Server-side payroll entry points penting:
- `getPayrollWorkspace()` — termasuk `branchName` di results sejak 2026-05-19
- `getPayrollEmployeeDetail()`
- `createPayrollPeriod()`
- `/payroll/page.tsx` auto-calls `generatePayrollPreview()` for periods before `FINALIZED`
- `generatePayrollPreview()`
- `finalizePayroll()`
- `markPayrollPaid()`
- `lockPayrollPeriod()`
- `addPayrollAdjustment()`
- `updatePayrollAdjustment()` — edit nominal dan keterangan adjustment; enforce batas kasbon
- `deletePayrollAdjustment()`

## Route Status Saat Ini

| Route | Status | Catatan |
|---|---|---|
| `/login` | Active | Login |
| `/dashboard` | Active | Operational dashboard |
| `/employees` | Active | Employee list |
| `/employees/[id]` | Active | Employee admin detail |
| `/employees/export.xlsx` | Active | Export data karyawan XLSX |
| `/positioning` | Active | Mutasi massal cabang/divisi/jabatan/grade/kelompok |
| `/divisi` | Redirect | Kompatibilitas route lama ke `/positioning` |
| `/history` | Active | Audit trail lintas modul |
| `/master` | Active | Landing/master shift shortcut |
| `/master/branches` | Active | CRUD |
| `/master/divisions` | Active | CRUD |
| `/master/positions` | Active | CRUD |
| `/master/employee-groups` | Active | Konfigurasi kelompok karyawan |
| `/master/catalogpoin` | Active | Katalog poin legacy/sync workbook |
| `/master/grades` | Active | CRUD |
| `/master/work-schedules` | Active | CRUD |
| `/performance` | Active | Activity, monthly performance, point catalog |
| `/performance/training` | Active | Training evaluation |
| `/teamperformance` | Active | Tampilan performa tim/self-service |
| `/tickets` | Active | Ticketing |
| `/ticketingapproval` | Active | Queue review SPV/KABAG dan final approval HRD/Admin |
| `/absensi` | Active | Input manual absensi HRD/Admin |
| `POST /api/integrations/adms/attendance` | Active | Batch ingest rekap BioFinger AT301 (Bearer token) |
| `POST /api/integrations/adms/taps` | Active | Batch ingest raw taps BioFinger AT301 (Bearer token) |
| `GET /api/integrations/adms/employees` | Active | Sinkronisasi employee/device mapping ADMS (Bearer token) |
| `/overtime` | Active | Request, draft, schedule, dan approval overtime |
| `/reviews` | Active | Review + incident |
| `/schedule` | Active | Jadwal personal/tim |
| `/scheduler` | Active | Scheduler operational view |
| `/settings` | Active | Account settings user aktif |
| `/users` | Active | Role/user management |
| `/payroll` | Active | Payroll workspace |
| `/payroll/[periodId]/[employeeId]` | Active | Payroll detail / payslip structure |
| `/payroll/[periodId]/[employeeId]/payslip.pdf` | Active | Payslip PDF |
| `/payroll/[periodId]/export.xlsx` | Active | Payroll export Excel (per karyawan) |
| `/payroll/[periodId]/rekap.xlsx` | Active | Rekap Excel per kategori + breakdown summary |
| `/payroll/[periodId]/slips.pdf` | Active | Bulk payslip PDF |
| `/finance` | Active | Finance summary — gaji pokok, grade, adjustment (tambah/edit/hapus) |

---

## Database Notes

Schema penting:
- `auth.ts`
- `master.ts`
- `employee.ts`
- `point.ts`
- `hr.ts`
- `payroll.ts`

Perubahan auth penting:
- `user_role_divisions` dipakai untuk multi-division scoping
- `employeeId` di `user_roles` dipakai untuk self-service dan self-access

Perubahan payroll/performance penting:
- payroll memakai snapshot table, bukan baca live employee data saat hasil sudah dibentuk
- performance memakai snapshot point catalog dan division target rules
- activity approved bisa di-lock saat payroll finalized
- `employee_attendance_records` menjadi sumber eligibility bonus fulltime/disiplin saat preview payroll

---

## Business Rules Kritis

### TEAMWORK Performance
- target harian default: `13.000`
- target harian divisi `OFFSET`: `39.000`
- target performa mengikuti divisi snapshot periode
- aktivitas harian mengikuti divisi aktual harian
- TW input H+1
- SPV/KABAG approve scoped
- HRD bisa override

### Ticketing
- semua izin/sakit/cuti berbasis tiket
- ticket TEAMWORK diproses dua tahap: `SPV`/`KABAG` scoped review menjadi `APPROVED_SPV`, lalu `HRD`/`SUPER_ADMIN` final approve menjadi `APPROVED_HRD`
- ticket dari `SPV`, `KABAG`, `MANAGERIAL`, `FINANCE`, `PAYROLL_VIEWER`, `HRD`, dan `SUPER_ADMIN` masuk jalur final HRD/SUPER_ADMIN langsung
- `SPV`/`KABAG` tidak boleh memproses tiket miliknya sendiri dan hanya boleh memproses TEAMWORK dalam `divisionIds`

### Absensi
- absensi manual saat ini dipakai untuk test koneksi karyawan-HRD-finance
- tanpa data absensi periode, bonus fulltime dan disiplin bernilai `0`
- fulltime butuh semua hari kerja terjadwal `HADIR`
- disiplin butuh performa minimal 80%, eligible fulltime, dan tidak ada `TELAT`
- integrasi fingerprint BioFinger AT301 sudah dibangun via endpoint batch `POST /api/integrations/adms/attendance`, raw taps `POST /api/integrations/adms/taps`, dan employee mapping `GET /api/integrations/adms/employees`
- cloud server mengirim rekap absensi; dashboard menghitung punctuality dari jadwal kerja
- absensi MANUAL tidak ditimpa oleh batch ADMS; data kosong tidak otomatis menjadi ALPA

### Review
- review dan incident sudah scoped sesuai role
- reviewer employee id bisa auto-fill bila akun reviewer linked ke employee

### Payroll
- periode payroll: 26 bulan sebelumnya s.d. 25 bulan berjalan
- payroll tidak boleh dihitung di browser
- gunakan snapshot
- finalisasi harus idempotent
- setelah `PAID`/`LOCKED`, koreksi via adjustment periode berikutnya
- payslip/detail payroll pribadi hanya boleh diakses owner atau payroll roles

### Employee-Linked Access
- `SUPER_ADMIN` tanpa employee link diarahkan ke `/dashboard`
- non-payroll roles tidak otomatis dapat akses workspace payroll umum
- user employee-linked tetap bisa membaca detail payroll miliknya sendiri bila tersedia

---

## File Penting untuk Sesi Berikutnya

### Core auth / role
- `src/lib/auth/session.ts`
- `src/lib/db/schema/auth.ts`
- `src/lib/permissions/index.ts`

### Layout dan Header
- `src/components/layout/Header.tsx`
- `src/components/layout/HeaderTitle.tsx`
- `src/components/layout/header-title.ts`

### Performance
- `src/server/actions/performance.ts`
- `src/server/actions/point-catalog.ts`
- `src/server/point-engine/*`

### Ticketing / review
- `src/server/actions/tickets.ts`
- `src/server/actions/attendance.ts`
- `src/server/attendance-engine/*`
- `src/server/actions/reviews.ts`
- `src/server/actions/training.ts`

### Payroll / finance
- `src/server/actions/payroll.ts`
- `src/server/actions/payroll.helpers.ts`
- `src/server/payroll-engine/*`
- `src/app/(dashboard)/payroll/*`
- `src/app/(dashboard)/finance/page.tsx`

---

## Current Verification Baseline

State terakhir yang sudah terbukti hijau di repo:
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm vitest run`
- `pnpm build`

Terakhir diverifikasi setelah batch:
- personal payroll detail access
- dynamic header title
- integrasi BioFinger AT301 batch attendance (sprint 2026-05-12)

Jika sesi berikutnya mulai dari branch yang sama, baseline ini bisa dipakai sebagai acuan regresi.

---

## QA Focus Berikutnya

Prioritas QA yang paling masuk akal dari state sekarang:
1. role-based access QA
   - `KABAG`, `SPV`, `TEAMWORK`, `FINANCE`, `PAYROLL_VIEWER`, `SUPER_ADMIN`
2. payroll lifecycle QA
   - preview -> finalize -> paid -> lock
3. point activity QA
   - draft -> submit -> approve/reject -> override -> monthly generation
4. ticket and leave quota QA
   - monthly/annual/quarter logic

---

## Known Follow-up Areas

Belum berarti bug, tapi area lanjutan yang masih mungkin dikerjakan setelah QA:
- hardening enterprise untuk payroll dan finance reporting
- audit/reporting tambahan
- manual QA matrix per role
- penerapan migration ke target DB bila ada perubahan schema yang belum diaplikasikan di environment tertentu

---

## Practical Restart Advice

Jika melanjutkan dari nol di PC/sesi lain:
1. checkout `main`
2. pastikan `.env.local` valid
3. jalankan `pnpm install`
4. jalankan `pnpm exec tsc --noEmit`
5. jalankan `pnpm lint`
6. jalankan `pnpm vitest run`
7. jalankan `pnpm build`
