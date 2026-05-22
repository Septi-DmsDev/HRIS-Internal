# Onboarding Curriculum - HRIS Internal

Dokumen ini membantu engineer baru memahami codebase aktual repo per 2026-05-22.

## 1. Tujuan Belajar

Setelah membaca dokumen ini, engineer baru diharapkan paham:

- arsitektur aplikasi dari UI sampai database;
- letak business logic sensitif;
- file mana yang aman diubah untuk UI, validasi, action, engine, dan schema;
- modul mana yang sudah ada di repo;
- risiko teknis yang perlu diingat sebelum menambah fitur baru.

## 2. Urutan Belajar yang Disarankan

1. Baca `AGENTS.md`.
2. Baca `references/business-rules.md`.
3. Baca `references/implementation-playbook.md`.
4. Baca `docs/codebase-curriculum/00-overview.md`.
5. Scan `src/lib/db/schema/*`.
6. Scan `src/server/actions/*`.
7. Scan `src/server/*-engine/*`.
8. Baru masuk ke `src/app/(dashboard)/*`.

## 3. Mental Model Arsitektur

```text
Page / Client Component
-> Server Action / Route Handler
-> Zod validation
-> requireAuth/checkRole/getCurrentUserRoleRow
-> Drizzle query/transaction
-> Rule engine/helper
-> PostgreSQL
```

Rule penting:

- UI hanya mengumpulkan input dan menampilkan hasil.
- Mutation sensitif dilakukan di server action atau route handler.
- Formula payroll, performa bulanan, bonus, quota, dan approval tidak boleh dipindah ke browser.
- Schema Drizzle di `src/lib/db/schema/*` adalah sumber kebenaran struktur data aplikasi.

## 4. Peta Folder

### Root

| File/Folder | Fungsi |
|---|---|
| `AGENTS.md` | Aturan kerja agent untuk repo ini. |
| `CLAUDE.md` | Instruksi tambahan untuk AI agent lain. |
| `agent-startup-prompt.md` | Prompt bootstrap yang sudah selaras dengan code aktual. |
| `HANDOVER.md` | Status project, setup environment, route aktif, dan QA focus. |
| `references/` | Aturan bisnis, playbook implementasi, tech stack, konsep phase. |
| `docs/codebase-curriculum/` | Dokumentasi codebase per modul. |
| `supabase/migrations/` | Riwayat migration SQL Drizzle/Supabase. |
| `scripts/seed-admin.ts` | Seed user admin awal. |
| `package.json` | Dependency dan script. |

### `src/app`

| Path | Fungsi |
|---|---|
| `src/app/page.tsx` | Redirect root ke login/dashboard. |
| `src/app/(auth)/login/*` | Halaman login dan form login. |
| `src/app/(dashboard)/dashboard/*` | Dashboard utama. |
| `src/app/(dashboard)/employees/*` | List/detail profil karyawan. |
| `src/app/(dashboard)/master/*` | Master branch, division, position, grade, work schedule, shift. |
| `src/app/(dashboard)/performance/*` | Performance point dan training evaluation. |
| `src/app/(dashboard)/tickets/*` | Ticketing izin/sakit/cuti. |
| `src/app/(dashboard)/absensi/*` | Input manual absensi kehadiran dan kedisiplinan. |
| `src/app/(dashboard)/overtime/*` | Request overtime dan draft entry. |
| `src/app/(dashboard)/history/*` | Audit trail lintas modul. |
| `src/app/(dashboard)/reviews/*` | Review dan incident. |
| `src/app/(dashboard)/payroll/*` | Payroll workspace, detail, PDF payslip, export XLSX. |
| `src/app/(dashboard)/finance/*` | Finance summary dari payroll result. |
| `src/app/(dashboard)/teamperformance/*` | Tampilan performa tim. |
| `src/app/(dashboard)/settings/*` | Settings akun login aktif. |
| `src/app/(dashboard)/schedule/*` | Jadwal pribadi/tim. |
| `src/app/(dashboard)/scheduler/*` | Scheduler operational view. |
| `src/app/(dashboard)/users/*` | Manajemen user role dan employee login. |

### `src/lib`

| Path | Fungsi |
|---|---|
| `src/lib/auth/session.ts` | `getUser`, `requireAuth`, `checkRole`, `getCurrentUserRoleRow`, `getCurrentUserRole`. |
| `src/lib/db/index.ts` | Koneksi Drizzle ke Postgres. |
| `src/lib/db/schema/*` | Definisi tabel, enum, dan type infer Drizzle. |
| `src/lib/supabase/client.ts` | Supabase browser client. |
| `src/lib/supabase/server.ts` | Supabase server client berbasis cookies. |
| `src/lib/supabase/admin.ts` | Supabase service-role client untuk server-only user management. |
| `src/lib/validations/*` | Seluruh schema Zod untuk input form/action. |
| `src/lib/permissions/index.ts` | Permission matrix per role. |

### `src/server`

| Path | Fungsi |
|---|---|
| `src/server/actions/*` | Boundary query/mutation yang dipanggil UI. |
| `src/server/point-engine/*` | Parser workbook, target days, monthly performance. |
| `src/server/attendance-engine/*` | Helper eligibility absensi untuk payroll. |
| `src/server/actions/overtime.ts` | Request overtime dan decision flow. |
| `src/server/actions/history.ts` | Audit trail lintas modul. |
| `src/server/payroll-engine/*` | Payroll period, bonus level, payroll calculators, payslip, export, summary. |
| `src/server/ticketing-engine/*` | Helper eligibility leave quota. |
| `src/server/review-engine/*` | Helper reviewer employee link. |
| `src/server/services/*` | Helper query reusable. |

