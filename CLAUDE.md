# CLAUDE.md - HRIS Internal Project Instructions

You are working on the internal HRIS/HRD Dashboard. Follow the business rules, current code flow, and documentation in this repository.

## Current Context

The product is implemented as three business phases, but the codebase already contains usable flows across all three:

1. Profiling Karyawan & Master Data Foundation
2. Performance Management Engine
3. Payroll System & Finance Closing

Payroll depends on finalized or snapshot data from employee profiling, performance, ticketing, review/incident, attendance/schedule, salary configuration, grade compensation, KPI summaries, and manual adjustments.

## Actual Architecture

```text
Page / Client Component
-> Server Action / Route Handler
-> Zod validation
-> requireAuth/checkRole/getCurrentUserRoleRow
-> Drizzle query or transaction
-> rule engine/helper
-> PostgreSQL
```

Key folders:

- `src/app/(dashboard)/*` for authenticated routes.
- `src/app/(auth)/*` for login/auth pages.
- `src/server/actions/*` for business entry points.
- `src/server/point-engine/*`, `src/server/payroll-engine/*`, `src/server/ticketing-engine/*`, and `src/server/review-engine/*` for testable rules/helpers.
- `src/lib/db/schema/*` for Drizzle schema.
- `src/lib/auth/session.ts` for auth/session flow.
- `src/lib/validations/*` for Zod schemas.
- `supabase/migrations/*` for SQL migration history.

## Employee Data Model

Tabel `employees` menyimpan dua kelompok data:

**Data Kerja** (wajib saat create):
`employee_code`, `full_name`, `branch_id`, `division_id`, `position_id`, `grade_id`, `employee_group`, `employment_status`, `payroll_status`, `start_date`, `supervisor_employee_id`

**Data Diri** (opsional, bisa diisi lewat import atau edit profil):
`birth_place`, `birth_date`, `gender`, `religion`, `marital_status`, `phone_number`, `address`, `nickname`, `photo_url`, `jobdesk`, `notes`

Tabel terkait per karyawan:
- `employee_division_histories` / `_position_` / `_grade_` / `_supervisor_` / `_status_histories` — riwayat perubahan
- `employee_schedule_assignments` — jadwal kerja aktif dan historis
- `employee_salary_configs` — konfigurasi gaji (1:1)
- `attendance_tickets` / `leave_quotas` — cuti & izin
- `daily_activity_entries` / `monthly_point_performances` — performa poin
- `employee_reviews` / `incident_logs` — review & insiden
- `payroll_employee_snapshots` / `payroll_results` / `payroll_adjustments` — payroll

## Login & Auth

Login mendukung tiga metode identifier (field `identifier` di form):

1. **Username** (default) — nilai sebelum `@` pada email login, contoh: `srifit` → `srifit@hris.internal`
2. **Email penuh** — langsung dipakai jika ada karakter `@`
3. **Nomor telepon** — dicari di `employees.phone_number`, dinormalisasi ke format `62xxxxxxx`, lalu resolve ke email via `admin.auth.admin.getUserById`

Resolusi terjadi di `src/server/actions/auth.ts → resolveIdentifierToEmail()`. Supabase Auth tetap menggunakan `signInWithPassword({ email, password })`.

Format email login yang dibuat saat import: `username@hris.internal` (menggunakan `normalizeImportEmail()` di `src/server/actions/employees.ts`).

## Import Karyawan dari Excel

Format kolom yang didukung (urutan bisa beda, header dicocokkan):
`CABANG`, `NAMA`, `USERNAME`, `PASSWORD`, `TEMPAT LAHIR`, `TGL LAHIR`, `JENIS KELAMIN`, `AGAMA`, `STATUS`, `ALAMAT`, `NO TELP`, `MASUK KERJA`, `LOLOS TRAINING`

Aturan pemetaan:
- `STATUS` → `marital_status` (status pernikahan, **bukan** employment status)
- `LOLOS TRAINING` → `training_graduation_date` sebagai **tanggal** (bukan boolean)
- Jika `training_graduation_date` ada → `employment_status = REGULER`, sebaliknya `TRAINING`
- `CABANG` dicocokkan fuzzy ke tabel `branches`
- `DIVISI` ditentukan otomatis dari branch (ambil divisi pertama milik cabang tersebut)
- `JABATAN` dan `GRADE` diambil dari fallback master data aktif (default TEAMWORK)
- Email login dibuat: `username@hris.internal`

