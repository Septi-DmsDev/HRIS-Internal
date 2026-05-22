# Overview

## 1. Tujuan Dokumen

Dokumen ini memberi gambaran besar project sebelum masuk ke level file. Fokusnya adalah menjawab:

- sistem ini mengerjakan apa;
- modul apa saja yang benar-benar ada di code;
- modul mana yang masih perlu hardening;
- bagaimana hubungan antar modul.

## 2. Identitas Project

Project ini adalah dashboard internal HRIS/HRD yang dibangun dengan:

- Next.js `16.2.4` App Router
- React `19.2.4`
- TypeScript
- Supabase Auth + `@supabase/ssr`
- Drizzle ORM + PostgreSQL
- Tailwind CSS v4
- shadcn/ui + Radix UI
- TanStack Table
- Zod v4
- date-fns
- Recharts
- Vitest
- PDF/XLSX route handlers

Fungsi bisnis yang sudah muncul di code:

- login dan session Supabase;
- user role management, employee login link, multi-division scope, dan history trail;
- account settings dan schedule;
- account settings untuk self-service profil enrichment (hobi, riwayat pendidikan, kompetensi);
- master data cabang/divisi/jabatan/grade/shift/jadwal kerja;
- profiling karyawan dan histori perubahan;
- mutasi massal penempatan (cabang/divisi/jabatan/grade/kelompok karyawan);
- katalog poin, import workbook, dan entry catalog manual;
- aktivitas harian poin-based (Mitra Kerja, Borongan, Training), batch submit, approval SPV/KABAG, HRD flow, dan self-service TEAMWORK;
- generate performa bulanan;
- input massal persentase performa managerial per periode oleh HRD/SUPER_ADMIN;
- ticketing izin/sakit/cuti dan leave quota;
- antrian approval tiket untuk SUPER_ADMIN/HRD/SPV/KABAG;
- input manual absensi untuk bonus fulltime/disiplin payroll;
- overtime request dan draft overtime;
- history audit lintas modul;
- review karyawan dan incident log;
- evaluasi training;
- payroll period, salary config, grade compensation, KPI managerial, preview, finalisasi, paid, lock;
- export Excel payroll, rekap Excel, slips PDF, dan payslip PDF;
- finance dashboard berbasis payroll result.

## 3. Arsitektur Singkat

```text
User Browser
-> Next.js App Router page / client component
-> server action / route handler
-> validation Zod
-> auth + role/scope check
-> Drizzle query / transaction
-> rule engine / helper service
-> PostgreSQL
-> response ke UI
```

## 4. Entry Point Utama

| Area | File | Peran |
|---|---|---|
| Auth helper server-side | `src/lib/auth/session.ts` | `getUser`, `requireAuth`, `checkRole`, `getCurrentUserRoleRow`, `getCurrentUserRole` |
| Permission matrix | `src/lib/permissions/index.ts` | permission helper dan test matrix |
| User management | `src/server/actions/users.ts` | invite/update/remove access dan employee login link |
| Koneksi database | `src/lib/db/index.ts` | inisialisasi Drizzle ke `DATABASE_URL` |
| Definisi tabel | `src/lib/db/schema/*` | sumber kebenaran model data |
| Boundary business logic | `src/server/actions/*` | query dan mutation yang dipanggil UI |
| Rule engine/helper | `src/server/*-engine/*` | kalkulasi/helper yang dipisahkan dari UI |
| Dashboard UI | `src/app/(dashboard)/*` | halaman internal setelah login |

## 5. Peta Relasi Modul

```text
Auth/User Role
  -> employee link + division scope

Master Data
  -> Employee Profiling
  -> Work Schedule / Shift

Employee Profiling
  -> Performance Point / Ticketing / Review / Incident / Training

Performance + Attendance + Ticketing + Review + KPI + Adjustment
  -> Payroll Snapshot
  -> Payroll Result
  -> Payslip + Export + Finance Dashboard

Employee Link
  -> account settings + schedule + personal payroll detail
```

## 6. Status Implementasi Aktual

