# Testing and Validation

## 1. Tujuan Dokumen

Menjelaskan:

- test yang sudah ada;
- cara menjalankan validasi repo;
- area yang belum tercakup test.

## 2. Command yang Perlu Diketahui

```bash
pnpm vitest run
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Catatan:

- `package.json` hanya punya script `lint`, tetapi `vitest`, `tsc`, dan `next build` bisa dijalankan langsung dari dependency.
- Untuk typecheck Next.js, jalankan `pnpm build` bila `.next/types` perlu diregenerasi.

## 3. Konfigurasi Test Aktual

| File | Isi penting |
|---|---|
| `vitest.config.ts` | alias `@` ke `./src`, environment `node` |
| `tsconfig.json` | strict mode aktif, noEmit, paths `@/*` |

## 4. Test yang Sudah Ada

| File test | Fokus |
|---|---|
| `src/config/constants.test.ts` | resolver target poin divisi, gaji/bonus constants |
| `src/lib/permissions/index.test.ts` | permission matrix per role |
| `src/lib/validations/employee.test.ts` | validasi employee dan work schedule |
| `src/lib/validations/payroll.test.ts` | validasi salary config dan KPI managerial |
| `src/server/actions/payroll.helpers.test.ts` | personal payroll detail access |
| `src/server/point-engine/parse-master-point-workbook.test.ts` | parser workbook poin |
| `src/server/point-engine/count-target-days-for-period.test.ts` | hitung target days |
| `src/server/point-engine/calculate-monthly-point-performance.test.ts` | hitung performa bulanan |
| `src/server/ticketing-engine/resolve-leave-quota-eligibility.test.ts` | eligibility leave quota berbasis quarter |
| `src/server/review-engine/resolve-reviewer-employee-id.test.ts` | reviewer employee id helper |
| `src/server/attendance-engine/resolve-attendance-payroll-eligibility.test.ts` | eligibility bonus fulltime/disiplin dari absensi |
| `src/server/attendance-engine/resolve-attendance-punctuality.test.ts` | punctuality resolver untuk absensi manual/fingerprint |
| `src/server/payroll-engine/resolve-payroll-period.test.ts` | periode payroll 26-25 |
| `src/server/payroll-engine/resolve-bonus-level.test.ts` | level bonus kinerja/prestasi |
| `src/server/payroll-engine/calculate-teamwork-payroll.test.ts` | payroll TEAMWORK |
| `src/server/payroll-engine/calculate-managerial-payroll.test.ts` | payroll MANAGERIAL |
| `src/server/payroll-engine/build-payroll-export-rows.test.ts` | format export Excel |
| `src/server/payroll-engine/build-payslip-breakdown.test.ts` | grouping addition/deduction slip |
| `src/server/payroll-engine/resolve-payroll-status-transition.test.ts` | aturan paid/lock |
| `src/server/payroll-engine/summarize-payroll-results.test.ts` | summary finance global dan per divisi |
| `src/server/actions/me.test.ts` | helper akses personal |
| `src/app/(dashboard)/finance/employee-search.test.ts` | helper pencarian employee finance |

## 5. Apa yang Sudah Dites

### Point Engine

- target default `13.000`;
- override `OFFSET` ke `39.000`;
- target day dari assignment tunggal dan assignment berganti;
- persentase bulanan dari target vs approved point;
- normalisasi workbook poin.

### Payroll Engine

- resolver periode anchor `YYYY-MM`;
- level bonus tanpa menumpuk bonus prestasi;
- payroll TEAMWORK training/reguler;
- payroll MANAGERIAL berbasis KPI;
- penalty SP ke bonus;
- unpaid leave, incident deduction, manual adjustment;
- status transition `FINALIZED -> PAID -> LOCKED`;
- breakdown slip;
- summary finance;
- export row shape.

### Helpers dan Validation

- permission matrix role;
- access detail payroll pribadi;
- employee-linked payroll detail access state;
- reviewer employee id helper;
- leave quota quarter eligibility;
- attendance eligibility untuk bonus fulltime/disiplin;
- overtime masih belum punya coverage test action end-to-end;
- employee/work schedule validation;
- nominal payroll tidak boleh negatif;
- KPI managerial dibatasi 0-200.

## 6. Test yang Masih Kurang

| Area | Gap |
|---|---|
| Server action auth/users | belum ada test invite/update/remove access dan employee login upsert |
| Server action master | belum ada test CRUD branch/division/position/grade/work schedule/shift |
| Employee action | belum ada test histori create/update |
| Schedule action | belum ada test assignment schedule dan scope |
| Performance action | belum ada test workflow save/submit/approve/reject/generate/batch |
| Ticketing action | belum ada test quota consume monthly/annual, cancel rule, scope SPV/KABAG, overtime flow |
| Review action | belum ada test formula review di level action dan scope SPV/KABAG |
| Training action | belum ada test kategori training dan keputusan lulus/gagal |
| Payroll action | belum ada integration test preview/finalize/paid/lock |
| Overtime action | belum ada test action flow dan schedule helper |
| Route handler | belum ada test export Excel dan payslip PDF |
| RLS | belum ada test policy |
| E2E | belum ada Playwright flow end-to-end |

## 7. Rekomendasi Test Tambahan

Prioritas tinggi:

- test `payroll.ts` preview/finalize/paid/lock dengan fixture kecil;
- test `tickets.ts` untuk quota monthly/annual/unpaid dan scope;
- test `performance.ts` untuk self-service TEAMWORK, SPV/KABAG scope, dan generate monthly;
- test `employees.ts` untuk history saat divisi/jabatan/grade/status/schedule berubah.

Prioritas menengah:

- test `users.ts` untuk employee login link dan multi-division scope;
- test `settings.ts` untuk update account settings;
- test route handler PDF/XLSX untuk access control;
- test `training.ts` untuk gap business rule graduation period.

## 8. Checklist Validasi Sebelum Merge

- `pnpm lint`
- `pnpm vitest run`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- cek role affected;
- cek table affected;
- cek snapshot/history affected;
- cek business rule affected;
- cek apakah dokumentasi perlu update.

## 9. Perlu Review Lanjutan

- repo belum menunjukkan test untuk RLS.
- payroll action integration test layak jadi investasi berikutnya.
- modul dengan audit gap perlu test setelah audit log ditambahkan.