## 5. File Penting per Area

### Auth dan Role

| File | Catatan |
|---|---|
| `src/proxy.ts` | Auth redirect layer Next.js 16. |
| `src/lib/auth/session.ts` | Pusat helper session dan role row. |
| `src/lib/db/schema/auth.ts` | `user_roles` dan `user_role_divisions`. |
| `src/server/actions/users.ts` | Invite/update/remove access dan employee login. |
| `src/lib/permissions/index.ts` | Matrix permission role. |

Catatan:

- `user_roles.employee_id` dipakai untuk akses berbasis relasi employee-linked.
- `user_role_divisions` dipakai untuk SPV/KABAG multi-division scope.
- `user_roles.division_id` masih ada sebagai deprecated compatibility field.

### Master Data dan Employee

| Area | File utama |
|---|---|
| Master branch/division/position/grade | `src/server/actions/branches.ts`, `divisions.ts`, `positions.ts`, `grades.ts` |
| Work schedule dan shift | `src/server/actions/work-schedules.ts`, `src/lib/db/schema/employee.ts` |
| Employee profile/history | `src/server/actions/employees.ts`, `src/lib/db/schema/employee.ts` |

### Performance

| File | Fungsi |
|---|---|
| `src/config/constants.ts` | Target 13.000, OFFSET 39.000, gaji default, bonus level. |
| `src/lib/db/schema/point.ts` | Katalog poin, aktivitas, approval log, monthly performance. |
| `src/server/actions/performance.ts` | Workspace, save/submit/approve/reject, batch approval, monthly generate. |
| `src/server/actions/point-catalog.ts` | Import/sync/update/delete katalog poin. |
| `src/server/point-engine/*` | Rule perhitungan yang sudah punya test. |

### Ticketing, Review, Training

| Area | File utama |
|---|---|
| Ticketing | `src/server/actions/tickets.ts`, `src/server/ticketing-engine/resolve-leave-quota-eligibility.ts` |
| Absensi | `src/server/actions/attendance.ts`, `src/server/attendance-engine/resolve-attendance-payroll-eligibility.ts` |
| Review/incident | `src/server/actions/reviews.ts`, `src/server/review-engine/resolve-reviewer-employee-id.ts` |
| Training | `src/server/actions/training.ts` |

### Payroll dan Finance

| File | Fungsi |
|---|---|
| `src/lib/db/schema/payroll.ts` | Salary config, grade compensation, period, KPI, snapshot, result, adjustment, audit log. |
| `src/server/actions/payroll.ts` | Payroll workspace, preview, finalize, paid, lock, adjustment, detail. |
| `src/server/actions/payroll.helpers.ts` | Personal payroll detail access helper. |
| `src/server/payroll-engine/*` | Pure/helper payroll logic yang sudah banyak dites. |
| `src/app/(dashboard)/payroll/*` | UI payroll dan route PDF/XLSX. |
| `src/app/(dashboard)/finance/*` | Finance dashboard. |

## 6. Test yang Perlu Dibaca

| Area | File |
|---|---|
| Constants/permissions | `src/config/constants.test.ts`, `src/lib/permissions/index.test.ts` |
| Validations | `src/lib/validations/*.test.ts` |
| Point engine | `src/server/point-engine/*.test.ts` |
| Ticket/review helper | `src/server/ticketing-engine/*.test.ts`, `src/server/review-engine/*.test.ts` |
| Attendance helper | `src/server/attendance-engine/*.test.ts` |
| Payroll engine | `src/server/payroll-engine/*.test.ts` |

## 7. Cara Trace Fitur

1. Mulai dari page di `src/app/(dashboard)/.../page.tsx`.
2. Lihat client component yang dipakai page itu.
3. Cari server action yang dipanggil.
4. Lihat validation schema.
5. Lihat schema database.
6. Lihat engine/helper bila ada.
7. Baca test terkait.

Contoh:

- Performance bulanan:
  `PerformanceCatalogClient.tsx -> generateMonthlyPerformance() -> countTargetDaysForPeriod() + calculateMonthlyPointPerformance() -> monthlyPointPerformances`
- Payroll auto-preview:
  `/payroll/page.tsx -> generatePayrollPreview() -> resolveAttendancePayrollEligibility() -> calculateTeamworkPayroll()/calculateManagerialPayroll() -> payrollEmployeeSnapshots + payrollResults`
## 8. Known Risks

- RLS policy tidak terlihat jelas di migration repo; proteksi yang terlihat saat ini ada di server action.
- Deadline H+1/H+2 performance belum lengkap.
- Rule training "reguler efektif periode payroll berikutnya" belum sepenuhnya tercermin karena `graduateTrainee()` langsung mengubah status.
- Audit log belum merata untuk semua modul non-payroll.
- `next-update.md` masih berisi beberapa payroll/master-data hardening yang belum selesai.

## 9. Checklist Sebelum Ngoding

- Sudah baca business rule modul terkait?
- Sudah tahu phase dan modul?
- Sudah tahu role/scope yang terdampak?
- Sudah tahu tabel dan action yang disentuh?
- Sudah tahu apakah butuh snapshot/history?
- Sudah tahu apakah butuh transaction?
- Sudah tahu apakah perlu audit log?
- Sudah tahu test apa yang perlu ditambah atau dijalankan?