**Upsert behavior (sejak 2026-05):**
- Jika baris Excel cocok dengan karyawan existing berdasarkan `fullName + birthDate` → UPDATE data (tidak insert baru)
- Cocok key: `fullName.toLowerCase().trim() + "|" + birthDate.toISOString().slice(0,10)`
- Jika upsert dan tidak ada `PASSWORD` di row → auth account **tidak** direset (skip `upsertEmployeeLogin`)
- Jika upsert dan ada `PASSWORD` → auth account/email diperbarui

**Export ↔ Import roundtrip:**
- Export (`/employees/export.xlsx`) menyertakan kolom `USERNAME` (dari email sebelum `@`) dan `PASSWORD` (kosong)
- File hasil export bisa langsung dipakai sebagai template import ulang

Catatan performa: import 300+ baris memerlukan waktu karena setiap baris membuat transaksi DB + Supabase Auth user secara berurutan.

## Admin Actions (SUPER_ADMIN only)

Dua server action khusus admin di `src/server/actions/employees.ts`:

**`purgeAllEmployees()`**
- Hapus seluruh data karyawan + payroll snapshot/results (yang punya RESTRICT FK)
- Hapus Supabase Auth accounts untuk role: `TEAMWORK`, `MANAGERIAL`, `SPV`, `KABAG`, `PAYROLL_VIEWER`
- Auth accounts untuk `SUPER_ADMIN`, `HRD`, `FINANCE` **tidak** dihapus
- Tidak bisa di-undo — di-trigger lewat AlertDialog konfirmasi di halaman `/employees`

**`createMissingEmployeeAccounts(defaultPassword)`**
- Buat akun Supabase Auth untuk karyawan aktif yang tidak punya `user_roles` entry
- Email format: `namalengkap.lowercase@hris.internal`
- Role otomatis: `MANAGERIAL` jika `employeeGroup = MANAGERIAL`, `TEAMWORK` untuk sisanya
- SPV/KABAG perlu di-assign manual setelah sync
- Di-trigger lewat tombol **Sync Akun** di toolbar `/employees` (SUPER_ADMIN only)

## Payroll Adjustments

Adjustment payroll (`payroll_adjustments`) kini pakai sistem kategori bertipe, menggantikan generic `ADDITION/DEDUCTION`. Kategori disimpan di field `reason` dengan encoding `CATEGORY::description` atau `CICILAN::tenor::description`.

**Kategori dan business rules:**

| Kategori | Arah | Karyawan | Rule |
|---|---|---|---|
| `MANUAL_ADDITION` | Penambah | Semua | Bebas, perlu keterangan |
| `TRANSPORT` | Penambah | Semua | Recurring bulanan |
| `BONUS_OMSET_1_CSM` | Penambah | Divisi CSM | Sekali per periode |
| `BONUS_OMSET_2_CSM` | Penambah | Divisi CSM | Sekali per periode |
| `BONUS_OMSET_3_CSM` | Penambah | Divisi CSM | Sekali per periode |
| `BONUS_KINERJA_CSM_TERTINGGI` | Penambah | Divisi CSM | Sekali per periode |
| `BONUS_COUNTER_MESIN` | Penambah | Divisi Printing | Sekali per periode |
| `BPJS` | Pengurang | Semua | Recurring bulanan, tidak ada batas |
| `KASBON` | Pengurang | Semua | Maks **Rp 300.000** per karyawan per periode |
| `GANTI_RUGI_PERSONAL` | Pengurang | Semua | **Sekali** per karyawan per periode |
| `GANTI_RUGI_TEAM` | Pengurang | **MANAGERIAL only** | **Sekali** per karyawan per periode |
| `CICILAN` | Pengurang | Tertentu | Perlu sisa tenor (bulan); recurring manual |

Business rules di-enforce di `addPayrollAdjustment` dan `updatePayrollAdjustment` (server action). Field `adjustmentType` di DB tetap `ADDITION`/`DEDUCTION`; kategori dibaca dari prefix `reason`.

**Server actions adjustment:**
- `addPayrollAdjustment` — tambah adjustment baru, enforce semua business rules
- `updatePayrollAdjustment` — edit nominal dan keterangan adjustment yang sudah ada; enforce batas kasbon (exclude ID yang sedang diedit); tidak mengubah kategori/karyawan
- `deletePayrollAdjustment` — hapus adjustment; RECURRING di-soft-deactivate, PERIOD di-hard-delete