| Modul | Status | Catatan |
|---|---|---|
| Auth & session | ada | `src/proxy.ts`, Supabase Auth, role row, employee link, division scope |
| User management | ada | `/users`, invite/update/remove access, employee login upsert |
| Master data | ada | branch, division, position, grade, work schedule, shift master |
| Employee profiling | ada | create, update, delete, histori, detail page |
| Employee placement | ada | `/positioning` untuk mutasi massal; `/divisi` dipertahankan sebagai redirect kompatibilitas |
| Performance point | ada, perlu hardening | self-service poin-based ada; input massal managerial ada; deadline H+1/H+2 masih perlu enforcement lengkap |
| Attendance | ada, manual + ingest API ADMS | `/absensi` untuk input manual, `/api/integrations/adms/attendance` untuk sinkronisasi mesin; dipakai payroll untuk fulltime/disiplin |
| Overtime | ada | `/overtime` mengelola request overtime, draft entry, approval, dan payroll integration |
| Ticketing leave | ada, perlu hardening | self-service employee-link ada; quota eligibility memakai quarter helper |
| History audit | ada | `/history` menggabungkan audit lintas modul untuk HRD/SUPER_ADMIN |
| Ticket approval queue | ada | `/ticketingapproval` dipakai role approver untuk antrian dan histori approval tiket |
| Review & incident | ada | review score 5 aspek, validate review, create incident |
| Training evaluation | ada | keputusan lulus/gagal ada; payroll kini mendukung prorate bonus fulltime/disiplin untuk kelulusan training di tengah periode |
| Payroll | ada, perlu hardening | period, snapshot, preview, finalize, paid, lock, export Excel, payslip PDF, rekap Excel dengan breakdown summary |
| Finance dashboard | ada | salary config, grade compensation, adjustment (tambah/edit/hapus per kategori) |
| Scheduler | ada | `/scheduler` route tersedia |
| RLS policy | perlu verifikasi | tidak terlihat jelas sebagai policy lengkap di repo |

## 7. Inkonsistensi/Gaps Code vs Business Rules

| Area | Catatan |
|---|---|
| RLS | Dokumentasi bisnis meminta RLS; repo lebih jelas menunjukkan server-side checks daripada policy RLS lengkap. |
| Performance deadline | Business rules meminta TW input H+1 dan SPV approve H+2; enforcement belum lengkap di semua action. |
| Training graduation | Transisi `graduateTrainee()` masih mengubah status langsung; mitigasi payroll saat ini memprorate bonus fulltime/disiplin jika tanggal lulus berada di tengah periode. |
| Audit log | Payroll dan performance activity punya log kuat; ticket/review/training masih perlu audit hardening bila diminta. |
| Payroll hardening | `next-update.md` mencatat overtime, SP quarter, structured additions/deductions, tunjangan masa kerja otomatis, dan rule lain yang belum penuh. |

Catatan implementasi payroll terbaru:
- tunjangan masa kerja dihitung dari `training_graduation_date` via `resolveTenureAllowanceAmount()` dengan bucket:
  - Jan-Feb-Mar -> efektif April tahun berikutnya;
  - Apr-Mei-Jun -> efektif Juli tahun berikutnya;
  - Jul-Ags-Sep -> efektif Oktober tahun berikutnya;
  - Okt-Nov-Des -> efektif Januari tahun berikutnya.

## 8. Risiko Teknis Paling Penting

- Payroll adalah modul dengan blast radius tertinggi; perubahan harus disertai test engine/helper dan cek status transition.
- Server-side scope harus dijaga untuk SPV/KABAG multi-division dan self-service employee-linked account.
- Jangan memindahkan logic payroll/ticket quota/bonus ke client component.
- Snapshot payroll dan snapshot master point tidak boleh rusak oleh update master data.
- Route handler PDF/XLSX harus tetap menghormati payroll read access.

## 9. Cara Memakai Kurikulum Ini

Jika baru mulai memahami codebase:

1. baca auth dan structure;
2. baca schema;
3. pilih satu modul;
4. ikuti alur: page -> client component -> server action -> schema/engine;
5. cocokkan dengan dokumen business rules;
6. catat gap yang muncul;
7. jalankan test terkait sebelum mengubah logic sensitif.
