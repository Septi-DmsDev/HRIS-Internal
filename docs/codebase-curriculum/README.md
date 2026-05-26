# HRIS Internal Codebase Curriculum

## Tujuan

Folder ini adalah kurikulum belajar codebase untuk project HRIS/HRD Dashboard internal. Isinya diselaraskan dengan code aktual repo per 2026-05-25 sehingga bisa dipakai untuk:

- onboarding developer baru,
- menyamakan pemahaman owner/project lead,
- memberi konteks ke AI agent berikutnya,
- membantu maintenance harian dan pengembangan fitur baru.

## Cara Membaca

Urutan baca yang direkomendasikan:

1. `00-overview.md`
2. `01-project-structure.md`
3. `02-auth-and-role-access.md`
4. `03-database-schema.md`
5. Dokumen modul: `04-master-data-module.md` sampai `10-payroll-module.md`
6. `11-ui-components.md`
7. `12-server-actions-and-business-logic.md`
8. `13-data-flow-and-user-flow.md`
9. `14-testing-and-validation.md`
10. `15-developer-learning-path.md`
11. `16-maintenance-checklist.md`

## Daftar Dokumen

| File | Fokus | Status |
|---|---|---|
| `README.md` | Peta baca kurikulum | updated |
| `00-overview.md` | Ringkasan sistem, status implementasi, relasi modul | updated |
| `01-project-structure.md` | Struktur repo, route, boundary folder, file inti | updated |
| `02-auth-and-role-access.md` | Auth, session, role, scope akses | updated |
| `03-database-schema.md` | Schema Drizzle dan relasi bisnis | updated |
| `04-master-data-module.md` | Cabang, divisi, jabatan, grade, shift, jadwal kerja | updated |
| `05-employee-profiling-module.md` | Profil karyawan, histori, detail page, import/export, placement | updated |
| `06-performance-point-module.md` | Katalog poin, aktivitas harian, performa bulanan | updated |
| `07-ticketing-leave-module.md` | Izin/sakit/cuti, overtime, leave quota | perlu review lanjutan |
| `08-review-and-incident-module.md` | Review kualitas kerja dan incident | perlu review lanjutan |
| `09-training-evaluation-module.md` | Evaluasi training berbasis performa | perlu review lanjutan |
| `10-payroll-module.md` | Period, preview, finalisasi, payslip, finance basis | updated |
| `11-ui-components.md` | Layout, reusable UI, table, tabs, dialog | perlu review lanjutan |
| `12-server-actions-and-business-logic.md` | Ringkasan server action | updated |
| `13-data-flow-and-user-flow.md` | Alur data dan alur user per modul | updated |
| `14-testing-and-validation.md` | Test yang ada, command, gap test | updated |
| `15-developer-learning-path.md` | Rencana belajar | perlu review lanjutan |
| `16-maintenance-checklist.md` | Checklist maintenance dan hotspot | updated |

## Quick Start untuk Developer Baru

1. Install dependency:
   `pnpm install`
2. Siapkan `.env.local` sesuai `README.md` atau `HANDOVER.md`.
3. Pastikan koneksi `DATABASE_URL` aktif.
4. Jalankan dev server:
   `pnpm dev`
5. Pahami auth terlebih dahulu:
   `src/proxy.ts`, `src/lib/auth/session.ts`, `src/lib/permissions/index.ts`, `src/server/actions/users.ts`
6. Lanjut ke schema:
   `src/lib/db/schema/*`
7. Lanjut ke server actions:
   `src/server/actions/*`
8. Baru masuk ke UI:
   `src/app/(dashboard)/*`

## Status Dokumentasi

Dokumentasi utama yang paling diselaraskan dengan code aktual:

- `AGENTS.md`
- `CLAUDE.md`
- `agent-startup-prompt.md`
- `README.md`
- `docs/onboarding-curriculum.md`
- `docs/codebase-curriculum/00-overview.md`
- `docs/codebase-curriculum/01-project-structure.md`
- `docs/codebase-curriculum/12-server-actions-and-business-logic.md`
- `docs/codebase-curriculum/14-testing-and-validation.md`
- `docs/codebase-curriculum/16-maintenance-checklist.md`

Dokumen `docs/superpowers/*` bersifat arsip spec/plan historis. Jangan pakai sebagai sumber status terakhir tanpa membandingkan dengan code.