**UI adjustment (Finance → tab Adjustment):**
- Tombol **Tambah Adjustment** → dialog add
- Tombol edit (ikon pensil) di setiap baris → dialog edit (nominal + keterangan)
- Tombol hapus (ikon tong sampah) di setiap baris → konfirmasi lalu delete

**Encoding reason:**
```
BPJS
BPJS::catatan
TRANSPORT
KASBON::catatan
GANTI_RUGI_PERSONAL::deskripsi
GANTI_RUGI_TEAM::deskripsi
CICILAN::12::nama barang
MANUAL_ADDITION::alasan
BONUS_OMSET_1_CSM::catatan
```

## Database & Migrations

**Koneksi:**
- `DATABASE_URL` → `localhost:5433` (PgBouncer pooler, untuk operasi normal/DML)
- Port 5432 (PostgreSQL langsung) tidak diekspos keluar
- Supabase self-hosted di `https://hris-supa.it-teknos.site`

**Kepemilikan tabel:**
- Tabel dimiliki oleh `supabase_admin` (superuser), bukan `postgres`
- User `postgres` hanya punya DML (SELECT/INSERT/UPDATE/DELETE), tidak bisa ALTER TABLE
- Untuk menjalankan DDL/migration: gunakan **Supabase Studio SQL Editor** atau endpoint pg-meta (`POST /pg/query` dengan service_role key)

**Cara apply migration baru:**
```bash
# Via pg-meta API (bisa dijalankan dari script Node.js)
POST https://hris-supa.it-teknos.site/pg/query
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
Body: { "query": "ALTER TABLE ..." }

# Atau via Supabase Studio → SQL Editor
```

Jangan gunakan `drizzle-kit migrate` langsung dari localhost karena `postgres` bukan owner tabel.

## Payroll Preview Performance

`generatePayrollPreview` di `src/server/actions/payroll.ts` dioptimasi (sejak 2026-05) dari N+1 queries menjadi bulk fetch + batch insert:

- **Sebelum:** ~1.800 queries untuk 303 karyawan (~1 menit)
- **Sesudah:** ~14 queries total (~2–5 detik)

Pola:
1. Bulk fetch semua data (salary configs, performance, tickets, incidents, adjustments, division/position/grade histories, schedule assignments + work schedule days) dalam satu pass menggunakan `inArray(employeeId, allIds)`
2. Build `Map<employeeId, data>` di JS untuk lookup O(1) per karyawan
3. Batch insert snapshots → ambil `returning({ id, employeeId })` → build Map → batch insert results

Jangan kembali ke pola per-karyawan `await` di dalam loop.

## Critical Rules

- Never calculate sensitive payroll values in client components.
- Keep business logic in server-side actions, services, route handlers, rule engines, database functions, or transactions.
- Use PostgreSQL/Drizzle transactions for payroll closing, leave quota usage, employee history updates, schedule assignment changes, and adjustments.
- Use snapshots for payroll periods and master point transactions.
- Use audit logs for critical actions. Payroll has `payroll_audit_logs`; performance activities have approval logs.
- Preserve business rules from `references/business-rules.md`.
- If code and business rules differ, mark the difference explicitly instead of silently changing the rule.

## Access Model

Current roles:

`SUPER_ADMIN`, `HRD`, `KABAG`, `SPV`, `MANAGERIAL`, `FINANCE`, `TEAMWORK`, `PAYROLL_VIEWER`.

Important details:

- `user_roles.employee_id` links a login account to an employee for self-service.
- `user_role_divisions` is the current division-scope table for SPV/KABAG.
- `user_roles.division_id` is deprecated compatibility data.
- Server-side scope checks are required even when UI navigation is hidden.

## Coding Style

- Prefer small, focused changes.
- Use TypeScript strictly.
- Validate input with Zod.
- Use shadcn/ui, Radix, Tailwind, and existing component patterns.
- Use clear status enums from `src/types/index.ts` and Drizzle schema enums.
- Add tests for rule engines/helpers when changing formulas or access helpers.
- Document assumptions in the final response.

## Before Each Task

Identify:

- module and phase;
- role and scope affected;
- tables affected;
- source data and output data;
- business rules involved;
- security, snapshot, idempotency, and audit impact;
- existing tests or missing tests.

## Final Response

Return:

1. Summary
2. Files changed
3. Business rules applied
4. Validation/tests
5. Remaining risks or follow-up decisions
