# Maintenance Checklist

## 1. Tujuan Dokumen

Checklist ini dipakai sebelum, saat, dan setelah mengubah code agar perubahan tetap aman terhadap business rule project HRIS/HRD Dashboard.

## 2. Checklist Sebelum Mengubah Code

- sudah baca business rule modul terkait;
- sudah tahu phase modulnya;
- sudah tahu role dan scope yang terdampak;
- sudah tahu tabel yang dibaca dan ditulis;
- sudah tahu apakah perubahan memengaruhi snapshot/history;
- sudah tahu apakah perlu transaction;
- sudah tahu apakah perlu audit log;
- sudah tahu test yang relevan.

## 3. Checklist per Layer

### Auth dan Access

- apakah route/action ini sudah memanggil `requireAuth()`?
- apakah role check sudah sesuai?
- apakah SPV/KABAG harus dibatasi `user_role_divisions`?
- apakah self-access butuh `user_roles.employee_id`?
- apakah route handler PDF/XLSX memakai access helper yang sama dengan UI?
- apakah history/audit route hanya dibuka untuk HRD/SUPER_ADMIN?
- apakah Supabase service-role client hanya dipakai server-side?

### Validation

- apakah input baru sudah masuk `src/lib/validations/*`?
- apakah enum/status baru konsisten dengan schema, types, UI, dan badge?
- apakah error message cukup jelas?

### Database dan Schema

- apakah perubahan butuh field baru atau table baru?
- apakah field itu perlu history/snapshot?
- apakah perubahan ke master bisa mengubah histori modul lain?
- apakah perubahan payroll/performance perlu idempotency?
- apakah migration sudah dibuat dan aman untuk data existing?

### Server Actions

- apakah action baru cukup baca/tulis satu tabel, atau perlu transaction?
- apakah `revalidatePath()` sudah sesuai?
- apakah ada status yang tidak boleh diubah dari state tertentu?
- apakah action menulis audit log bila menyentuh approval/payroll/adjustment/master penting?

### Rule Engine

- apakah logic sensitif ditempatkan di server/engine, bukan di client?
- apakah ada test unit untuk rule baru?
- apakah formula mengikuti `references/business-rules.md`?
- jika rule berbeda dari dokumen, apakah gap dicatat?

### UI

- apakah status label dan badge sinkron dengan enum?
- apakah form mengikuti schema input terbaru?
- apakah dialog destructive memakai confirm?
- apakah `DataTable` search key masih benar?
- apakah role navigation di `Sidebar.tsx` sinkron dengan action guard?

## 4. Checklist Maintenance per Modul

### User/Auth

- cek `user_roles.employee_id` untuk self-service;
- cek `user_role_divisions` untuk SPV/KABAG;
- cek admin/service-role operation tetap server-only;
- cek employee login tidak menciptakan role ganda yang membingungkan.

### Master Data

- cek dampak ke employee option;
- cek kode unik;
- cek data master yang dipakai payroll/training;
- cek shift master dan work schedule tetap konsisten.

### Employee Profiling

- cek apakah perubahan perlu history;
- cek schedule assignment lama ditutup dengan benar;
- cek scope SPV/KABAG;
- cek snapshot payroll/performance tidak membaca live data setelah locked.

### Performance

- cek versi katalog aktif;
- cek snapshot poin tetap aman;
- cek activity status transition;
- cek self-service TEAMWORK hanya menulis employee sendiri;
- cek target days dan divisi snapshot;
- cek gap deadline H+1/H+2.

### Overtime

- cek overtime placement `BEFORE_SHIFT` / `AFTER_SHIFT`;
- cek draft overtime dan request overtime tetap terpisah dari ticket leave;
- cek overtime approved ikut terbaca payroll preview;
- cek scope SPV/KABAG dan employee-linked flow.

### History

- cek history lintas modul tidak mengekspos payload sensitif tanpa scope;
- cek sumber audit yang digabung di `/history`;
- cek limit data history tidak terlalu besar untuk UI.

### Ticketing

- cek status ticket sebelum approve/reject/cancel;
- cek quota eligibility dan priority paid/unpaid;
- cek scope SPV/KABAG;
- cek payroll impact untuk ticket approved;
- cek audit gap bila action penting belum punya log.

### Review/Incident

- cek formula bobot review;
- cek reviewer employee link;
- cek incident type yang memengaruhi payroll;
- cek siapa yang boleh validate review.

### Training

- cek apakah keputusan training harus langsung atau next payroll;
- cek standar lulus per divisi;
- cek status karyawan masih `TRAINING` sebelum lulus/gagal;
- catat gap rule efektif periode berikutnya.

### Payroll

- cek status periode sebelum preview/finalize/paid/lock;
- cek snapshot tetap dipakai;
- cek KPI managerial lengkap;
- cek ticket approved dan incident aktif masuk periode;
- cek activity dan monthly performance dikunci saat finalize;
- cek audit log payroll ditulis;
- cek personal payroll detail access untuk employee-linked account;
- cek export XLSX dan payslip PDF memakai access control.

## 5. Hotspot yang Paling Berisiko

| Area | Risiko |
|---|---|
| `src/server/actions/payroll.ts` | efek lintas modul dan banyak tabel |
| `src/server/actions/performance.ts` | status workflow, self-service, batch action, generate monthly |
| `src/server/actions/tickets.ts` | leave quota/payroll impact bisa salah bila modifikasi tergesa |
| `src/server/actions/employees.ts` | history/schedule assignment bisa salah bila effective date keliru |
| `src/server/actions/users.ts` | role/employee/division scope salah bisa membuka data sensitif |
| `src/lib/auth/session.ts` | role row salah berdampak ke semua action |
| `src/proxy.ts` | auth redirect semua route |
| payroll PDF/XLSX route handlers | bisa bocor data bila access guard longgar |

## 6. Known Gaps yang Selalu Perlu Diingat

- RLS policy belum terlihat lengkap di repo.
- Deadline H+1/H+2 performance belum lengkap.
- Training graduation belum sepenuhnya mengikuti rule efektif payroll berikutnya.
- Audit log non-payroll belum merata.
- overtime approval flow dan history route perlu test coverage lebih lengkap.
- `next-update.md` berisi payroll/master-data hardening yang belum selesai semua.

## 7. Checklist Setelah Mengubah Code

- jalankan `pnpm lint`;
- jalankan `pnpm vitest run` atau subset test terkait;
- jalankan `pnpm exec tsc --noEmit`;
- jalankan `pnpm build` untuk perubahan Next.js signifikan;
- cek ulang role affected;
- cek ulang data flow modul terdampak;
- update dokumentasi bila behavior bisnis berubah.

## 8. Area Review Lanjutan

- policy RLS yang sebenarnya;
- overtime dan uang harian di payroll preview;
- structured payroll additions/deductions;
- SP penalty per quarter;
- audit log ticket/review/training/master compensation;
- integration test payroll action.
