# Struktur Project

## 1. Gambaran Umum

Repo ini mengikuti pola Next.js App Router dengan pemisahan jelas antara:

- `src/app` untuk UI, route, dan route handler;
- `src/server/actions` untuk boundary bisnis;
- `src/server/*-engine` untuk kalkulasi/helper yang bisa dites;
- `src/lib/db/schema` untuk model data;
- `src/lib/validations` untuk kontrak input;
- `src/components` untuk reusable UI.

## 2. Struktur Root

| File/Folder | Fungsi nyata | Catatan |
|---|---|---|
| `AGENTS.md` | aturan kerja agent pada repo ini | wajib dibaca sebelum mengubah code |
| `CLAUDE.md` | instruksi AI tambahan | sejalan dengan `AGENTS.md` |
| `agent-startup-prompt.md` | prompt bootstrap agent | memuat alur code aktual |
| `HANDOVER.md` | catatan status project dan setup environment | gunakan untuk restart/QA |
| `README.md` | ringkasan project, setup, docs map | sudah bukan template default |
| `references/` | dokumen business rule dan arsitektur | acuan bisnis utama |
| `docs/` | kurikulum codebase, onboarding, arsip specs/plans | `docs/superpowers/*` bersifat historis |
| `src/` | seluruh source code aplikasi | pusat codebase |
| `supabase/migrations/` | migration SQL hasil Drizzle/Supabase | policy RLS perlu verifikasi |
| `scripts/seed-admin.ts` | seed user admin awal | bootstrap role pertama |
| `components.json` | config shadcn/ui | base color `slate`, css variables aktif |
| `package.json` | dependency dan script | script resmi `dev`, `build`, `start`, `lint` |
| `drizzle.config.ts` | config Drizzle Kit | schema di `src/lib/db/schema` |
| `vitest.config.ts` | alias dan environment test | memakai environment `node` |

## 3. Struktur `src`

```text
src/
├── app/                  # halaman, layout, route handler
├── components/           # reusable UI dan layout
├── config/               # konstanta bisnis
├── lib/                  # auth, db, permissions, supabase, utils, validations
├── server/               # actions, engines, services
├── types/                # type union lintas modul
└── proxy.ts              # auth redirect layer Next.js 16
```

## 4. Struktur `src/app`

| Path | Fungsi nyata |
|---|---|
| `src/app/layout.tsx` | root layout, font Plus Jakarta Sans, metadata app |
| `src/app/page.tsx` | root redirect |
| `src/app/globals.css` | token warna dan typography global |
| `src/app/(auth)/login/*` | halaman login dan form login |
| `src/app/(dashboard)/layout.tsx` | guard login + sidebar + header |
| `src/app/(dashboard)/dashboard/*` | ringkasan utama |
| `src/app/(dashboard)/employees/*` | list, form, detail profil karyawan |
| `src/app/(dashboard)/positioning/*` | mutasi massal cabang/divisi/jabatan/grade/kelompok |
| `src/app/(dashboard)/divisi/*` | route kompatibilitas lama yang redirect ke `/positioning` |
| `src/app/(dashboard)/history/*` | audit trail lintas modul |
| `src/app/(dashboard)/master/branches/*` | CRUD cabang |
| `src/app/(dashboard)/master/divisions/*` | CRUD divisi |
| `src/app/(dashboard)/master/positions/*` | CRUD jabatan |
| `src/app/(dashboard)/master/employee-groups/*` | konfigurasi kelompok karyawan |
| `src/app/(dashboard)/master/catalogpoin/*` | katalog poin versi lama / sinkronisasi workbook |
| `src/app/(dashboard)/master/grades/*` | CRUD grade dan compensation config |
| `src/app/(dashboard)/master/work-schedules/*` | CRUD jadwal kerja dan master shift |
| `src/app/(dashboard)/performance/*` | katalog poin, aktivitas, monthly performance |
| `src/app/(dashboard)/performance/training/*` | evaluasi training |
| `src/app/(dashboard)/tickets/*` | ticket izin/sakit/cuti |
| `src/app/(dashboard)/ticketingapproval/*` | antrian approval tiket dan histori review |
| `src/app/(dashboard)/absensi/*` | input manual absensi kehadiran/disiplin |
| `src/app/(dashboard)/overtime/*` | request overtime dan draft entry |
| `src/app/(dashboard)/reviews/*` | review + incident |
| `src/app/(dashboard)/payroll/*` | workspace payroll, detail, export, payslip |
| `src/app/(dashboard)/finance/*` | finance dashboard |
| `src/app/(dashboard)/schedule/*` | jadwal personal/tim |
| `src/app/(dashboard)/scheduler/*` | scheduler operational view |
| `src/app/(dashboard)/settings/*` | account settings user aktif |
| `src/app/(dashboard)/teamperformance/*` | tampilan performa tim |
| `src/app/(dashboard)/users/*` | role/user management |

Route handler aktif:

| Path | Fungsi |
|---|---|
| `src/app/(dashboard)/payroll/[periodId]/export.xlsx/route.ts` | export payroll XLSX |
| `src/app/(dashboard)/payroll/[periodId]/rekap.xlsx/route.ts` | export rekap payroll XLSX |
| `src/app/(dashboard)/payroll/[periodId]/slips.pdf/route.ts` | export bulk slips PDF |
| `src/app/(dashboard)/payroll/[periodId]/[employeeId]/payslip.pdf/route.ts` | payslip PDF |
| `src/app/(dashboard)/employees/export.xlsx/route.ts` | export data karyawan XLSX |
| `src/app/api/integrations/adms/attendance/route.ts` | ingest sinkronisasi absensi dari mesin ADMS/fingerprint |

## 5. Struktur `src/lib`

| Path | Fungsi nyata |
|---|---|
| `src/lib/auth/session.ts` | session helper server-side |
| `src/lib/db/index.ts` | singleton Drizzle client |
| `src/lib/db/schema/*` | definisi tabel/enum/type infer |
| `src/lib/supabase/server.ts` | server client Supabase berbasis cookie |
| `src/lib/supabase/client.ts` | browser client Supabase |
| `src/lib/supabase/admin.ts` | service-role client untuk server-only user management |
| `src/lib/permissions/index.ts` | permission matrix per role |
| `src/lib/validations/*` | schema Zod semua action penting |
| `src/lib/utils/index.ts` | helper `cn()` |

## 6. Struktur `src/server`

| Path | Fungsi nyata |
|---|---|
| `src/server/actions/*` | server action untuk query/mutation |
| `src/server/point-engine/*` | kalkulasi target/performa dan parser workbook |
| `src/server/attendance-engine/*` | helper eligibility fulltime/disiplin dari absensi |
| `src/server/payroll-engine/*` | periode, level bonus, kalkulator payroll, export, payslip, summary |
| `src/server/ticketing-engine/*` | helper leave quota eligibility |
| `src/server/review-engine/*` | helper reviewer employee id |
| `src/server/services/point-catalog-service.ts` | helper query katalog poin |

Action file aktif:

```text
auth.ts
attendance.ts
branches.ts
dashboard.ts
divisions.ts
employees.ts
grades.ts
payroll.ts / payroll.helpers.ts
performance.ts
point-catalog.ts
positions.ts
reviews.ts
schedule.ts
settings.ts
tickets.ts
training.ts
users.ts
work-schedules.ts
```

## 7. Struktur `src/components`

| Path | Fungsi nyata |
|---|---|
| `src/components/layout/Sidebar.tsx` | navigasi modul berdasarkan role |
| `src/components/layout/Header.tsx` | identitas user + logout |
| `src/components/layout/HeaderTitle.tsx` | title dinamis route |
| `src/components/tables/DataTable.tsx` | wrapper TanStack Table + search + pagination |
| `src/components/ui/*` | wrapper shadcn/ui dan Radix |

## 8. Boundary Penting

```text
UI layer
-> src/app/(dashboard)/* dan src/components/*

Validation layer
-> src/lib/validations/*

Access control layer
-> src/proxy.ts + src/lib/auth/session.ts + scoped action checks

Business action layer
-> src/server/actions/*

Rule/helper layer
-> src/server/*-engine/* + src/server/services/*

Persistence layer
-> src/lib/db/schema/* + src/lib/db/index.ts
```

## 9. Cara Cepat Mencari Alur Kode

Untuk memahami satu fitur:

1. cari page di `src/app/(dashboard)/.../page.tsx`;
2. lihat client component yang dipakai page itu;
3. cari action di `src/server/actions`;
4. lihat schema Zod yang dipakai;
5. lihat tabel di `src/lib/db/schema`;
6. jika ada kalkulasi, lihat engine terkait;
7. cek test file bila tersedia.
